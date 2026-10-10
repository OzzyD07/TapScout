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
    const planned = h.events.filter((e) => e.type === "action_planned");
    expect(planned.every((e) => (e.payload as { source: string }).source === "planner")).toBe(true);
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

  it("closes the keyboard by tapping plain text when the driver cannot dismiss it", async () => {
    const device = fakeDevice();
    let keyboard = true;
    device.keyboardShown = async () => keyboard;
    device.hideKeyboard = async () => {
      throw new Error("Did not know how to dismiss the keyboard");
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

  it("dismisses a system ANR dialog with Wait before exploring", async () => {
    const device = fakeDevice({ anrFirst: true });
    const h = harness(device, scriptedPlanner(), 1);
    await runAgent(h.ports, h.config);

    // Centre of the "Wait" button in the fixture: [70,1300][1010,1426].
    expect(device.tapAt).toHaveBeenCalledWith(540, 1363);
    expect(h.events.some((e) => e.type === "note" && message(e).includes("Wait"))).toBe(true);
    expect(h.counters.screensObserved).toBeGreaterThanOrEqual(1);
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
    const h = harness(fakeDevice(), plan as ReturnType<typeof scriptedPlanner>, 30);
    const out = await runAgent(h.ports, h.config);
    expect(out.stopReason).toBe("goals_exhausted");
    expect(h.counters.plannerCalls).toBeLessThan(30);
  });

  it("reports access_blocked when the app never shows a usable screen", async () => {
    const device = fakeDevice();
    device.appState = async () => 1;
    const h = harness(device, scriptedPlanner());
    const out = await runAgent(h.ports, { ...h.config, launchTimeoutMs: 10_000 });
    expect(out).toMatchObject({ phase: "blocked", stopReason: "access_blocked" });
  });
});
