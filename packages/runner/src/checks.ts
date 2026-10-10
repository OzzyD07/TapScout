// Mode checks beyond Functional (docs/03 §6.2–6.5, docs/05 §5). Passive: computed from every
// observation and action outcome during the shared exploration; no extra device actions. The
// active Stress probe and crash records are fed in by the agent loop.

import type {
  CheckResult,
  EvidenceRef,
  Finding,
  Platform,
  Severity,
  TestMode,
  UiElement,
  VersionStamp,
} from "@tapscout/shared";
import type { NormalizedScreen } from "./observer.js";

const INTERACTIVE = new Set(["button", "link", "switch", "checkbox", "tab", "text_field", "cell"]);
const CONTROL = new Set(["button", "link", "tab", "cell"]);

/** Recommended / minimum touch target, in dp (Android) or pt (iOS) — docs/03 §6.4. */
export const TOUCH_TARGET = {
  android: { recommended: 48, minimum: 32 },
  ios: { recommended: 44, minimum: 28 },
} as const;

const ACCOUNT_CREATION = /\b(sign ?up|register|create (an |your )?(account|profile))\b/i;
const ACCOUNT_DELETION = /\b(delete|remove|close|erase)\b.{0,16}\b(account|profile|my data)\b/i;
const PRIVACY = /\bprivacy\b/i;

/** Dated rule references (docs/03 §6.5): the rule pack, never model memory. */
const RULES = {
  accountDeletion: {
    ios: {
      ruleId: "apple-app-review-5.1.1",
      sourceUrl: "https://developer.apple.com/app-store/review/guidelines/#privacy",
      checkedOn: "2026-10-11",
    },
    android: {
      ruleId: "google-play-account-deletion",
      sourceUrl: "https://support.google.com/googleplay/android-developer/answer/13327111",
      checkedOn: "2026-10-11",
    },
  },
  privacyPolicy: {
    ios: {
      ruleId: "apple-app-review-5.1.1",
      sourceUrl: "https://developer.apple.com/app-store/review/guidelines/#privacy",
      checkedOn: "2026-10-11",
    },
    android: {
      ruleId: "google-play-user-data",
      sourceUrl: "https://support.google.com/googleplay/android-developer/answer/10144311",
      checkedOn: "2026-10-11",
    },
  },
} as const;

export interface ScreenSighting {
  screenLabel: string;
  element: UiElement;
  artifactId: string;
  step: number;
}

export interface CrashRecord {
  afterAction: string;
  screenLabel: string;
  detail: string;
  artifactId?: string;
  step: number;
}

export interface StressProbe {
  formLabel: string;
  fieldLabel: string;
  submitLabel: string;
  outcome: "crash" | "survived" | "inconclusive";
  detail: string;
  reproduction: Finding["reproduction"];
  evidence: EvidenceRef[];
}

export interface ClippingCandidate {
  screenLabel: string;
  text: string;
  artifactId: string;
}

function name(e: UiElement): string {
  return e.label ?? e.text ?? e.stableId ?? e.role;
}

function key(e: UiElement, screenLabel: string): string {
  return (
    e.stableId ?? `${screenLabel}|${e.role}|${e.label ?? e.text ?? `${e.bounds.x},${e.bounds.y}`}`
  );
}

export class ModeTracker {
  readonly screens = new Set<string>();
  /** Interactive controls seen (by identity) — the scope of the accessibility checks. */
  readonly controls = new Set<string>();
  readonly unlabeled = new Map<string, ScreenSighting>();
  readonly smallTargets = new Map<string, ScreenSighting & { size: { w: number; h: number } }>();
  /** App controls covered by the open keyboard, and controls seen without the keyboard. */
  readonly covered = new Map<string, ScreenSighting>();
  private readonly seenUncovered = new Set<string>();
  keyboardSeenOpen = false;
  readonly clipping: ClippingCandidate[] = [];
  visionScreens = 0;
  accountCreation: { screenLabel: string; artifactId: string } | null = null;
  deletionEntry: ScreenSighting | null = null;
  privacyEntry: ScreenSighting | null = null;
  privacyOpened: { artifactId: string } | null = null;
  readonly crashes: CrashRecord[] = [];
  readonly stress: StressProbe[] = [];
  /** Form screen → the control that submitted it (for the Stress probe). */
  readonly formSubmits = new Map<string, UiElement>();

