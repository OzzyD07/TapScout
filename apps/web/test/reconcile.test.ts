import { describe, expect, it, vi } from "vitest";
import {
  type ActiveRun,
  type ActiveSession,
  isCronAuthorized,
  type ReconcileDeps,
  reconcile,
} from "../src/lib/reconcile/service";
import type { SessionRecord } from "../src/lib/report/build";
import type { ReportContext } from "../src/lib/report/service";
import type { WorkflowRunState } from "../src/lib/runs/dispatch";

const NOW = new Date("2026-10-17T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const RUN = "11111111-1111-4111-8111-111111111111";

function session(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: crypto.randomUUID(),
    phase: "exploring",
    attemptId: "att",
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    finishedAt: null,
    ...over,
  };
}

function run(over: Partial<ActiveRun> = {}): ActiveRun {
  return {
    id: RUN,
    createdAt: ago(20),
    cancelRequestedAt: null,
    githubRunId: 42,
    platforms: "android",
    sessions: [session()],
    dispatchStatus: "dispatched",
    hasReport: false,
    ...over,
  };
}

const context: ReportContext = {
  modes: ["functional"],
  versions: {
    agent: "a",
    prompt: "p",
    checkPack: "c",
    rulePack: "r",
    budget: "b",
    plannerModel: "m",
  },
  githubRunId: 42,
  sessions: [
    {
      id: "s",
      platform: "android",
      phase: "cancelled",
      stopReason: "cancelled",
      phaseDetail: null,
      counters: {},
      result: null,
      buildId: "b",
    } satisfies SessionRecord,
  ],
  checks: [],
  findings: [],
};

function deps(runs: ActiveRun[], outbox: unknown[] = [], over: Partial<ReconcileDeps> = {}) {
  type Rpc = { data: unknown; error: { code?: string; message: string } | null };
  const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>): Promise<Rpc> => {
    if (fn === "claim_outbox") return { data: outbox, error: null };
    if (fn === "claim_run_dispatch") return { data: [], error: null };
    if (fn === "acquire_report_lease") {
      return {
        data: [{ report_attempt_id: "ra", lease_version: 1, report_version: 1 }],
        error: null,
      };
    }
    return { data: true, error: null };
  });
  const github = {
    getWorkflowRun: vi.fn(
      async (): Promise<WorkflowRunState | null> => ({ status: "in_progress", conclusion: null }),
    ),
    findDispatchedWorkflowRun: vi.fn(async (): Promise<number | null> => null),
    cancelWorkflowRun: vi.fn(async () => {}),
  };
  const d: ReconcileDeps = {
    rpc,
    workerId: "cron:test",
    now: () => NOW,
    listActiveRuns: vi.fn(async () => runs),
    dispatchWorkflow: vi.fn(async () => ({ workflowRunId: 77 })),
    github,
    report: { loadContext: vi.fn(async () => context), summarize: vi.fn(async () => null) },
    ...over,
  };
  return { d, rpc, github };
}

const calls = (rpc: ReturnType<typeof deps>["rpc"], fn: string) =>
  rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args);

describe("isCronAuthorized", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer s3cret2", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer x", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
  });
});

