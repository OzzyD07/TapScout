import { createRemoteJWKSet, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";

export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

let remoteJwks: JWTVerifyGetKey | undefined;
function githubJwks(): JWTVerifyGetKey {
  remoteJwks ??= createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));
  return remoteJwks;
}

export interface OidcExpectation {
  audience: string;
  /** "owner/repo" */
  repository: string;
  /** Workflow file name, e.g. "qa-run.yml". */
  workflowFile: string;
  /** Trusted ref, e.g. "refs/heads/main". */
  ref: string;
  allowedEvents?: readonly string[];
}

export interface VerifiedWorkflowIdentity {
  repository: string;
  repositoryId: string;
  workflowRef: string;
  ref: string;
  sha: string;
  runId: number;
  runAttempt: number;
  checkRunId: number | null;
  eventName: string;
  runnerEnvironment: string | null;
}

export class OidcRejected extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "OidcRejected";
  }
}

function claim(payload: JWTPayload, name: string): string {
  const value = payload[name];
  if (typeof value !== "string" || value.length === 0)
    throw new OidcRejected(`missing claim ${name}`);
  return value;
}

/**
 * Verifies a GitHub Actions OIDC token: signature (JWKS), issuer, audience and expiry, then the
 * repository, workflow file, ref and event. A runId in the request body is never trusted on its
 * own (docs/04 §3).
 */
export async function verifyGithubOidc(
  token: string,
  expected: OidcExpectation,
  keys: JWTVerifyGetKey = githubJwks(),
): Promise<VerifiedWorkflowIdentity> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: expected.audience,
      algorithms: ["RS256"],
      clockTolerance: 30,
    }));
  } catch (error) {
    throw new OidcRejected(`invalid token: ${(error as Error).message}`);
  }

  const repository = claim(payload, "repository");
  if (repository !== expected.repository) throw new OidcRejected("repository mismatch");

  const ref = claim(payload, "ref");
  if (ref !== expected.ref) throw new OidcRejected("ref mismatch");

  const workflowRef = claim(payload, "workflow_ref");
  const expectedWorkflowRef = `${expected.repository}/.github/workflows/${expected.workflowFile}@${expected.ref}`;
  if (workflowRef !== expectedWorkflowRef) throw new OidcRejected("workflow mismatch");

  const eventName = claim(payload, "event_name");
  const allowed = expected.allowedEvents ?? ["workflow_dispatch"];
  if (!allowed.includes(eventName)) throw new OidcRejected(`event ${eventName} not allowed`);

  const runId = Number(claim(payload, "run_id"));
  const runAttempt = Number(claim(payload, "run_attempt"));
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(runAttempt)) {
    throw new OidcRejected("invalid run identifiers");
  }
  const checkRunId = typeof payload.check_run_id === "string" ? Number(payload.check_run_id) : null;

  return {
    repository,
    repositoryId: claim(payload, "repository_id"),
    workflowRef,
    ref,
    sha: claim(payload, "sha"),
    runId,
    runAttempt,
    checkRunId: checkRunId !== null && Number.isSafeInteger(checkRunId) ? checkRunId : null,
    eventName,
    runnerEnvironment:
      typeof payload.runner_environment === "string" ? payload.runner_environment : null,
  };
}