  constructor(
    private readonly platform: Platform,
    /** Screenshot pixels per dp (Android) or pt (iOS). */
    private unitScale: number,
  ) {}

  setUnitScale(scale: number): void {
    if (scale > 0) this.unitScale = scale;
  }

  observe(screenLabel: string, screen: NormalizedScreen, artifactId: string, step: number): void {
    this.screens.add(screenLabel);
    if (screen.keyboardVisible) this.keyboardSeenOpen = true;
    const limits = TOUCH_TARGET[this.platform];
    for (const e of screen.elements) {
      const sighting = { screenLabel, element: e, artifactId, step };
      const k = key(e, screenLabel);
      if (!INTERACTIVE.has(e.role) || !e.enabled) continue;
      if (!e.visible) {
        // Covered by the keyboard: only app controls count, i.e. ones also seen uncovered.
        if (screen.keyboardVisible && CONTROL.has(e.role)) this.covered.set(k, sighting);
        continue;
      }
      this.seenUncovered.add(k);
      this.controls.add(k);
      if (!e.label && !e.text && e.role !== "cell") {
        if (!this.unlabeled.has(k)) this.unlabeled.set(k, sighting);
      }
      if (e.role !== "text_field") {
        const w = e.bounds.width / this.unitScale;
        const h = e.bounds.height / this.unitScale;
        if (Math.min(w, h) < limits.recommended && !this.smallTargets.has(k)) {
          this.smallTargets.set(k, { ...sighting, size: { w: Math.round(w), h: Math.round(h) } });
        }
      }
      const text = `${e.label ?? ""} ${e.text ?? ""}`;
      if (CONTROL.has(e.role) && ACCOUNT_DELETION.test(text)) this.deletionEntry ??= sighting;
      if (CONTROL.has(e.role) && PRIVACY.test(text)) this.privacyEntry ??= sighting;
    }
    const hasFields = screen.elements.some((e) => e.role === "text_field" && !e.masked);
    if (
      hasFields &&
      !this.accountCreation &&
      (ACCOUNT_CREATION.test(screenLabel) ||
        screen.elements.some((e) => e.role === "text" && ACCOUNT_CREATION.test(e.text ?? "")))
    ) {
      this.accountCreation = { screenLabel, artifactId };
    }
  }

  /** Action outcomes: form submits (for Stress) and an opened privacy policy. */
  noteAction(o: {
    type: string;
    target?: UiElement;
    fromLabel: string;
    fromHadFields: boolean;
    toLabel: string | null;
    leftApp: boolean;
    artifactId: string;
  }): void {
    if (o.type !== "tap" || !o.target) return;
    const text = `${o.target.label ?? ""} ${o.target.text ?? ""}`;
    if (PRIVACY.test(text) && o.leftApp) this.privacyOpened ??= { artifactId: o.artifactId };
    const back =
      o.target.stableId === "BackButton" || /^(navigate up|back)$/i.test(o.target.label ?? "");
    if (o.fromHadFields && !back && o.toLabel && o.toLabel !== o.fromLabel) {
      this.formSubmits.set(o.fromLabel, o.target);
    }
  }

  /** Covered controls that are real app controls (seen uncovered elsewhere in the session). */
  coveredAppControls(): ScreenSighting[] {
    return [...this.covered.entries()].filter(([k]) => this.seenUncovered.has(k)).map(([, v]) => v);
  }
}

// ---- Results ----------------------------------------------------------------------------------

export interface CheckContext {
  platform: Platform;
  modes: TestMode[];
  run: { runId: string; sessionId: string };
  versions: VersionStamp;
  newId(): string;
  now(): number;
  device: string;
}

