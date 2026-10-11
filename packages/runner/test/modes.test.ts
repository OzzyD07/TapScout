import {
  type ChatMessage,
  CheckResult,
  DEFAULT_PLATFORM_BUDGET,
  Finding,
  type RelayResponse,
  type RunEventInput,
  runVersionStamp,
  type SessionCounters,
  type TestMode,
  type UiElement,
} from "@tapscout/shared";
import { describe, expect, it, vi } from "vitest";
import { type AgentDevice, capFindings, crashSignature, runAgent } from "../src/agent.js";
import { buildModeChecks, groundClipping, ModeTracker } from "../src/checks.js";
import type { NormalizedScreen } from "../src/observer.js";

const el = (over: Partial<UiElement>): UiElement => ({
  ref: "el-1",
  role: "button",
  platformClass: "x",
  bounds: { x: 0, y: 0, width: 300, height: 150 },
  visible: true,
  enabled: true,
  focused: false,
  clickable: true,
  masked: false,
  ...over,
});

const screen = (elements: UiElement[], keyboardVisible = false): NormalizedScreen => ({
  elements,
  widthPx: 1080,
  heightPx: 2400,
  keyboardVisible,
  dialogVisible: false,
  interruption: null,
  truncated: false,
  secretsVisible: false,
});

const ctx = (modes: TestMode[], platform: "android" | "ios" = "android") => {
  let n = 0;
  return {
    platform,
    modes,
    run: {
      runId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
    },
    versions: runVersionStamp("test"),
    newId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++n).padStart(12, "0")}`,
    now: () => 0,
    device: "Android Emulator",
  };
};

function valid(r: { checks: unknown[]; findings: unknown[] }) {
  for (const c of r.checks) expect(CheckResult.safeParse(c).success).toBe(true);
  for (const f of r.findings) expect(Finding.safeParse(f).success).toBe(true);
}

describe("accessibility", () => {
  it("flags controls without label or text, once per control", () => {
    const t = new ModeTracker("android", 2.625);
    const icon = el({
      stableId: "profile-settings",
      bounds: { x: 913, y: 336, width: 126, height: 126 },
    });
    const labelled = el({ stableId: "profile-edit", label: "Edit profile" });
    t.observe("Profile", screen([icon, labelled]), "shot-1", 1);
    t.observe("Profile", screen([icon, labelled]), "shot-2", 2);
    const r = buildModeChecks(t, ctx(["accessibility"]));
    valid(r);
    const labels = r.checks.find((c) => c.checkId === "a11y.control_labels");
    expect(labels).toMatchObject({ status: "failed" });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      verification: "potential_issue",
      expectationBasis: "platform_rule",
      evidence: [{ artifactId: "shot-1", role: "symptom" }],
    });
    // 126 px at 2.625 px/dp = 48 dp: meets the Android recommendation.
    expect(r.checks.find((c) => c.checkId === "a11y.touch_targets")?.status).toBe(
      "passed_within_scope",
    );
  });

  it("lists targets under the recommendation as inconclusive and reports only very small ones", () => {
    const t = new ModeTracker("ios", 3);
    t.observe(
      "Profile",
      screen([
        el({ label: "Settings", bounds: { x: 0, y: 300, width: 120, height: 120 } }), // 40pt
        el({ label: "Close", bounds: { x: 0, y: 300, width: 60, height: 60 } }), // 20pt
      ]),
      "s",
      1,
    );
    const r = buildModeChecks(t, ctx(["accessibility"], "ios"));
    valid(r);
    expect(r.checks.find((c) => c.checkId === "a11y.touch_targets")).toMatchObject({
      status: "failed",
    });
    expect(r.findings.map((f) => f.title)).toEqual([
      'Very small touch target "Close" on "Profile"',
    ]);
  });
});

describe("accessibility on real apps (benchmark runs f86858fd, e24b2ce6)", () => {
  it("reads a clickable row by the texts inside it, but not an image-only tile", () => {
    const t = new ModeTracker("android", 2.625);
    const row = el({
      platformClass: "android.widget.LinearLayout",
      bounds: { x: 527, y: 178, width: 543, height: 126 },
    });
    const title = el({
      role: "text",
      clickable: false,
      text: "Refresh",
      bounds: { x: 600, y: 200, width: 200, height: 60 },
    });
    const tile = el({
      platformClass: "android.widget.LinearLayout",
      bounds: { x: 42, y: 545, width: 249, height: 249 },
    });
    t.observe("Add podcast", screen([row, title, tile]), "s", 1);
    const r = buildModeChecks(t, ctx(["accessibility"]));
    valid(r);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.evidence[0]?.region).toEqual(tile.bounds);
  });

  it("does not measure inline links of web content (ca26b0b3: release notes)", () => {
    const t = new ModeTracker("android", 2.625);
    const web = el({
      role: "web_view",
      clickable: false,
      bounds: { x: 0, y: 300, width: 1080, height: 1800 },
    });
    const mention = el({
      label: "@NatsuCamellia",
      bounds: { x: 464, y: 1083, width: 376, height: 60 },
    });
    t.observe("Release notes", screen([web, mention]), "s", 1);
    expect(buildModeChecks(t, ctx(["accessibility"])).findings).toEqual([]);
  });

  it("treats a non-clickable checkbox inside a labelled row as part of the row", () => {
    const t = new ModeTracker("android", 2.625);
    const row = el({ label: "Sort by date", bounds: { x: 545, y: 556, width: 525, height: 126 } });
    const box = el({
      role: "checkbox",
      clickable: false,
      bounds: { x: 902, y: 580, width: 60, height: 60 },
    });
    t.observe("Sort", screen([row, box]), "s", 1);
    const r = buildModeChecks(t, ctx(["accessibility"]));
    expect(r.findings).toEqual([]);
  });

  it("groups the same issue per screen and counts a control seen again on another screen once", () => {
    const t = new ModeTracker("android", 2.625);
    const sw = (y: number) =>
      el({
        role: "switch",
        platformClass: "android.widget.Switch",
        bounds: { x: 895, y, width: 122, height: 71 },
      });
    const switches = [sw(699), sw(1427), sw(1574)];
    t.observe("Settings", screen(switches), "en", 1);
    // The same page after the app language changed (f86858fd: "Instellings").
    t.observe("Instellings", screen(switches), "af", 2);
    const r = buildModeChecks(t, ctx(["accessibility"]));
    valid(r);
    expect(r.findings.map((f) => f.title)).toEqual([
      '3 switches without an accessibility label on "Settings"',
      '3 very small touch targets ("switch") on "Settings"',
    ]);
    expect(r.findings[0]?.evidence.map((e) => e.region?.y)).toEqual([699, 1427, 1574]);
  });

  it("measures a switch cut off by the scroll edge by its full-size twin", () => {
    const t = new ModeTracker("android", 2.625);
    const sw = (y: number, height: number) =>
      el({
        role: "switch",
        platformClass: "android.widget.Switch",
        label: `s${y}`,
        bounds: { x: 895, y, width: 122, height },
      });
    // 122×71 px = 46×27 dp (a real, small switch) and the same switch clipped to 33 px.
    t.observe("Settings", screen([sw(1427, 71), sw(2238, 33)]), "s", 1);
    const r = buildModeChecks(t, ctx(["accessibility"]));
    expect(r.findings.map((f) => f.evidence[0]?.region?.y)).toEqual([1427]);

    // A name link cut by the bottom edge of the screen (0b8ca5e6): 113×81 px, ends at 2400.
    const edge = new ModeTracker("android", 2.625);
    edge.observe(
      "Comments",
      screen([el({ label: "N0x0n", bounds: { x: 74, y: 2319, width: 113, height: 81 } })]),
      "s",
      1,
    );
    expect(buildModeChecks(edge, ctx(["accessibility"])).findings).toEqual([]);
    // Nor is a row cut by the edge reported as unlabeled: its text may be below it (23a8e69a).
    const cut = new ModeTracker("android", 2.625);
    cut.observe(
      "Feed",
      screen([el({ bounds: { x: 0, y: 2369, width: 329, height: 31 } })]),
      "s",
      1,
    );
    expect(buildModeChecks(cut, ctx(["accessibility"])).findings).toEqual([]);
  });
});

describe("ui/ux keyboard occlusion", () => {
  it("does not compare a form with a field-less view of the same name (59785198)", () => {
    const t = new ModeTracker("android", 2.625);
    const next = el({ label: "Next", bounds: { x: 84, y: 2182, width: 912, height: 134 } });
    t.observe("Sync", screen([next]), "intro", 1);
    const field = el({ role: "text_field", label: "Email", stableId: "email" });
    t.observe("Sync", screen([field], true), "form", 2);
    expect(buildModeChecks(t, ctx(["ui_ux"])).findings).toEqual([]);
  });

  it("does not count bottom navigation that Android hides behind the keyboard (f86858fd)", () => {
    const t = new ModeTracker("android", 2.625);
    const field = el({ role: "text_field", label: "Search", stableId: "search" });
    const tabs = ["Recent", "Calendar", "Settings"].map((label, i) =>
      el({ label, bounds: { x: i * 360, y: 2272, width: 360, height: 128 } }),
    );
    const save = el({
      label: "Save",
      stableId: "save",
      bounds: { x: 0, y: 1900, width: 1080, height: 150 },
    });
    t.observe("Profile", screen([field, save, ...tabs]), "closed", 1);
    t.observe("Profile", screen([field], true), "open", 2);
    const r = buildModeChecks(t, ctx(["ui_ux"]));
    expect(r.findings.map((f) => f.title)).toEqual([
      '"Save" is hidden by the keyboard on "Profile"',
    ]);
  });

  it("reports an app control seen under the keyboard and elsewhere uncovered", () => {
    const t = new ModeTracker("ios", 3);
    const cont = el({ stableId: "register-continue", label: "Continue" });
    const emoji = el({ label: "Emoji", visible: false });
    t.observe("Create profile", screen([{ ...cont, visible: false }, emoji], true), "kb", 1);
    t.observe("Create profile", screen([cont]), "nokb", 2);
    const r = buildModeChecks(t, ctx(["ui_ux"], "ios"));
    valid(r);
    expect(r.findings.map((f) => f.title)).toEqual([
      '"Continue" is hidden by the keyboard on "Create profile"',
    ]);
    expect(r.checks.find((c) => c.checkId === "ui.keyboard_occlusion")?.status).toBe("failed");
    expect(r.checks.find((c) => c.checkId === "ui.text_clipping")?.status).toBe("not_tested");
  });
});

describe("android keyboard occlusion", () => {
  it("reports a control that disappears from the hierarchy while the keyboard is open", () => {
    const t = new ModeTracker("android", 2.625);
    const field = el({ role: "text_field", label: "Name", stableId: "register-name" });
    const cont = el({
      stableId: "register-continue",
      label: "Continue",
      bounds: { x: 63, y: 2050, width: 954, height: 147 },
    });
    // A list row under the form is content, not the form's action (c522e6d1).
    const row = el({
      label:
        "Recent Your recent list is currently empty. Chat with your team and you will find all your recent meetings here.",
      bounds: { x: 0, y: 1400, width: 1080, height: 300 },
    });
    t.observe("Create profile", screen([field, cont, row]), "closed", 1);
    t.observe("Create profile", screen([field], true), "open", 2);
    const r = buildModeChecks(t, ctx(["ui_ux"]));
    valid(r);
    expect(r.findings.map((f) => f.title)).toEqual([
      '"Continue" is hidden by the keyboard on "Create profile"',
    ]);
    expect(r.findings[0]?.evidence[0]?.artifactId).toBe("open");
  });

  it("does not take an unnamed icon that moved up with the form for a hidden one (398fa898)", () => {
    const t = new ModeTracker("android", 2.625);
    const user = el({ role: "text_field", label: "Email or username" });
    const pass = (y: number) =>
      el({
        role: "text_field",
        label: "Password",
        masked: true,
        bounds: { x: 174, y, width: 732, height: 144 },
      });
    // The eye icon has neither id nor text: its identity is where it sits.
    const eye = (y: number) => el({ bounds: { x: 783, y, width: 126, height: 126 } });
    t.observe("Login", screen([user, pass(1300), eye(1309)]), "closed", 1);
    t.observe("Login", screen([user, pass(858), eye(867)], true), "open", 2);
    const r = buildModeChecks(t, ctx(["ui_ux"]));
    valid(r);
    expect(r.findings.filter((f) => f.checkId === "ui.keyboard_occlusion")).toEqual([]);
  });
});

describe("clipping grounding (real model answers)", () => {
  const row = el({
    role: "button",
    label:
      "Welcome to FieldNotes: tap a note to read it, or add your own from this list, Notes stay on this device. Delete this one from its detail screen.",
  });

  it("keeps a half-hidden line even when its last word is misread (seeded, run 2ce8b240)", () => {
    expect(
      groundClipping(["Notes stay on this device. Delete this one from its do"], [row]),
    ).toEqual(["Notes stay on this device. Delete this one from its do"]);
  });

  it("drops a whole sentence of a longer multi-line text (benchmark run 5cf50571)", () => {
    const rules = el({
      role: "text",
      text: "• Sexually explicit or violent media must be marked as sensitive or with a content warning • No racism, sexism, homophobia, transphobia, ableism, xenophobia, or casteism. • No incitement of violence",
    });
    expect(
      groundClipping(
        ["No racism, sexism, homophobia, transphobia, ableism, xenophobia, or casteism."],
        [rules],
      ),
    ).toEqual([]);
  });

  it("drops an intentional ellipsis (fixed, run 4cc0a298) and unsupported text", () => {
    expect(groundClipping(["Delete this one from its de..."], [row])).toEqual([]);
    expect(groundClipping(["Something that is not on screen at all"], [row])).toEqual([]);
    expect(groundClipping("nope", [row])).toEqual([]);
  });
});

describe("store readiness", () => {
  const form = [el({ role: "text_field", label: "Name", stableId: "register-name" })];

  it("reports a potential risk when an account is created but no deletion entry is found", () => {
    const t = new ModeTracker("ios", 3);
    t.observe("Create profile", screen(form), "reg", 1);
    t.observe("Settings", screen([el({ label: "Privacy policy" })]), "set", 2);
    const r = buildModeChecks(t, ctx(["store_readiness"], "ios"));
    valid(r);
    expect(r.checks.find((c) => c.checkId === "store.account_deletion")).toMatchObject({
      status: "inconclusive",
      storeStatus: "potential_risk",
      ruleRef: { ruleId: "apple-app-review-5.1.1" },
    });
    expect(r.findings[0]?.title).toContain("No in-app account deletion");
    expect(r.checks.find((c) => c.checkId === "store.privacy_policy")).toMatchObject({
      storeStatus: "evidence_found",
    });
  });

  it("asks for more information instead of reporting when no settings screen was reached", () => {
    const t = new ModeTracker("android", 2.625);
    t.observe("Create profile", screen(form), "reg", 1);
    t.observe("Profile", screen([el({ label: "Edit profile" })]), "prof", 2);
    const r = buildModeChecks(t, ctx(["store_readiness"]));
    expect(r.findings).toHaveLength(0);
    expect(r.checks.find((c) => c.checkId === "store.account_deletion")?.storeStatus).toBe(
      "needs_additional_information",
    );
  });

  it("finds the deletion entry and an opened privacy policy", () => {
    const t = new ModeTracker("android", 2.625);
    t.observe("Create profile", screen(form), "reg", 1);
    const privacy = el({ label: "Privacy policy" });
    t.observe("Settings", screen([privacy, el({ label: "Delete account" })]), "set", 2);
    t.noteAction({
      type: "tap",
      target: privacy,
      fromLabel: "Settings",
      fromHadFields: false,
      toLabel: null,
      leftApp: true,
      artifactId: "browser",
    });
    const r = buildModeChecks(t, ctx(["store_readiness"]));
    valid(r);
    expect(r.findings).toHaveLength(0);
    expect(r.checks.find((c) => c.checkId === "store.account_deletion")?.storeStatus).toBe(
      "evidence_found",
    );
    expect(r.checks.find((c) => c.checkId === "store.privacy_policy")?.summary).toContain(
      "left the app",
    );
  });
});

// ---- Stress probe on a tiny notes app -------------------------------------------------------

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const node = (cls: string, attrs: Record<string, string>, y: number) =>
  `<${cls} class="${cls}" package="dev.sample" ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ")} enabled="true" displayed="true" bounds="[50,${y}][1030,${y + 140}]"/>`;
