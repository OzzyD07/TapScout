import {
  CreateRunRequest,
  type CreateRunResponse,
  DEFAULT_PLATFORM_BUDGET,
  DEFAULT_REPORT_BUDGET,
} from "@tapscout/shared";
import { fromDbError, fromZodError, HttpError, type PostgrestLikeError } from "@/lib/api/errors";
import { type DispatchDeps, dispatchRun } from "./dispatch";

/** Concurrent active runs per user; the rest wait visibly instead of starting more runners. */
export const MAX_ACTIVE_RUNS_PER_USER = 2;

export const AGENT_VERSION = "f1-pilot";

export interface RunsDeps extends DispatchDeps {
  countActiveRuns(userId: string): Promise<number>;
}

export async function createRun(
  deps: RunsDeps,
  userId: string,
  body: unknown,
): Promise<CreateRunResponse> {
  const parsed = CreateRunRequest.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);

  if ((await deps.countActiveRuns(userId)) >= MAX_ACTIVE_RUNS_PER_USER) {
    throw new HttpError(
      429,
      "conflict",
      `You already have ${MAX_ACTIVE_RUNS_PER_USER} runs in progress. Wait for one to finish.`,
    );
  }

  const config = { budget: DEFAULT_PLATFORM_BUDGET, reportBudget: DEFAULT_REPORT_BUDGET };
  const { data, error } = await deps.rpc("create_test_run", {
    p_owner: userId,
    p_android_build: parsed.data.builds.android ?? null,
    p_ios_build: parsed.data.builds.ios ?? null,
    p_modes: parsed.data.modes,
    p_config: config,
    p_version_stamp: {
      agent: AGENT_VERSION,
      prompt: "none",
      checkPack: "none",
      rulePack: "none",
      budget: config.budget.budgetVersion,
      plannerModel: "none",
    },
  });
  if (error) throw fromDbError(error as PostgrestLikeError);
  const runId = String(data);

  const platforms =
    parsed.data.builds.android && parsed.data.builds.ios
      ? "both"
      : parsed.data.builds.android
        ? "android"
        : "ios";
  const dispatch = await dispatchRun(deps, runId, platforms);
  return { runId, dispatch };
}

/**
 * Records the cancellation. Running sessions learn it from their next heartbeat and finish as
 * cancelled; never-started sessions end immediately (request_run_cancel).
 */
export async function cancelRun(
  deps: Pick<RunsDeps, "rpc">,
  userId: string,
  runId: string,
): Promise<{ status: string }> {
  const { data, error } = await deps.rpc("request_run_cancel", { p_run_id: runId, p_user: userId });
  if (error) throw fromDbError(error as PostgrestLikeError);
  return { status: String(data) };
}
