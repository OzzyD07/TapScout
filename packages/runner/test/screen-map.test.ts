import { describe, expect, it } from "vitest";
import { buildScreenMap, ScreenShots } from "../src/screen-map.js";
import { StateGraph } from "../src/state.js";

const el = (role: string, label?: string, text?: string) => ({
  ref: "el-1",
  role,
  label,
  text,
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  enabled: true,
  visible: true,
});

describe("buildScreenMap", () => {
  it("shows one node per screen name, a clean screenshot and named taps between them", () => {
    const graph = new StateGraph();
    const shots = new ScreenShots();
    graph.visit("welcome", "Welcome", 1);
    shots.note("Welcome", "shot-1", true);
    graph.visit("form", "Create profile", 2);
    shots.note("Create profile", "shot-2", true);
    // The same form with the keyboard open is another state of the same screen.
    graph.visit("form-kb", "Create profile", 3);
    shots.note("Create profile", "shot-3", false);
    graph.visit("profile", "Profile", 4);
    shots.note("Profile", "shot-4", false);
    shots.note("Profile", "shot-5", true);

    graph.record("welcome", "tap:start", 'Tap "Get started"', "form", 1, {
      type: "tap",
      target: el("button", "Get started") as never,
    });
    graph.record("form-kb", "tap:name", 'Tap "Name"', "profile", 3, {
      type: "tap",
      // A field's text is what was typed; it never names a move.
      target: el("text_field", undefined, "Alex Doe") as never,
    });
    graph.record("profile", "back", "Go back", "welcome", 4, { type: "back" });

    expect(buildScreenMap(graph, shots)).toEqual({
      screens: [
        { label: "Welcome", visits: 1, firstStep: 1, screenshotArtifactId: "shot-1" },
        { label: "Create profile", visits: 2, firstStep: 2, screenshotArtifactId: "shot-2" },
        { label: "Profile", visits: 1, firstStep: 4, screenshotArtifactId: "shot-5" },
      ],
      edges: [
        { from: "Welcome", to: "Create profile", type: "tap", via: "Get started" },
        { from: "Create profile", to: "Profile", type: "tap" },
        { from: "Profile", to: "Welcome", type: "back" },
      ],
    });
  });
});
