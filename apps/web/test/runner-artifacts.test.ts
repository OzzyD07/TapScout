import { describe, expect, it, vi } from "vitest";
import { type ArtifactDeps, completeArtifact, presignArtifact } from "../src/lib/runner/artifacts";
import { issueRunnerToken } from "../src/lib/runner/token";

const signingKey = "k".repeat(48);
const scope = {
  kind: "device" as const,
  runId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  attemptId: "33333333-3333-4333-8333-333333333333",
  leaseVersion: 1,
};

function deps(overrides: Partial<ArtifactDeps> = {}): ArtifactDeps {
  return {
    signingKey,
    publishableKey: "sb_publishable_test",
    newId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    leaseIsCurrent: vi.fn(async () => true),
    insertPending: vi.fn(async () => {}),
    signUpload: vi.fn(async (key: string) => ({
      signedUrl: `https://storage.test/upload/${key}?token=t`,
    })),
    findPending: vi.fn(async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runId: scope.runId,
      sessionId: scope.sessionId,
      attemptId: scope.attemptId,
      kind: "screenshot",
      objectKey: "runs/x.png",
      contentType: "image/png",
      stepIndex: 1,
    })),
    objectSize: vi.fn(async () => 2048),
    markReady: vi.fn(async () => {}),
    ...overrides,
  };
}

const token = async () => (await issueRunnerToken(scope, signingKey)).token;

describe("presignArtifact", () => {
  it("derives the object key on the server from the token scope", async () => {
    const d = deps();
    const res = await presignArtifact(d, await token(), {
      kind: "screenshot",
      contentType: "image/png",
      sizeBytes: 2048,
      stepIndex: 1,
    });
    expect(res.objectKey).toBe(
      `runs/${scope.runId}/${scope.sessionId}/${scope.attemptId}/screenshots/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`,
    );
    expect(res.requiredHeaders["content-type"]).toBe("image/png");
    expect(d.insertPending).toHaveBeenCalledOnce();
  });

  it("refuses uploads after the lease was lost", async () => {
    const d = deps({ leaseIsCurrent: vi.fn(async () => false) });
    await expect(
      presignArtifact(d, await token(), {
        kind: "screenshot",
        contentType: "image/png",
        sizeBytes: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: "lease_lost" });
    expect(d.insertPending).not.toHaveBeenCalled();
  });

  it("rejects kinds the runner may not upload", async () => {
    await expect(
      presignArtifact(deps(), await token(), {
        kind: "build",
        contentType: "image/png",
        sizeBytes: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("completeArtifact", () => {
  const body = {
    artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sha256: "a".repeat(64),
    sizeBytes: 2048,
  };

  it("marks the artifact ready when the object exists with the stated size", async () => {
    const d = deps();
    expect(await completeArtifact(d, await token(), body)).toEqual({
      artifactId: body.artifactId,
      status: "ready",
    });
    expect(d.markReady).toHaveBeenCalledWith(body.artifactId, body.sha256, 2048);
  });

  it("does not mark missing or mismatched uploads ready", async () => {
    const missing = deps({ objectSize: vi.fn(async () => null) });
    await expect(completeArtifact(missing, await token(), body)).rejects.toMatchObject({
      status: 409,
    });
    const wrong = deps({ objectSize: vi.fn(async () => 10) });
    await expect(completeArtifact(wrong, await token(), body)).rejects.toMatchObject({
      status: 409,
    });
    expect(wrong.markReady).not.toHaveBeenCalled();
  });

  it("returns 404 for artifacts of another session attempt", async () => {
    const d = deps({ findPending: vi.fn(async () => null) });
    await expect(completeArtifact(d, await token(), body)).rejects.toMatchObject({ status: 404 });
  });
});
