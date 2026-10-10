import type { DevicePlatform } from "./locators.js";

export interface SessionOptions {
  platform: DevicePlatform;
  /** Path to the APK, or to the unpacked iOS Simulator `.app`. */
  appPath: string;
  /** iOS Simulator UDID or Android emulator serial; optional when exactly one device is attached. */
  udid?: string;
  /** iOS only: prebuilt WebDriverAgentRunner-Runner.app, so no xcodebuild runs at session start. */
  prebuiltWdaPath?: string;
}

/**
 * Appium capabilities. Automatic alert/permission handling stays off so permission dialogs are
 * observed and tested as separate scenarios (docs/03 §5.2).
 */
export function buildCapabilities(options: SessionOptions): Record<string, unknown> {
  const common = {
    "appium:app": options.appPath,
    "appium:newCommandTimeout": 300,
    "appium:noReset": false,
    ...(options.udid ? { "appium:udid": options.udid } : {}),
  };

  if (options.platform === "android") {
    return {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:autoGrantPermissions": false,
      "appium:uiautomator2ServerInstallTimeout": 120_000,
      "appium:uiautomator2ServerLaunchTimeout": 120_000,
      "appium:adbExecTimeout": 120_000,
      "appium:androidInstallTimeout": 180_000,
      ...common,
    };
  }

  return {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:autoAcceptAlerts": false,
    "appium:autoDismissAlerts": false,
    // Without a prebuilt WDA it is built on first use; small CI machines need generous limits.
    ...(options.prebuiltWdaPath
      ? { "appium:usePreinstalledWDA": true, "appium:prebuiltWDAPath": options.prebuiltWdaPath }
      : {}),
    // The CI simulator is booted headless; without this the driver restarts it with a visible
    // window, which cost ~2.5 min per session (run 78ff4a21).
    "appium:isHeadless": true,
    // Typed test data must arrive unchanged (persistence checks compare it), and the keyboard's
    // suggestion bar slows typing down.
    "appium:keyboardAutocorrection": false,
    "appium:keyboardPrediction": false,
    "appium:wdaLaunchTimeout": 600_000,
    "appium:wdaConnectionTimeout": 600_000,
    "appium:simulatorStartupTimeout": 300_000,
    ...common,
  };
}