describe("reconcile: outbox", () => {
  const item = (over: object = {}) => ({
    id: "o1",
    kind: "dispatch_run",
    run_id: RUN,
    attempts: 1,
    created_at: ago(2).toISOString(),
    provider_ref: null,
    ...over,
  });

  it("dispatches a pending run the API could not dispatch", async () => {
    const r = run({
      githubRunId: null,
      sessions: [session({ phase: "queued", attemptId: null, leaseExpiresAt: null })],
      platforms: "both",
    });
    const { d, rpc } = deps([r], [item()]);
    const res = await reconcile(d);
    expect(d.dispatchWorkflow).toHaveBeenCalledWith({ runId: RUN, platforms: "both" });
    expect(calls(rpc, "complete_outbox")[0]).toMatchObject({
      p_outcome: "dispatched",
      p_provider_ref: { workflowRunId: 77 },
    });
    expect(res.dispatched).toBe(1);
  });

  it("never starts a second workflow when an earlier attempt already started one", async () => {
    const r = run({
      githubRunId: null,
      sessions: [session({ phase: "queued", attemptId: null, leaseExpiresAt: null })],
    });
    const { d, rpc, github } = deps([r], [item({ attempts: 2 })]);
    github.findDispatchedWorkflowRun.mockResolvedValueOnce(555);
    const res = await reconcile(d);
    expect(d.dispatchWorkflow).not.toHaveBeenCalled();
    expect(calls(rpc, "complete_outbox")[0]).toMatchObject({
      p_outcome: "dispatched",
      p_provider_ref: { workflowRunId: 555 },
    });
    expect(res.dispatchRecovered).toBe(1);
  });

  it("retries later instead of re-dispatching blind when GitHub cannot be checked", async () => {
    const r = run({ githubRunId: null });
    const { d, rpc } = deps([r], [item({ attempts: 3 })], { github: null });
    await reconcile(d);
    expect(d.dispatchWorkflow).not.toHaveBeenCalled();
    expect(calls(rpc, "complete_outbox")[0]).toMatchObject({ p_outcome: "retry" });
  });

  it("records a failed dispatch as a retry", async () => {
    const r = run({ githubRunId: null });
    const { d, rpc } = deps([r], [item()], {
      dispatchWorkflow: vi.fn(async () => {
        throw new Error("GitHub dispatch HTTP 502");
      }),
    });
    const res = await reconcile(d);
    expect(calls(rpc, "complete_outbox")[0]).toMatchObject({ p_outcome: "retry" });
    expect(res.dispatchRetries).toBe(1);
  });

  it("drops the dispatch of a cancelled or finished run", async () => {
    const { d, rpc } = deps(
      [run({ cancelRequestedAt: ago(1) })],
      [item(), item({ id: "o2", run_id: "gone" })],
    );
    await reconcile(d);
    expect(d.dispatchWorkflow).not.toHaveBeenCalled();
    expect(calls(rpc, "complete_outbox").map((a) => a.p_outcome)).toEqual(["terminal", "terminal"]);
  });

  it("gives a cancelled runner time to stop, then cancels its workflow", async () => {
    const cancelItem = item({ kind: "cancel_run" });
    const early = deps([run({ cancelRequestedAt: ago(1) })], [cancelItem]);
    await reconcile(early.d);
    expect(early.github.cancelWorkflowRun).not.toHaveBeenCalled();
    expect(calls(early.rpc, "complete_outbox")[0]).toMatchObject({ p_outcome: "retry" });

    const late = deps([run({ cancelRequestedAt: ago(4) })], [cancelItem]);
    const res = await reconcile(late.d);
    expect(late.github.cancelWorkflowRun).toHaveBeenCalledWith(42);
    expect(res.workflowsCancelled).toBe(1);
  });
});

