import { readFileSync } from "node:fs";
import {
  type ChatMessage,
  DEFAULT_PLATFORM_BUDGET,
  type RelayResponse,
  type RunEventInput,
  runVersionStamp,
  type SessionCounters,
} from "@tapscout/shared";
import { describe, expect, it, vi } from "vitest";
import { type AgentDevice, type AgentPorts, runAgent } from "../src/agent.js";

const xml = (name: string) => readFileSync(`test/fixtures/${name}.xml`, "utf8");

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  b.set([0x89, 0x50, 0x4e, 0x47], 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

type FakeDevice = AgentDevice & { typed: string[]; tapAt: ReturnType<typeof vi.fn> };

/** FieldNotes in miniature: welcome → (Get started) → register. */
function fakeDevice(opts: { anrFirst?: boolean } = {}): FakeDevice {
  let screen = "welcome";
  let anr = opts.anrFirst ?? false;
  const typed: string[] = [];
  return {
    platform: "android",
    typed,
    windowSize: async () => ({ width: 1080, height: 2400 }),
    screenshotPng: async () => png(1080, 2400),
    pageSource: async () => (anr ? xml("android-anr") : xml(`android-${screen}`)),
    keyboardShown: async () => false,
    appState: async () => 4,
    appIdFromCapabilities: () => "dev.tapscout.fieldnotes",
    find: async (hint) => (hint.testId ? { elementId: hint.testId } : null),
    tap: async (t) => {
      if (t.elementId === "welcome-get-started") screen = "register";
    },
    tapAt: vi.fn(async () => {
      anr = false;
    }),
    typeInto: async (t, text) => {
      typed.push(`${t.elementId}=${text}`);
    },
    pressEnter: async () => {},
    scroll: async () => {},
    back: async () => {
      screen = "welcome";
    },
    hideKeyboard: async () => {},
    relaunch: async () => {},
  };
}

/** Answers like the planner would, grounded in the refs of the prompt it receives. */
function scriptedPlanner(opts: { firstInvalid?: boolean } = {}) {
  let invalidSent = !opts.firstInvalid;
  return vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
    const prompt = messages.find((m) => m.role === "user")?.content ?? "";
    const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
    const refOf = (id: string) =>
      new RegExp(`(el-\\d+) [a-z_]+ (?:"[^"]*" )?id=${id}`).exec(prompt)?.[1];
    let nextAction: unknown = { type: "back" };
    if (!invalidSent) {
      invalidSent = true;
      nextAction = { type: "tap", targetRef: "el-404" };
    } else if (refOf("welcome-get-started")) {
      nextAction = { type: "tap", targetRef: refOf("welcome-get-started") };
    } else if (refOf("register-name")) {
      nextAction = {
        type: "type",
        targetRef: refOf("register-name"),
        input: { kind: "literal", value: "Alex Doe" },
      };
    }
    return {
      model: "nvidia/Nemotron-3_5-Lightning",
      content: JSON.stringify({
        schemaVersion: "1",
        goalId: "explore",
        observationId: obs,
        nextAction,
        expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
        decisionSummary: "Next step.",
      }),
      usage: { inputTokens: 700, outputTokens: 130, reported: true },
      latencyMs: 800,
      budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
    };
  });
}

type Emitted = Pick<RunEventInput, "type" | "payload"> & { stepIndex?: number };

function harness(
  device: AgentDevice,
  plan: ReturnType<typeof scriptedPlanner>,
  maxPlannerRequests = 4,
) {
  const events: Emitted[] = [];
  let clock = 0;
  let artifacts = 0;
  const ports: AgentPorts = {
    device,
    emit: (e) => events.push(e),
    flush: async () => {},
    saveEvidence: async () => `00000000-0000-4000-8000-${String(++artifacts).padStart(12, "0")}`,
    plan: (messages) => plan(messages),
    vision: vi.fn(),
    checkpoint: () => {},
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log: () => {},
  };
  const counters: SessionCounters = {
    screensObserved: 0,
    transitionsObserved: 0,
    actionsExecuted: 0,
    checksRun: 0,
    plannerCalls: 0,
    visionCalls: 0,
  };
  const config = {
    platform: "android" as const,
    modes: ["functional" as const],
    budget: { ...DEFAULT_PLATFORM_BUDGET, maxPlannerRequests },
    softDeadline: 10 * 60_000,
    counters,
    settleMs: 10,
    // The two-screen fake app plans as early as the agent did before 2b5fa1bd.
    planAfter: { screens: 2, steps: 8 },
    run: { runId: "run-1", sessionId: "session-1" },
    versions: runVersionStamp(DEFAULT_PLATFORM_BUDGET.budgetVersion),
    newId: (() => {
      let n = 0;
      return () => `00000000-0000-4000-8000-f${String(++n).padStart(11, "0")}`;
    })(),
  };
  return { ports, config, events, counters };
}

const message = (e: Emitted) => String((e.payload as { message?: string }).message ?? "");