const page = (title: string, nodes: string[]) =>
  `<hierarchy width="1080" height="2400">${node("android.widget.TextView", { text: title }, 150)}${nodes.join("")}</hierarchy>`;

/** Notes ⇄ New note. `seeded`: a title over 120 characters kills the process on Save. */
function notesApp(seeded: boolean) {
  let screen: "notes" | "new" = "notes";
  let running = true;
  let title = "";
  const notes: string[] = [];
  const device: AgentDevice = {
    platform: "android",
    windowSize: async () => ({ width: 1080, height: 2400 }),
    screenshotPng: async () => Buffer.alloc(8),
    pageSource: async () =>
      !running
        ? page("Home", [])
        : screen === "notes"
          ? page("Notes", [
              node(
                "android.widget.Button",
                { "resource-id": "notes-add", "content-desc": "Add note", clickable: "true" },
                300,
              ),
              ...notes.map((n, i) =>
                node("android.widget.TextView", { text: n.slice(0, 60) }, 500 + i * 150),
              ),
            ])
          : page("New note", [
              node(
                "android.widget.EditText",
                {
                  "resource-id": "note-title",
                  "content-desc": "Title",
                  text: title,
                  clickable: "true",
                },
                300,
              ),
              node(
                "android.widget.Button",
                { "resource-id": "note-save", "content-desc": "Save", clickable: "true" },
                600,
              ),
            ]),
    keyboardShown: async () => false,
    appState: async () => (running ? 4 : 1),
    appIdFromCapabilities: () => "dev.sample",
    displayDensity: async () => 420,
    find: async (hint) => ({ elementId: hint.testId ?? hint.label ?? "?" }),
    tap: async (t) => {
      if (t.elementId === "notes-add") {
        screen = "new";
        title = "";
      } else if (t.elementId === "note-save") {
        if (seeded && title.length > 120) {
          running = false;
          return;
        }
        notes.push(title);
        screen = "notes";
      }
    },
    tapAt: async () => {},
    typeInto: async (_t, text) => {
      title = seeded ? text : text.slice(0, 120);
    },
    pressEnter: async () => {},
    scroll: async () => {},
    back: async () => {
      screen = "notes";
    },
    hideKeyboard: async () => {},
    relaunch: async () => {
      running = true;
      screen = "notes";
    },
  };
  return device;
}

