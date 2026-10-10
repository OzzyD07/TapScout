import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { remote } from "webdriverio";
import { buildCapabilities, type SessionOptions } from "./capabilities.js";
import {
  type DevicePlatform,
  type LocatorCandidate,
  locatorCandidates,
  type TargetHint,
} from "./locators.js";

type Browser = Awaited<ReturnType<typeof remote>>;

export interface ResolvedTarget {
  candidate: LocatorCandidate;
  elementId: string;
}

export interface ObservationFiles {
  name: string;
  screenshot: string;
  hierarchy: string;
  capturedAt: string;
}

export class DeviceSession {
  private constructor(
    readonly platform: DevicePlatform,
    readonly driver: Browser,
  ) {}

  static async open(
    options: SessionOptions & { appiumUrl?: string; connectionTimeoutMs?: number },
  ): Promise<DeviceSession> {
    const url = new URL(options.appiumUrl ?? "http://127.0.0.1:4723");
    const driver = await remote({
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: Number(url.port || 4723),
      path: url.pathname || "/",
      logLevel: "warn",
      connectionRetryTimeout: options.connectionTimeoutMs ?? 900_000,
      connectionRetryCount: 0,
      capabilities: buildCapabilities(options),
    });
    // Explicit polling below; never rely on implicit waits.
    await driver.setTimeout({ implicit: 0 });
    return new DeviceSession(options.platform, driver);
  }

  /** Polls every candidate until one matches exactly one element, or the deadline passes. */
  async find(hint: TargetHint, timeoutMs = 30_000): Promise<ResolvedTarget | null> {
    const candidates = locatorCandidates(this.platform, hint);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const candidate of candidates) {
        const elements = await this.driver.$$(candidate.selector).getElements();
        if (elements.length === 1 && elements[0]) {
          const elementId = await elements[0].elementId;
          if (elementId) return { candidate, elementId };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }

  async tap(target: ResolvedTarget): Promise<void> {
    await this.driver.elementClick(target.elementId);
  }

  /** Screenshot and hierarchy are captured separately; they are not treated as atomic. */
  async observe(dir: string, name: string): Promise<ObservationFiles> {
    const capturedAt = new Date().toISOString();
    const screenshot = join(dir, `${name}.png`);
    const hierarchy = join(dir, `${name}.xml`);
    await this.driver.saveScreenshot(screenshot);
    await writeFile(hierarchy, await this.driver.getPageSource());
    return { name, screenshot, hierarchy, capturedAt };
  }

  /** Screen size in driver units: px on Android, pt on iOS. */
  async windowSize(): Promise<{ width: number; height: number }> {
    const rect = await this.driver.getWindowRect();
    return { width: rect.width, height: rect.height };
  }

  async screenshotPng(): Promise<Buffer> {
    return Buffer.from(await this.driver.takeScreenshot(), "base64");
  }

  pageSource(): Promise<string> {
    return this.driver.getPageSource();
  }

  async keyboardShown(): Promise<boolean> {
    try {
      return Boolean(await this.driver.isKeyboardShown());
    } catch {
      return false;
    }
  }

  /** Appium app state: 0 not installed, 1 not running, 2–3 background, 4 foreground. */
  async appState(appId: string): Promise<number> {
    return Number(await this.driver.queryAppState(appId));
  }

  /** Package (Android) or bundle id (iOS) from the session capabilities, when the driver set it. */
  appIdFromCapabilities(): string | undefined {
    const caps = this.driver.capabilities as Record<string, unknown>;
    const id =
      caps.appPackage ?? caps["appium:appPackage"] ?? caps.bundleId ?? caps["appium:bundleId"];
    return typeof id === "string" && id ? id : undefined;
  }

  /** A single touch tap at a point in driver units. Only for verified, current bounds. */
  async tapAt(x: number, y: number): Promise<void> {
    await this.driver.performActions([
      {
        type: "pointer",
        id: "finger1",
        parameters: { pointerType: "touch" },
        actions: [
          { type: "pointerMove", duration: 0, x: Math.round(x), y: Math.round(y) },
          { type: "pointerDown", button: 0 },
          { type: "pause", duration: 80 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ]);
    await this.driver.releaseActions();
  }

  async typeInto(target: ResolvedTarget, text: string): Promise<void> {
    await this.driver.elementClick(target.elementId);
    await this.driver.elementClear(target.elementId);
    if (text) await this.driver.elementSendKeys(target.elementId, text);
  }

  async pressEnter(): Promise<void> {
    if (this.platform === "android") await this.driver.pressKeyCode(66);
    else await this.driver.keys(["\n"]);
  }

  /**
   * Scrolls the content in `direction` ("down" reveals what is below). `region` is in driver units;
   * without it the central part of the screen is used.
   */
  async scroll(
    direction: "up" | "down" | "left" | "right",
    region?: { x: number; y: number; width: number; height: number },
  ): Promise<void> {
    if (this.platform === "android") {
      const size = region ?? (await this.windowSize());
      const r = region ?? {
        x: 0,
        y: Math.round(size.height * 0.2),
        width: size.width,
        height: Math.round(size.height * 0.6),
      };
      await this.driver.execute("mobile: scrollGesture", {
        left: r.x,
        top: r.y,
        width: r.width,
        height: r.height,
        direction,
        percent: 0.7,
      });
      return;
    }
    await this.driver.execute("mobile: scroll", { direction });
  }

  async back(): Promise<void> {
    await this.driver.back();
  }

  /**
   * Closes the software keyboard. iOS has no generic dismiss: after the driver's own attempt the
   * keyboard's return-type keys are tried. Throws when the keyboard could not be closed this way.
   */
  async hideKeyboard(): Promise<void> {
    try {
      await this.driver.hideKeyboard();
      return;
    } catch (error) {
      if (this.platform !== "ios") throw error;
    }
    await this.driver.execute("mobile: hideKeyboard", {
      keys: ["done", "Done", "return", "Return", "go", "Go", "search", "Search"],
    });
  }

  async relaunch(appId: string, clearData: boolean): Promise<void> {
    await this.driver.terminateApp(appId).catch(() => undefined);
    if (clearData && this.platform === "android") {
      await this.driver.execute("mobile: clearApp", { appId });
    }
    await this.driver.activateApp(appId);
  }

  async background(seconds: number): Promise<void> {
    await this.driver.execute("mobile: backgroundApp", { seconds });
  }

  async close(): Promise<void> {
    await this.driver.deleteSession();
  }
}
