import { describe, expect, it } from "vitest";
import { buildCapabilities, locatorCandidates } from "../src/index.js";

describe("locatorCandidates", () => {
  it("prefers stable ids, then labels, then text on Android", () => {
    const c = locatorCandidates("android", { testId: "welcome-get-started", label: "Get started" });
    expect(c.map((x) => x.strategy)).toEqual(["stable_id", "accessibility_label", "text"]);
    expect(c[0]?.selector).toBe(
      'android=new UiSelector().resourceIdMatches("(.*:id/)?welcome-get-started")',
    );
  });

  it("uses accessibility ids on iOS and escapes quotes", () => {
    const c = locatorCandidates("ios", { testId: "edit-save", label: 'Say "hi"' });
    expect(c[0]?.selector).toBe("~edit-save");
    expect(c[2]?.selector).toBe(
      '-ios predicate string:label == "Say \\"hi\\"" OR value == "Say \\"hi\\""',
    );
  });

  it("never produces coordinate selectors", () => {
    expect(locatorCandidates("ios", {})).toEqual([]);
  });
});

describe("buildCapabilities", () => {
  it("keeps automatic permission and alert handling off", () => {
    expect(
      buildCapabilities({ platform: "android", appPath: "a.apk" })["appium:autoGrantPermissions"],
    ).toBe(false);
    const ios = buildCapabilities({ platform: "ios", appPath: "A.app", udid: "X" });
    expect(ios["appium:autoAcceptAlerts"]).toBe(false);
    expect(ios["appium:udid"]).toBe("X");
    expect(ios["appium:usePreinstalledWDA"]).toBeUndefined();
  });

  it("uses a prebuilt WebDriverAgent when one is given", () => {
    const ios = buildCapabilities({
      platform: "ios",
      appPath: "A.app",
      prebuiltWdaPath: "/w/WDA.app",
    });
    expect(ios["appium:usePreinstalledWDA"]).toBe(true);
    expect(ios["appium:prebuiltWDAPath"]).toBe("/w/WDA.app");
  });
});
