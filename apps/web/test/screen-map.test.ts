import { describe, expect, it } from "vitest";
import { layoutScreenMap, MAP_NODE } from "../src/lib/report/screen-map-layout";
import { reportView } from "../src/lib/report/view";

const map = {
  screens: [
    { label: "Profile", visits: 3, firstStep: 5, screenshotArtifactId: "p" },
    { label: "Welcome", visits: 1, firstStep: 1, screenshotArtifactId: "w" },
    { label: "Create profile", visits: 2, firstStep: 2 },
    { label: "Settings", visits: 1, firstStep: 9 },
    { label: "Lost", visits: 1, firstStep: 12 },
  ],
  edges: [
    { from: "Welcome", to: "Create profile", type: "tap" as const, via: "Get started" },
    { from: "Create profile", to: "Profile", type: "tap" as const },
    { from: "Profile", to: "Settings", type: "tap" as const },
    { from: "Settings", to: "Profile", type: "back" as const },
    { from: "Settings", to: "Welcome", type: "tap" as const, via: "Sign out" },
  ],
};

describe("layoutScreenMap", () => {
  it("puts screens in columns by observed moves from the first screen", () => {
    const layout = layoutScreenMap(map);
    const at = (label: string) => layout.screens.find((s) => s.label === label);
    expect(["Welcome", "Create profile", "Profile", "Settings"].map((l) => at(l)?.depth)).toEqual([
      0, 1, 2, 3,
    ]);
    // No observed move reaches it: last column, after the others.
    expect(at("Lost")?.depth).toBe(-1);
    expect(at("Lost")?.x).toBeGreaterThan(at("Settings")?.x ?? Infinity);
    expect(layout.width).toBeGreaterThanOrEqual((at("Lost")?.x ?? 0) + MAP_NODE.width);
    // The back that undoes the Settings tap is not drawn; the long way back to Welcome runs on a
    // lane below the screens instead of across them.
    expect(layout.edges.map((e) => e.type)).toEqual(["tap", "tap", "tap", "tap"]);
    const signOut = layout.edges.find((e) => e.via === "Sign out");
    expect(signOut?.backwards).toBe(true);
    expect(signOut?.path).toMatch(/^M [\d.]+ [\d.]+ H [\d.]+ V [\d.]+ H [\d.]+ V [\d.]+ H [\d.]+$/);
    const lane = Number(signOut?.path.split(" V ")[1]?.split(" ")[0]);
    expect(lane).toBeGreaterThan(Math.max(...layout.screens.map((x) => x.y + MAP_NODE.height)));
    expect(layout.height).toBeGreaterThan(lane);
  });

  it("wraps a column with many screens", () => {
    const many = {
      screens: [
        { label: "Home", visits: 1, firstStep: 0 },
        ...Array.from({ length: 6 }, (_, i) => ({ label: `S${i}`, visits: 1, firstStep: i + 1 })),
      ],
      edges: Array.from({ length: 6 }, (_, i) => ({
        from: "Home",
        to: `S${i}`,
        type: "tap" as const,
      })),
    };
    const layout = layoutScreenMap(many);
    expect(new Set(layout.screens.map((s) => s.x)).size).toBe(3);
    expect(layout.height).toBeLessThan(5 * (MAP_NODE.height + MAP_NODE.label + 20));
  });
});

describe("reportView maps", () => {
  it("keeps valid maps per platform and skips broken ones", () => {
    const view = reportView({
      platforms: [
        { platform: "android", checks: [], screenMap: map },
        { platform: "ios", checks: [], screenMap: { screens: "nope" } },
      ],
      findings: [],
    });
    expect(view.maps.map((m) => m.platform)).toEqual(["android"]);
  });

  it("summarises what each platform session did and why it stopped", () => {
    const view = reportView({
      platforms: [
        {
          platform: "android",
          phase: "completed",
          stopReason: "budget_exhausted",
          checks: [],
          counters: {
            screensObserved: 9,
            transitionsObserved: 14,
            actionsExecuted: 96,
            plannerCalls: 60,
          },
        },
        { platform: "ios", phase: "infrastructure_failed", checks: [] },
      ],
      findings: [],
    });
    expect(view.coverage).toEqual([
      {
        platform: "android",
        phase: "completed",
        stopReason: "budget_exhausted",
        screens: 9,
        transitions: 14,
        actions: 96,
        plannerCalls: 60,
        visionCalls: 0,
      },
      {
        platform: "ios",
        phase: "infrastructure_failed",
        stopReason: undefined,
        screens: 0,
        transitions: 0,
        actions: 0,
        plannerCalls: 0,
        visionCalls: 0,
      },
    ]);
  });
});
