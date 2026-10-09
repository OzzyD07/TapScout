#!/usr/bin/env node
// TapScout device runner (F1 pilot): GitHub OIDC bootstrap → lease + heartbeat → download build →
// Appium session → evidence + events → finish. The first action is deterministic; the Nemotron
// planner replaces it in F2. Never prints tokens or signed URLs.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type DevicePlatform, DeviceSession } from "@tapscout/adapters";
import type {
  DeviceProfile,
  FinishSessionRequest,
  SessionCounters,
  StopReason,
} from "@tapscout/shared";
import { fetchGithubOidcToken, RunnerApi, RunnerApiError } from "./api.js";
import { EventSink } from "./events.js";
import { uploadEvidence } from "./uploads.js";

const { values } = parseArgs({
  options: {
    platform: { type: "string" },
    "run-id": { type: "string" },
    api: { type: "string", default: process.env.TAPSCOUT_API_URL },
    audience: { type: "string", default: process.env.TAPSCOUT_OIDC_AUDIENCE ?? "tapscout" },
    udid: { type: "string" },
    wda: { type: "string" },
    out: { type: "string", default: ".artifacts/run" },
  },
});

const platform = values.platform as DevicePlatform | undefined;
const runId = values["run-id"];
if ((platform !== "android" && platform !== "ios") || !runId || !values.api) {
  console.error("usage: tapscout-runner --platform android|ios --run-id <uuid> --api <base url>");
  process.exit(2);
}

class Stop extends Error {
  constructor(
    readonly reason: StopReason,
    readonly phase: FinishSessionRequest["phase"] | null,
    message: string,
  ) {
    super(message);
  }
}

const outDir = join(values.out ?? ".artifacts/run", platform);
await mkdir(outDir, { recursive: true });
const api = new RunnerApi({ baseUrl: values.api });
const counters: SessionCounters = {
  screensObserved: 0,
  transitionsObserved: 0,
  actionsExecuted: 0,
  checksRun: 0,
  plannerCalls: 0,
  visionCalls: 0,
};

console.log(`runner: ${platform} run ${runId} → ${new URL(values.api).origin}`);
const boot = await api.bootstrap(
  await fetchGithubOidcToken(values.audience ?? "tapscout"),
  runId,
  platform,
);
api.setToken(boot.sessionToken);
console.log(`runner: lease acquired (attempt ${boot.attemptId}, lease v${boot.leaseVersion})`);

const sink = new EventSink(api, { runId, sessionId: boot.sessionId, attemptId: boot.attemptId });
let stopSignal: Stop | null = null;

const heartbeat = setInterval(async () => {
  try {
    const hb = await api.heartbeat();
    if (!hb.leaseValid) stopSignal = new Stop("infrastructure_failed", null, "lease lost");
    else if (hb.cancelRequested)
      stopSignal ??= new Stop("cancelled", "cancelled", "cancelled by user");
    await sink.flush();
  } catch (error) {
    console.warn(`runner: heartbeat failed: ${(error as Error).message}`);
  }
}, boot.heartbeatIntervalSeconds * 1000);

function checkpoint(): void {
  if (stopSignal) throw stopSignal;
}

async function evidence(file: string, kind: "screenshot" | "hierarchy", step: number) {
  return uploadEvidence(api, file, kind, step);
}

let device: DeviceSession | undefined;
let deviceProfile: DeviceProfile | undefined;
let finish: FinishSessionRequest | null = null;
let step = 0;

