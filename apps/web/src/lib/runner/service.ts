import {
  EventBatchRequest,
  type EventBatchResponse,
  FinishSessionRequest,
  type HeartbeatResponse,
  type PlatformBudget,
  RunnerBootstrapRequest,
  RunnerBootstrapResponse,
  type TestAccount,
  type TestMode,
} from "@tapscout/shared";
import { fromDbError, fromZodError, HttpError, type PostgrestLikeError } from "@/lib/api/errors";
import { OidcRejected, type VerifiedWorkflowIdentity } from "./oidc";
import { issueRunnerToken, type RunnerScope, requireDeviceScope, verifyRunnerToken } from "./token";

export const LEASE_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HEARTBEAT_INTERVAL_SECONDS = 30;

type RpcResult = { data: unknown; error: PostgrestLikeError | null };

export interface BootstrapContext {
  modes: TestMode[];
  budget: PlatformBudget;
  build: { buildId: string; objectKey: string; fileName: string; sizeBytes: number };
  /** Decrypted only here, for the device runner that holds this session's lease. */
  testAccount?: TestAccount;
}

/** Everything the runner endpoints need from the outside world; injected so it can be tested. */
export interface RunnerDeps {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  verifyOidc(token: string): Promise<VerifiedWorkflowIdentity>;
  loadBootstrapContext(runId: string, buildId: string): Promise<BootstrapContext>;
  signBuildDownload(objectKey: string): Promise<string>;
  signingKey: string;
}

async function rpcRows<T>(
  deps: RunnerDeps,
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const { data, error } = await deps.rpc(fn, args);
  if (error) throw fromDbError(error);
  return (Array.isArray(data) ? data : data == null ? [] : [data]) as T[];
}

export async function authenticateDevice(deps: Pick<RunnerDeps, "signingKey">, token: string) {
  let scope: RunnerScope;
  try {
    scope = await verifyRunnerToken(token, deps.signingKey);
  } catch {
    throw new HttpError(401, "unauthorized", "invalid or expired runner token");
  }
  try {
    return requireDeviceScope(scope);
  } catch {
    throw new HttpError(403, "forbidden", "device scope required");
  }
}