/** Add a short note, then keep opening the form. */
function notesPlanner() {
  return vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
    const prompt = messages.find((m) => m.role === "user")?.content ?? "";
    const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
    const ref = (id: string) =>
      new RegExp(`(el-\\d+) [a-z_]+ (?:"[^"]*" )?id=${id}`).exec(prompt)?.[1];
    const nextAction = ref("notes-add")
      ? { type: "tap", targetRef: ref("notes-add") }
      : /id=note-title value=""/.test(prompt)
        ? {
            type: "type",
            targetRef: ref("note-title"),
            input: { kind: "literal", value: "Lake birds" },
          }
        : { type: "tap", targetRef: ref("note-save") };
    return {
      model: "m",
      content: JSON.stringify({
        schemaVersion: "1",
        goalId: "notes",
        observationId: obs,
        nextAction,
        expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
        decisionSummary: "Work with notes.",
      }),
      usage: { inputTokens: 1, outputTokens: 1, reported: true },
      latencyMs: 1,
      budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
    };
  });
}

async function runNotes(seeded: boolean, modes: TestMode[] = ["stress"]) {
  const events: Array<Pick<RunEventInput, "type" | "payload">> = [];
  let clock = 0;
  let artifacts = 0;
  let ids = 0;
  const counters: SessionCounters = {
    screensObserved: 0,
    transitionsObserved: 0,
    actionsExecuted: 0,
    checksRun: 0,
    plannerCalls: 0,
    visionCalls: 0,
  };
  const out = await runAgent(
    {
      device: notesApp(seeded),
      emit: (e) => events.push(e),
      flush: async () => {},
      saveEvidence: async () => `00000000-0000-4000-8000-${String(++artifacts).padStart(12, "0")}`,
      plan: notesPlanner(),
      vision: vi.fn(),
      checkpoint: () => {},
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      log: () => {},
    },
    {
      platform: "android",
      modes,
      budget: { ...DEFAULT_PLATFORM_BUDGET, maxPlannerRequests: 5 },
      softDeadline: 10 * 60_000,
      counters,
      settleMs: 10,
      run: {
        runId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
      },
      versions: runVersionStamp("test"),
      newId: () => `bbbbbbbb-bbbb-4bbb-8bbb-${String(++ids).padStart(12, "0")}`,
    },
  );
  return { out, events };
}

