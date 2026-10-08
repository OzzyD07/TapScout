import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { GITHUB_OIDC_ISSUER, OidcRejected, verifyGithubOidc } from "../src/lib/runner/oidc";
import { issueRunnerToken, requireDeviceScope, verifyRunnerToken } from "../src/lib/runner/token";

const expected = {
  audience: "tapscout",
  repository: "OzzyD07/TapScout",
  workflowFile: "qa-run.yml",
  ref: "refs/heads/main",
};

const baseClaims = {
  repository: "OzzyD07/TapScout",
  repository_id: "123",
  ref: "refs/heads/main",
  sha: "abc123",
  workflow_ref: "OzzyD07/TapScout/.github/workflows/qa-run.yml@refs/heads/main",
  event_name: "workflow_dispatch",
  run_id: "987654",
  run_attempt: "1",
  check_run_id: "555",
  runner_environment: "github-hosted",
};

let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

async function oidcToken(
  claims: Record<string, unknown>,
  opts: { aud?: string; iss?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(opts.iss ?? GITHUB_OIDC_ISSUER)
    .setAudience(opts.aud ?? "tapscout")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("verifyGithubOidc", () => {
  it("accepts the trusted workflow on the trusted ref", async () => {
    const id = await verifyGithubOidc(await oidcToken(baseClaims), expected, jwks);
    expect(id).toMatchObject({ runId: 987654, runAttempt: 1, checkRunId: 555 });
  });

  it.each([
    ["another repository", { repository: "evil/TapScout" }],
    [
      "another workflow",
      { workflow_ref: "OzzyD07/TapScout/.github/workflows/ci.yml@refs/heads/main" },
    ],
    [
      "another branch",
      {
        ref: "refs/heads/feature",
        workflow_ref: "OzzyD07/TapScout/.github/workflows/qa-run.yml@refs/heads/feature",
      },
    ],
    ["a pull request event", { event_name: "pull_request" }],
    ["a non-numeric run id", { run_id: "x" }],
  ])("rejects %s", async (_name, override) => {
    const token = await oidcToken({ ...baseClaims, ...override });
    await expect(verifyGithubOidc(token, expected, jwks)).rejects.toBeInstanceOf(OidcRejected);
  });

  it("rejects a wrong audience or issuer", async () => {
    await expect(
      verifyGithubOidc(await oidcToken(baseClaims, { aud: "other" }), expected, jwks),
    ).rejects.toThrow();
    await expect(
      verifyGithubOidc(await oidcToken(baseClaims, { iss: "https://example.com" }), expected, jwks),
    ).rejects.toThrow();
  });
});

describe("runner tokens", () => {
  const secret = "x".repeat(48);

  it("round-trips a device scope", async () => {
    const scope = {
      kind: "device",
      runId: "r",
      sessionId: "s",
      attemptId: "a",
      leaseVersion: 2,
    } as const;
    const { token } = await issueRunnerToken(scope, secret);
    expect(await verifyRunnerToken(token, secret)).toEqual(scope);
  });

  it("rejects tokens signed with another key and expired tokens", async () => {
    const scope = {
      kind: "device",
      runId: "r",
      sessionId: "s",
      attemptId: "a",
      leaseVersion: 1,
    } as const;
    const { token } = await issueRunnerToken(scope, secret);
    await expect(verifyRunnerToken(token, "y".repeat(48))).rejects.toThrow();
    const expired = await issueRunnerToken(scope, secret, -60);
    await expect(verifyRunnerToken(expired.token, secret)).rejects.toThrow();
  });

  it("never lets a report token act as a device", async () => {
    const { token } = await issueRunnerToken(
      { kind: "report", runId: "r", reportAttemptId: "ra", leaseVersion: 1 },
      secret,
    );
    const scope = await verifyRunnerToken(token, secret);
    expect(scope.kind).toBe("report");
    expect(() => requireDeviceScope(scope)).toThrow("device scope required");
  });

  it("refuses weak signing keys", async () => {
    await expect(
      issueRunnerToken(
        { kind: "device", runId: "r", sessionId: "s", attemptId: "a", leaseVersion: 1 },
        "short",
      ),
    ).rejects.toThrow();
  });
});
