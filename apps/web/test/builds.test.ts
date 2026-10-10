import { describe, expect, it, vi } from "vitest";
import {
  type BuildRecord,
  type BuildsDeps,
  completeBuildUpload,
  createBuildUpload,
  MAX_PENDING_UPLOADS,
} from "../src/lib/builds/service";

const USER = "11111111-1111-4111-8111-111111111111";
const BUILD = "22222222-2222-4222-8222-222222222222";
const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function deps(over: Partial<BuildsDeps> = {}, record?: Partial<BuildRecord>): BuildsDeps {
  return {
    maxBytes: 50 * 1024 * 1024,
    newId: () => BUILD,
    now: () => new Date("2026-10-11T10:00:00.000Z"),
    countPending: vi.fn(async () => 0),
    insertBuild: vi.fn(async () => {}),
    signUpload: vi.fn(
      async (key: string) => `https://storage.example/upload/sign/builds/${key}?token=t`,
    ),
    loadBuild: vi.fn(async () => ({
      id: BUILD,
      ownerId: USER,
      platform: "android" as const,
      sizeBytes: 1234,
      stagingKey: `staging/${BUILD}/app.apk`,
      status: "awaiting_upload" as const,
      ...record,
    })),
    objectSize: vi.fn(async () => 1234),
    objectHead: vi.fn(async () => ZIP_HEAD),
    moveObject: vi.fn(async () => {}),
    removeObject: vi.fn(async () => {}),
    markUploaded: vi.fn(async () => {}),
    markRejected: vi.fn(async () => {}),
    ...over,
  };
}

const apk = {
  platform: "android",
  fileName: "MyApp-release.apk",
  sizeBytes: 1234,
  contentType: "application/vnd.android.package-archive",
  appName: "My App",
};

describe("createBuildUpload", () => {
  it("records the build and signs an upload for its staging path only", async () => {
    const d = deps();
    const res = await createBuildUpload(d, USER, apk);
    expect(d.insertBuild).toHaveBeenCalledWith(
      expect.objectContaining({ id: BUILD, ownerId: USER, stagingKey: `staging/${BUILD}/app.apk` }),
    );
    expect(d.signUpload).toHaveBeenCalledWith(`staging/${BUILD}/app.apk`);
    expect(res).toMatchObject({
      buildId: BUILD,
      requiredHeaders: { "content-type": "application/vnd.android.package-archive" },
      expiresAt: "2026-10-11T12:00:00.000Z",
    });
  });

  it.each([
    ["an iOS build that is not a zip", { ...apk, platform: "ios" }],
    ["an APK with a zip content type", { ...apk, contentType: "application/zip" }],
    ["a file over the bucket limit", { ...apk, sizeBytes: 51 * 1024 * 1024 }],
    ["a missing app name", { ...apk, appName: "" }],
  ])("rejects %s", async (_, body) => {
    const d = deps();
    await expect(createBuildUpload(d, USER, body)).rejects.toMatchObject({ status: 400 });
    expect(d.insertBuild).not.toHaveBeenCalled();
  });

  it("limits unfinished uploads per user", async () => {
    const d = deps({ countPending: vi.fn(async () => MAX_PENDING_UPLOADS) });
    await expect(createBuildUpload(d, USER, apk)).rejects.toMatchObject({ status: 409 });
  });
});

describe("completeBuildUpload", () => {
  it("moves a checked upload to its final path and makes it usable", async () => {
    const d = deps();
    expect(await completeBuildUpload(d, USER, BUILD)).toEqual({
      buildId: BUILD,
      status: "uploaded",
    });
    expect(d.moveObject).toHaveBeenCalledWith(`staging/${BUILD}/app.apk`, `final/${BUILD}/app.apk`);
    expect(d.markUploaded).toHaveBeenCalledWith(BUILD, `final/${BUILD}/app.apk`);
  });

  it("hides other users' builds", async () => {
    const d = deps({}, { ownerId: "someone-else" });
    await expect(completeBuildUpload(d, USER, BUILD)).rejects.toMatchObject({ status: 404 });
  });

  it("waits for the file and refuses to complete twice", async () => {
    await expect(
      completeBuildUpload(deps({ objectSize: vi.fn(async () => null) }), USER, BUILD),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      completeBuildUpload(deps({}, { status: "uploaded" }), USER, BUILD),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    ["a size that differs from the declared one", { objectSize: vi.fn(async () => 99) }],
    [
      "a file that is not a ZIP container",
      { objectHead: vi.fn(async () => new Uint8Array([0x7f, 0x45, 0x4c, 0x46])) },
    ],
  ])("rejects %s and removes the upload", async (_, over) => {
    const d = deps(over);
    await expect(completeBuildUpload(d, USER, BUILD)).rejects.toMatchObject({ status: 400 });
    expect(d.markRejected).toHaveBeenCalled();
    expect(d.removeObject).toHaveBeenCalledWith(`staging/${BUILD}/app.apk`);
    expect(d.markUploaded).not.toHaveBeenCalled();
  });
});
