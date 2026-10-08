import { jwtVerify, SignJWT } from "jose";

const ISSUER = "tapscout-api";
const AUDIENCE = "tapscout-runner";

/**
 * Short-lived application token for a runner. A device token is bound to one session attempt
 * and lease version; a report token to one report attempt. Neither can act outside its scope,
 * and a report token can never drive a device (docs/02 §8).
 */
export type RunnerScope =
  | { kind: "device"; runId: string; sessionId: string; attemptId: string; leaseVersion: number }
  | { kind: "report"; runId: string; reportAttemptId: string; leaseVersion: number };

export const RUNNER_TOKEN_TTL_SECONDS = 30 * 60;

function key(secret: string): Uint8Array {
  if (secret.length < 32)
    throw new Error("RUNNER_TOKEN_SIGNING_KEY must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function issueRunnerToken(
  scope: RunnerScope,
  secret: string,
  ttlSeconds = RUNNER_TOKEN_TTL_SECONDS,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const subject = scope.kind === "device" ? scope.sessionId : scope.reportAttemptId;
  const token = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key(secret));
  return { token, expiresAt };
}

export async function verifyRunnerToken(token: string, secret: string): Promise<RunnerScope> {
  const { payload } = await jwtVerify(token, key(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["HS256"],
  });
  const scope = payload.scope as RunnerScope | undefined;
  const subject =
    scope?.kind === "device"
      ? scope.sessionId
      : scope?.kind === "report"
        ? scope.reportAttemptId
        : undefined;
  if (!scope || !subject || payload.sub !== subject) throw new Error("malformed runner token");
  return scope;
}

/** Device scope or throw: report tokens must never reach device endpoints. */
export function requireDeviceScope(scope: RunnerScope): Extract<RunnerScope, { kind: "device" }> {
  if (scope.kind !== "device") throw new Error("device scope required");
  return scope;
}