describe("reconcile: sessions", () => {
  it("leaves sessions with a live lease alone", async () => {
    const { d, rpc, github } = deps([run()]);
    await reconcile(d);
    expect(calls(rpc, "fail_session_without_lease")).toEqual([]);
    expect(github.getWorkflowRun).not.toHaveBeenCalled();
  });

  it("closes a session whose runner stopped heartbeating and stops the workflow", async () => {
    const dead = session({ leaseExpiresAt: ago(6) });
    const { d, rpc, github } = deps([run({ sessions: [dead] })]);
    const res = await reconcile(d);
    expect(calls(rpc, "fail_session_without_lease")[0]).toMatchObject({
      p_session_id: dead.id,
      p_phase: "infrastructure_failed",
    });
    expect(github.cancelWorkflowRun).toHaveBeenCalledWith(42);
    // The report is written right away: the cancelled workflow will not run its report job.
    expect(calls(rpc, "save_report")).toHaveLength(1);
    expect(res).toMatchObject({ sessionsFailed: 1, workflowsCancelled: 1, reports: 1 });
  });

  it("does not stop the workflow while the other platform is still running", async () => {
    const dead = session({ leaseExpiresAt: ago(6) });
    const { d, rpc, github } = deps([run({ sessions: [dead, session()] })]);
    await reconcile(d);
    expect(calls(rpc, "fail_session_without_lease")).toHaveLength(1);
    expect(github.cancelWorkflowRun).not.toHaveBeenCalled();
    expect(calls(rpc, "acquire_report_lease")).toEqual([]);
  });

  it("closes sessions of a finished workflow that never reported", async () => {
    const queued = session({ phase: "queued", attemptId: null, leaseExpiresAt: null });
    const { d, rpc, github } = deps([run({ sessions: [queued] })]);
    github.getWorkflowRun.mockResolvedValueOnce({ status: "completed", conclusion: "failure" });
    await reconcile(d);
    expect(calls(rpc, "fail_session_without_lease")[0]).toMatchObject({
      p_detail: "The device job ended without reporting a result.",
    });
    expect(github.cancelWorkflowRun).not.toHaveBeenCalled();
  });

  it("waits for a queued GitHub runner, but not forever", async () => {
    const queued = () => session({ phase: "queued", attemptId: null, leaseExpiresAt: null });
    const young = deps([run({ sessions: [queued()] })]);
    await reconcile(young.d);
    expect(calls(young.rpc, "fail_session_without_lease")).toEqual([]);

    const old = deps([run({ createdAt: ago(61), sessions: [queued()] })]);
    await reconcile(old.d);
    expect(calls(old.rpc, "fail_session_without_lease")[0]).toMatchObject({
      p_phase: "infrastructure_failed",
    });
  });

  it("fails a run whose dispatch ran out of attempts", async () => {
    const queued = session({ phase: "queued", attemptId: null, leaseExpiresAt: null });
    const { d, rpc } = deps([
      run({ githubRunId: null, dispatchStatus: "terminal", sessions: [queued] }),
    ]);
    await reconcile(d);
    expect(calls(rpc, "fail_session_without_lease")[0]).toMatchObject({
      p_detail: "The test could not be started on GitHub Actions.",
    });
  });

  it("closes a cancelled run's dead session as cancelled", async () => {
    const dead = session({ leaseExpiresAt: ago(6) });
    const { d, rpc } = deps([run({ cancelRequestedAt: ago(8), sessions: [dead] })]);
    const res = await reconcile(d);
    expect(calls(rpc, "fail_session_without_lease")[0]).toMatchObject({ p_phase: "cancelled" });
    expect(calls(rpc, "save_report")[0]).toMatchObject({
      p_report_attempt_id: null,
      p_overall_status: "cancelled",
    });
    expect(res.cancelReports).toBe(1);
  });
});

describe("reconcile: reports", () => {
  const done = (minutes: number) =>
    session({ phase: "completed", attemptId: "a", leaseExpiresAt: null, finishedAt: ago(minutes) });

  it("leaves the report to the report job for a few minutes", async () => {
    const { d, rpc } = deps([run({ sessions: [done(2)] })]);
    await reconcile(d);
    expect(calls(rpc, "acquire_report_lease")).toEqual([]);
  });

  it("writes the missing report under the report lease afterwards", async () => {
    const { d, rpc } = deps([run({ sessions: [done(6)] })]);
    const res = await reconcile(d);
    expect(calls(rpc, "acquire_report_lease")[0]).toMatchObject({
      p_run_id: RUN,
      p_github_run_id: null,
    });
    expect(res.reports).toBe(1);
  });

  it("is idempotent when the report job got there first", async () => {
    const { d, rpc } = deps([run({ sessions: [done(6)] })]);
    rpc.mockImplementation(async (fn: string) =>
      fn === "acquire_report_lease"
        ? { data: null, error: { code: "AQ003", message: "report already exists" } }
        : { data: [], error: null },
    );
    const res = await reconcile(d);
    expect(res.reports).toBe(0);
    expect(res.errors).toEqual([]);
    expect(calls(rpc, "save_report")).toEqual([]);
  });

  it("skips runs that already have a report and bounds reports per call", async () => {
    const runs = [
      run({ id: "r0", hasReport: true, sessions: [done(9)] }),
      ...[1, 2, 3, 4].map((i) => run({ id: `r${i}`, sessions: [done(9)] })),
    ];
    const { d, rpc } = deps(runs);
    await reconcile(d);
    expect(calls(rpc, "acquire_report_lease").map((a) => a.p_run_id)).toEqual(["r1", "r2", "r3"]);
  });
});
