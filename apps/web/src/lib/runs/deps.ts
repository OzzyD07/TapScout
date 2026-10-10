import "server-only";
import { HttpError } from "@/lib/api/errors";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser, type SessionUser } from "@/lib/supabase/server";
import { githubDispatcher } from "./dispatch";
import type { RunsDeps } from "./service";

export function createRunsDeps(): RunsDeps {
  const admin = createAdminClient();
  return {
    rpc: (fn, args) => admin.rpc(fn, args),
    workerId: `api:${crypto.randomUUID()}`,
    dispatchWorkflow: githubDispatcher({
      token: serverEnv.githubDispatchToken(),
      repository: serverEnv.githubRepository(),
      workflowFile: serverEnv.githubWorkflowFile(),
      ref: serverEnv.githubDispatchRef(),
    }),
    async countActiveRuns(userId) {
      const { count, error } = await admin
        .from("test_runs")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .in("status", ["queued", "running"])
        .is("cancel_requested_at", null);
      if (error) throw new HttpError(500, "internal", "could not count active runs");
      return count ?? 0;
    },
  };
}

/** Verified signed-in user for API routes; 401 otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "unauthorized", "sign in required");
  return user;
}
