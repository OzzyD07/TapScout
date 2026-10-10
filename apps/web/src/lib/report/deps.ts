import "server-only";
import { CheckResult, Finding, TestMode, VersionStamp } from "@tapscout/shared";
import { z } from "zod";
import { HttpError } from "@/lib/api/errors";
import { createRelayDeps } from "@/lib/relay/deps";
import { relayReportSummary } from "@/lib/relay/service";
import { verifyGithubOidc } from "@/lib/runner/oidc";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportDeps } from "./service";
import { summarizeReport } from "./summary";

const UNKNOWN_VERSIONS: VersionStamp = {
  agent: "unknown",
  prompt: "unknown",
  checkPack: "unknown",
  rulePack: "unknown",
  budget: "unknown",
  plannerModel: "unknown",
};

export function createReportDeps(): ReportDeps {
  const admin = createAdminClient();
  return {
    rpc: (fn, args) => admin.rpc(fn, args),
    verifyOidc: (token) =>
      verifyGithubOidc(token, {
        audience: serverEnv.runnerOidcAudience(),
        repository: serverEnv.githubRepository(),
        workflowFile: serverEnv.githubWorkflowFile(),
        ref: serverEnv.githubWorkflowRef(),
      }),
    async loadContext(runId) {
      const [run, sessions, checks, findings] = await Promise.all([
        admin
          .from("test_runs")
          .select("modes, version_stamp, github_run_id")
          .eq("id", runId)
          .maybeSingle(),
        admin
          .from("platform_sessions")
          .select("id, platform, phase, stop_reason, phase_detail, counters, result, build_id")
          .eq("run_id", runId)
          .order("platform"),
        admin.from("check_results").select("data").eq("run_id", runId),
        admin.from("findings").select("data").eq("run_id", runId),
      ]);
      if (!run.data) throw new HttpError(404, "not_found", "run not found");
      const versions = VersionStamp.safeParse(run.data.version_stamp);
      return {
        modes: z.array(TestMode).parse(run.data.modes),
        versions: versions.success ? versions.data : UNKNOWN_VERSIONS,
        githubRunId: run.data.github_run_id === null ? null : Number(run.data.github_run_id),
        sessions: (sessions.data ?? []).map((s) => ({
          id: s.id,
          platform: s.platform,
          phase: s.phase,
          stopReason: s.stop_reason,
          phaseDetail: s.phase_detail,
          counters: s.counters ?? {},
          result: s.result,
          buildId: s.build_id,
        })),
        // Stored rows that do not match the current contract are left out rather than guessed.
        checks: (checks.data ?? []).flatMap((c) => {
          const r = CheckResult.safeParse(c.data);
          return r.success ? [r.data] : [];
        }),
        findings: (findings.data ?? []).flatMap((f) => {
          const r = Finding.safeParse(f.data);
          return r.success ? [r.data] : [];
        }),
      };
    },
    async summarize(report, scope) {
      // Missing model configuration only costs the summary, never the report.
      const relay = createRelayDeps();
      return summarizeReport(report, async (messages, maxOutputTokens) => {
        const res = await relayReportSummary(
          relay,
          { kind: "report", ...scope },
          messages,
          maxOutputTokens,
        );
        return { content: res.content, model: res.model };
      });
    },
  };
}