describe("stress long-text probe", () => {
  it("reproduces a crash on save with long text (seeded)", async () => {
    const { out } = await runNotes(true);
    valid(out);
    const check = out.checks.find((c) => c.checkId === "stress.long_text");
    expect(check?.status).toBe("failed");
    const finding = out.findings.find((f) => f.checkId === "stress.long_text");
    expect(finding).toMatchObject({
      verification: "reproduced",
      expectationBasis: "runtime_signal",
      reproduction: { valid: 2, symptom: 2 },
      severity: "high",
    });
    expect(check?.findingIds).toEqual([finding?.findingId]);
    // The probe's own crashes are not double-reported as exploration crashes.
    expect(out.checks.find((c) => c.checkId === "stress.crash")?.status).toBe(
      "passed_within_scope",
    );
  });

  it("still probes a form when a persistence check runs right after its first save", async () => {
    const { out } = await runNotes(true, ["functional", "stress"]);
    expect(out.checks.find((c) => c.checkId === "functional.persistence")?.status).toBe(
      "passed_within_scope",
    );
    expect(out.checks.find((c) => c.checkId === "stress.long_text")?.status).toBe("failed");
  });

  it("passes when the app limits the input (fixed)", async () => {
    const { out } = await runNotes(false);
    expect(out.checks.find((c) => c.checkId === "stress.long_text")?.status).toBe(
      "passed_within_scope",
    );
    expect(out.findings).toHaveLength(0);
  });

  it("records a crash caused by an ordinary exploration step", async () => {
    const events: Array<Pick<RunEventInput, "type" | "payload">> = [];
    let clock = 0;
    const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
      const ref = (id: string) =>
        new RegExp(`(el-\\d+) [a-z_]+ (?:"[^"]*" )?id=${id}`).exec(prompt)?.[1];
      const nextAction = ref("notes-add")
        ? { type: "tap", targetRef: ref("notes-add") }
        : /id=note-title value=""/.test(prompt)
          ? {
              type: "type",
              targetRef: ref("note-title"),
              input: { kind: "literal", value: "x".repeat(150) },
            }
          : { type: "tap", targetRef: ref("note-save") };
      return {
        model: "m",
        content: JSON.stringify({
          schemaVersion: "1",
          goalId: "notes",
          observationId: obs,
          nextAction,
          expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
          decisionSummary: "Long title.",
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    let n = 0;
    const out = await runAgent(
      {
        device: notesApp(true),
        emit: (e) => events.push(e),
        flush: async () => {},
        saveEvidence: async () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        plan,
        vision: vi.fn(),
        checkpoint: () => {},
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        log: () => {},
      },
      {
        platform: "android",
        modes: ["stress"],
        budget: { ...DEFAULT_PLATFORM_BUDGET, maxPlannerRequests: 3 },
        softDeadline: 10 * 60_000,
        counters: {
          screensObserved: 0,
          transitionsObserved: 0,
          actionsExecuted: 0,
          checksRun: 0,
          plannerCalls: 0,
          visionCalls: 0,
        },
        settleMs: 10,
        run: { runId: "r", sessionId: "s" },
        versions: runVersionStamp("test"),
        newId: () => `cccccccc-cccc-4ccc-8ccc-${String(++n).padStart(12, "0")}`,
      },
    );
    expect(out.checks.find((c) => c.checkId === "stress.crash")?.status).toBe("failed");
    expect(out.findings.find((f) => f.checkId === "stress.crash")?.title).toBe(
      'App stopped after Tap "Save"',
    );
    expect(
      events.some((e) => e.type === "note" && (e.payload as { level: string }).level === "error"),
    ).toBe(true);
  });

  it("treats an 'app is not running' driver error as a crash, not a broken device", async () => {
    const device = notesApp(true);
    const source = device.pageSource;
    const state = device.appState;
    device.pageSource = async () => {
      if ((await state("dev.sample")) === 1) {
        const error = new Error(
          "The application under test with bundle id 'dev.sample' is not running, possibly crashed",
        );
        error.name = "WebDriverError";
        throw error;
      }
      return source();
    };
    const { out } = await (async () => {
      const events: unknown[] = [];
      let clock = 0;
      let n = 0;
      const o = await runAgent(
        {
          device,
          emit: (e) => events.push(e),
          flush: async () => {},
          saveEvidence: async () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
          plan: notesPlanner(),
          vision: vi.fn(),
          checkpoint: () => {},
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
          log: () => {},
        },
        {
          platform: "android",
          modes: ["stress"],
          budget: { ...DEFAULT_PLATFORM_BUDGET, maxPlannerRequests: 5 },
          softDeadline: 10 * 60_000,
          counters: {
            screensObserved: 0,
            transitionsObserved: 0,
            actionsExecuted: 0,
            checksRun: 0,
            plannerCalls: 0,
            visionCalls: 0,
          },
          settleMs: 10,
          run: { runId: "r", sessionId: "s" },
          versions: runVersionStamp("test"),
          newId: () => `dddddddd-dddd-4ddd-8ddd-${String(++n).padStart(12, "0")}`,
        },
      );
      return { out: o };
    })();
    expect(out.phase).toBe("completed");
    expect(out.findings.find((f) => f.checkId === "stress.long_text")?.verification).toBe(
      "reproduced",
    );
  });

  it("keeps collected results when the device session fails", async () => {
    const device = notesApp(false);
    let calls = 0;
    const source = device.pageSource;
    device.pageSource = async () => {
      calls += 1;
      if (calls > 6) {
        const error = new Error("WebDriverError: instrumentation process is not running");
        error.name = "WebDriverError";
        throw error;
      }
      return source();
    };
    let clock = 0;
    let n = 0;
    const out = await runAgent(
      {
        device,
        emit: () => {},
        flush: async () => {},
        saveEvidence: async () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        plan: notesPlanner(),
        vision: vi.fn(),
        checkpoint: () => {},
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        log: () => {},
      },
      {
        platform: "android",
        modes: ["accessibility"],
        budget: { ...DEFAULT_PLATFORM_BUDGET, maxPlannerRequests: 20 },
        softDeadline: 10 * 60_000,
        counters: {
          screensObserved: 0,
          transitionsObserved: 0,
          actionsExecuted: 0,
          checksRun: 0,
          plannerCalls: 0,
          visionCalls: 0,
        },
        settleMs: 10,
        run: { runId: "r", sessionId: "s" },
        versions: runVersionStamp("test"),
        newId: () => `eeeeeeee-eeee-4eee-8eee-${String(++n).padStart(12, "0")}`,
      },
    );
    expect(out).toMatchObject({
      phase: "infrastructure_failed",
      stopReason: "infrastructure_failed",
    });
    expect(out.checks.find((c) => c.checkId === "a11y.control_labels")?.status).toBe(
      "passed_within_scope",
    );
  });

  it("does not run stress probes when Stress is not selected", async () => {
    const { out, events } = await runNotes(true, ["functional"]);
    expect(out.checks.some((c) => c.checkId.startsWith("stress."))).toBe(false);
    expect(
      events.some(
        (e) =>
          e.type === "action_planned" &&
          String((e.payload as { summary: string }).summary).includes("long text"),
      ),
    ).toBe(false);
  });
});

describe("finding cap (benchmark run 0b8ca5e6: 400 on more than 50 findings)", () => {
  it("keeps the most important findings and drops the rest from the checks", () => {
    const t = new ModeTracker("android", 2.625);
    // 60 unlabeled icons on 60 screens: 60 findings before the cap.
    for (let i = 0; i < 60; i++) {
      t.observe(
        `Screen ${i}`,
        screen([el({ bounds: { x: i, y: 300, width: 126, height: 126 } })]),
        "s",
        i,
      );
    }
    const r = buildModeChecks(t, ctx(["accessibility"]));
    const crash = {
      ...(r.findings[0] as Finding),
      findingId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
      verification: "reproduced" as const,
      severity: "high" as const,
    };
    const all = [...r.findings, crash];
    const capped = capFindings(all, r.checks, 50);
    expect(capped.findings).toHaveLength(50);
    expect(capped.dropped).toBe(11);
    expect(capped.findings.some((f) => f.findingId === crash.findingId)).toBe(true);
    const cited = r.checks.flatMap((c) => c.findingIds);
    expect(cited.every((id) => capped.findings.some((f) => f.findingId === id))).toBe(true);
  });
});

describe("crash signature (B10, Jerboa run 64bd5873)", () => {
  it("takes the exception line of an Android crash log, numbers masked", () => {
    const log = [
      "10-11 14:49:20.162  3798  3798 E AndroidRuntime: FATAL EXCEPTION: main",
      "10-11 14:49:20.162  3798  3798 E AndroidRuntime: Process: com.jerboa, PID: 3798",
      "10-11 14:49:20.162  3798  3798 E AndroidRuntime: io.ktor.client.plugins.HttpRequestTimeoutException: Request timeout has expired [request_timeout=20000 ms]",
      "10-11 14:49:20.162  3798  3798 E AndroidRuntime: \tat com.jerboa.model.SiteViewModel.getSite(SiteViewModel.kt:229)",
    ].join("\n");
    expect(crashSignature(log)).toBe(
      "io.ktor.client.plugins.HttpRequestTimeoutException: Request timeout has expired [request_timeout=# ms]",
    );
    expect(crashSignature("no crash here")).toBeUndefined();
  });
});