export async function bootstrap(deps: RunnerDeps, oidcToken: string, body: unknown) {
  let identity: VerifiedWorkflowIdentity;
  try {
    identity = await deps.verifyOidc(oidcToken);
  } catch (error) {
    if (error instanceof OidcRejected) throw new HttpError(401, "unauthorized", error.message);
    throw error;
  }
  const parsed = RunnerBootstrapRequest.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);

  const [lease] = await rpcRows<{
    session_id: string;
    attempt_id: string;
    lease_version: number;
    build_id: string;
  }>(deps, "acquire_session_lease", {
    p_run_id: parsed.data.runId,
    p_platform: parsed.data.platform,
    p_github_run_id: identity.runId,
    p_github_run_attempt: identity.runAttempt,
    p_github_job_id: identity.checkRunId,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (!lease) throw new HttpError(500, "internal", "lease was not returned");

  const context = await deps.loadBootstrapContext(parsed.data.runId, lease.build_id);
  const downloadUrl = await deps.signBuildDownload(context.build.objectKey);
  const { token, expiresAt } = await issueRunnerToken(
    {
      kind: "device",
      runId: parsed.data.runId,
      sessionId: lease.session_id,
      attemptId: lease.attempt_id,
      leaseVersion: lease.lease_version,
    },
    deps.signingKey,
  );

  return RunnerBootstrapResponse.parse({
    sessionId: lease.session_id,
    attemptId: lease.attempt_id,
    leaseVersion: lease.lease_version,
    sessionToken: token,
    tokenExpiresAt: expiresAt.toISOString(),
    build: {
      buildId: context.build.buildId,
      downloadUrl,
      fileName: context.build.fileName,
      sizeBytes: context.build.sizeBytes,
    },
    modes: context.modes,
    budget: context.budget,
    heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    testAccount: context.testAccount,
  });
}

export async function heartbeat(deps: RunnerDeps, token: string): Promise<HeartbeatResponse> {
  const scope = await authenticateDevice(deps, token);
  const [row] = await rpcRows<{ lease_valid: boolean; cancel_requested: boolean }>(
    deps,
    "heartbeat_session",
    {
      p_session_id: scope.sessionId,
      p_attempt_id: scope.attemptId,
      p_lease_version: scope.leaseVersion,
      p_lease_seconds: LEASE_SECONDS,
    },
  );
  if (!row?.lease_valid) {
    return { leaseValid: false, cancelRequested: false, sessionToken: null, tokenExpiresAt: null };
  }
  const fresh = await issueRunnerToken(scope, deps.signingKey);
  return {
    leaseValid: true,
    cancelRequested: row.cancel_requested,
    sessionToken: fresh.token,
    tokenExpiresAt: fresh.expiresAt.toISOString(),
  };
}

export async function appendEvents(
  deps: RunnerDeps,
  token: string,
  body: unknown,
): Promise<EventBatchResponse> {
  const scope = await authenticateDevice(deps, token);
  const parsed = EventBatchRequest.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);

  for (const event of parsed.data.events) {
    if (
      event.runId !== scope.runId ||
      event.sessionId !== scope.sessionId ||
      event.attemptId !== scope.attemptId
    ) {
      throw new HttpError(403, "forbidden", "event does not belong to this session attempt");
    }
  }

  const [row] = await rpcRows<{ accepted: number; duplicates: number; last_sequence: number }>(
    deps,
    "append_run_events",
    {
      p_session_id: scope.sessionId,
      p_attempt_id: scope.attemptId,
      p_lease_version: scope.leaseVersion,
      p_events: parsed.data.events,
    },
  );
  return {
    accepted: row?.accepted ?? 0,
    duplicates: row?.duplicates ?? 0,
    lastSequence: Number(row?.last_sequence ?? 0),
  };
}

export async function finishSession(deps: RunnerDeps, token: string, body: unknown) {
  const scope = await authenticateDevice(deps, token);
  const parsed = FinishSessionRequest.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);
  const { result } = parsed.data;
  const findings = parsed.data.findings ?? [];
  if (result.sessionId !== scope.sessionId) {
    throw new HttpError(403, "forbidden", "result belongs to another session");
  }
  // Findings and checks must belong to this session and agree with the result they come with.
  for (const f of findings) {
    if (f.sessionId !== scope.sessionId || f.runId !== scope.runId) {
      throw new HttpError(403, "forbidden", "finding belongs to another session");
    }
    if (f.platform !== result.platform || !UUID.test(f.findingId)) {
      throw new HttpError(400, "invalid_request", "finding platform or id is invalid");
    }
  }
  const ids = new Set(findings.map((f) => f.findingId));
  if (
    ids.size !== findings.length ||
    result.findingIds.length !== ids.size ||
    result.findingIds.some((id) => !ids.has(id))
  ) {
    throw new HttpError(400, "invalid_request", "result.findingIds must list exactly the findings");
  }
  if (result.checks.some((c) => c.platform !== result.platform)) {
    throw new HttpError(400, "invalid_request", "check platform does not match the result");
  }
  if (new Set(result.checks.map((c) => c.checkId)).size !== result.checks.length) {
    throw new HttpError(400, "invalid_request", "duplicate check ids");
  }
  await rpcRows(deps, "finish_session", {
    p_session_id: scope.sessionId,
    p_attempt_id: scope.attemptId,
    p_lease_version: scope.leaseVersion,
    p_phase: parsed.data.phase,
    p_stop_reason: parsed.data.stopReason,
    p_result: parsed.data.result,
    p_device_profile: parsed.data.device ?? null,
    p_checks: result.checks,
    p_findings: findings,
  });
  return { ok: true as const };
}
