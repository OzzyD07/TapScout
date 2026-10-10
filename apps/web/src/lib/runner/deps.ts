import "server-only";
import { PlatformBudget, TestMode, UPLOAD_LIMITS } from "@tapscout/shared";
import { z } from "zod";
import { HttpError } from "@/lib/api/errors";
import { openTestAccount, parseKey } from "@/lib/builds/secrets";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ArtifactDeps } from "./artifacts";
import { verifyGithubOidc } from "./oidc";
import type { BootstrapContext, RunnerDeps } from "./service";

const RunRow = z.object({ modes: z.array(TestMode), config: z.object({ budget: PlatformBudget }) });
const BuildRow = z.object({
  id: z.string(),
  object_key: z.string(),
  file_name: z.string(),
  size_bytes: z.coerce.number(),
  has_test_account: z.boolean().default(false),
});

export function createArtifactDeps(): ArtifactDeps {
  const admin = createAdminClient();
  const bucket = () => admin.storage.from(serverEnv.storageEvidenceBucket());
  return {
    signingKey: serverEnv.runnerTokenSigningKey(),
    publishableKey: publicEnv.supabasePublishableKey,
    newId: () => crypto.randomUUID(),
    async leaseIsCurrent(scope) {
      const { data } = await admin
        .from("platform_sessions")
        .select("id")
        .eq("id", scope.sessionId)
        .eq("attempt_id", scope.attemptId)
        .eq("lease_version", scope.leaseVersion)
        .not("phase", "in", "(completed,cancelled,blocked,infrastructure_failed)")
        .maybeSingle();
      return Boolean(data);
    },
    async insertPending(row) {
      const { error } = await admin.from("artifacts").insert({
        id: row.id,
        run_id: row.runId,
        session_id: row.sessionId,
        attempt_id: row.attemptId,
        kind: row.kind,
        object_key: row.objectKey,
        content_type: row.contentType,
        step_index: row.stepIndex,
        status: "pending",
      });
      if (error) throw new HttpError(500, "internal", "could not record the artifact");
    },
    async signUpload(objectKey) {
      const { data, error } = await bucket().createSignedUploadUrl(objectKey);
      if (error || !data) throw new HttpError(500, "internal", "could not sign the upload");
      return { signedUrl: data.signedUrl };
    },
    async findPending(artifactId, scope) {
      const { data } = await admin
        .from("artifacts")
        .select("id, run_id, session_id, attempt_id, kind, object_key, content_type, step_index")
        .eq("id", artifactId)
        .eq("session_id", scope.sessionId)
        .eq("attempt_id", scope.attemptId)
        .eq("status", "pending")
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        runId: data.run_id,
        sessionId: data.session_id,
        attemptId: data.attempt_id,
        kind: data.kind,
        objectKey: data.object_key,
        contentType: data.content_type,
        stepIndex: data.step_index,
      };
    },
    async objectSize(objectKey) {
      const { data, error } = await bucket().info(objectKey);
      if (error || !data) return null;
      return typeof data.size === "number" ? data.size : null;
    },
    async markReady(artifactId, sha256, sizeBytes) {
      const { error } = await admin
        .from("artifacts")
        .update({
          status: "ready",
          sha256,
          size_bytes: sizeBytes,
          ready_at: new Date().toISOString(),
        })
        .eq("id", artifactId)
        .eq("status", "pending");
      if (error) throw new HttpError(500, "internal", "could not mark the artifact ready");
    },
  };
}

export function createRunnerDeps(): RunnerDeps {
  const admin = createAdminClient();
  return {
    rpc: (fn, args) => admin.rpc(fn, args),
    signingKey: serverEnv.runnerTokenSigningKey(),
    verifyOidc: (token) =>
      verifyGithubOidc(token, {
        audience: serverEnv.runnerOidcAudience(),
        repository: serverEnv.githubRepository(),
        workflowFile: serverEnv.githubWorkflowFile(),
        ref: serverEnv.githubWorkflowRef(),
      }),
    async loadBootstrapContext(runId, buildId): Promise<BootstrapContext> {
      const [run, build] = await Promise.all([
        admin.from("test_runs").select("modes, config").eq("id", runId).single(),
        admin
          .from("app_builds")
          .select("id, object_key, file_name, size_bytes, has_test_account")
          .eq("id", buildId)
          .single(),
      ]);
      const runRow = RunRow.safeParse(run.data);
      const buildRow = BuildRow.safeParse(build.data);
      if (!runRow.success || !buildRow.success) {
        throw new HttpError(500, "internal", "run or build record is incomplete");
      }
      let testAccount: BootstrapContext["testAccount"];
      if (buildRow.data.has_test_account) {
        // Without the key or with a damaged secret the run goes on and reports the sign-in wall.
        const key = parseKey(process.env.APP_CREDENTIALS_ENCRYPTION_KEY);
        const { data } = await admin
          .from("build_test_accounts")
          .select("ciphertext")
          .eq("build_id", buildId)
          .maybeSingle();
        try {
          if (!key || !data) throw new Error(key ? "no stored test account" : "no encryption key");
          testAccount = openTestAccount(data.ciphertext, key, buildId);
        } catch (error) {
          console.error(`bootstrap: test account unavailable: ${(error as Error).message}`);
        }
      }
      return {
        testAccount,
        modes: runRow.data.modes,
        budget: runRow.data.config.budget,
        build: {
          buildId: buildRow.data.id,
          objectKey: buildRow.data.object_key,
          fileName: buildRow.data.file_name,
          sizeBytes: buildRow.data.size_bytes,
        },
      };
    },
    async signBuildDownload(objectKey) {
      const { data, error } = await admin.storage
        .from(serverEnv.storageBuildsBucket())
        .createSignedUrl(objectKey, UPLOAD_LIMITS.signedDownloadUrlSeconds);
      if (error || !data?.signedUrl) {
        throw new HttpError(500, "internal", "could not sign the build download");
      }
      return data.signedUrl;
    },
  };
}
