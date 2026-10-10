import {
  type ChatMessage,
  CheckResult,
  DEFAULT_PLATFORM_BUDGET,
  Finding,
  type RelayResponse,
  type RunEventInput,
  runVersionStamp,
  type SessionCounters,
  type UiElement,
} from "@tapscout/shared";
import { describe, expect, it, vi } from "vitest";
import { type AgentDevice, runAgent } from "../src/agent.js";
import { buildFunctionalChecks, FunctionalTracker, valueVisible } from "../src/functional.js";

// ---- A tiny two-screen profile app rendered as Android page sources -------------------------

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const node = (cls: string, attrs: Record<string, string>, y: number) =>
  `<${cls} class="${cls}" package="dev.sample" ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ")} enabled="true" displayed="true" bounds="[50,${y}][1030,${y + 110}]"/>`;
const page = (title: string, nodes: string[]) =>
  `<hierarchy width="1080" height="2400">${node("android.widget.TextView", { text: title }, 150)}${nodes.join("")}</hierarchy>`;

/** Profile ⇄ Edit profile. `seeded` keeps edits only in memory, like the FieldNotes defect. */
function profileApp(seeded: boolean) {
  let screen: "profile" | "edit" = "profile";
  let persisted = "";
  let memory: string | null = null;
  let draft = "";
  const bio = () => memory ?? persisted;
  const device: AgentDevice = {
    platform: "android",
    windowSize: async () => ({ width: 1080, height: 2400 }),
    screenshotPng: async () => Buffer.alloc(8),
    pageSource: async () =>
      screen === "profile"
        ? page("Profile", [
            node("android.widget.TextView", { text: bio() || "No bio yet." }, 400),
            node(
              "android.widget.Button",
              { "resource-id": "profile-edit", "content-desc": "Edit profile", clickable: "true" },
              600,
            ),
          ])
        : page("Edit profile", [
            node(
              "android.widget.ImageButton",
              { "content-desc": "Navigate up", clickable: "true" },
              140,
            ),
            node(
              "android.widget.EditText",
              {
                "resource-id": "edit-bio",
                "content-desc": "About you",
                text: draft,
                clickable: "true",
              },
              400,
            ),
            node(
              "android.widget.Button",
              { "resource-id": "edit-save", "content-desc": "Save", clickable: "true" },
              600,
            ),
          ]),
    keyboardShown: async () => false,
    appState: async () => 4,
    appIdFromCapabilities: () => "dev.sample",
    find: async (hint) => ({ elementId: hint.testId ?? hint.label ?? "?" }),
    tap: async (t) => {
      if (t.elementId === "profile-edit") {
        screen = "edit";
        draft = bio();
      } else if (t.elementId === "edit-save") {
        if (seeded) memory = draft;
        else persisted = draft;
        screen = "profile";
      }
    },
    tapAt: async () => {},
    typeInto: async (_t, text) => {
      draft = text;
    },
    pressEnter: async () => {},
    scroll: async () => {},
    back: async () => {
      screen = "profile";
    },
    hideKeyboard: async () => {},
    relaunch: async () => {
      memory = null;
      screen = "profile";
    },
  };
  return device;
}

/** Edit → type a bio → save, then keep re-opening the editor until the planner budget is spent. */
function editingPlanner() {
  return vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
    const prompt = messages.find((m) => m.role === "user")?.content ?? "";
    const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
    const ref = (id: string) =>
      new RegExp(`(el-\\d+) [a-z_]+ (?:"[^"]*" )?id=${id}`).exec(prompt)?.[1];
    const empty = /id=edit-bio value=""/.test(prompt);
    const nextAction = ref("profile-edit")
      ? { type: "tap", targetRef: ref("profile-edit") }
      : empty
        ? {
            type: "type",
            targetRef: ref("edit-bio"),
            input: { kind: "literal", value: "Birds seen at the lake" },
          }
        : { type: "tap", targetRef: ref("edit-save") };
    return {
      model: "m",
      content: JSON.stringify({
        schemaVersion: "1",
        goalId: "edit-profile",
        observationId: obs,
        nextAction,
        expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
        decisionSummary: "Edit the profile.",
      }),
      usage: { inputTokens: 1, outputTokens: 1, reported: true },
      latencyMs: 1,
      budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
    };
  });
}

