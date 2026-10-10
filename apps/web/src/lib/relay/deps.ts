import "server-only";
import { HttpError } from "@/lib/api/errors";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTokenFactoryChat } from "./provider";
import type { RelayDeps } from "./service";

const TERMINAL_PHASES = "(completed,cancelled,blocked,infrastructure_failed)";

export function createRelayDeps(): RelayDeps {
  const admin = createAdminClient();
  return {
    signingKey: serverEnv.runnerTokenSigningKey(),
    models: { planner: serverEnv.plannerModel(), vision: serverEnv.visionModel() },
    chat: createTokenFactoryChat({
      apiKey: serverEnv.tokenFactoryApiKey(),
      baseUrl: serverEnv.tokenFactoryBaseUrl(),
    }),
    rpc: (fn, args) => admin.rpc(fn, args),
    async deviceLeaseIsCurrent(scope) {
      const { data } = await admin
        .from("platform_sessions")
        .select("id")
        .eq("id", scope.sessionId)
        .eq("attempt_id", scope.attemptId)
        .eq("lease_version", scope.leaseVersion)
        .gt("lease_expires_at", new Date().toISOString())
        .not("phase", "in", TERMINAL_PHASES)
        .maybeSingle();
      return Boolean(data);
    },
    async reportLeaseIsCurrent(scope) {
      const { data } = await admin
        .from("report_attempts")
        .select("id")
        .eq("id", scope.reportAttemptId)
        .eq("run_id", scope.runId)
        .eq("lease_version", scope.leaseVersion)
        .eq("phase", "started")
        .gt("lease_expires_at", new Date().toISOString())
        .maybeSingle();
      return Boolean(data);
    },
    async loadScreenshot(artifactId, scope) {
      const { data: row } = await admin
        .from("artifacts")
        .select("object_key, content_type")
        .eq("id", artifactId)
        .eq("run_id", scope.runId)
        .eq("session_id", scope.sessionId)
        .eq("attempt_id", scope.attemptId)
        .eq("kind", "screenshot")
        .eq("status", "ready")
        .maybeSingle();
      if (!row) return null;
      const { data, error } = await admin.storage
        .from(serverEnv.storageEvidenceBucket())
        .download(row.object_key);
      if (error || !data) throw new HttpError(500, "internal", "could not read the screenshot");
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: row.content_type };
    },
    async recordUsage(row) {
      const { error } = await admin.from("usage_records").insert({
        run_id: row.runId,
        session_id: row.sessionId,
        report_attempt_id: row.reportAttemptId,
        kind: "model",
        model: row.model,
        purpose: row.purpose,
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        usage_reported: row.usageReported,
        latency_ms: row.latencyMs,
        estimated_cost_usd: row.estimatedCostUsd,
      });
      if (error) throw new Error(error.message);
    },
  };
}
