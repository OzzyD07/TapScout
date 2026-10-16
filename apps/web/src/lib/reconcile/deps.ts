import "server-only";
import { HttpError } from "@/lib/api/errors";
import { createReportDeps } from "@/lib/report/deps";
import {
  cancelWorkflowRun,
  findDispatchedWorkflowRun,
  type GithubConfig,
  getWorkflowRun,
  githubDispatcher,
} from "@/lib/runs/dispatch";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActiveRun, ReconcileDeps } from "./service";

const date = (v: string | null) => (v ? new Date(v) : null);

export function createReconcileDeps(): ReconcileDeps {
  const admin = createAdminClient();
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const config: GithubConfig | null = token
    ? {
        token,
        repository: serverEnv.githubRepository(),
        workflowFile: serverEnv.githubWorkflowFile(),
        ref: serverEnv.githubDispatchRef(),
      }
    : null;
  const report = createReportDeps();
  return {
    rpc: (fn, args) => admin.rpc(fn, args),
    workerId: `cron:${crypto.randomUUID()}`,
    now: () => new Date(),
    dispatchWorkflow: config
      ? githubDispatcher(config)
      : async () => {
          throw new Error("GITHUB_DISPATCH_TOKEN is not configured");
        },
    github: config
      ? {
          getWorkflowRun: (id) => getWorkflowRun(config, id),
          findDispatchedWorkflowRun: (runId, since) =>
            findDispatchedWorkflowRun(config, runId, since),
          cancelWorkflowRun: (id) => cancelWorkflowRun(config, id),
        }
      : null,
    report: { loadContext: report.loadContext, summarize: report.summarize },
    async listActiveRuns(limit) {
      const { data, error } = await admin
        .from("test_runs")
        .select(
          "id, created_at, cancel_requested_at, github_run_id, android_build_id, ios_build_id, " +
            "platform_sessions(id, phase, attempt_id, lease_expires_at, finished_at), " +
            "dispatch_outbox(kind, status), reports(id)",
        )
        .in("status", ["queued", "running"])
        .order("created_at")
        .limit(limit);
      if (error) throw new HttpError(500, "internal", "could not list active runs");
      return ((data ?? []) as unknown as ActiveRunRow[]).map(
        (r): ActiveRun => ({
          id: r.id,
          createdAt: new Date(r.created_at),
          cancelRequestedAt: date(r.cancel_requested_at),
          githubRunId: r.github_run_id === null ? null : Number(r.github_run_id),
          platforms:
            r.android_build_id && r.ios_build_id ? "both" : r.android_build_id ? "android" : "ios",
          sessions: r.platform_sessions.map((s) => ({
            id: s.id,
            phase: s.phase,
            attemptId: s.attempt_id,
            leaseExpiresAt: date(s.lease_expires_at),
            finishedAt: date(s.finished_at),
          })),
          dispatchStatus: r.dispatch_outbox.find((o) => o.kind === "dispatch_run")?.status ?? null,
          hasReport: r.reports.length > 0,
        }),
      );
    },
  };
}

interface ActiveRunRow {
  id: string;
  created_at: string;
  cancel_requested_at: string | null;
  github_run_id: number | string | null;
  android_build_id: string | null;
  ios_build_id: string | null;
  platform_sessions: {
    id: string;
    phase: string;
    attempt_id: string | null;
    lease_expires_at: string | null;
    finished_at: string | null;
  }[];
  dispatch_outbox: { kind: string; status: string }[];
  reports: { id: string }[];
}
