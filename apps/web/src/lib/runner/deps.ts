import "server-only";
import { PlatformBudget, TestMode, UPLOAD_LIMITS } from "@tapscout/shared";
import { z } from "zod";
import { HttpError } from "@/lib/api/errors";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGithubOidc } from "./oidc";
import type { BootstrapContext, RunnerDeps } from "./service";

const RunRow = z.object({ modes: z.array(TestMode), config: z.object({ budget: PlatformBudget }) });
const BuildRow = z.object({
  id: z.string(),
  object_key: z.string(),
  file_name: z.string(),
  size_bytes: z.coerce.number(),
});

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
          .select("id, object_key, file_name, size_bytes")
          .eq("id", buildId)
          .single(),
      ]);
      const runRow = RunRow.safeParse(run.data);
      const buildRow = BuildRow.safeParse(build.data);
      if (!runRow.success || !buildRow.success) {
        throw new HttpError(500, "internal", "run or build record is incomplete");
      }
      return {
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