async function run(seeded: boolean) {
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
      device: profileApp(seeded),
      emit: (e) => events.push(e),
      flush: async () => {},
      saveEvidence: async () => `00000000-0000-4000-8000-${String(++artifacts).padStart(12, "0")}`,
      plan: editingPlanner(),
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
      modes: ["functional"],
      budget: { ...DEFAULT_PLATFORM_BUDGET, maxPlannerRequests: 3 },
      softDeadline: 10 * 60_000,
      counters,
      settleMs: 10,
      run: {
        runId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
      },
      versions: runVersionStamp("test"),
      newId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++ids).padStart(12, "0")}`,
    },
  );
  return { out, events, counters };
}

describe("functional persistence check", () => {
  it("passes when the saved value survives a relaunch (fixed build)", async () => {
    const { out, counters } = await run(false);
    const persistence = out.checks.find((c) => c.checkId === "functional.persistence");
    expect(persistence).toMatchObject({ status: "passed_within_scope" });
    expect(persistence?.summary).toContain("Kept after relaunch");
    expect(out.findings).toHaveLength(0);
    expect(counters.checksRun).toBeGreaterThanOrEqual(2);
    for (const c of out.checks) expect(CheckResult.safeParse(c).success).toBe(true);
  });

  it("fails and reproduces when the saved value is lost (seeded build)", async () => {
    const { out, events } = await run(true);
    const persistence = out.checks.find((c) => c.checkId === "functional.persistence");
    expect(persistence?.status).toBe("failed");
    expect(out.findings).toHaveLength(1);
    const finding = out.findings[0];
    expect(Finding.safeParse(finding).success).toBe(true);
    expect(finding).toMatchObject({
      verification: "reproduced",
      expectationBasis: "observed_invariant",
      reproduction: { valid: 2, symptom: 2, blocked: [] },
      severity: "high",
      checkId: "functional.persistence",
    });
    expect(persistence?.findingIds).toEqual([finding?.findingId]);
    expect(finding?.evidence.map((e) => e.role)).toEqual(["before", "after", "replay", "replay"]);

    const types = events.map((e) => e.type);
    expect(types).toContain("finding_candidate");
    expect(events.find((e) => e.type === "finding_updated")?.payload).toMatchObject({
      verification: "reproduced",
      reproductionLabel: "Reproduced 2/2",
    });
    const replays = events.filter(
      (e) => e.type === "action_planned" && (e.payload as { source: string }).source === "replay",
    );
    expect(replays.length).toBeGreaterThan(0);
    // The check runs right after the save and exploration resumes afterwards.
    const phases = events
      .filter((e) => e.type === "phase_changed")
      .map((e) => (e.payload as { to: string }).to);
    expect(phases).toEqual(["testing", "reproducing", "exploring"]);
  });
});

// ---- Tracker and check builder ------------------------------------------------------------

const el = (over: Partial<UiElement>): UiElement => ({
  ref: "el-1",
  role: "text",
  platformClass: "x",
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  visible: true,
  enabled: true,
  focused: false,
  clickable: false,
  masked: false,
  ...over,
});

describe("FunctionalTracker", () => {
  const field = el({ role: "text_field", stableId: "edit-name", label: "Name" });
  const save = el({ role: "button", stableId: "edit-save", label: "Save" });

  it("records a candidate only when the saved value shows up elsewhere", () => {
    const t = new FunctionalTracker();
    t.noteTyped("Alex Doe", field, "Edit profile", 1);
    t.noteOutcome({
      type: "tap",
      target: save,
      fromLabel: "Edit profile",
      fromElements: [field, save],
      toLabel: "Profile",
      toElements: [el({ text: "Hi, Alex Doe" })],
      step: 2,
      artifactId: "a",
    });
    expect(t.candidates).toMatchObject([
      { value: "Alex Doe", screenLabel: "Profile", commitLabel: "Save" },
    ]);
  });

  it("does not treat a back/up control as a save and drops the unsaved input", () => {
    const t = new FunctionalTracker();
    t.noteTyped("Alex Doe", field, "Edit profile", 1);
    t.noteOutcome({
      type: "tap",
      target: el({ role: "button", label: "Navigate up" }),
      fromLabel: "Edit profile",
      fromElements: [field],
      toLabel: "Profile",
      toElements: [el({ text: "Hi, Alex Doe" })],
      step: 2,
      artifactId: "a",
    });
    expect(t.candidates).toHaveLength(0);
    expect(t.returnPaths).toMatchObject([{ fromLabel: "Edit profile", toLabel: "Profile" }]);
  });

  it("forgets a candidate that was later replaced on its screen", () => {
    const t = new FunctionalTracker();
    t.noteTyped("Alex Doe", field, "Edit profile", 1);
    const saved = {
      type: "tap",
      target: save,
      fromLabel: "Edit profile",
      fromElements: [field, save],
    };
    t.noteOutcome({
      ...saved,
      toLabel: "Profile",
      toElements: [el({ text: "Hi, Alex Doe" })],
      step: 2,
      artifactId: "a",
    });
    t.noteOutcome({
      type: "tap",
      fromLabel: "Profile",
      fromElements: [],
      toLabel: "Profile",
      toElements: [el({ text: "Hi, Sam" })],
      step: 3,
      artifactId: "b",
    });
    expect(t.candidates).toHaveLength(0);
  });

  it("notices validation feedback after submitting a form", () => {
    const t = new FunctionalTracker();
    t.noteOutcome({
      type: "tap",
      target: el({ role: "button", label: "Continue" }),
      fromLabel: "Create profile",
      fromElements: [field],
      toLabel: "Create profile",
      toElements: [field, el({ text: "Enter your name." })],
      step: 1,
      artifactId: "a",
    });
    expect(t.feedback).toMatchObject([
      { formLabel: "Create profile", texts: ["Enter your name."] },
    ]);
  });

  it("matches values case-insensitively and ignores inputs and short values", () => {
    expect(valueVisible("alex doe", [el({ text: "Hi, Alex Doe" })])).toBe(true);
    expect(valueVisible("Alex Doe", [el({ role: "text_field", text: "Alex Doe" })])).toBe(false);
    expect(valueVisible("ab", [el({ text: "ab" })])).toBe(false);
  });
});

describe("buildFunctionalChecks", () => {
  it("reports not_tested, never a pass, when nothing was observed", () => {
    const checks = buildFunctionalChecks({
      platform: "ios",
      screenLabels: ["Welcome"],
      transitions: 0,
      failedActions: 0,
      tracker: new FunctionalTracker(),
      probes: { skipped: "No saved value was seen." },
    });
    expect(checks.map((c) => c.status)).toEqual([
      "not_tested",
      "not_tested",
      "not_tested",
      "not_tested",
    ]);
    for (const c of checks) expect(CheckResult.safeParse(c).success).toBe(true);
  });
});
