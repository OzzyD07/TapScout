// Functional mode (docs/03 §6.1): passive bookkeeping during exploration. It notices values the
// agent typed and then saw again on another screen after a save (persistence candidates), form
// validation feedback and working return paths. The active part (relaunch and re-check) lives in
// the agent loop because it drives the device.

import type { CheckResult, UiElement } from "@tapscout/shared";
import { identityOf, type TargetIdentity } from "./state.js";

export interface PersistenceCandidate {
  value: string;
  field: TargetIdentity;
  fieldLabel: string;
  formLabel: string;
  /** Screen that showed the saved value right after the save. */
  screenLabel: string;
  /** The control that saved it (replayed for reproduction). */
  commit: TargetIdentity;
  commitLabel: string;
  savedStep: number;
  /** Screenshot of `screenLabel` showing the value before any relaunch. */
  savedArtifactId: string;
}

export interface FeedbackRecord {
  formLabel: string;
  control: string;
  texts: string[];
  step: number;
  artifactId: string;
}

export interface ReturnPath {
  fromLabel: string;
  toLabel: string;
  control: string;
  step: number;
}

interface WriteRecord {
  value: string;
  field: TargetIdentity;
  fieldLabel: string;
  formLabel: string;
  step: number;
}

export interface ActionOutcome {
  type: string;
  target?: UiElement;
  fromLabel: string;
  fromElements: UiElement[];
  /** Null when the app left the foreground. */
  toLabel: string | null;
  toElements: UiElement[];
  step: number;
  artifactId: string;
}

const MIN_VALUE_LENGTH = 3;
const MAX_CANDIDATES = 6;

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when a display element (not an input) contains the value. */
export function valueVisible(value: string, elements: UiElement[]): boolean {
  const needle = norm(value);
  if (needle.length < MIN_VALUE_LENGTH) return false;
  return elements.some(
    (e) =>
      e.role !== "text_field" &&
      !e.masked &&
      (norm(e.text ?? "").includes(needle) || norm(e.label ?? "").includes(needle)),
  );
}

/** Platform back controls: navigation-bar back buttons and Android's "Navigate up". */
export function isBackControl(target: UiElement | undefined): boolean {
  if (!target) return false;
  return (
    target.stableId === "BackButton" ||
    /^(navigate up|back)$/i.test(target.label ?? "") ||
    /^(navigate up|back)$/i.test(target.text ?? "")
  );
}

function displayName(e: UiElement | TargetIdentity | undefined): string {
  return e?.label ?? e?.text ?? e?.stableId ?? "control";
}

function fieldKey(f: TargetIdentity): string {
  return f.stableId ?? f.label ?? f.text ?? "";
}

function texts(elements: UiElement[]): Set<string> {
  return new Set(
    elements
      .filter((e) => e.role === "text" && (e.text ?? e.label))
      .map((e) => (e.text ?? e.label ?? "").trim()),
  );
}

export class FunctionalTracker {
  private writes: WriteRecord[] = [];
  candidates: PersistenceCandidate[] = [];
  feedback: FeedbackRecord[] = [];
  returnPaths: ReturnPath[] = [];

  noteTyped(value: string, field: UiElement, formLabel: string, step: number): void {
    if (field.masked || norm(value).length < MIN_VALUE_LENGTH) return;
    const key = fieldKey(identityOf(field));
    this.writes = this.writes.filter(
      (w) => !(w.formLabel === formLabel && fieldKey(w.field) === key),
    );
    this.writes.push({
      value: value.trim(),
      field: identityOf(field),
      fieldLabel: displayName(field),
      formLabel,
      step,
    });
  }

  /** Records an action's observed result; returns the persistence candidates it created. */
  noteOutcome(o: ActionOutcome): PersistenceCandidate[] {
    if (o.toLabel === null) return [];
    const created: PersistenceCandidate[] = [];
    const formHasFields = o.fromElements.some((e) => e.role === "text_field");

    if (
      o.type === "tap" &&
      o.toLabel === o.fromLabel &&
      formHasFields &&
      !isBackControl(o.target)
    ) {
      const before = texts(o.fromElements);
      const added = [...texts(o.toElements)].filter(
        (t) => !before.has(t) && t.length >= MIN_VALUE_LENGTH && t.length <= 200,
      );
      if (added.length > 0) {
        this.feedback.push({
          formLabel: o.fromLabel,
          control: displayName(o.target),
          texts: added.slice(0, 3),
          step: o.step,
          artifactId: o.artifactId,
        });
      }
    }

    if (o.toLabel !== o.fromLabel) {
      const back = o.type === "back" || isBackControl(o.target);
      if (back) {
        this.returnPaths.push({
          fromLabel: o.fromLabel,
          toLabel: o.toLabel,
          control: o.type === "back" ? "system back" : displayName(o.target),
          step: o.step,
        });
      } else if (o.type === "tap" && o.target) {
        for (const w of this.writes.filter((x) => x.formLabel === o.fromLabel)) {
          if (!valueVisible(w.value, o.toElements)) continue;
          this.candidates = this.candidates.filter(
            (c) => !(c.screenLabel === o.toLabel && fieldKey(c.field) === fieldKey(w.field)),
          );
          const candidate: PersistenceCandidate = {
            value: w.value,
            field: w.field,
            fieldLabel: w.fieldLabel,
            formLabel: w.formLabel,
            screenLabel: o.toLabel,
            commit: identityOf(o.target),
            commitLabel: displayName(o.target),
            savedStep: o.step,
            savedArtifactId: o.artifactId,
          };
          this.candidates.push(candidate);
          created.push(candidate);
        }
      }
      // Leaving a form ends its unsaved input either way.
      this.writes = this.writes.filter((x) => x.formLabel !== o.fromLabel);
    }

    // A value that is no longer shown on its screen was changed or removed on purpose later.
    this.candidates = this.candidates
      .filter(
        (c) =>
          c.screenLabel !== o.toLabel ||
          c.savedStep === o.step ||
          valueVisible(c.value, o.toElements),
      )
      .slice(-MAX_CANDIDATES);
    return created;
  }
}

