import { createHash, timingSafeEqual } from "node:crypto";
import type { PostgrestLikeError } from "@/lib/api/errors";
import { buildReport } from "@/lib/report/build";
import { type ReportDeps, writeReport } from "@/lib/report/service";
import { type DispatchDeps, dispatchClaimed, type WorkflowRunState } from "@/lib/runs/dispatch";

type RpcResult = { data: unknown; error: PostgrestLikeError | null };
type Platforms = "both" | "android" | "ios";

/** A runner heartbeats every 30 s and renews a 300 s lease; this much past expiry it is gone. */
export const LEASE_GRACE_MS = 5 * 60_000;
/** A dispatched run whose device jobs never took a lease is given up after this long. */
export const NEVER_STARTED_MS = 60 * 60_000;
/** A cancelled run's runner gets this long to stop by itself before its workflow is cancelled. */
export const CANCEL_GRACE_MS = 3 * 60_000;
/** The report job normally reports within a few minutes of the last device job. */
export const REPORT_GRACE_MS = 5 * 60_000;

const OUTBOX_BATCH = 5;
const MAX_RUNS = 25;
const MAX_REPORTS = 3;
const MAX_GITHUB_CALLS = 12;
const TIME_BUDGET_MS = 40_000;

export interface ActiveSession {
  id: string;
  phase: string;
  attemptId: string | null;
  leaseExpiresAt: Date | null;
  finishedAt: Date | null;
}

export interface ActiveRun {
  id: string;
  createdAt: Date;
  cancelRequestedAt: Date | null;
  githubRunId: number | null;
  platforms: Platforms;
  sessions: ActiveSession[];
  /** The run's dispatch_run outbox state, when there is one. */
  dispatchStatus: string | null;
  hasReport: boolean;
}

export interface GithubProvider {
  getWorkflowRun(workflowRunId: number): Promise<WorkflowRunState | null>;
  findDispatchedWorkflowRun(runId: string, since: Date): Promise<number | null>;
  cancelWorkflowRun(workflowRunId: number): Promise<void>;
}

export interface ReconcileDeps {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  workerId: string;
  now(): Date;
  /** Runs still queued or running, oldest first. */
  listActiveRuns(limit: number): Promise<ActiveRun[]>;
  dispatchWorkflow: DispatchDeps["dispatchWorkflow"];
  /** null when no GitHub token is configured; provider checks are then skipped. */
  github: GithubProvider | null;
  report: Pick<ReportDeps, "loadContext" | "summarize">;
}

export interface ReconcileSummary {
  dispatched: number;
  dispatchRetries: number;
  dispatchRecovered: number;
  sessionsFailed: number;
  workflowsCancelled: number;
  reports: number;
  cancelReports: number;
  errors: string[];
}

interface OutboxItem {
  id: string;
  kind: string;
  run_id: string;
  attempts: number;
  created_at: string;
  provider_ref: { workflowRunId?: number } | null;
}

const TERMINAL = new Set(["completed", "cancelled", "blocked", "infrastructure_failed"]);

/** Constant-time check of the cron caller's bearer token. */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match?.[1]) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(match[1]), digest(secret));
}

/**
 * Maintenance pass called by Supabase Cron (docs/02 §7). Every step is idempotent and bounded:
 * outbox items are taken with an atomic claim, sessions are closed only through
 * fail_session_without_lease, and reports only under the report lease. Overlapping calls are safe.
 */
