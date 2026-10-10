import { DEFAULT_PLATFORM_BUDGET } from "@tapscout/shared";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../src/lib/api/errors";
import { OidcRejected } from "../src/lib/runner/oidc";
import {
  appendEvents,
  bootstrap,
  finishSession,
  heartbeat,
  type RunnerDeps,
} from "../src/lib/runner/service";
import { issueRunnerToken } from "../src/lib/runner/token";

const signingKey = "k".repeat(48);
const RUN = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const ATTEMPT = "33333333-3333-4333-8333-333333333333";

function deps(overrides: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    signingKey,
    rpc: vi.fn(async () => ({ data: [], error: null })),
    verifyOidc: vi.fn(async () => ({
      repository: "OzzyD07/TapScout",
      repositoryId: "1",
      workflowRef: "x",
      ref: "refs/heads/main",
      sha: "abc",
      runId: 42,
      runAttempt: 1,
      checkRunId: 7,
      eventName: "workflow_dispatch",
      runnerEnvironment: "github-hosted",
    })),
    loadBootstrapContext: vi.fn(async () => ({
      modes: ["functional" as const],
      budget: DEFAULT_PLATFORM_BUDGET,
      build: { buildId: "b1", objectKey: "final/b1/app.apk", fileName: "app.apk", sizeBytes: 1000 },
    })),
    signBuildDownload: vi.fn(async () => "https://storage.example/signed"),
    ...overrides,
  };
}

async function deviceToken(leaseVersion = 1) {
  return (
    await issueRunnerToken(
      { kind: "device", runId: RUN, sessionId: SESSION, attemptId: ATTEMPT, leaseVersion },
      signingKey,
    )
  ).token;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: crypto.randomUUID(),
    runId: RUN,
    sessionId: SESSION,
    attemptId: ATTEMPT,
    clientSequence: 1,
    occurredAt: new Date().toISOString(),
    phase: "exploring",
    type: "note",
    payload: { level: "info", message: "hello" },
    ...overrides,
  };
}

describe("bootstrap", () => {
  it("binds the lease to the verified workflow run and returns a scoped token", async () => {
    const d = deps({
      rpc: vi.fn(async () => ({
        data: [{ session_id: SESSION, attempt_id: ATTEMPT, lease_version: 3, build_id: "b1" }],
        error: null,
      })),
    });
    const res = await bootstrap(d, "oidc", { runId: RUN, platform: "android" });
    expect(d.rpc).toHaveBeenCalledWith(
      "acquire_session_lease",
      expect.objectContaining({ p_run_id: RUN, p_github_run_id: 42, p_github_job_id: 7 }),
    );
    expect(res).toMatchObject({
      sessionId: SESSION,
      leaseVersion: 3,
      heartbeatIntervalSeconds: 30,
    });
    expect(res.build.downloadUrl).toBe("https://storage.example/signed");
  });

  it("maps a rejected OIDC token to 401 and a held lease to 409", async () => {
    const bad = deps({
      verifyOidc: vi.fn(async () => Promise.reject(new OidcRejected("ref mismatch"))),
    });
    await expect(bootstrap(bad, "oidc", { runId: RUN, platform: "ios" })).rejects.toMatchObject({
      status: 401,
    });

    const held = deps({
      rpc: vi.fn(async () => ({ data: null, error: { code: "AQ003", message: "lease held" } })),
    });
    await expect(bootstrap(held, "oidc", { runId: RUN, platform: "ios" })).rejects.toMatchObject({
      status: 409,
      code: "conflict",
    });
  });
});

