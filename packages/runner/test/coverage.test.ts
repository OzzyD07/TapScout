import type { UiElement } from "@tapscout/shared";
import { describe, expect, it } from "vitest";
import { ControlLedger, familyOf, iconOnly, safeToTry } from "../src/coverage.js";
import { actionKey, StateGraph } from "../src/state.js";

let refs = 0;
function control(over: Partial<UiElement>): UiElement {
  return {
    ref: `el-${++refs}`,
    role: "button",
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    enabled: true,
    visible: true,
    ...over,
  } as UiElement;
}

const gear = control({ stableId: "profile-settings" });
const edit = control({ label: "Edit profile", stableId: "profile-edit" });
const del = control({ label: "Delete account" });
const back = control({ label: "Navigate up" });
const add = control({ label: "Add note" });

/** Home → Profile and Home → Notes were observed; we stand on Home. */
function graph(): StateGraph {
  const g = new StateGraph();
  g.visit("home", "Home", 1);
  g.visit("profile", "Profile", 2);
  g.visit("notes", "Notes", 3);
  g.record("home", "tap:profile", "Tap Profile", "profile", 2, { type: "tap" });
  g.record("profile", "back:", "Back", "home", 3, { type: "back" });
  g.record("home", "tap:notes", "Tap Notes", "notes", 4, { type: "tap" });
  return g;
}

describe("safeToTry / iconOnly", () => {
  it("keeps destructive and back controls for the planner only", () => {
    expect(safeToTry(del)).toBe(false);
    expect(safeToTry(control({ text: "Sign out" }))).toBe(false);
    expect(safeToTry(back)).toBe(false);
    expect(safeToTry(gear)).toBe(true);
    expect(iconOnly(gear)).toBe(true);
    expect(iconOnly(edit)).toBe(false);
  });
});

describe("ControlLedger.frontier", () => {
  it("puts an untried settings icon first when Store Readiness is selected", () => {
    const ledger = new ControlLedger();
    ledger.note("Profile", [edit, gear, del, back]);
    ledger.note("Notes", [add]);
    const g = graph();
    const out = ledger.frontier(g, "Home", ["store_readiness"]);
    expect(out.map((c) => c.description)).toEqual([
      '"Profile": icon button id=profile-settings',
      '"Profile": button "Edit profile"',
      '"Notes": button "Add note"',
    ]);
    expect(out[0]?.identity).toMatchObject({ stableId: "profile-settings" });
  });

  it("drops controls already tapped on that screen and screens without an observed path", () => {
    const ledger = new ControlLedger();
    ledger.note("Profile", [gear]);
    ledger.note("Elsewhere", [add]);
    const g = graph();
    expect(ledger.frontier(g, "Home", ["functional"])).toHaveLength(1);
    g.record("profile", actionKey("tap", gear), "Tap gear", "profile", 5, { type: "tap" });
    expect(ledger.frontier(g, "Home", ["functional"])).toEqual([]);
  });

  it("treats one opened list row as standing for the others", () => {
    const rows = ["Groceries", "Trip plan", "Ideas"].map((text) => control({ role: "cell", text }));
    const ledger = new ControlLedger();
    ledger.note("Notes", [...rows, add]);
    const g = graph();
    expect(ledger.frontier(g, "Home", ["functional"])).toHaveLength(2);
    g.record("notes", actionKey("tap", rows[0]), "Open row", "notes", 6, { type: "tap" });
    expect(ledger.frontier(g, "Home", ["functional"]).map((c) => c.role)).toEqual(["button"]);
  });
});

describe("familyOf", () => {
  it("groups ids that differ only by a trailing index or id", () => {
    expect(familyOf({ role: "button", stableId: "note-row-0" })).toBe("id:note-row");
    expect(familyOf({ role: "button", stableId: "note-row-12" })).toBe("id:note-row");
    expect(familyOf({ role: "button", stableId: "item_3f2a91c4" })).toBe("id:item");
    expect(familyOf({ role: "cell" })).toBe("cell");
    expect(familyOf({ role: "button", stableId: "profile-settings" })).toBeNull();
    expect(familyOf({ role: "button" })).toBeNull();
  });

  it("offers one row of a family until a row was opened", () => {
    const rows = [0, 1, 2].map((n) => control({ stableId: `note-row-${n}`, text: `Note ${n}` }));
    const ledger = new ControlLedger();
    ledger.note("Notes", [...rows, add]);
    const g = graph();
    expect(ledger.frontier(g, "Home", ["functional"]).map((c) => c.identity.stableId)).toEqual([
      "note-row-0",
      undefined,
    ]);
    g.record("notes", actionKey("tap", rows[1]), "Open row", "notes", 6, { type: "tap" });
    expect(ledger.frontier(g, "Home", ["functional"])).toHaveLength(1);
  });
});
