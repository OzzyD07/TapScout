import {
  type ChatMessage,
  DEFAULT_PLATFORM_BUDGET,
  type RelayResponse,
  runVersionStamp,
} from "@tapscout/shared";
import { describe, expect, it, vi } from "vitest";
import { type AgentPorts, runAgent } from "../src/agent.js";
import { nextRef, parseVisualElements, VISUAL_CLASS } from "../src/visual.js";

const screen = { widthPx: 1080, heightPx: 2400 };

describe("parseVisualElements", () => {
  it("reads the point formats the model actually wrote and drops the system bars", () => {
    // Answers recorded from MiniCPM-V 4.5 on FieldNotes screenshots (16 Oct): numbers, a point
    // as a string, a box as a string or an array.
    const answer = JSON.stringify({
      screen: "Create profile",
      items: [
        { label: "Back arrow", x: 60, y: 80 },
        { label: "Continue button", x: 100, y: 930 },
        { label: "Name text field", box: "50 264" },
        { label: "Save", box: "[50, 410, 950, 460]" },
        { label: "Save", x: 500, y: 435 },
        { label: "12:30", x: 80, y: 10 },
        { label: "Home", x: 500, y: 995 },
        { label: "", x: 500, y: 500 },
      ],
    });
    const parsed = parseVisualElements(`<think></think>${answer}`, screen, 7);
    expect(parsed.title).toBe("Create profile");
    expect(parsed.elements.map((e) => [e.ref, e.role, e.label])).toEqual([
      ["el-7", "button", "Back arrow"],
      ["el-8", "button", "Continue"],
      ["el-9", "text_field", "Name"],
      ["el-10", "button", "Save"],
    ]);
    const center = (i: number) => {
      const b = parsed.elements[i]?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
      return [b.x + b.width / 2, b.y + b.height / 2].map(Math.round);
    };
    expect(center(1)).toEqual([108, 2232]);
    expect(center(3)).toEqual([540, 1044]);
    expect(parsed.elements.every((e) => e.platformClass === VISUAL_CLASS)).toBe(true);
  });

  it("returns nothing for an answer that is not a list", () => {
    expect(parseVisualElements("I see a game.", screen, 1)).toEqual({ elements: [] });
    expect(nextRef([{ ref: "el-3" }, { ref: "el-12" }])).toBe(13);
    expect(nextRef([])).toBe(1);
  });
});

/** A game drawn on a canvas: the hierarchy has only its root view. */
const canvas = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy index="0" class="hierarchy" rotation="0" width="1080" height="2400">
  <android.widget.FrameLayout index="0" package="dev.example.game" class="android.widget.FrameLayout" text="" clickable="false" enabled="true" focusable="false" focused="false" bounds="[0,0][1080,2400]" displayed="true">
    <android.view.SurfaceView index="0" package="dev.example.game" class="android.view.SurfaceView" text="" clickable="false" enabled="true" focusable="false" focused="false" bounds="[0,0][1080,2400]" displayed="true" />
  </android.widget.FrameLayout>
