import { describe, expect, it, vi } from "vitest";
import { buildReport, overallStatus, type SessionRecord } from "../src/lib/report/build";
import { type ReportContext, type ReportDeps, reportRun } from "../src/lib/report/service";

const RUN = "11111111-1111-4111-8111-111111111111";
const versions = {
  agent: "a",
  prompt: "p",
  checkPack: "c",
  rulePack: "r",
  budget: "b",
  plannerModel: "m",
};

function session(over: Partial<SessionRecord>): SessionRecord {
  return {
    id: crypto.randomUUID(),
    platform: "android",
    phase: "completed",
    stopReason: "goals_exhausted",
    phaseDetail: null,
    counters: { actionsExecuted: 1 },
    result: null,
    buildId: "b1",
    ...over,
  };
}

describe("overallStatus", () => {
  it.each([
    [["completed", "completed"], "completed"],
    [["completed", "infrastructure_failed"], "partial"],
    [["blocked"], "partial"],
    [["infrastructure_failed", "infrastructure_failed"], "infrastructure_failed"],
  ])("%j → %s", (phases, expected) => {
    expect(overallStatus(phases, false)).toBe(expected);
  });

  it("is cancelled when the user cancelled", () => {
    expect(overallStatus(["completed"], true)).toBe("cancelled");
  });
});

describe("buildReport", () => {
  it("adds a limitation for each incomplete platform and never invents findings", () => {
    const report = buildReport({
      runId: RUN,
      reportVersion: 1,
      modes: ["functional"],
      versions,
      cancelled: false,
      sessions: [
        session({}),
        session({ platform: "ios", phase: "infrastructure_failed", phaseDetail: "runner lost" }),
      ],
      checks: [],
      findings: [],
    });
    expect(report.overallStatus).toBe("partial");
    expect(report.findings).toEqual([]);
    expect(report.summary).toBeNull();
    expect(report.limitations.some((l) => l.startsWith("iOS did not complete"))).toBe(true);
    expect(report.platforms[1]?.blockers).toContain("runner lost");
  });
});

function deps(context: Partial<ReportContext>, rpc?: ReportDeps["rpc"]): ReportDeps {
  const full: ReportContext = {
    modes: ["functional"],
    versions,
    githubRunId: 42,
    sessions: [session({})],
    checks: [],
    findings: [],
    ...context,
  };
  return {
    verifyOidc: vi.fn(async () => ({
      repository: "OzzyD07/TapScout",
      repositoryId: "1",
      workflowRef: "x",
      ref: "refs/heads/main",
      sha: "s",
      runId: 42,
      runAttempt: 1,
      checkRunId: null,
      eventName: "workflow_dispatch",
      runnerEnvironment: "github-hosted",
    })),
    loadContext: vi.fn(async () => full),
    rpc:
      rpc ??
      vi.fn(async (fn: string) =>
        fn === "acquire_report_lease"
          ? {
              data: [{ report_attempt_id: "ra", lease_version: 1, report_version: 1 }],
              error: null,
            }
          : { data: true, error: null },
      ),
  };
}

describe("reportRun", () => {
  it("closes sessions whose runner never reported, then saves the report", async () => {
    const stuck = session({ platform: "ios", phase: "exploring" });
    const d = deps({ sessions: [session({}), stuck] });
    const res = await reportRun(d, "oidc", { runId: RUN });
    expect(res.status).toBe("saved");
    expect(d.rpc).toHaveBeenCalledWith(
      "fail_session_without_lease",
      expect.objectContaining({ p_session_id: stuck.id, p_phase: "infrastructure_failed" }),
    );
    expect(d.rpc).toHaveBeenCalledWith("save_report", expect.objectContaining({ p_run_id: RUN }));
  });

  it("skips cancelled runs without saving", async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === "acquire_report_lease"
        ? { data: null, error: { code: "AQ002", message: "run cancelled" } }
        : { data: true, error: null },
    );
    const d = deps({}, rpc);
    expect(await reportRun(d, "oidc", { runId: RUN })).toEqual({
      status: "skipped",
      reason: "cancelled",
    });
    expect(rpc).not.toHaveBeenCalledWith("save_report", expect.anything());
  });

  it("refuses a workflow run that does not belong to the test run", async () => {
    const d = deps({ githubRunId: 999 });
    await expect(reportRun(d, "oidc", { runId: RUN })).rejects.toMatchObject({ status: 403 });
    expect(d.rpc).not.toHaveBeenCalled();
  });
});
