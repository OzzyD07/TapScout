import { describe, expect, it } from "vitest";
import { installRejection, simulatorPlatformProblem } from "../src/build-check.js";

describe("installRejection", () => {
  it("explains Android install failures caused by the build", () => {
    expect(
      installRejection(
        "android",
        "Error executing adbExec. Original error: 'Command adb install failed' Failure [INSTALL_FAILED_NO_MATCHING_ABIS: Failed to extract native libraries]",
      ),
    ).toContain("x86_64");
    expect(installRejection("android", "Failure [INSTALL_PARSE_FAILED_NOT_APK]")).toContain(
      "could not be read",
    );
    expect(installRejection("android", "Failure [INSTALL_FAILED_SOMETHING_NEW]")).toContain(
      "INSTALL_FAILED_SOMETHING_NEW",
    );
  });

  it("explains a device build on the iOS Simulator", () => {
    expect(installRejection("ios", "Unable to install app: Bad CPU type in executable")).toContain(
      "iphonesimulator",
    );
  });

  it("leaves real infrastructure errors alone", () => {
    expect(installRejection("android", "socket hang up")).toBeNull();
    expect(installRejection("ios", "Could not start WebDriverAgent")).toBeNull();
  });
});

describe("simulatorPlatformProblem", () => {
  it("accepts Simulator builds and builds without the key", () => {
    expect(
      simulatorPlatformProblem({ CFBundleSupportedPlatforms: ["iPhoneSimulator"] }),
    ).toBeNull();
    expect(simulatorPlatformProblem({})).toBeNull();
    expect(simulatorPlatformProblem(null)).toBeNull();
  });

  it("names a device-only build", () => {
    expect(simulatorPlatformProblem({ CFBundleSupportedPlatforms: ["iPhoneOS"] })).toContain(
      "device build (iPhoneOS)",
    );
  });
});
