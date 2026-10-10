import { readFileSync } from "node:fs";
import type { UiElement } from "@tapscout/shared";
import { describe, expect, it } from "vitest";
import { normalizeHierarchy } from "../src/observer.js";
import { actionKey, fingerprint, StateGraph } from "../src/state.js";

const screen = (platform: "android" | "ios", name: string, scale = 1) =>
  normalizeHierarchy(platform, readFileSync(`test/fixtures/${name}.xml`, "utf8"), { scale });

describe("fingerprint", () => {
  it("separates different screens and ignores field values", () => {
    const welcome = screen("android", "android-welcome");
    const register = screen("android", "android-register");
    expect(fingerprint(welcome)).not.toBe(fingerprint(register));

    const typed = {
      ...register,
      elements: register.elements.map((e) =>
        e.stableId === "register-name" ? ({ ...e, text: "Alex Doe" } as UiElement) : e,
      ),
    };
    expect(fingerprint(typed)).toBe(fingerprint(register));
  });

  it("treats an open keyboard as a different state of the same screen", () => {
    const register = screen("android", "android-register");
    expect(fingerprint({ ...register, keyboardVisible: true })).not.toBe(fingerprint(register));
  });
});

describe("StateGraph", () => {
  it("counts visits, transitions and detects loops", () => {
    const g = new StateGraph(3);
    expect(g.visit("a", "Welcome", 0).isNew).toBe(true);
    expect(g.visit("b", "Register", 1).isNew).toBe(true);
    g.record("a", "tap:start", 'Tap "Get started"', "b", 1);
    expect(g.transitions).toBe(1);
    expect(g.history.at(-1)?.result).toBe('opened "Register"');

    for (let i = 0; i < 3; i++) g.record("b", "tap:continue", 'Tap "Continue"', "b", 2 + i);
    expect(g.isLooping("b", "tap:continue")).toBe(true);
    expect(g.stuckFor(3)).toBe(true);
    expect(g.get("b")?.tried.get("tap:continue")?.count).toBe(3);
    expect(g.visit("a", "Welcome", 5).isNew).toBe(false);
    expect(g.get("a")?.visits).toBe(2);
  });

  it("keys actions by target identity, not by the per-observation ref", () => {
    const el = { ref: "el-4", stableId: "register-continue", label: "Continue" } as UiElement;
    expect(actionKey("tap", el)).toBe(actionKey("tap", { ...el, ref: "el-9" }));
  });
});