describe("runAgent", () => {
  it("explores with the planner, records transitions and stops on the planner budget", async () => {
    const device = fakeDevice();
    const h = harness(device, scriptedPlanner());
    const out = await runAgent(h.ports, h.config);

    expect(out).toMatchObject({ phase: "completed", stopReason: "budget_exhausted", screens: 2 });
    expect(h.counters.plannerCalls).toBe(4);
    expect(h.counters.screensObserved).toBe(2);
    expect(h.counters.transitionsObserved).toBeGreaterThanOrEqual(1);
    expect(device.typed).toContain("register-name=Alex Doe");

    const executed = h.events.filter((e) => e.type === "action_executed");
    expect(executed[0]?.payload).toMatchObject({
      summary: 'Tap "Get started"',
      outcome: "ok",
      resultSummary: expect.stringContaining('opened "Create profile"'),
    });
    // After the planner budget, untried controls are still tapped, without model calls.
    const sources = h.events
      .filter((e) => e.type === "action_planned")
      .map((e) => (e.payload as { source: string }).source);
    // The welcome page right after launch is answered as onboarding, without the planner.
    expect(sources[0]).toBe("deterministic");
    expect(
      h.events.some((e) => e.type === "note" && message(e).includes('tap "Get started"')),
    ).toBe(true);
    const later = sources.slice(1);
    expect(later.filter((s) => s === "planner")).toHaveLength(3);
    expect(later.lastIndexOf("planner")).toBeLessThan(later.indexOf("deterministic"));
    expect(out.detail).toContain("Every reachable control was tried afterwards");
    const newStates = h.events.filter(
      (e) => e.type === "observation" && (e.payload as { isNewState: boolean }).isNewState,
    );
    expect(newStates).toHaveLength(2);
  });

  it("repairs an invalid proposal once and never executes it", async () => {
    const plan = scriptedPlanner({ firstInvalid: true });
    const h = harness(fakeDevice(), plan, 3);
    await runAgent(h.ports, h.config);

    expect(h.events.some((e) => e.type === "note" && message(e).includes("rejected"))).toBe(true);
    const repair = plan.mock.calls[1]?.[0] as ChatMessage[];
    expect(repair.at(-1)?.content).toContain("el-404");
    const first = h.events.find((e) => e.type === "action_planned");
    expect(first?.payload).toMatchObject({ summary: 'Tap "Get started"' });
  });

  it("does not count an action interrupted by a system dialog as a result", async () => {
    const device = fakeDevice();
    let anr = false;
    const source = device.pageSource;
    device.pageSource = async () => (anr ? xml("android-anr") : source());
    const tap = device.tap;
    device.tap = async (t) => {
      await tap(t);
      anr = true; // the launcher hangs right after the tap
    };
    device.tapAt = vi.fn(async () => {
      anr = false;
    });
    const h = harness(device, scriptedPlanner(), 2);
    await runAgent(h.ports, h.config);
    const first = h.events.find((e) => e.type === "action_executed");
    expect(first?.payload).toMatchObject({
      outcome: "uncertain",
      resultSummary: expect.stringContaining("system dialog"),
    });
  });

  it("stops as an infrastructure problem when system dialogs keep coming back", async () => {
    const device = fakeDevice();
    let anr = false;
    const source = device.pageSource;
    device.pageSource = async () => (anr ? xml("android-anr") : source());
    device.tap = async () => {
      anr = true;
    };
    device.back = async () => {
      anr = true;
    };
    device.tapAt = vi.fn(async () => {
      anr = false;
    });
    const h = harness(device, scriptedPlanner(), 30);
    const out = await runAgent(h.ports, h.config);
    expect(out).toMatchObject({ stopReason: "infrastructure_failed" });
    expect(out.blockers[0]).toContain("System dialog");
  });

  it("closes the keyboard with the return key when the driver cannot dismiss it", async () => {
    const device = fakeDevice();
    let keyboard = true;
    device.keyboardShown = async () => keyboard;
    device.hideKeyboard = async () => {
      throw new Error("Did not know how to dismiss the keyboard");
    };
    device.pressEnter = vi.fn(async () => {
      keyboard = false;
    });
    const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
      return {
        model: "m",
        content: JSON.stringify({
          schemaVersion: "1",
          goalId: "explore",
          observationId: obs,
          nextAction: prompt.includes("Keyboard: visible")
            ? { type: "hide_keyboard" }
            : { type: "back" },
          expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
          decisionSummary: "Close the keyboard.",
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 2);
    await runAgent(h.ports, h.config);
    expect(device.pressEnter).toHaveBeenCalledTimes(1);
    expect(device.tapAt).not.toHaveBeenCalled();
  });

  it("closes the keyboard by tapping plain text when the driver cannot dismiss it", async () => {
    const device = fakeDevice();
    let keyboard = true;
    device.keyboardShown = async () => keyboard;
    device.hideKeyboard = async () => {
      throw new Error("Did not know how to dismiss the keyboard");
    };
    device.pressEnter = async () => {
      throw new Error("no focused field");
    };
    device.tapAt = vi.fn(async () => {
      keyboard = false;
    });
    const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
      return {
        model: "m",
        content: JSON.stringify({
          schemaVersion: "1",
          goalId: "explore",
          observationId: obs,
          nextAction: prompt.includes("Keyboard: visible")
            ? { type: "hide_keyboard" }
            : { type: "back" },
          expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
          decisionSummary: "Close the keyboard.",
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 2);
    await runAgent(h.ports, h.config);
    expect(device.tapAt).toHaveBeenCalledTimes(1);
    expect(h.events.find((e) => e.type === "action_executed")?.payload).toMatchObject({
      summary: "Hide keyboard",
      outcome: "ok",
    });
  });

  it("relaunches when the app went to the background and its page source fails", async () => {
    const device = fakeDevice();
    let background = false;
    const source = device.pageSource;
    device.pageSource = async () => {
      if (background) throw new Error("XCTPerformOnMainRunLoop work timed out after 60.0s");
      return source();
    };
    device.appState = async () => (background ? 3 : 4);
    device.tap = async () => {
      background = true; // e.g. a link opened the browser
    };
    device.relaunch = async () => {
      background = false;
    };
    const h = harness(device, scriptedPlanner(), 3);
    const out = await runAgent(h.ports, h.config);
    expect(out.phase).toBe("completed");
    expect(
      h.events.some(
        (e) =>
          e.type === "action_executed" &&
          (e.payload as { summary: string }).summary === "Relaunch app",
      ),
    ).toBe(true);
  });

  it("types into a field no locator finds by focusing it where it was seen (aa5045dc, Flutter)", async () => {
    const device = fakeDevice();
    const find = device.find;
    // Flutter fields have only a hint: the locators find nothing for them.
    device.find = async (hint) => (hint.testId === "register-name" ? null : find(hint));
    let focused: string | null = null;
    const tapAt = device.tapAt;
    device.tapAt = vi.fn(async (x: number, y: number) => {
      focused = "register-name";
      await tapAt(x, y);
    });
    device.focusedField = async () => (focused ? { elementId: focused } : null);
    const h = harness(device, scriptedPlanner(), 4);
    await runAgent(h.ports, h.config);
    expect(device.typed).toContain("register-name=Alex Doe");
  });

  it("reads typed text back and retypes it once with a clear when keystrokes were lost (b13c27ba)", async () => {
    const device = fakeDevice();
    const values = new Map<string, string>();
    let garble = true;
    device.typeInto = async (t, text, clear) => {
      // iOS simulator: the first keystrokes vanished and the rest landed out of order.
      const arrived = garble ? "ADoe" : text;
      garble = false;
      values.set(t.elementId, clear ? arrived : (values.get(t.elementId) ?? "") + arrived);
      device.typed.push(`${t.elementId}=${arrived}${clear ? " (cleared)" : ""}`);
    };
    device.readValue = async (t) => values.get(t.elementId);
    const h = harness(device, scriptedPlanner(), 3);
    await runAgent(h.ports, h.config);
    expect(device.typed.slice(0, 2)).toEqual([
      "register-name=ADoe",
      "register-name=Alex Doe (cleared)",
    ]);
    expect(values.get("register-name")).toBe("Alex Doe");
  });

  it("waits for a spinner to go away before judging the screen (docs/07 A2)", async () => {
    const device = fakeDevice();
    let polls = 0;
    const source = device.pageSource;
    device.pageSource = async () => {
      polls += 1;
      const page = await source();
      // The first two looks show a spinner over the screen.
      return polls <= 2
        ? page.replace(
            "</hierarchy>",
            '<android.widget.ProgressBar class="android.widget.ProgressBar" package="dev.tapscout.fieldnotes" text="" enabled="true" bounds="[480,1100][600,1220]" displayed="true"/></hierarchy>',
          )
        : page;
    };
    const h = harness(device, scriptedPlanner(), 1);
    await runAgent(h.ports, h.config);
    const first = h.events.find((e) => e.type === "observation");
    expect(polls).toBeGreaterThan(2);
    expect(first).toBeDefined();
    expect(h.events.some((e) => e.type === "note" && message(e).startsWith("Still loading"))).toBe(
      false,
    );
  });

  it("attaches the masked Android crash log to a crash finding (B10)", async () => {
    const device = fakeDevice();
    let dead = false;
    const tap = device.tap;
    device.tap = async (t) => {
      await tap(t);
      dead = true; // the process dies after the first tap
    };
    device.appState = async () => (dead ? 1 : 4);
    device.relaunch = async () => {
      dead = false;
    };
    const h = harness(device, scriptedPlanner(), 2);
    const logs: string[] = [];
    const save = h.ports.saveEvidence;
    h.ports.saveEvidence = async (name, kind, data, at) => {
      if (kind === "log") logs.push(String(data));
      return save(name, kind, data, at);
    };
    h.ports.crashLog = async () =>
      "FATAL EXCEPTION: main\njava.lang.IllegalStateException: user alex@example.com\n\tat dev.Foo.bar(Foo.kt:12)";
    const out = await runAgent(h.ports, { ...h.config, modes: ["stress"] });
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      expect(log).toContain("FATAL EXCEPTION");
      expect(log).not.toContain("alex@example.com");
    }
    const crash = out.findings.find((f) => f.checkId === "stress.crash");
    expect(crash?.evidence.some((e) => e.role === "log")).toBe(true);
  });

  it("asks for a test plan once two screens are known and shows it to the planner (B11-2)", async () => {
    const device = fakeDevice();
    const prompts: string[] = [];
    const planner = scriptedPlanner();
    const h = harness(device, planner, 6);
    h.ports.plan = async (messages) => {
      prompts.push(messages.map((m) => m.content).join("\n"));
      return planner(messages);
    };
    const asked: string[] = [];
    h.ports.testPlan = vi.fn(async (messages: ChatMessage[]) => {
      asked.push(messages.map((m) => m.content).join("\n"));
      return {
        model: "nvidia/Nemotron-3-Ultra-550b-a55b",
        content: JSON.stringify({
          appType: "note-taking app",
          goals: [
            { goalId: "create-profile", description: "Create a profile.", targets: ["Continue"] },
            { goalId: "open-settings", description: "Open settings.", targets: ["Settings"] },
          ],
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    await runAgent(h.ports, h.config);

    expect(h.ports.testPlan).toHaveBeenCalledTimes(1);
    expect(asked[0]).toContain("Screens seen so far:");
    expect(h.events.some((e) => message(e).startsWith("Test plan (nvidia/Nemotron-3-Ultra"))).toBe(
      true,
    );
    const withPlan = prompts.filter((p) => p.includes("Test plan for this note-taking app:"));
    expect(withPlan.length).toBeGreaterThan(0);
    expect(withPlan[0]).toContain('[open] open-settings: Open settings. (head for: "Settings")');
  });

  it("explores on when the test plan call fails (B11-2)", async () => {
    const h = harness(fakeDevice(), scriptedPlanner(), 6);
    h.ports.testPlan = vi.fn(async () => {
      throw new Error("budget_exhausted");
    });
    const out = await runAgent(h.ports, h.config);
    expect(out.phase).toBe("completed");
    expect(h.events.some((e) => message(e).startsWith("Test plan skipped"))).toBe(true);
  });

  it("has the model review heuristic findings at the end and lowers a likely-false one (B11)", async () => {
    const device = fakeDevice();
    // An icon button without a label on the welcome screen: an a11y.control_labels finding.
    const icon =
      '<android.widget.ImageButton index="9" package="dev.tapscout.fieldnotes" class="android.widget.ImageButton" text="" clickable="true" enabled="true" focusable="true" password="false" bounds="[900,150][1020,270]" displayed="true" />';
    const page = device.pageSource;
    device.pageSource = async () => (await page()).replace("</hierarchy>", `${icon}</hierarchy>`);
    const h = harness(device, scriptedPlanner(), 3);
    const reviews: string[] = [];
    h.ports.triage = vi.fn(async (messages: ChatMessage[]) => {
      reviews.push(messages.map((m) => m.content).join("\n"));
      return {
        model: "nvidia/nemotron-3-super-120b-a12b",
        content: JSON.stringify({
          items: [{ id: "T1", reason: "It is decorative.", verdict: "likely_false" }],
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    const out = await runAgent(h.ports, { ...h.config, modes: ["accessibility"] });

    const reviewed = out.findings.find((f) => f.checkId === "a11y.control_labels");
    expect(reviews[0]).toContain("[T1] check=a11y.control_labels");
    expect(reviewed).toMatchObject({
      verification: "manual_review_required",
      triage: { verdict: "likely_false", reason: "It is decorative." },
    });
    expect(
      h.events.some(
        (e) =>
          e.type === "finding_updated" &&
          (e.payload as { findingId: string }).findingId === reviewed?.findingId,
      ),
    ).toBe(true);
    expect(h.events.some((e) => message(e).startsWith("Finding review ("))).toBe(true);

    // A failed review leaves the findings as they were.
    const again = harness(fakeDevice(), scriptedPlanner(), 3);
    const d2 = again.ports.device as ReturnType<typeof fakeDevice>;
    d2.pageSource = device.pageSource;
    again.ports.triage = vi.fn(async () => {
      throw new Error("budget_exhausted");
    });
    const out2 = await runAgent(again.ports, { ...again.config, modes: ["accessibility"] });
    expect(out2.findings.find((f) => f.checkId === "a11y.control_labels")?.verification).toBe(
      "potential_issue",
    );
    expect(again.events.some((e) => message(e).startsWith("Finding review skipped"))).toBe(true);
  });

  it("steps back out of a screen where nothing changes instead of ending (b9c33676)", async () => {
    const device = fakeDevice();
    let screen: "theme" | "home" = "theme";
    const btn = (id: string, text: string, y: number) =>
      `<android.widget.Button class="android.widget.Button" package="dev.tapscout.fieldnotes" text="${text}" resource-id="${id}" clickable="true" enabled="true" bounds="[42,${y}][1038,${y + 150}]" displayed="true"/>`;
    device.pageSource = async () =>
      `<hierarchy width="1080" height="2400"><android.widget.FrameLayout class="android.widget.FrameLayout" package="dev.tapscout.fieldnotes" bounds="[0,0][1080,2400]" displayed="true">
        <android.widget.TextView class="android.widget.TextView" package="dev.tapscout.fieldnotes" text="${screen === "theme" ? "Theme" : "Home"}" clickable="false" enabled="true" bounds="[42,160][600,240]" displayed="true"/>
        ${screen === "theme" ? btn("light", "Light", 400) + btn("dark", "Dark", 600) : btn("item", "Episodes", 400)}
      </android.widget.FrameLayout></hierarchy>`;
    const tapped: string[] = [];
    device.tap = async (t) => {
      tapped.push(t.elementId);
    };
    device.back = async () => {
      screen = "home";
    };
    // A planner that keeps choosing the same option: the screen never changes.
    const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
      const ref = (id: string) =>
        new RegExp(`(el-\\d+) [a-z_]+ (?:"[^"]*" )?id=${id}`).exec(prompt)?.[1];
      const targetRef = ref("light") ?? ref("item");
      return {
        model: "m",
        content: JSON.stringify({
          schemaVersion: "1",
          goalId: "theme",
          observationId: obs,
          nextAction: { type: "tap", targetRef },
          expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
          decisionSummary: "Pick a theme.",
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 40);
    const out = await runAgent(h.ports, {
      ...h.config,
      budget: { ...h.config.budget, maxDeviceActions: 40 },
    });
    expect(
      h.events.some(
        (e) =>
          e.type === "action_planned" &&
          (e.payload as { decisionSummary: string }).decisionSummary.startsWith(
            "Leave this screen",
          ),
      ),
    ).toBe(true);
    expect(tapped).toContain("item");
  });

  it("tries one choice of a choice list, not all of them (14833cfd, Jerboa theme colours)", async () => {
    const device = fakeDevice();
    let screen: "settings" | "colours" = "settings";
    const btn = (id: string, text: string, y: number) =>
      `<android.widget.Button class="android.widget.Button" package="dev.tapscout.fieldnotes" text="${text}" resource-id="${id}" clickable="true" enabled="true" bounds="[42,${y}][1038,${y + 150}]" displayed="true"/>`;
    const colours = ["Beach", "Blue", "Crimson", "Green", "Grey", "Pink"];
    device.pageSource = async () =>
      `<hierarchy width="1080" height="2400"><android.widget.FrameLayout class="android.widget.FrameLayout" package="dev.tapscout.fieldnotes" bounds="[0,0][1080,2400]" displayed="true">
        <android.widget.TextView class="android.widget.TextView" package="dev.tapscout.fieldnotes" text="${screen === "settings" ? "Look and feel" : "Theme colour"}" clickable="false" enabled="true" bounds="[42,160][600,240]" displayed="true"/>
        ${
          screen === "settings"
            ? btn("theme-colour", "Theme colour", 400) + btn("post-view", "Post view", 600)
            : colours.map((c, i) => btn(`colour-${c.toLowerCase()}`, c, 400 + i * 160)).join("")
        }
      </android.widget.FrameLayout></hierarchy>`;
    const tapped: string[] = [];
    device.tap = async (t) => {
      tapped.push(t.elementId);
      if (t.elementId === "theme-colour") screen = "colours";
      else if (t.elementId.startsWith("colour-")) screen = "settings";
    };
    device.back = async () => {
      screen = "settings";
    };
    // No planner calls: the deterministic exploration and the tours decide alone.
    const h = harness(device, scriptedPlanner(), 1);
    await runAgent(h.ports, { ...h.config, budget: { ...h.config.budget, maxDeviceActions: 30 } });
    expect(tapped.filter((id) => id.startsWith("colour-"))).toHaveLength(1);
    expect(tapped).toContain("post-view");
  });

  it("opens each main section of a bottom bar once without the planner (B7)", async () => {
    const device = fakeDevice();
    let section = "Home";
    const tab = (label: string, i: number) =>
      `<android.widget.Button class="android.widget.Button" package="dev.tapscout.fieldnotes" text="" content-desc="${label}" resource-id="tab-${label.toLowerCase()}" clickable="true" enabled="true" bounds="[${i * 360},2232][${(i + 1) * 360},2400]" displayed="true"/>`;
    device.pageSource = async () =>
      `<hierarchy width="1080" height="2400"><android.widget.FrameLayout class="android.widget.FrameLayout" package="dev.tapscout.fieldnotes" bounds="[0,0][1080,2400]" displayed="true">
        <android.widget.TextView class="android.widget.TextView" package="dev.tapscout.fieldnotes" text="${section}" clickable="false" enabled="true" bounds="[42,160][600,240]" displayed="true"/>
        <android.widget.Button class="android.widget.Button" package="dev.tapscout.fieldnotes" text="Item in ${section}" resource-id="item" clickable="true" enabled="true" bounds="[42,600][1038,760]" displayed="true"/>
        ${["Home", "Search", "Profile"].map(tab).join("")}
      </android.widget.FrameLayout></hierarchy>`;
    device.tap = async (t) => {
      const name = /^tab-(\w+)$/.exec(t.elementId)?.[1];
      if (name) section = name[0]?.toUpperCase() + name.slice(1);
    };
    const h = harness(device, scriptedPlanner(), 2);
    await runAgent(h.ports, h.config);
    const sweeps = h.events
      .filter((e) => e.type === "action_planned")
      .map((e) => (e.payload as { decisionSummary: string }).decisionSummary)
      .filter((d) => d.startsWith("Coverage: open the main section"));
    expect(sweeps).toEqual(
      expect.arrayContaining([
        'Coverage: open the main section "Search".',
        'Coverage: open the main section "Profile".',
      ]),
    );
  });

  it("does not press Back again where Back left the app (f9ba4aeb)", async () => {
    const device = fakeDevice();
    let out = false;
    const source = device.pageSource;
    device.pageSource = async () => (out ? '<hierarchy width="1080" height="2400"/>' : source());
    device.appState = async () => (out ? 3 : 4);
    const back = device.back;
    device.back = async () => {
      // Back on the first screen sends the app to the background; elsewhere it goes back.
      if ((await source()).includes("Get started")) out = true;
      else await back();
    };
    const relaunch = vi.fn(async () => {
      out = false;
    });
    device.relaunch = relaunch;
    // A planner that only ever goes back.
    const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
      return {
        model: "m",
        content: JSON.stringify({
          schemaVersion: "1",
          goalId: "explore",
          observationId: obs,
          nextAction: { type: "back" },
          expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
          decisionSummary: "Back.",
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 8);
    const result = await runAgent(h.ports, h.config);
    expect(relaunch.mock.calls.length).toBeLessThanOrEqual(1);
    expect(result.stopReason).not.toBe("access_blocked");
  });

  it("leaves a share sheet with Back before relaunching (benchmark run 5a5a1b40)", async () => {
    const device = fakeDevice();
    let sheet = false;
    const source = device.pageSource;
    device.pageSource = async () => (sheet ? '<hierarchy width="1080" height="2400"/>' : source());
    device.appState = async () => (sheet ? 3 : 4);
    device.tap = async () => {
      sheet = true;
    };
    device.back = async () => {
      sheet = false;
    };
    const relaunch = vi.fn(async () => {});
    device.relaunch = relaunch;
    const h = harness(device, scriptedPlanner(), 2);
    await runAgent(h.ports, h.config);
    const summaries = h.events
      .filter((e) => e.type === "action_executed")
      .map((e) => (e.payload as { summary: string }).summary);
    expect(summaries).toContain("Go back");
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("closes a frozen launcher (system ANR dialog) before exploring", async () => {
    const device = fakeDevice({ anrFirst: true });
    const h = harness(device, scriptedPlanner(), 1);
    await runAgent(h.ports, h.config);

    // Centre of the "Close app" button in the fixture: [70,1174][1010,1300].
    expect(device.tapAt).toHaveBeenCalledWith(540, 1237);
    expect(h.events.some((e) => e.type === "note" && message(e).includes("Close app"))).toBe(true);
    expect(h.counters.screensObserved).toBeGreaterThanOrEqual(1);
  });

  it("allows a permission request shown at launch and records it as an interruption", async () => {
    const device = fakeDevice();
    let asking = true;
    const source = device.pageSource;
    device.pageSource = async () => (asking ? xml("android-permission") : source());
    // The permission controller's activity is in front: the app reports "running in background".
    device.appState = async () => (asking ? 3 : 4);
    device.tapAt = vi.fn(async () => {
      asking = false;
    });
    const h = harness(device, scriptedPlanner(), 1);
    await runAgent(h.ports, h.config);

    // Centre of "Allow" in the fixture: [105,1200][975,1326].
    expect(device.tapAt).toHaveBeenCalledWith(540, 1263);
    const note = h.events.find((e) => e.type === "note" && message(e).startsWith("Interruption"));
    expect(note && message(note)).toContain(
      'permission request "Allow Read You to send you notifications?"',
    );
    expect(h.counters.screensObserved).toBeGreaterThanOrEqual(1);
  });

  it("answers an iOS SpringBoard alert that is not in the page source (f74585fb, Ice Cubes)", async () => {
    const device = fakeDevice();
    let asking = true;
    Object.assign(device, {
      platform: "ios",
      windowSize: async () => ({ width: 402, height: 874 }),
      screenshotPng: async () => png(1206, 2622),
      pageSource: async () => xml("ios-welcome"),
      systemAlert: async () =>
        asking
          ? {
              text: "“Ice Cubes” Would Like to Send You Notifications\nNotifications may include alerts.",
              buttons: ["Don’t Allow", "Allow"],
            }
          : null,
    });
    device.answerAlert = vi.fn(async () => {
      asking = false;
    });
    const h = harness(device, scriptedPlanner(), 1);
    await runAgent(h.ports, { ...h.config, platform: "ios" });

    expect(device.answerAlert).toHaveBeenCalledTimes(1);
    expect(device.answerAlert).toHaveBeenCalledWith("Allow");
    const note = h.events.find((e) => e.type === "note" && message(e).startsWith("Interruption"));
    expect(note && message(note)).toContain("Would Like to Send You Notifications");
  });

  it("asks for an iOS system alert only at the start and when the page source stood still", async () => {
    const device = fakeDevice();
    let n = 0;
    Object.assign(device, {
      platform: "ios",
      windowSize: async () => ({ width: 402, height: 874 }),
      screenshotPng: async () => png(1206, 2622),
      // Every observation sees a slightly different source: no alert is likely after the start.
      pageSource: async () => `${xml("ios-welcome")}<!-- ${n++} -->`,
      systemAlert: vi.fn(async () => null),
      answerAlert: vi.fn(async () => {}),
    });
    const h = harness(device, scriptedPlanner(), 3);
    await runAgent(h.ports, { ...h.config, platform: "ios" });
    expect(n).toBeGreaterThan(3);
    expect(device.systemAlert).toHaveBeenCalledTimes(3);

    // The same source twice in a row (taps landing on an alert): ask again.
    const still = fakeDevice();
    Object.assign(still, {
      platform: "ios",
      windowSize: async () => ({ width: 402, height: 874 }),
      screenshotPng: async () => png(1206, 2622),
      pageSource: async () => xml("ios-welcome"),
      systemAlert: vi.fn(async () => null),
      answerAlert: vi.fn(async () => {}),
    });
    const h2 = harness(still, scriptedPlanner(), 3);
    await runAgent(h2.ports, { ...h2.config, platform: "ios" });
    expect((still.systemAlert as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(3);
  });

  it("closes an iOS share sheet the app opened, or relaunches when it stays (ddb11947)", async () => {
    const iosDevice = (system: string) => {
      const device = fakeDevice();
      let covered = true;
      Object.assign(device, {
        platform: "ios",
        windowSize: async () => ({ width: 402, height: 874 }),
        screenshotPng: async () => png(1206, 2622),
        pageSource: async () => xml(covered ? system : "ios-welcome"),
        relaunch: vi.fn(async () => {
          covered = false;
        }),
      });
      return { device, close: () => (covered = false) };
    };

    const share = iosDevice("ios-share-sheet");
    share.device.tapAt = vi.fn(async () => {
      share.close();
    });
    let h = harness(share.device, scriptedPlanner(), 1);
    await runAgent(h.ports, { ...h.config, platform: "ios" });
    // Middle of the free band below the sheet, in points.
    expect(share.device.tapAt).toHaveBeenNthCalledWith(1, 201, 674);
    expect(h.events.some((e) => message(e).startsWith("Closed the iOS share sheet"))).toBe(true);

    // A Quick Look preview without a close button, whose taps change nothing: relaunch.
    const stuck = iosDevice("ios-quick-look");
    const source = xml("ios-quick-look").replace("QLOverlayDoneButtonAccessibilityIdentifier", "x");
    const pageSource = stuck.device.pageSource;
    stuck.device.pageSource = async () => {
      const s = await pageSource();
      return s.includes("QLPreviewControllerView") ? source : s;
    };
    h = harness(stuck.device, scriptedPlanner(), 1);
    await runAgent(h.ports, { ...h.config, platform: "ios" });
    expect(stuck.device.relaunch).toHaveBeenCalledWith("dev.tapscout.fieldnotes", false);
    expect(h.events.some((e) => message(e).includes("did not close; relaunched"))).toBe(true);
  });

  it("stops with goals_exhausted once nothing new is reachable, before the planner budget", async () => {
    // A planner that only ever goes back and forth between the two screens.
    const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
      const start = /(el-\d+) button "Get started"/.exec(prompt)?.[1];
      return {
        model: "m",
        content: JSON.stringify({
          schemaVersion: "1",
          goalId: "explore",
          observationId: obs,
          nextAction: start ? { type: "tap", targetRef: start } : { type: "back" },
          expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
          decisionSummary: "Next step.",
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    const h = harness(fakeDevice(), plan as ReturnType<typeof scriptedPlanner>, 90);
    const out = await runAgent(h.ports, {
      ...h.config,
      budget: { ...h.config.budget, maxPlannerRequests: 90, maxDeviceActions: 200 },
    });
    expect(out.stopReason).toBe("goals_exhausted");
    expect(h.counters.plannerCalls).toBeLessThan(90);
  });

  it("after the planner budget, tours to an untried icon button on another screen", async () => {
    // Welcome gains an icon-only settings button and a Delete account button.
    const extra = (id: string, desc: string) =>
      `<android.widget.Button class="android.widget.Button" text="" content-desc="${desc}" resource-id="${id}" clickable="true" enabled="true" focusable="true" password="false" bounds="[53,800][200,900]" displayed="true" />`;
    const welcome = xml("android-welcome").replace(
      "</android.widget.Button>",
      `</android.widget.Button>${extra("welcome-settings", "")}${extra("welcome-delete", "Delete account")}`,
    );
    const settings = xml("android-welcome")
      .replace('text="FieldNotes"', 'text="Settings"')
      .replace(
        /content-desc="Get started" resource-id="welcome-get-started"/,
        'content-desc="Privacy policy" resource-id="settings-privacy"',
      );
    let screen = "welcome";
    const device = fakeDevice();
    const tapped: string[] = [];
    device.pageSource = async () =>
      screen === "welcome" ? welcome : screen === "settings" ? settings : xml("android-register");
    device.tap = async (t) => {
      tapped.push(String(t.elementId));
      if (t.elementId === "welcome-get-started") screen = "register";
      if (t.elementId === "welcome-settings") screen = "settings";
    };
    device.back = async () => {
      screen = "welcome";
    };
    // The planner opens the form, comes back, opens it again; then its budget is gone.
    const answers = ["welcome-get-started", "back", "welcome-get-started"];
    const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
      const prompt = messages.find((m) => m.role === "user")?.content ?? "";
      const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
      const next = answers.shift();
      const ref = new RegExp(`(el-\\d+) [a-z_]+ (?:"[^"]*" )?id=${next}`).exec(prompt)?.[1];
      return {
        model: "m",
        content: JSON.stringify({
          schemaVersion: "1",
          goalId: "explore",
          observationId: obs,
          nextAction: ref ? { type: "tap", targetRef: ref } : { type: "back" },
          expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
          decisionSummary: "Next step.",
        }),
        usage: { inputTokens: 1, outputTokens: 1, reported: true },
        latencyMs: 1,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
      };
    });
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 3);
    const out = await runAgent(h.ports, { ...h.config, modes: ["store_readiness"] });

    expect(h.counters.plannerCalls).toBe(3);
    expect(tapped).toContain("welcome-settings");
    expect(tapped).not.toContain("welcome-delete");
    expect(h.events.some((e) => message(e).startsWith("Coverage: heading for"))).toBe(true);
    expect(out.screens).toBeGreaterThanOrEqual(3);
  });

  it("ends as infrastructure, without throwing, when the device fails while the app starts (723816ca)", async () => {
    const device = fakeDevice();
    device.appState = async () => {
      const error = new Error(
        "WebDriverError: Error executing adbExec. Original error: 'Command 'adb shell dumpsys activity processes' exited with code 255'",
      );
      error.name = "WebDriverError";
      throw error;
    };
    const h = harness(device, scriptedPlanner(), 4);
    const out = await runAgent(h.ports, h.config);
    expect(out.phase).toBe("infrastructure_failed");
    expect(out.stopReason).toBe("infrastructure_failed");
    expect(out.detail).toContain("exited with code 255");
  });

  it("opens a control named by an open goal of the test plan without the planner", async () => {
    const device = fakeDevice();
    const h = harness(device, scriptedPlanner(), 6);
    const testPlan = vi.fn(
      async (): Promise<RelayResponse> => ({
        model: "ultra",
        content: JSON.stringify({
          appType: "notes app",
          goals: [
            { goalId: "finish-sign-up", description: "Finish sign-up.", targets: ["Continue"] },
            { goalId: "open-settings", description: "Open settings.", targets: ["Settings"] },
          ],
        }),
        usage: { inputTokens: 500, outputTokens: 80, reported: true },
        latencyMs: 900,
        budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 0 },
      }),
    );
    await runAgent({ ...h.ports, testPlan }, h.config);
    expect(testPlan).toHaveBeenCalledTimes(1);
    const planned = h.events
      .filter((e) => e.type === "action_planned")
      .map((e) => e.payload as { summary: string; decisionSummary: string; goalId: string });
    const byPlan = planned.find((p) => p.decisionSummary.startsWith("Test plan: open"));
    expect(byPlan).toMatchObject({ summary: 'Tap "Continue"', goalId: "finish-sign-up" });
    // Once tapped, the goal counts as reached and its control is not opened again.
    expect(planned.filter((p) => p.decisionSummary.startsWith("Test plan: open"))).toHaveLength(1);
  });

  it("continues in a new device session when the old one dies mid-run (9d845c86)", async () => {
    const broken = fakeDevice();
    let shots = 0;
    const screenshot = broken.screenshotPng;
    broken.screenshotPng = async () => {
      shots += 1;
      if (shots === 6) throw new Error("WebDriverError: invalid session id: the session is gone");
      return screenshot();
    };
    const h = harness(broken, scriptedPlanner(), 6);
    const replacement = fakeDevice();
    const reconnect = vi.fn(async () => replacement);
    const out = await runAgent({ ...h.ports, reconnect }, h.config);

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(out.phase).toBe("completed");
    expect(out.stopReason).not.toBe("infrastructure_failed");
    expect(h.counters.plannerCalls).toBe(6);
    expect(h.events.map(message).some((m) => /continuing in a new session/.test(m))).toBe(true);
  });

  it("ends as infrastructure when the device keeps failing after its resumes", async () => {
    const dead = () => {
      const d = fakeDevice();
      let n = 0;
      const shot = d.screenshotPng;
      d.screenshotPng = async () => {
        n += 1;
        if (n > 2) throw new Error("WebDriverError: invalid session id");
        return shot();
      };
      return d;
    };
    const h = harness(dead(), scriptedPlanner(), 20);
    const reconnect = vi.fn(async () => dead());
    const out = await runAgent({ ...h.ports, reconnect }, h.config);
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(out.phase).toBe("infrastructure_failed");
  });

  it("reports access_blocked when the app never shows a usable screen", async () => {
    const device = fakeDevice();
    device.appState = async () => 1;
    const h = harness(device, scriptedPlanner());
    const out = await runAgent(h.ports, { ...h.config, launchTimeoutMs: 10_000 });
    expect(out).toMatchObject({ phase: "blocked", stopReason: "access_blocked" });
  });
});

/** A sign-in screen made from the register fixture: Username + masked Password + "Sign in". */
function loginXml(typedUser = ""): string {
  return xml("android-register")
    .replace(
      /(<android\.widget\.EditText[^>]*resource-id="register-email"[^>]*?)password="false"/,
      '$1password="true"',
    )
    .replace(/text="" content-desc="Name"/, `text="${typedUser}" content-desc="Username"`)
    .replace(/content-desc="Email"/g, 'content-desc="Password"')
    .replace(/text="(Name|Email)"/g, (_, w) => `text="${w === "Name" ? "Username" : "Password"}"`)
    .replace(/text="Create profile"/g, 'text="Log in"')
    .replace(/text="Create your profile"/g, 'text="Sign in to FieldNotes"')
    .replace(/content-desc="Continue"/g, 'content-desc="Sign in"')
    .replace(/text="Continue"/g, 'text="Sign in"');
}

/** Planner that types the test account by reference, then signs in; `back` otherwise. */
function signInPlanner(useAccount: boolean) {
  const prompts: string[] = [];
  let passwordTyped = false;
  const plan = vi.fn(async (messages: ChatMessage[]): Promise<RelayResponse> => {
    const prompt = messages.map((m) => m.content).join("\n");
    prompts.push(prompt);
    const obs = /Observation (obs-\d+)/.exec(prompt)?.[1] ?? "obs-0";
    const ref = (id: string) =>
      new RegExp(String.raw`(el-\d+) [a-z_]+ (?:"[^"]*" )?id=${id}`).exec(prompt)?.[1];
    let nextAction: unknown = { type: "back" };
    if (useAccount && ref("register-name") && /register-name value=""/.test(prompt)) {
      nextAction = {
        type: "type",
        targetRef: ref("register-name"),
        input: { kind: "credential_ref", key: "username" },
      };
    } else if (useAccount && ref("register-email") && !passwordTyped) {
      passwordTyped = true;
      nextAction = {
        type: "type",
        targetRef: ref("register-email"),
        input: { kind: "credential_ref", key: "password" },
      };
    } else if (ref("register-continue")) {
      nextAction = { type: "tap", targetRef: ref("register-continue") };
    }
    return {
      model: "m",
      content: JSON.stringify({
        schemaVersion: "1",
        goalId: "sign-in",
        observationId: obs,
        nextAction,
        expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
        decisionSummary: "Sign in.",
      }),
      usage: { inputTokens: 1, outputTokens: 1, reported: true },
      latencyMs: 1,
      budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
    };
  });
  return { plan, prompts };
}

function loginDevice(account?: { username: string; password: string }) {
  let screen = "login";
  let user = "";
  let pass = "";
  const device = fakeDevice();
  device.pageSource = async () => (screen === "login" ? loginXml(user) : xml("android-welcome"));
  device.typeInto = async (t, text) => {
    if (t.elementId === "register-name") user = text;
    if (t.elementId === "register-email") pass = text;
  };
  device.tap = async (t) => {
    if (
      t.elementId === "register-continue" &&
      account &&
      user === account.username &&
      pass === account.password
    ) {
      screen = "home";
    }
  };
  device.back = async () => {};
  return { device, typed: () => ({ user, pass }) };
}

describe("sign-in walls", () => {
  it("reports a sign-in it could not pass, and never types into the password field", async () => {
    const { device, typed } = loginDevice();
    const { plan } = signInPlanner(false);
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 30);
    const out = await runAgent(h.ports, h.config);

    expect(out.stopReason).toBe("access_blocked");
    expect(out.blockers[0]).toMatch(
      /^Sign-in required: "Log in" asks for a password and no test account was provided/,
    );
    expect(out.detail).toContain("screens behind sign-in were not tested");
    expect(typed().pass).toBe("");
  });

  it("signs in with the test account by reference and keeps its values out of prompts and evidence", async () => {
    const account = { username: "qa.tester@example.com", password: "Pa55word!" };
    const { device, typed } = loginDevice(account);
    const { plan, prompts } = signInPlanner(true);
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 6);
    const evidence: string[] = [];
    const save = h.ports.saveEvidence;
    h.ports.saveEvidence = async (name, kind, data, at) => {
      evidence.push(String(data));
      return save(name, kind, data, at);
    };
    const out = await runAgent(h.ports, { ...h.config, testAccount: account });

    expect(typed()).toEqual({ user: account.username, pass: account.password });
    expect(
      h.events.some((e) =>
        message(e).includes('Got past the sign-in on "Log in" with the test account'),
      ),
    ).toBe(true);
    expect(out.blockers.filter((b) => /sign-in/i.test(b))).toEqual([]);
    for (const text of [...prompts, ...evidence, JSON.stringify(h.events)]) {
      expect(text).not.toContain(account.username);
      expect(text).not.toContain(account.password);
    }
    expect(prompts.some((p) => p.includes("a test account is available"))).toBe(true);
  });

  it("retypes a username whose first keystrokes were lost, and scrubs the fragment (43c5c77c)", async () => {
    const account = { username: "qa.tester@example.com", password: "Pa55word!" };
    const { device, typed } = loginDevice(account);
    const type = device.typeInto;
    let first = true;
    device.typeInto = async (t, text, clear) => {
      // The keyboard was still coming up: only the end of the username arrived.
      const arrived = first && text === account.username ? text.slice(7) : text;
      if (text === account.username) first = false;
      await type(t, arrived, clear);
    };
    device.readValue = async (t) => (t.elementId === "register-name" ? typed().user : undefined);
    const { plan, prompts } = signInPlanner(true);
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 6);
    await runAgent(h.ports, { ...h.config, testAccount: account });

    expect(typed().user).toBe(account.username);
    for (const text of [...prompts, JSON.stringify(h.events)]) {
      expect(text).not.toContain(account.username.slice(7));
    }
  });

  it("scrubs fragments only as whole values, not inside element types (cdb25f9c)", async () => {
    // The FieldNotes demo password starts with "FieldNotes": its fragment "Field" turned iOS
    // XCUIElementTypeTextField into a non-field. Same shape here with Android's EditText.
    const account = { username: "qa.tester@example.com", password: "EditText-Demo-2026" };
    const { device, typed } = loginDevice(account);
    const { plan, prompts } = signInPlanner(true);
    const h = harness(device, plan as ReturnType<typeof scriptedPlanner>, 6);
    const evidence: string[] = [];
    const save = h.ports.saveEvidence;
    h.ports.saveEvidence = async (name, kind, data, at) => {
      evidence.push(String(data));
      return save(name, kind, data, at);
    };
    const out = await runAgent(h.ports, { ...h.config, testAccount: account });

    expect(typed()).toEqual({ user: account.username, pass: account.password });
    expect(out.blockers.filter((b) => /sign-in/i.test(b))).toEqual([]);
    expect(evidence.some((x) => x.includes("android.widget.EditText"))).toBe(true);
    for (const text of [...prompts, ...evidence, JSON.stringify(h.events)]) {
      expect(text).not.toContain(account.password);
    }
  });
});
