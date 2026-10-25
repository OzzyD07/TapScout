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
    async expireEvidence(before, max) {
      const { data: runs, error } = await admin
        .from("test_runs")
        .select("id")
        .lt("finished_at", before.toISOString())
        .eq("keep_evidence", false)
        .eq("is_shared_sample", false)
        .order("finished_at")
        .limit(50);
      if (error) throw new Error("could not list old runs");
      if (!runs?.length) return 0;
      const { data: artifacts, error: listError } = await admin
        .from("artifacts")
        .select("id, object_key")
        .in(
          "run_id",
          runs.map((r) => r.id),
        )
        .neq("status", "expired")
        .limit(max);
      if (listError) throw new Error("could not list old evidence");
      let removed = 0;
      for (let i = 0; i < (artifacts ?? []).length; i += 500) {
        const batch = (artifacts ?? []).slice(i, i + 500);
        const { error: removeError } = await admin.storage
          .from(serverEnv.storageEvidenceBucket())
          .remove(batch.map((a) => a.object_key));
        if (removeError) throw new Error("could not remove old evidence");
        const { error: updateError } = await admin
          .from("artifacts")
          .update({ status: "expired" })
          .in(
            "id",
            batch.map((a) => a.id),
          );
        if (updateError) throw new Error("could not mark old evidence expired");
        removed += batch.length;
      }
      return removed;
    },
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