describe("events", () => {
  it("rejects events for another session before touching the database", async () => {
    const d = deps();
    await expect(
      appendEvents(d, await deviceToken(), { events: [event({ sessionId: crypto.randomUUID() })] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("forwards a valid batch with the lease from the token", async () => {
    const d = deps({
      rpc: vi.fn(async () => ({
        data: [{ accepted: 1, duplicates: 0, last_sequence: 5 }],
        error: null,
      })),
    });
    const res = await appendEvents(d, await deviceToken(2), { events: [event()] });
    expect(res).toEqual({ accepted: 1, duplicates: 0, lastSequence: 5 });
    expect(d.rpc).toHaveBeenCalledWith(
      "append_run_events",
      expect.objectContaining({ p_lease_version: 2 }),
    );
  });

  it("reports a lost lease as 409 lease_lost", async () => {
    const d = deps({
      rpc: vi.fn(async () => ({ data: null, error: { code: "AQ001", message: "stale" } })),
    });
    await expect(appendEvents(d, await deviceToken(), { events: [event()] })).rejects.toMatchObject(
      {
        status: 409,
        code: "lease_lost",
      },
    );
  });

  it("rejects malformed events with 400", async () => {
    await expect(
      appendEvents(deps(), await deviceToken(), { events: [event({ type: "shell" })] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("heartbeat and auth", () => {
  it("rotates the token while the lease is valid and stops when it is lost", async () => {
    const valid = deps({
      rpc: vi.fn(async () => ({
        data: [{ lease_valid: true, cancel_requested: true }],
        error: null,
      })),
    });
    const ok = await heartbeat(valid, await deviceToken());
    expect(ok.leaseValid).toBe(true);
    expect(ok.cancelRequested).toBe(true);
    expect(ok.sessionToken).toBeTypeOf("string");

    const lost = deps({
      rpc: vi.fn(async () => ({
        data: [{ lease_valid: false, cancel_requested: false }],
        error: null,
      })),
    });
    expect(await heartbeat(lost, await deviceToken())).toMatchObject({
      leaseValid: false,
      sessionToken: null,
    });
  });

  it("refuses report tokens and garbage on device endpoints", async () => {
    const report = (
      await issueRunnerToken(
        { kind: "report", runId: RUN, reportAttemptId: "ra", leaseVersion: 1 },
        signingKey,
      )
    ).token;
    await expect(heartbeat(deps(), report)).rejects.toMatchObject({ status: 403 });
    await expect(heartbeat(deps(), "not-a-token")).rejects.toBeInstanceOf(HttpError);
  });

  it("refuses to finish with another session's result", async () => {
    const result = {
      platform: "android",
      sessionId: crypto.randomUUID(),
      phase: "completed",
      build: { buildId: "b1" },
      counters: {
        screensObserved: 0,
        transitionsObserved: 0,
        actionsExecuted: 0,
        checksRun: 0,
        plannerCalls: 0,
        visionCalls: 0,
      },
      checks: [],
      findingIds: [],
    };
    await expect(
      finishSession(deps(), await deviceToken(), {
        phase: "completed",
        stopReason: "goals_exhausted",
        result,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  describe("with checks and findings", () => {
    const FINDING = "44444444-4444-4444-8444-444444444444";
    const counters = {
      screensObserved: 2,
      transitionsObserved: 1,
      actionsExecuted: 5,
      checksRun: 1,
      plannerCalls: 3,
      visionCalls: 0,
    };
    const check = {
      checkId: "functional.persistence",
      mode: "functional",
      platform: "android",
      status: "failed",
      summary: "Lost after relaunch: About you.",
      scope: "Profile",
      findingIds: [FINDING],
      evidence: [],
    };
    const finding = {
      findingId: FINDING,
      runId: RUN,
      sessionId: SESSION,
      platform: "android",
      mode: "functional",
      checkId: "functional.persistence",
      title: "Saved About you is lost after the app restarts",
      expected: "kept",
      observed: "lost",
      expectationBasis: "observed_invariant",
      evidenceKind: "measured",
      verification: "reproduced",
      reproduction: { target: 2, started: 2, valid: 2, symptom: 2, blocked: [] },
      confidence: "high",
      severity: "high",
      severityRationale: "data loss",
      evidence: [],
      versions: {
        agent: "a",
        prompt: "p",
        checkPack: "c",
        rulePack: "none",
        budget: "b",
        plannerModel: "m",
      },
      createdAt: "2026-10-10T12:00:00.000Z",
    };
    const body = (overrides: Record<string, unknown> = {}, f: unknown[] = [finding]) => ({
      phase: "completed",
      stopReason: "goals_exhausted",
      result: {
        platform: "android",
        sessionId: SESSION,
        phase: "completed",
        build: { buildId: "b1" },
        counters,
        checks: [check],
        findingIds: [FINDING],
        ...overrides,
      },
      findings: f,
    });

    it("passes checks and findings to finish_session in one call", async () => {
      const d = deps();
      await finishSession(d, await deviceToken(), body());
      expect(d.rpc).toHaveBeenCalledWith(
        "finish_session",
        expect.objectContaining({
          p_checks: [expect.objectContaining({ checkId: "functional.persistence" })],
          p_findings: [expect.objectContaining({ findingId: FINDING })],
        }),
      );
    });

    it("rejects a finding of another session", async () => {
      await expect(
        finishSession(deps(), await deviceToken(), body({}, [{ ...finding, sessionId: RUN }])),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("rejects findingIds that do not match the findings", async () => {
      await expect(
        finishSession(deps(), await deviceToken(), body({ findingIds: [] })),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        finishSession(
          deps(),
          await deviceToken(),
          body({ checks: [{ ...check, platform: "ios" }] }),
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