// ---- Check results ----------------------------------------------------------------------------

export interface PersistenceProbe {
  candidate: PersistenceCandidate;
  /** kept/lost after relaunch; unreachable when the screen could not be navigated to again. */
  status: "kept" | "lost" | "unreachable";
  afterArtifactId?: string;
  findingId?: string;
}

export interface FunctionalSummary {
  platform: "android" | "ios";
  screenLabels: string[];
  transitions: number;
  failedActions: number;
  tracker: FunctionalTracker;
  /** Null when the persistence probe did not run, with the reason. */
  probes: PersistenceProbe[] | { skipped: string };
}

function list(items: string[], max = 5): string {
  const shown = items.slice(0, max).map((s) => `"${s}"`);
  return items.length > max
    ? `${shown.join(", ")} and ${items.length - max} more`
    : shown.join(", ");
}

/**
 * Functional check results for one platform (docs/05 §5). A pass only covers the screens that
 * were reached; nothing observed means `not_tested`, never a pass.
 */
export function buildFunctionalChecks(s: FunctionalSummary): CheckResult[] {
  const scopeScreens = `Screens reached: ${list(s.screenLabels, 8)}`.slice(0, 300);
  const checks: CheckResult[] = [];

  checks.push({
    checkId: "functional.flow_transitions",
    mode: "functional",
    platform: s.platform,
    status: s.transitions > 0 ? "passed_within_scope" : "not_tested",
    summary: (s.transitions > 0
      ? `${s.transitions} screen transitions observed across ${s.screenLabels.length} screens` +
        (s.failedActions > 0 ? `; ${s.failedActions} actions could not be executed.` : ".")
      : "No screen transition was observed."
    ).slice(0, 400),
    scope: scopeScreens,
    findingIds: [],
    evidence: [],
  });

  const fb = s.tracker.feedback;
  checks.push({
    checkId: "functional.form_feedback",
    mode: "functional",
    platform: s.platform,
    status: fb.length > 0 ? "passed_within_scope" : "not_tested",
    summary: (fb.length > 0
      ? `Forms answered submissions with visible feedback: ${fb
          .slice(0, 3)
          .map((f) => `${f.formLabel} → ${list(f.texts, 2)}`)
          .join("; ")}.`
      : "No form submission produced on-screen feedback during exploration."
    ).slice(0, 400),
    scope: `Forms: ${list([...new Set(fb.map((f) => f.formLabel))]) || "none submitted"}`.slice(
      0,
      300,
    ),
    findingIds: [],
    evidence: fb.slice(0, 3).map((f) => ({ artifactId: f.artifactId, role: "after" as const })),
  });

  const back = s.tracker.returnPaths;
  checks.push({
    checkId: "functional.return_paths",
    mode: "functional",
    platform: s.platform,
    status: back.length > 0 ? "passed_within_scope" : "not_tested",
    summary: (back.length > 0
      ? `Return paths worked: ${back
          .slice(0, 4)
          .map((b) => `${b.fromLabel} → ${b.toLabel} (${b.control})`)
          .join("; ")}.`
      : "No back or close action was observed."
    ).slice(0, 400),
    scope: scopeScreens,
    findingIds: [],
    evidence: [],
  });

  if (!Array.isArray(s.probes)) {
    checks.push({
      checkId: "functional.persistence",
      mode: "functional",
      platform: s.platform,
      status: "not_tested",
      summary: s.probes.skipped.slice(0, 400),
      scope: "Save → relaunch → re-open",
      findingIds: [],
      evidence: [],
    });
  } else {
    const lost = s.probes.filter((p) => p.status === "lost");
    const kept = s.probes.filter((p) => p.status === "kept");
    const status =
      lost.length > 0 ? "failed" : kept.length > 0 ? "passed_within_scope" : "inconclusive";
    const describe = (p: PersistenceProbe) =>
      `${p.candidate.fieldLabel} (${p.candidate.formLabel} → ${p.candidate.screenLabel})`;
    checks.push({
      checkId: "functional.persistence",
      mode: "functional",
      platform: s.platform,
      status,
      summary: [
        lost.length > 0 ? `Lost after relaunch: ${lost.map(describe).join("; ")}.` : "",
        kept.length > 0 ? `Kept after relaunch: ${kept.map(describe).join("; ")}.` : "",
        s.probes.some((p) => p.status === "unreachable")
          ? "Some screens could not be reached again after the relaunch."
          : "",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 400),
      scope: `Saved values re-checked after an app relaunch on: ${list([
        ...new Set(s.probes.map((p) => p.candidate.screenLabel)),
      ])}`.slice(0, 300),
      findingIds: lost.flatMap((p) => (p.findingId ? [p.findingId] : [])),
      evidence: s.probes.flatMap((p) => [
        { artifactId: p.candidate.savedArtifactId, role: "before" as const },
        ...(p.afterArtifactId ? [{ artifactId: p.afterArtifactId, role: "after" as const }] : []),
      ]),
    });
  }
  return checks;
}
