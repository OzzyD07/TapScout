#!/usr/bin/env node
// F1 device smoke (docs/05 §6): launch the sample app, observe, perform one real action,
// verify the resulting screen and record timings and the locator strategy that matched.
// Runs without the TapScout backend; results go to --out for the workflow to upload.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { DevicePlatform } from "./locators.js";
import { DeviceSession, type ObservationFiles } from "./session.js";

interface StepRecord {
  name: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

const { values } = parseArgs({
  options: {
    platform: { type: "string" },
    app: { type: "string" },
    udid: { type: "string" },
    out: { type: "string", default: ".artifacts/smoke" },
    appium: { type: "string", default: "http://127.0.0.1:4723" },
  },
});

const platform = values.platform as DevicePlatform | undefined;
if ((platform !== "android" && platform !== "ios") || !values.app) {
  console.error(
    "usage: tapscout-device-smoke --platform android|ios --app <path> [--udid <id>] [--out <dir>]",
  );
  process.exit(2);
}

const outDir = join(values.out ?? ".artifacts/smoke", platform);
await mkdir(outDir, { recursive: true });

const steps: StepRecord[] = [];
const observations: ObservationFiles[] = [];
const startedAt = Date.now();

async function step<T>(name: string, fn: () => Promise<T>, detail?: (r: T) => string): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    steps.push({ name, ok: true, durationMs: Date.now() - t0, detail: detail?.(result) });
    console.log(`✓ ${name} (${Date.now() - t0} ms)`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    steps.push({ name, ok: false, durationMs: Date.now() - t0, detail: message.slice(0, 2000) });
    console.error(`✗ ${name}: ${message.split("\n")[0]}`);
    throw error;
  }
}

let session: DeviceSession | undefined;
let success = false;
let deviceCaps: Record<string, unknown> = {};

try {
  session = await step("open_session", () =>
    DeviceSession.open({
      platform,
      appPath: values.app as string,
      udid: values.udid,
      appiumUrl: values.appium,
    }),
  );
  const s = session;
  deviceCaps = s.driver.capabilities as Record<string, unknown>;

  const start = await step(
    "find_get_started",
    async () => {
      const target = await s.find({ testId: "welcome-get-started", label: "Get started" }, 90_000);
      if (!target) throw new Error("welcome screen did not show 'Get started' within 90 s");
      return target;
    },
    (t) => `${t.candidate.strategy}: ${t.candidate.selector}`,
  );
  observations.push(await step("observe_launch", () => s.observe(outDir, "01-launch")));

  await step("tap_get_started", () => s.tap(start));

  await step(
    "verify_register_screen",
    async () => {
      const field = await s.find({ testId: "register-name", label: "Name" }, 30_000);
      if (!field) throw new Error("register screen did not appear after the tap");
      return field;
    },
    (t) => `${t.candidate.strategy}: ${t.candidate.selector}`,
  );
  observations.push(await step("observe_after_tap", () => s.observe(outDir, "02-after-tap")));
  success = true;
} catch {
  if (session) {
    try {
      observations.push(await session.observe(outDir, "99-failure"));
    } catch {
      // The session may already be gone; the step log keeps the original error.
    }
  }
} finally {
  if (session) {
    try {
      await session.close();
    } catch {
      // Ignore close errors; the result is already decided.
    }
  }
}

const result = {
  platform,
  success,
  totalMs: Date.now() - startedAt,
  steps,
  observations: observations.map((o) => ({ ...o, screenshot: o.screenshot.replace(/\\/g, "/") })),
  device: {
    platformVersion: deviceCaps.platformVersion ?? deviceCaps["appium:platformVersion"],
    deviceName: deviceCaps.deviceName ?? deviceCaps["appium:deviceName"],
    automationName: deviceCaps.automationName ?? deviceCaps["appium:automationName"],
  },
  finishedAt: new Date().toISOString(),
};
await writeFile(join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `result: ${success ? "PASS" : "FAIL"} in ${result.totalMs} ms → ${join(outDir, "result.json")}`,
);
process.exit(success ? 0 : 1);