try {
  sink.emit({
    type: "note",
    payload: { level: "info", message: `Runner started on GitHub-hosted ${platform} runner` },
  });
  await sink.flush();

  // Download and verify the build (the hash is recorded, never trusted from the request).
  const buildDir = join(outDir, "build");
  await mkdir(buildDir, { recursive: true });
  const res = await fetch(boot.build.downloadUrl, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok)
    throw new Stop(
      "infrastructure_failed",
      "infrastructure_failed",
      `build download HTTP ${res.status}`,
    );
  const bytes = Buffer.from(await res.arrayBuffer());
  const buildFile = join(buildDir, boot.build.fileName);
  await writeFile(buildFile, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let appPath = buildFile;
  if (platform === "ios") {
    execFileSync("ditto", ["-x", "-k", buildFile, join(buildDir, "unpacked")]);
    const app = (await readdir(join(buildDir, "unpacked"))).find((f) => f.endsWith(".app"));
    if (!app)
      throw new Stop("unsupported", "blocked", "ZIP does not contain an iOS Simulator .app");
    appPath = join(buildDir, "unpacked", app);
  }
  sink.emit({
    type: "note",
    payload: {
      level: "info",
      message: `Build downloaded (${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}…)`,
    },
  });
  checkpoint();

  device = await DeviceSession.open({
    platform,
    appPath,
    udid: values.udid,
    prebuiltWdaPath: values.wda,
  });
  const caps = device.driver.capabilities as Record<string, unknown>;
  deviceProfile = {
    platform,
    environment: platform === "ios" ? "ios_simulator" : "android_emulator",
    osVersion: String(caps.platformVersion ?? caps["appium:platformVersion"] ?? "unknown"),
    deviceName: String(caps.deviceName ?? caps["appium:deviceName"] ?? "unknown"),
    automation: {
      appium: process.env.APPIUM_VERSION ?? "unknown",
      driver: platform === "ios" ? "xcuitest" : "uiautomator2",
      driverVersion:
        (platform === "ios" ? process.env.XCUITEST_VERSION : process.env.UIAUTOMATOR2_VERSION) ??
        "unknown",
    },
  };
  sink.emit({ type: "phase_changed", payload: { from: "preparing", to: "exploring" } });
  checkpoint();

  // Observe the launch screen.
  const start = await device.find({ testId: "welcome-get-started", label: "Get started" }, 90_000);
  const launch = await device.observe(outDir, `step-${step}-launch`);
  const launchShot = await evidence(launch.screenshot, "screenshot", step);
  await evidence(launch.hierarchy, "hierarchy", step);
  counters.screensObserved += 1;
  sink.emit({
    type: "observation",
    stepIndex: step,
    payload: {
      observationId: `obs-${step}`,
      isNewState: true,
      elementCount: 0,
      screenshotArtifactId: launchShot,
    },
  });
  await sink.flush();
  checkpoint();
  if (!start)
    throw new Stop(
      "access_blocked",
      "blocked",
      "launch screen did not show the expected entry action",
    );

  // One deterministic action (F1). In F2 the Nemotron planner proposes it.
  step += 1;
  const commandId = `cmd-${step}`;
  sink.emit({
    type: "action_planned",
    stepIndex: step,
    payload: {
      commandId,
      goalId: "pilot-entry",
      summary: 'Tap "Get started"',
      decisionSummary: "F1 pilot: deterministic first action to verify the device chain.",
      source: "deterministic",
    },
  });
  const t0 = Date.now();
  await device.tap(start);
  const next = await device.find({ testId: "register-name", label: "Name" }, 30_000);
  const after = await device.observe(outDir, `step-${step}-after-tap`);
  const afterShot = await evidence(after.screenshot, "screenshot", step);
  await evidence(after.hierarchy, "hierarchy", step);
  counters.actionsExecuted += 1;
  counters.screensObserved += 1;
  counters.transitionsObserved += next ? 1 : 0;
  sink.emit({
    type: "action_executed",
    stepIndex: step,
    payload: {
      commandId,
      summary: 'Tap "Get started"',
      outcome: next ? "ok" : "uncertain",
      durationMs: Date.now() - t0,
      screenshotArtifactId: afterShot,
      resultSummary: next
        ? "Registration form is visible."
        : "Expected registration form not observed.",
    },
  });
  sink.emit({ type: "counters", payload: counters });
  sink.emit({
    type: "stopped",
    payload: { reason: "goals_exhausted", detail: "F1 pilot flow finished" },
  });
  await sink.flush();

  finish = {
    phase: "completed",
    stopReason: "goals_exhausted",
    result: {
      platform,
      sessionId: boot.sessionId,
      phase: "completed",
      stopReason: "goals_exhausted",
      device: deviceProfile,
      build: { buildId: boot.build.buildId, sha256 },
      counters,
      checks: [],
      findingIds: [],
      blockers: [],
    },
    device: deviceProfile,
  };
} catch (error) {
  const stop =
    error instanceof Stop
      ? error
      : new Stop("infrastructure_failed", "infrastructure_failed", (error as Error).message);
  console.error(`runner: stopping (${stop.reason}): ${stop.message}`);
  if (stop.phase) {
    try {
      sink.emit({
        type: "blocked",
        payload: {
          kind:
            stop.reason === "unsupported"
              ? "unsupported"
              : stop.reason === "access_blocked"
                ? "access"
                : "infrastructure",
          reason: stop.message.slice(0, 400),
        },
      });
      sink.emit({ type: "counters", payload: counters });
      sink.emit({ type: "stopped", payload: { reason: stop.reason } });
      await sink.flush();
    } catch {
      // Best effort; the finish call below still records the outcome.
    }
    finish = {
      phase: stop.phase,
      stopReason: stop.reason,
      result: {
        platform,
        sessionId: boot.sessionId,
        phase: stop.phase,
        stopReason: stop.reason,
        device: deviceProfile,
        build: { buildId: boot.build.buildId },
        counters,
        checks: [],
        findingIds: [],
        blockers: [stop.message.slice(0, 400)],
      },
      device: deviceProfile,
    };
  }
} finally {
  clearInterval(heartbeat);
  if (device) await device.close().catch(() => undefined);
}

let exitCode = 0;
if (finish) {
  try {
    await sink.flush();
    await api.finish(finish);
    console.log(`runner: session finished as ${finish.phase}`);
    exitCode = finish.phase === "completed" ? 0 : 1;
  } catch (error) {
    const lost = error instanceof RunnerApiError && error.code === "lease_lost";
    console.error(
      `runner: finish failed${lost ? " (lease lost)" : ""}: ${(error as Error).message}`,
    );
    exitCode = 1;
  }
} else {
  console.error(
    "runner: lease lost; not writing a result for an attempt that no longer owns the session",
  );
  exitCode = 1;
}
process.exit(exitCode);