</hierarchy>`;

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  b.set([0x89, 0x50, 0x4e, 0x47], 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const reply = (content: string): RelayResponse => ({
  model: "m",
  content,
  usage: { inputTokens: 700, outputTokens: 80, reported: true },
  latencyMs: 900,
  budgetRemaining: { inputTokens: 1, outputTokens: 1, requests: 1 },
});

/**
 * A canvas game: a menu with Play, a level with Pause. Options: Back closes the game (most games
 * do), and the first frame after a (re)launch is still black.
 */
function game(opts: { backCloses?: boolean; blankAfterLaunch?: boolean } = {}) {
  let inGame = false;
  let running = true;
  let blankFrames = 0;
  let closes = 0;
  const tapAt = vi.fn(async (x: number, y: number) => {
    if (Math.abs(x - 540) < 60 && Math.abs(y - 1440) < 60) inGame = true;
  });
  const back = vi.fn(async () => {
    if (opts.backCloses && !inGame && running) {
      running = false;
      closes += 1;
    }
    inGame = false;
  });
  const vision = vi.fn(async () => {
    if (blankFrames > 0) {
      blankFrames -= 1;
      return reply(JSON.stringify({ screen: "Black screen", items: [] }));
    }
    return reply(
      JSON.stringify(
        inGame
          ? { screen: "Level 1", items: [{ label: "Pause", x: 900, y: 80 }] }
          : { screen: "Main menu", items: [{ label: "Play", x: 500, y: 600 }] },
      ),
    );
  });
  const plan = vi.fn(async (messages: ChatMessage[]) => {
    const prompt = messages.find((m) => m.role === "user")?.content ?? "";
    const obs = /Observation (obs-\d+)/.exec(prompt)?.[1];
    const play = /(el-\d+) button "Play" \[located on the screenshot\]/.exec(prompt)?.[1];
    return reply(
      JSON.stringify({
        schemaVersion: "1",
        goalId: "start-game",
        observationId: obs,
        nextAction: play ? { type: "tap", targetRef: play } : { type: "back" },
        expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
        decisionSummary: "Start the game.",
      }),
    );
  });
  let clock = 0;
  let n = 0;
  const events: { type: string; payload: unknown }[] = [];
  const ports: AgentPorts = {
    device: {
      platform: "android",
      windowSize: async () => ({ width: 1080, height: 2400 }),
      screenshotPng: async () => png(1080, 2400),
      pageSource: async () => canvas,
      keyboardShown: async () => false,
      appState: async () => (running ? 4 : 1),
      appIdFromCapabilities: () => "dev.example.game",
      find: vi.fn(async () => null),
      tap: async () => {},
      tapAt,
      typeInto: async () => {},
      pressEnter: async () => {},
      scroll: async () => {},
      back,
      hideKeyboard: async () => {},
      relaunch: async () => {
        running = true;
        inGame = false;
        if (opts.blankAfterLaunch) blankFrames = 2;
      },
    },
    emit: (e) => events.push(e),
    flush: async () => {},
    saveEvidence: async () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    plan: (messages) => plan(messages),
    vision,
    checkpoint: () => {},
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log: () => {},
  };
  const config = {
    platform: "android" as const,
    modes: ["functional" as const, "accessibility" as const],
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
    run: { runId: "run-1", sessionId: "session-1" },
    versions: runVersionStamp(DEFAULT_PLATFORM_BUDGET.budgetVersion),
    newId: () => `00000000-0000-4000-8000-f${String(++n).padStart(11, "0")}`,
  };
  return { ports, config, tapAt, back, events, closes: () => closes };
}

describe("runAgent on a screen without accessibility information", () => {
  it("starts, taps controls the vision model located, and says what it could not measure", async () => {
    const g = game();
    const out = await runAgent(g.ports, g.config);

    // Started although the hierarchy never showed an element.
    expect(out.stopReason).not.toBe("access_blocked");
    // "Play" at (500, 600) of 1000 → the centre of a 1080×2400 screen's upper half.
    expect(g.tapAt).toHaveBeenCalledWith(540, 1440);
    expect(g.ports.device.find).not.toHaveBeenCalled();
    expect(out.screenMap.screens.map((s) => s.label)).toEqual(
      expect.arrayContaining(["Main menu (from screenshot)", "Level 1 (from screenshot)"]),
    );
    expect(out.blockers.join(" ")).toMatch(/exposed no accessibility information/);
    // Located controls are estimates: no accessibility finding is made from them.
    expect(out.findings.filter((f) => f.mode === "accessibility")).toEqual([]);
    expect(
      g.events.some((e) => /exposes no accessibility information/.test(JSON.stringify(e.payload))),
    ).toBe(true);
  });

  it("stops pressing Back once it closed the game, and waits for a frame drawn after a relaunch (59a1dc45)", async () => {
    const g = game({ backCloses: true, blankAfterLaunch: true });
    const out = await runAgent(g.ports, {
      ...g.config,
      budget: { ...g.config.budget, maxPlannerRequests: 12, maxDeviceActions: 30 },
    });
    expect(out.stopReason).not.toBe("access_blocked");
    expect(out.blockers.join(" ")).not.toMatch(/left the foreground repeatedly/);
    // Back from the level returns to the menu; from the menu it closes the game, which happens
    // once: after that the menu is never left with Back again.
    expect(g.closes()).toBe(1);
    expect(g.back.mock.calls.length).toBeGreaterThan(1);
    // After the relaunch the game was played again once its menu was drawn.
    expect(g.tapAt.mock.calls.filter(([x, y]) => x === 540 && y === 1440).length).toBeGreaterThan(
      1,
    );
  });
});