const NOT_ATTEMPTED: Finding["reproduction"] = {
  target: 0,
  started: 0,
  valid: 0,
  symptom: 0,
  blocked: [],
};

function list(items: string[], max = 4): string {
  const shown = items.slice(0, max).map((s) => `"${s}"`);
  return items.length > max
    ? `${shown.join(", ")} and ${items.length - max} more`
    : shown.join(", ");
}

/** Check and finding results for every selected non-Functional mode. */
export function buildModeChecks(
  t: ModeTracker,
  ctx: CheckContext,
): { checks: CheckResult[]; findings: Finding[] } {
  const checks: CheckResult[] = [];
  const findings: Finding[] = [];
  const has = (m: TestMode) => ctx.modes.includes(m);
  const screensScope = `Screens reached: ${list([...t.screens], 8)}`.slice(0, 300);

  const finding = (f: {
    mode: TestMode;
    checkId: string;
    title: string;
    expected: string;
    observed: string;
    basis: Finding["expectationBasis"];
    kind: Finding["evidenceKind"];
    verification: Finding["verification"];
    severity: Severity;
    rationale: string;
    confidence?: Finding["confidence"];
    evidence: EvidenceRef[];
    reproduction?: Finding["reproduction"];
    replay?: Finding["replay"];
  }): string => {
    const findingId = ctx.newId();
    findings.push({
      findingId,
      runId: ctx.run.runId,
      sessionId: ctx.run.sessionId,
      platform: ctx.platform,
      mode: f.mode,
      checkId: f.checkId,
      title: f.title.slice(0, 160),
      expected: f.expected.slice(0, 600),
      observed: f.observed.slice(0, 600),
      expectationBasis: f.basis,
      evidenceKind: f.kind,
      verification: f.verification,
      reproduction: f.reproduction ?? NOT_ATTEMPTED,
      confidence: f.confidence ?? "medium",
      severity: f.severity,
      severityRationale: f.rationale.slice(0, 400),
      conditions: [ctx.device],
      replay: f.replay,
      evidence: f.evidence,
      versions: ctx.versions,
      createdAt: new Date(ctx.now()).toISOString(),
    });
    return findingId;
  };

  const check = (
    c: Omit<CheckResult, "platform" | "evidence" | "findingIds"> & {
      findingIds?: string[];
      evidence?: EvidenceRef[];
    },
  ) =>
    checks.push({
      ...c,
      platform: ctx.platform,
      summary: c.summary.slice(0, 400),
      scope: c.scope.slice(0, 300),
      findingIds: c.findingIds ?? [],
      evidence: c.evidence ?? [],
    });

  // ---- Accessibility --------------------------------------------------------------------------
  if (has("accessibility")) {
    const unlabeled = [...t.unlabeled.values()];
    const ids = unlabeled.map((u) =>
      finding({
        mode: "accessibility",
        checkId: "a11y.control_labels",
        title: `${u.element.role === "text_field" ? "Text field" : "Control"} without an accessibility label on "${u.screenLabel}"`,
        expected: "Every interactive control exposes a label that screen readers announce.",
        observed: `A ${u.element.role.replace("_", " ")}${u.element.stableId ? ` (id ${u.element.stableId})` : ""} on "${u.screenLabel}" has neither a label nor visible text in the accessibility hierarchy.`,
        basis: "platform_rule",
        kind: "measured",
        verification: "potential_issue",
        severity: "medium",
        rationale:
          "Screen-reader users cannot tell what this control does. Not confirmed with TalkBack/VoiceOver; a merged parent label could exist.",
        evidence: [{ artifactId: u.artifactId, role: "symptom", region: u.element.bounds }],
      }),
    );
    check({
      checkId: "a11y.control_labels",
      mode: "accessibility",
      status:
        t.controls.size === 0
          ? "not_tested"
          : unlabeled.length > 0
            ? "failed"
            : "passed_within_scope",
      summary:
        t.controls.size === 0
          ? "No interactive controls were observed."
          : unlabeled.length > 0
            ? `${unlabeled.length} of ${t.controls.size} controls have no label: ${list(unlabeled.map((u) => `${u.element.stableId ?? u.element.role} on ${u.screenLabel}`))}.`
            : `All ${t.controls.size} interactive controls seen expose a label or text.`,
      scope: screensScope,
      findingIds: ids,
    });

    const limits = TOUCH_TARGET[ctx.platform];
    const unit = ctx.platform === "ios" ? "pt" : "dp";
    const small = [...t.smallTargets.values()];
    const tiny = small.filter((s) => Math.min(s.size.w, s.size.h) < limits.minimum);
    const tinyIds = tiny.map((s) =>
      finding({
        mode: "accessibility",
        checkId: "a11y.touch_targets",
        title: `Very small touch target "${name(s.element)}" on "${s.screenLabel}"`,
        expected: `Touch targets of at least ${limits.recommended}×${limits.recommended}${unit} (minimum ${limits.minimum}${unit}).`,
        observed: `The control measures ${s.size.w}×${s.size.h}${unit} in the hierarchy.`,
        basis: "platform_rule",
        kind: "measured",
        verification: "potential_issue",
        severity: "low",
        rationale:
          "Hard to hit for users with limited dexterity; the real hit area may be larger than the drawn bounds.",
        evidence: [{ artifactId: s.artifactId, role: "symptom", region: s.element.bounds }],
      }),
    );
    check({
      checkId: "a11y.touch_targets",
      mode: "accessibility",
      status:
        t.controls.size === 0
          ? "not_tested"
          : tiny.length > 0
            ? "failed"
            : small.length > 0
              ? "inconclusive"
              : "passed_within_scope",
      summary:
        t.controls.size === 0
          ? "No interactive controls were observed."
          : small.length > 0
            ? `Below the ${limits.recommended}${unit} recommendation (drawn bounds; the hit area may be larger): ${list(small.map((s) => `${name(s.element)} ${s.size.w}×${s.size.h}${unit}`))}.`
            : `All ${t.controls.size} controls seen are at least ${limits.recommended}${unit}.`,
      scope: screensScope,
      findingIds: tinyIds,
    });
  }

  // ---- UI / UX --------------------------------------------------------------------------------
  if (has("ui_ux")) {
    const covered = t.coveredAppControls();
    const ids = covered.map((c) =>
      finding({
        mode: "ui_ux",
        checkId: "ui.keyboard_occlusion",
        title: `"${name(c.element)}" is hidden by the keyboard on "${c.screenLabel}"`,
        expected: "The main action of a form stays reachable while the user is typing.",
        observed: `With the software keyboard open, "${name(c.element)}" lies under the keyboard; it could only be reached after closing the keyboard.`,
        basis: "ui_semantics",
        kind: "measured",
        verification: "observed",
        severity: "medium",
        rationale:
          "Users must know to dismiss the keyboard to continue; the flow is not blocked once it is closed.",
        evidence: [{ artifactId: c.artifactId, role: "symptom", region: c.element.bounds }],
      }),
    );
    check({
      checkId: "ui.keyboard_occlusion",
      mode: "ui_ux",
      status:
        ctx.platform === "android"
          ? covered.length > 0
            ? "failed"
            : "unsupported"
          : !t.keyboardSeenOpen
            ? "not_tested"
            : covered.length > 0
              ? "failed"
              : "passed_within_scope",
      summary:
        covered.length > 0
          ? `Covered by the keyboard: ${list(covered.map((c) => `${name(c.element)} on ${c.screenLabel}`))}.`
          : ctx.platform === "android"
            ? "The Android hierarchy does not expose the keyboard frame; occlusion is not measured."
            : t.keyboardSeenOpen
              ? "No app control was covered while the keyboard was open."
              : "The keyboard was never open during the run.",
      scope: screensScope,
      findingIds: ids,
    });

    const clipIds = t.clipping.map((c) =>
      finding({
        mode: "ui_ux",
        checkId: "ui.text_clipping",
        title: `Text appears cut off on "${c.screenLabel}"`,
        expected: "Text is fully visible, wraps, or ends with an ellipsis.",
        observed: `The vision model reported "${c.text}" as cut off; the hierarchy holds a longer text that starts this way.`,
        basis: "heuristic",
        kind: "ai_visual",
        verification: "potential_issue",
        severity: "low",
        confidence: "low",
        rationale: "Users may not see the full content; visual AI estimate, not a measurement.",
        evidence: [{ artifactId: c.artifactId, role: "symptom" }],
      }),
    );
    check({
      checkId: "ui.text_clipping",
      mode: "ui_ux",
      status:
        t.clipping.length > 0
          ? "failed"
          : t.visionScreens > 0
            ? "passed_within_scope"
            : "not_tested",
      summary:
        t.clipping.length > 0
          ? `Possibly clipped text: ${list(t.clipping.map((c) => `${c.text} (${c.screenLabel})`))}.`
          : t.visionScreens > 0
            ? `No clipped text reported on ${t.visionScreens} screens checked visually.`
            : "No screen with long text was checked visually.",
      scope: `Visual check (AI estimate) on ${t.visionScreens} screens`,
      findingIds: clipIds,
    });
  }

  // ---- Store readiness ------------------------------------------------------------------------
  if (has("store_readiness")) {
    const rule = RULES.accountDeletion[ctx.platform];
    if (!t.accountCreation) {
      check({
        checkId: "store.account_deletion",
        mode: "store_readiness",
        status: "not_tested",
        storeStatus: "not_assessed",
        summary: "No account creation was observed, so the deletion requirement was not assessed.",
        scope: screensScope,
        ruleRef: rule,
      });
    } else if (t.deletionEntry) {
      check({
        checkId: "store.account_deletion",
        mode: "store_readiness",
        status: "passed_within_scope",
        storeStatus: "evidence_found",
        summary: `Account creation on "${t.accountCreation.screenLabel}"; in-app deletion entry "${name(t.deletionEntry.element)}" found on "${t.deletionEntry.screenLabel}". Deleting server data is not verified.`,
        scope: screensScope,
        ruleRef: rule,
        evidence: [
          {
            artifactId: t.deletionEntry.artifactId,
            role: "symptom",
            region: t.deletionEntry.element.bounds,
          },
        ],
      });
    } else {
      const id = finding({
        mode: "store_readiness",
        checkId: "store.account_deletion",
        title: "No in-app account deletion found although the app creates an account",
        expected: `Apps that let users create an account offer a way to delete it from within the app (${rule.ruleId}).`,
        observed: `An account/profile is created on "${t.accountCreation.screenLabel}", but no delete-account entry was found on the ${t.screens.size} screens reached.`,
        basis: "platform_rule",
        kind: "measured",
        verification: "potential_issue",
        severity: "medium",
        rationale:
          "Possible store rejection. Not finding the entry is not proof it does not exist on unvisited screens.",
        evidence: [{ artifactId: t.accountCreation.artifactId, role: "symptom" }],
      });
      check({
        checkId: "store.account_deletion",
        mode: "store_readiness",
        status: "inconclusive",
        storeStatus: "potential_risk",
        summary: `Account creation seen on "${t.accountCreation.screenLabel}"; no deletion entry found on the screens reached.`,
        scope: screensScope,
        ruleRef: rule,
        findingIds: [id],
      });
    }

    const prule = RULES.privacyPolicy[ctx.platform];
    if (t.privacyEntry) {
      check({
        checkId: "store.privacy_policy",
        mode: "store_readiness",
        status: "passed_within_scope",
        storeStatus: "evidence_found",
        summary: `Privacy policy entry "${name(t.privacyEntry.element)}" on "${t.privacyEntry.screenLabel}"${t.privacyOpened ? "; opening it left the app for an external page" : "; it was not opened during the run"}. The policy content is not reviewed.`,
        scope: screensScope,
        ruleRef: prule,
        evidence: [
          {
            artifactId: t.privacyEntry.artifactId,
            role: "symptom",
            region: t.privacyEntry.element.bounds,
          },
          ...(t.privacyOpened
            ? [{ artifactId: t.privacyOpened.artifactId, role: "after" as const }]
            : []),
        ],
      });
    } else {
      check({
        checkId: "store.privacy_policy",
        mode: "store_readiness",
        status: "inconclusive",
        storeStatus: "needs_additional_information",
        summary:
          "No privacy policy entry was found on the screens reached; the store listing link is not checked.",
        scope: screensScope,
        ruleRef: prule,
      });
    }
  }

  // ---- Stress ---------------------------------------------------------------------------------
  if (has("stress")) {
    const ids: string[] = [];
    for (const p of t.stress.filter((s) => s.outcome === "crash")) {
      ids.push(
        finding({
          mode: "stress",
          checkId: "stress.long_text",
          title: `App closes after saving long text in ${p.fieldLabel}`,
          expected:
            "Long input is accepted, shortened or rejected with a message; the app keeps running.",
          observed: `After entering bounded long text (~330 characters) in ${p.fieldLabel} on "${p.formLabel}" and tapping "${p.submitLabel}", the app process was no longer running. ${p.detail}`,
          basis: "runtime_signal",
          kind: "runtime_signal",
          verification: p.reproduction.symptom > 0 ? "reproduced" : "observed",
          severity: "high",
          confidence:
            p.reproduction.valid > 0 && p.reproduction.symptom === p.reproduction.valid
              ? "high"
              : "medium",
          rationale:
            "A crash loses the user's input and interrupts the flow; reachable with ordinary typing.",
          evidence: p.evidence,
          reproduction: p.reproduction,
          replay: {
            precondition: `"${p.formLabel}" open with app data from this session.`,
            resets: ["app_process"],
            path: [
              { index: 0, description: `Open "${p.formLabel}"` },
              { index: 1, description: `Type long text into ${p.fieldLabel}` },
              { index: 2, description: `Tap "${p.submitLabel}"` },
            ],
            perturbation: "Bounded long text (~330 characters)",
            observe: "The app keeps running.",
          },
        }),
      );
    }
    for (const c of t.crashes) {
      ids.push(
        finding({
          mode: "stress",
          checkId: "stress.crash",
          title: `App stopped after ${c.afterAction}`.slice(0, 160),
          expected: "The app keeps running after ordinary interaction.",
          observed: `After "${c.afterAction}" on "${c.screenLabel}" the app process was no longer running. ${c.detail}`,
          basis: "runtime_signal",
          kind: "runtime_signal",
          verification: "observed",
          severity: "high",
          rationale: "An unexpected process exit interrupts the user and can lose data.",
          evidence: c.artifactId ? [{ artifactId: c.artifactId, role: "symptom" }] : [],
        }),
      );
    }
    const probes = t.stress;
    check({
      checkId: "stress.long_text",
      mode: "stress",
      status:
        probes.length === 0
          ? "not_tested"
          : probes.some((p) => p.outcome === "crash")
            ? "failed"
            : probes.every((p) => p.outcome === "survived")
              ? "passed_within_scope"
              : "inconclusive",
      summary:
        probes.length === 0
          ? "No form that had been submitted before was reached again for a long-text probe."
          : probes
              .map((p) => `${p.formLabel} / ${p.fieldLabel}: ${p.outcome} (${p.detail})`)
              .join("; "),
      scope: `Long text on ${list(probes.map((p) => p.formLabel)) || "no forms"}`,
      findingIds: ids.slice(0, probes.filter((p) => p.outcome === "crash").length),
    });
    check({
      checkId: "stress.crash",
      mode: "stress",
      status: t.crashes.length > 0 ? "failed" : "passed_within_scope",
      summary:
        t.crashes.length > 0
          ? `The app stopped ${t.crashes.length} time(s) during exploration: ${list(t.crashes.map((c) => c.afterAction))}.`
          : "The app process did not stop unexpectedly during exploration.",
      scope: screensScope,
      findingIds: ids.slice(probes.filter((p) => p.outcome === "crash").length),
    });
  }

  return { checks, findings };
}
