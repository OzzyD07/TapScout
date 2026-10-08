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

  async close(): Promise<void> {
    await this.driver.deleteSession();
  }
}
