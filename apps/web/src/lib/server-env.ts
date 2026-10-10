import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable ${name}`);
  return value;
}

/** Server-only configuration (docs/04 §3). Read lazily so pages that do not need it still build. */
export const serverEnv = {
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  runnerTokenSigningKey: () => required("RUNNER_TOKEN_SIGNING_KEY"),
  runnerOidcAudience: () => process.env.RUNNER_OIDC_AUDIENCE || "tapscout",
  githubRepository: () => required("GITHUB_REPOSITORY"),
  githubDispatchToken: () => required("GITHUB_DISPATCH_TOKEN"),
  githubWorkflowFile: () => process.env.GITHUB_WORKFLOW_ID || "qa-run.yml",
  githubWorkflowRef: () => `refs/heads/${process.env.GITHUB_WORKFLOW_REF || "main"}`,
  githubDispatchRef: () => process.env.GITHUB_WORKFLOW_REF || "main",
  storageBuildsBucket: () => process.env.STORAGE_BUILDS_BUCKET || "builds",
  storageEvidenceBucket: () => process.env.STORAGE_EVIDENCE_BUCKET || "evidence",
  tokenFactoryApiKey: () => required("TOKEN_FACTORY_API_KEY"),
  tokenFactoryBaseUrl: () =>
    process.env.TOKEN_FACTORY_BASE_URL || "https://api.tokenfactory.nebius.com/v1/",
  plannerModel: () => process.env.NEMOTRON_MODEL_ID || "nvidia/Nemotron-3_5-Lightning",
  visionModel: () => process.env.VISION_MODEL_ID || "openbmb/MiniCPM-V-4_5",
};