export async function reconcile(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const started = deps.now().getTime();
  const outOfTime = () => deps.now().getTime() - started > TIME_BUDGET_MS;
  const summary: ReconcileSummary = {
    dispatched: 0,
    dispatchRetries: 0,
    dispatchRecovered: 0,
    sessionsFailed: 0,
    workflowsCancelled: 0,
    reports: 0,
    cancelReports: 0,
    errors: [],
  };
  let githubCalls = 0;
  const github = <T>(call: (g: GithubProvider) => Promise<T>): Promise<T> | null => {
    if (!deps.github || githubCalls >= MAX_GITHUB_CALLS) return null;
    githubCalls++;
    return call(deps.github);
  };
  const note = (where: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    summary.errors.push(`${where}: ${message}`.slice(0, 200));
  };
  const complete = (item: OutboxItem, outcome: string, ref: unknown, error: string | null) =>
    deps.rpc("complete_outbox", {
      p_id: item.id,
      p_worker: deps.workerId,
      p_outcome: outcome,
      p_provider_ref: ref,
      p_error: error,
      p_retry_seconds: 60,
    });

  const runs = await deps.listActiveRuns(MAX_RUNS);
  const byId = new Map(runs.map((r) => [r.id, r]));

  // 1. Outbox: dispatches the API could not finish, and cancellations.
  const claimed = await deps.rpc("claim_outbox", {
    p_worker: deps.workerId,
    p_batch: OUTBOX_BATCH,
    p_claim_seconds: 120,
  });
  if (claimed.error) note("claim_outbox", claimed.error);
  const items = (Array.isArray(claimed.data) ? claimed.data : []) as OutboxItem[];
  for (const item of items) {
    try {
      const run = byId.get(item.run_id);
      if (item.kind === "dispatch_run") {
        if (!run || run.cancelRequestedAt) {
          await complete(item, "terminal", null, "run is no longer waiting for a dispatch");
          continue;
        }
        const known = run.githubRunId ?? item.provider_ref?.workflowRunId ?? null;
        if (known !== null) {
          await complete(item, "dispatched", { workflowRunId: known }, null);
          continue;
        }
        if (item.attempts > 1) {
          // An earlier attempt may have started a workflow without us hearing back.
          const lookup = github((g) =>
            g.findDispatchedWorkflowRun(run.id, new Date(item.created_at)),
          );
          if (!lookup) {
            await complete(item, "retry", null, "GitHub check unavailable");
            summary.dispatchRetries++;
            continue;
          }
          const existing = await lookup;
          if (existing !== null) {
            await complete(item, "dispatched", { workflowRunId: existing }, null);
            summary.dispatchRecovered++;
            continue;
          }
        }
        const outcome = await dispatchClaimed(deps, item, run.id, run.platforms);
        if (outcome === "dispatched") summary.dispatched++;
        else summary.dispatchRetries++;
      } else if (item.kind === "cancel_run") {
        const live = run?.sessions.filter((s) => !TERMINAL.has(s.phase)) ?? [];
        if (live.length === 0 || !run?.githubRunId) {
          await complete(item, "dispatched", null, null);
          continue;
        }
        const since = run.cancelRequestedAt?.getTime() ?? 0;
        if (deps.now().getTime() - since < CANCEL_GRACE_MS) {
          // The runner learns the cancel from its heartbeat and stops with partial evidence.
          await complete(item, "retry", null, "waiting for the runner to stop");
          continue;
        }
        const cancel = github((g) => g.cancelWorkflowRun(run.githubRunId as number));
        if (!cancel) {
          await complete(item, "retry", null, "GitHub check unavailable");
          continue;
        }
        await cancel;
        summary.workflowsCancelled++;
        await complete(item, "dispatched", { workflowRunId: run.githubRunId }, null);
      } else {
        await complete(item, "terminal", null, `unsupported outbox kind ${item.kind}`);
      }
    } catch (error) {
      note(`outbox ${item.id}`, error);
      await complete(item, "retry", null, String((error as Error).message).slice(0, 300));
    }
  }

  // 2. Sessions whose runner died, never started, or ignored a cancel.
  const cancelledByUs = new Set<string>();
  for (const run of runs) {
    if (outOfTime()) break;
    try {
      await reconcileSessions(run);
    } catch (error) {
      note(`run ${run.id}`, error);
    }
  }

  // 3. Reports the report job did not write.
  let reportsTried = 0;
  for (const run of runs) {
    if (outOfTime() || reportsTried >= MAX_REPORTS) break;
    if (run.hasReport || run.sessions.some((s) => !TERMINAL.has(s.phase))) continue;
    try {
      if (run.cancelRequestedAt) {
        reportsTried++;
        if (await saveCancelReport(run.id)) summary.cancelReports++;
        continue;
      }
      const lastFinished = Math.max(0, ...run.sessions.map((s) => s.finishedAt?.getTime() ?? 0));
      if (!cancelledByUs.has(run.id) && deps.now().getTime() - lastFinished < REPORT_GRACE_MS) {
        continue;
      }
      reportsTried++;
      const res = await writeReport({ rpc: deps.rpc, ...deps.report }, run.id, null);
      if (res.status === "saved") summary.reports++;
    } catch (error) {
      note(`report ${run.id}`, error);
    }
  }
  return summary;

  async function reconcileSessions(run: ActiveRun): Promise<void> {
    const now = deps.now().getTime();
    const open = run.sessions.filter((s) => !TERMINAL.has(s.phase));
    if (open.length === 0) return;
    const alive = (s: ActiveSession) =>
      s.leaseExpiresAt !== null && s.leaseExpiresAt.getTime() > now - LEASE_GRACE_MS;
    const suspects = open.filter((s) => !alive(s));
    if (suspects.length === 0) return;

    let workflow: WorkflowRunState | null | undefined;
    if (run.githubRunId !== null) {
      const lookup = github((g) => g.getWorkflowRun(run.githubRunId as number));
      workflow = lookup ? await lookup : undefined;
    }
    const workflowOver = workflow === null || workflow?.status === "completed";
    const cancelled = run.cancelRequestedAt !== null;

    let failedLeased = false;
    for (const s of suspects) {
      let detail: string | null = null;
      if (workflowOver) {
        detail = "The device job ended without reporting a result.";
      } else if (s.attemptId !== null) {
        detail = "The device runner stopped answering (no heartbeat for over 5 minutes).";
        failedLeased = true;
      } else if (run.dispatchStatus === "terminal" && run.githubRunId === null) {
        detail = "The test could not be started on GitHub Actions.";
      } else if (now - run.createdAt.getTime() > NEVER_STARTED_MS) {
        detail = "No device runner picked up the test within 60 minutes.";
      } else if (cancelled && now - (run.cancelRequestedAt?.getTime() ?? now) > CANCEL_GRACE_MS) {
        detail = "Cancelled before the device job started.";
      }
      if (!detail) continue;
      const { data, error } = await deps.rpc("fail_session_without_lease", {
        p_session_id: s.id,
        p_phase: cancelled ? "cancelled" : "infrastructure_failed",
        p_detail: cancelled ? "Cancelled; the device job did not stop by itself." : detail,
      });
      if (error) throw new Error(error.message);
      if (data) summary.sessionsFailed++;
      s.phase = cancelled ? "cancelled" : "infrastructure_failed";
      s.finishedAt = new Date(now);
    }

    // A hung runner keeps its workflow (and the report job behind it) waiting until the job
    // timeout; once no session of the run is alive, stop the workflow and report from here.
    const stillAlive = run.sessions.some((s) => !TERMINAL.has(s.phase) && alive(s));
    if (failedLeased && !stillAlive && workflow && workflow.status !== "completed") {
      const cancel = github((g) => g.cancelWorkflowRun(run.githubRunId as number));
      if (cancel) {
        await cancel;
        summary.workflowsCancelled++;
        cancelledByUs.add(run.id);
      }
    }
  }

  async function saveCancelReport(runId: string): Promise<boolean> {
    const context = await deps.report.loadContext(runId);
    const report = buildReport({
      runId,
      reportVersion: 1,
      modes: context.modes,
      versions: context.versions,
      cancelled: true,
      sessions: context.sessions,
      checks: context.checks,
      findings: context.findings,
    });
    const { data, error } = await deps.rpc("save_report", {
      p_run_id: runId,
      p_report_attempt_id: null,
      p_lease_version: null,
      p_overall_status: report.overallStatus,
      p_data: report,
      p_object_key: null,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }
}
