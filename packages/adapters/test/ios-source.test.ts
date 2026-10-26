import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsVisibility } from "../src/index.js";

const fixture = (name: string) =>
  readFileSync(`../runner/test/fixtures/${name}.xml`, "utf8").replaceAll(/ visible="\w+"/g, "");

const app = (...windows: string[]) =>
  `<AppiumAUT><XCUIElementTypeApplication type="XCUIElementTypeApplication" name="App">${windows
    .map(
      (w) =>
        `<XCUIElementTypeWindow type="XCUIElementTypeWindow" x="0" y="0">${w}</XCUIElementTypeWindow>`,
    )
    .join("")}</XCUIElementTypeApplication></AppiumAUT>`;

describe("needsVisibility", () => {
  it("keeps the fast source for a plain app screen", () => {
    expect(needsVisibility(fixture("ios-welcome"))).toBe(false);
    expect(needsVisibility(fixture("ios-register"))).toBe(false);
    // Empty extra windows (status bar, keyboard host while closed) do not count.
    expect(
      needsVisibility(
        app(
          `<XCUIElementTypeButton type="XCUIElementTypeButton" name="Save"/>`,
          `<XCUIElementTypeOther type="XCUIElementTypeOther"/>`,
        ),
      ),
    ).toBe(false);
  });

  it("reads the full source where something covers the app", () => {
    expect(needsVisibility(fixture("ios-register-keyboard"))).toBe(true);
    expect(needsVisibility(fixture("ios-permission"))).toBe(true);
    expect(needsVisibility(fixture("ios-share-sheet"))).toBe(true);
    // A sheet over a screen that stays in the tree behind it (Ice Cubes "Add Account"): two bars.
    expect(
      needsVisibility(
        app(
          `<XCUIElementTypeNavigationBar type="XCUIElementTypeNavigationBar" name="Trending"/>` +
            `<XCUIElementTypeNavigationBar type="XCUIElementTypeNavigationBar" name="Add Account"/>`,
        ),
      ),
    ).toBe(true);
    // iOS 26 keeps a dimming overlay on plain screens; it alone is no cover.
    expect(
      needsVisibility(
        app(`<XCUIElementTypeImage type="XCUIElementTypeImage" name="AdditionalDimmingOverlay"/>`),
      ),
    ).toBe(false);
    // Content in a second window.
    expect(
      needsVisibility(
        app(
          `<XCUIElementTypeButton type="XCUIElementTypeButton" name="Save"/>`,
          `<XCUIElementTypeButton type="XCUIElementTypeButton" name="Done"/>`,
        ),
      ),
    ).toBe(true);
  });
});
