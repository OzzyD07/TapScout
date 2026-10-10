import type { PostgrestLikeError } from "@/lib/api/errors";

type RpcResult = { data: unknown; error: PostgrestLikeError | null };

export interface DispatchDeps {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  /** Calls the GitHub workflow_dispatch API; returns the created workflow run id when known. */
  dispatchWorkflow(input: { runId: string; platforms: "both" | "android" | "ios" }): Promise<{
    workflowRunId: number | null;
  }>;
  workerId: string;
}

interface OutboxRow {
  id: string;
}

export type DispatchOutcome = "dispatched" | "pending_retry";

/**
 * Claims the run's dispatch outbox item and dispatches qa-run.yml once. A failed or ambiguous
 * dispatch stays in the outbox for the maintenance job; a second paid workflow is never started
 * without checking GitHub first (docs/02 §7).
 */
export async function dispatchRun(
  deps: DispatchDeps,
  runId: string,
  platforms: "both" | "android" | "ios",
): Promise<DispatchOutcome> {
  const claimed = await deps.rpc("claim_run_dispatch", {
    p_run_id: runId,
    p_worker: deps.workerId,
    p_claim_seconds: 60,
  });
  if (claimed.error) return "pending_retry";
  const [item] = (Array.isArray(claimed.data) ? claimed.data : []) as OutboxRow[];
  if (!item) return "pending_retry";

  try {
    const { workflowRunId } = await deps.dispatchWorkflow({ runId, platforms });
    await deps.rpc("complete_outbox", {
      p_id: item.id,
      p_worker: deps.workerId,
      p_outcome: "dispatched",
      p_provider_ref: workflowRunId ? { workflowRunId } : null,
      p_error: null,
      p_retry_seconds: 0,
    });
    return "dispatched";
  } catch (error) {
    await deps.rpc("complete_outbox", {
      p_id: item.id,
      p_worker: deps.workerId,
      p_outcome: "retry",
      p_provider_ref: null,
      p_error: (error as Error).message.slice(0, 300),
      p_retry_seconds: 30,
    });
    return "pending_retry";
  }
}

export class GithubDispatchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GithubDispatchError";
  }
}

export interface GithubConfig {
  token: string;
  repository: string;
  workflowFile: string;
  ref: string;
  fetch?: typeof fetch;
}

export function githubDispatcher(config: GithubConfig): DispatchDeps["dispatchWorkflow"] {
  const fetchImpl = config.fetch ?? fetch;
  return async ({ runId, platforms }) => {
    const res = await fetchImpl(
      `https://api.github.com/repos/${config.repository}/actions/workflows/${config.workflowFile}/dispatches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ref: config.ref,
          inputs: { run_id: runId, platforms },
          return_run_details: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const text = await res.text();
    if (!res.ok) throw new GithubDispatchError(res.status, `GitHub dispatch HTTP ${res.status}`);
    const body = text ? (JSON.parse(text) as { workflow_run_id?: number }) : {};
    return { workflowRunId: body.workflow_run_id ?? null };
  };
}

export async function cancelWorkflowRun(
  config: GithubConfig,
  workflowRunId: number,
): Promise<void> {
  const fetchImpl = config.fetch ?? fetch;
  const res = await fetchImpl(
    `https://api.github.com/repos/${config.repository}/actions/runs/${workflowRunId}/cancel`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  // 409 means the workflow already finished; nothing left to cancel.
  if (!res.ok && res.status !== 409) {
    throw new GithubDispatchError(res.status, `GitHub cancel HTTP ${res.status}`);
  }
}
