import type {
  CheckResult,
  Finding,
  Report,
  ReportSummary,
  TestMode,
  VersionStamp,
} from "@tapscout/shared";
import { z } from "zod";
import { fromDbError, fromZodError, HttpError, type PostgrestLikeError } from "@/lib/api/errors";
import { OidcRejected, type VerifiedWorkflowIdentity } from "@/lib/runner/oidc";
import { buildReport, type SessionRecord } from "./build";

type RpcResult = { data: unknown; error: PostgrestLikeError | null };

export interface ReportContext {
  modes: TestMode[];
  versions: VersionStamp;
  githubRunId: number | null;
  sessions: SessionRecord[];
  checks: CheckResult[];
  findings: Finding[];
}

export interface ReportDeps {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  verifyOidc(token: string): Promise<VerifiedWorkflowIdentity>;
  loadContext(runId: string): Promise<ReportContext>;
  /** Model summary under the report lease; null when unavailable. Never blocks the report. */
  summarize(
    report: Report,
    scope: { runId: string; reportAttemptId: string; leaseVersion: number },
  ): Promise<ReportSummary | null>;
}

const Body = z.object({ runId: z.uuid() });

export type ReportOutcome =
  | { status: "saved"; overallStatus: string; reportVersion: number }
  | { status: "skipped"; reason: "cancelled" | "already_reported" };

/**
 * Called by the qa-run report job after both device jobs have ended. Sessions that are still not
 * terminal at that point lost their runner without a result and are closed as
 * infrastructure_failed; then a separate report lease is taken and the report saved once.
 */
export async function reportRun(
  deps: ReportDeps,
  oidcToken: string,
  body: unknown,
): Promise<ReportOutcome> {
  let identity: VerifiedWorkflowIdentity;
  try {
    identity = await deps.verifyOidc(oidcToken);
  } catch (error) {
    if (error instanceof OidcRejected) throw new HttpError(401, "unauthorized", error.message);
    throw error;
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);
  const runId = parsed.data.runId;

  const before = await deps.loadContext(runId);
  if (before.githubRunId !== null && before.githubRunId !== identity.runId) {
    throw new HttpError(403, "forbidden", "workflow run does not belong to this test run");
  }
  for (const s of before.sessions) {
    if (!["completed", "cancelled", "blocked", "infrastructure_failed"].includes(s.phase)) {
      const { error } = await deps.rpc("fail_session_without_lease", {
        p_session_id: s.id,
        p_phase: "infrastructure_failed",
        p_detail: "The device job ended without reporting a result.",
      });
      if (error) throw fromDbError(error);
    }
  }

  const lease = await deps.rpc("acquire_report_lease", {
    p_run_id: runId,
    p_github_run_id: identity.runId,
    p_lease_seconds: 300,
  });
  if (lease.error) {
    if (lease.error.code === "AQ002") return { status: "skipped", reason: "cancelled" };
    if (lease.error.message?.includes("report already exists")) {
      return { status: "skipped", reason: "already_reported" };
    }
    throw fromDbError(lease.error);
  }
  const [attempt] = (Array.isArray(lease.data) ? lease.data : [lease.data]) as {
    report_attempt_id: string;
    lease_version: number;
    report_version: number;
  }[];
  if (!attempt) throw new HttpError(500, "internal", "report lease was not returned");

  const context = await deps.loadContext(runId);
  const deterministic = buildReport({
    runId,
    reportVersion: attempt.report_version,
    modes: context.modes,
    versions: context.versions,
    cancelled: false,
    sessions: context.sessions,
    checks: context.checks,
    findings: context.findings,
  });
  const summary = await deps
    .summarize(deterministic, {
      runId,
      reportAttemptId: attempt.report_attempt_id,
      leaseVersion: attempt.lease_version,
    })
    .catch((error: unknown) => {
      console.error("report: summary failed", error);
      return null;
    });
  const report: Report = { ...deterministic, summary };
  const saved = await deps.rpc("save_report", {
    p_run_id: runId,
    p_report_attempt_id: attempt.report_attempt_id,
    p_lease_version: attempt.lease_version,
    p_overall_status: report.overallStatus,
    p_data: report,
    p_object_key: null,
  });
  if (saved.error) throw fromDbError(saved.error);
  return {
    status: "saved",
    overallStatus: report.overallStatus,
    reportVersion: report.reportVersion,
  };
}
