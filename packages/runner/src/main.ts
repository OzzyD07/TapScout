#!/usr/bin/env node
// TapScout device runner: GitHub OIDC bootstrap → lease + heartbeat → download build → Appium
// session → autonomous agent loop (Nemotron planner via the relay) → evidence + events → finish.
// Never prints tokens or signed URLs.

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type DevicePlatform, DeviceSession } from "@tapscout/adapters";
import {
  type DeviceProfile,
  type FinishSessionRequest,
  runVersionStamp,
  type SessionCounters,
  type StopReason,
} from "@tapscout/shared";
import { runAgent } from "./agent.js";
import { fetchGithubOidcToken, RunnerApi, RunnerApiError } from "./api.js";
import { installRejection, simulatorPlatformProblem } from "./build-check.js";
import { EventSink } from "./events.js";
import { EvidenceUploader } from "./uploads.js";

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

/** Planner answers measured at ~130–150 tokens; the cap leaves room without wasting reservation. */
const PLANNER_MAX_OUTPUT_TOKENS = 500;
/** A device failure within this many actions gets one retry with a new Appium session. */
const EARLY_FAILURE_ACTIONS = 5;

/** XCUITest reports no device name for an existing simulator chosen by UDID; simctl knows it. */
function simulatorName(udid: string | undefined): string | undefined {
  if (!udid) return undefined;
  try {
    const list = JSON.parse(
      execFileSync("xcrun", ["simctl", "list", "devices", "-j"]).toString("utf8"),
    ) as { devices: Record<string, { udid: string; name: string }[]> };
    return Object.values(list.devices)
      .flat()
      .find((d) => d.udid === udid)?.name;
  } catch {
    return undefined;
  }
}

const startedAt = Date.now();
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

let device: DeviceSession | undefined;
let deviceProfile: DeviceProfile | undefined;
let finish: FinishSessionRequest | null = null;
const uploads = new EvidenceUploader(api);

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
    const entries = await readdir(join(buildDir, "unpacked"));
    const app = entries.find((f) => f.endsWith(".app"));
    if (!app) {
      throw new Stop(
        "unsupported",
        "blocked",
        entries.includes("Payload")
          ? "This is an .ipa device build; TapScout needs a ZIP of an iOS Simulator .app."
          : "ZIP does not contain an iOS Simulator .app at its top level",
      );
    }
    appPath = join(buildDir, "unpacked", app);
    let plist: unknown = null;
    try {
      const json = execFileSync("plutil", [
        "-convert",
        "json",
        "-o",
        "-",
        join(appPath, "Info.plist"),
      ]);
      plist = JSON.parse(json.toString("utf8"));
    } catch {
      // No readable Info.plist: let the install attempt decide.
    }
    const problem = simulatorPlatformProblem(plist);
    if (problem) throw new Stop("unsupported", "blocked", problem);
  }
  sink.emit({
    type: "note",
    payload: {
      level: "info",
      message: `Build downloaded (${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}…)`,
    },
  });
  checkpoint();

  const openDevice = () =>
    DeviceSession.open({ platform, appPath, udid: values.udid, prebuiltWdaPath: values.wda });
  try {
    device = await openDevice();
  } catch (error) {
    const rejection = installRejection(platform, (error as Error).message ?? "");
    if (rejection) throw new Stop("unsupported", "blocked", rejection);
    throw error;
  }
  const caps = device.driver.capabilities as Record<string, unknown>;
  deviceProfile = {
    platform,
    environment: platform === "ios" ? "ios_simulator" : "android_emulator",
    osVersion: String(caps.platformVersion ?? caps["appium:platformVersion"] ?? "unknown"),
    deviceName: String(
      (platform === "ios" ? simulatorName(values.udid) : undefined) ??
        caps.deviceName ??
        caps["appium:deviceName"] ??
        "unknown",
    ),
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

  // Autonomous exploration (F2): Observe → Plan (Nemotron) → Validate → Act → Evaluate.
  // The job clock is not visible to the runner; device setup before it is bounded by the
  // preparation budget, so the soft stop is measured from runner start minus that allowance.
  const softDeadline =
    startedAt + (boot.budget.qaSoftStopMinute - boot.budget.preparationMaxMinutes) * 60_000;
  const runOnce = (session: DeviceSession) =>
    runAgent(
      {
        device: session,
        emit: (event) => sink.emit(event),
        flush: () => sink.flush(),
        async saveEvidence(name, kind, data, stepIndex) {
          const file = join(outDir, `${name}.${kind === "screenshot" ? "png" : "xml"}`);
          await writeFile(file, data);
          return uploads.start(file, kind, stepIndex);
        },
        evidenceReady: (artifactId) => uploads.ready(artifactId),
        plan: (messages, purpose) =>
          api.relayPlan({
            purpose,
            messages,
            responseSchema: "planner_output_v1",
            maxOutputTokens: PLANNER_MAX_OUTPUT_TOKENS,
          }),
        vision: (artifactId, prompt) =>
          api.relayVision({ artifactId, prompt, maxOutputTokens: 200 }),
        checkpoint,
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        log: (message) => console.log(`runner: ${message}`),
      },
      {
        platform,
        modes: boot.modes,
        budget: boot.budget,
        softDeadline,
        counters,
        run: { runId, sessionId: boot.sessionId },
        versions: runVersionStamp(boot.budget.budgetVersion),
        newId: randomUUID,
      },
    );
  let agent = await runOnce(device);
  // An early device failure (e.g. the UiAutomator2 instrumentation crashing on a cold emulator,
  // run 2fc4f938) is retried once with a fresh Appium session while there is time left.
  if (
    agent.phase === "infrastructure_failed" &&
    counters.actionsExecuted < EARLY_FAILURE_ACTIONS &&
    Date.now() < softDeadline - 5 * 60_000
  ) {
    sink.emit({
      type: "note",
      payload: {
        level: "warn",
        message: `Device session failed early (${agent.detail.slice(0, 200)}); starting a new session once.`,
      },
    });
    await sink.flush();
    await device.close().catch(() => undefined);
    device = await openDevice();
    agent = await runOnce(device);
  }
  console.log(
    `runner: agent stopped (${agent.stopReason}): ${agent.detail} — ${agent.screens} screens, ` +
      `${counters.actionsExecuted} actions, ${counters.plannerCalls} planner calls`,
  );
  if (agent.blockers.length > 0) {
    sink.emit({
      type: "blocked",
      payload: {
        kind: agent.stopReason === "infrastructure_failed" ? "infrastructure" : "access",
        reason: agent.blockers.join(" ").slice(0, 400),
      },
    });
  }
  sink.emit({ type: "counters", payload: counters });
  sink.emit({
    type: "stopped",
    payload: { reason: agent.stopReason, detail: agent.detail.slice(0, 300) },
  });
  await sink.flush();

  finish = {
    phase: agent.phase,
    stopReason: agent.stopReason,
    result: {
      platform,
      sessionId: boot.sessionId,
      phase: agent.phase,
      stopReason: agent.stopReason,
      device: deviceProfile,
      build: { buildId: boot.build.buildId, sha256 },
      counters,
      checks: agent.checks,
      findingIds: agent.findings.map((f) => f.findingId),
      blockers: agent.blockers.map((b) => b.slice(0, 400)),
    },
    findings: agent.findings,
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
// Evidence still in flight must be complete before the lease ends with the finish call.
await uploads.drain().catch(() => undefined);
if (uploads.failures > 0) console.warn(`runner: ${uploads.failures} evidence uploads failed`);
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
