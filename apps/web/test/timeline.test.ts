import { describe, expect, it } from "vitest";
import {
  describeEvent,
  latestScreenshot,
  mergeEvents,
  runStatusLabel,
  type TimelineEvent,
} from "../src/lib/runs/timeline";

function ev(over: Partial<TimelineEvent>): TimelineEvent {
  return {
    eventId: crypto.randomUUID(),
    sessionId: "s1",
    sequence: 1,
    type: "note",
    phase: "exploring",
    stepIndex: null,
    occurredAt: "2026-10-10T10:00:00Z",
    payload: { level: "info", message: "hi" },
    ...over,
  };
}

describe("mergeEvents", () => {
  it("deduplicates realtime and history deliveries and orders by sequence", () => {
    const a = ev({ sequence: 2 });
    const b = ev({ sequence: 1 });
    const merged = mergeEvents([a], [b, { ...a }]);
    expect(merged.map((e) => e.sequence)).toEqual([1, 2]);
    expect(merged).toHaveLength(2);
  });

  it("keeps sessions separate", () => {
    const merged = mergeEvents(
      [],
      [ev({ sessionId: "s2", sequence: 1 }), ev({ sessionId: "s1", sequence: 3 })],
    );
    expect(merged.map((e) => e.sessionId)).toEqual(["s1", "s2"]);
  });
});

describe("describeEvent", () => {
  it("marks uncertain actions as warnings and carries the screenshot", () => {
    const d = describeEvent(
      ev({
        type: "action_executed",
        payload: { summary: 'Tap "Save"', outcome: "uncertain", screenshotArtifactId: "art-1" },
      }),
    );
    expect(d).toMatchObject({ tone: "warn", screenshotArtifactId: "art-1" });
  });

  it("hides counters from the timeline", () => {
    expect(describeEvent(ev({ type: "counters", payload: {} }))).toBeNull();
  });
});

describe("latestScreenshot and status", () => {
  it("returns the newest screenshot of the session", () => {
    const events = [
      ev({ type: "observation", sequence: 1, payload: { screenshotArtifactId: "a" } }),
      ev({
        type: "action_executed",
        sequence: 2,
        payload: { outcome: "ok", screenshotArtifactId: "b" },
      }),
      ev({
        sessionId: "s2",
        type: "observation",
        sequence: 1,
        payload: { screenshotArtifactId: "c" },
      }),
    ];
    expect(latestScreenshot(events, "s1")).toBe("b");
  });

  it("shows cancelling while a cancelled run is still running", () => {
    expect(runStatusLabel("running", true)).toBe("Cancelling");
    expect(runStatusLabel("partial", true)).toBe("Partial");
  });
});
