import {
  CreateBuildUploadRequest,
  type CreateBuildUploadResponse,
  UPLOAD_LIMITS,
} from "@tapscout/shared";
import { fromZodError, HttpError } from "@/lib/api/errors";

/** Started but not finished uploads one user may have at a time. */
export const MAX_PENDING_UPLOADS = 3;

const FORMATS = {
  android: { ext: "apk", contentType: "application/vnd.android.package-archive" },
  ios: { ext: "zip", contentType: "application/zip" },
} as const;

export interface BuildRecord {
  id: string;
  ownerId: string | null;
  platform: "android" | "ios";
  sizeBytes: number;
  stagingKey: string;
  status: "awaiting_upload" | "uploaded" | "accepted" | "rejected";
}

/** Storage and database access; injected so the rules can be tested. */
export interface BuildsDeps {
  /** The `builds` bucket's file size limit (50 MB on the Supabase Free plan). */
  maxBytes: number;
  newId(): string;
  now(): Date;
  countPending(ownerId: string): Promise<number>;
  insertBuild(row: {
    id: string;
    ownerId: string;
    platform: "android" | "ios";
    appName: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    stagingKey: string;
  }): Promise<void>;
  /** Signed upload URL for exactly this object path; the browser PUTs the file there. */
  signUpload(key: string): Promise<string>;
  loadBuild(id: string): Promise<BuildRecord | null>;
  /** Size of a stored object, or null when it does not exist. */
  objectSize(key: string): Promise<number | null>;
  /** First bytes of a stored object (format check). */
  objectHead(key: string, bytes: number): Promise<Uint8Array>;
  moveObject(from: string, to: string): Promise<void>;
  removeObject(key: string): Promise<void>;
  markUploaded(id: string, objectKey: string): Promise<void>;
  markRejected(id: string, reason: string): Promise<void>;
}

/**
 * Start Test with your own build, step 1: record the build and hand out a signed upload URL for
 * its staging path. The file goes from the browser straight to Storage, never through the API
 * (docs/02 §3).
 */
export async function createBuildUpload(
  deps: BuildsDeps,
  ownerId: string,
  body: unknown,
): Promise<CreateBuildUploadResponse> {
  const parsed = CreateBuildUploadRequest.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);
  const req = parsed.data;
  const format = FORMATS[req.platform];
  if (
    req.contentType !== format.contentType ||
    !req.fileName.toLowerCase().endsWith(`.${format.ext}`)
  ) {
    throw new HttpError(
      400,
      "invalid_request",
      req.platform === "android"
        ? "Android builds must be an .apk file."
        : "iOS builds must be a .zip of an iOS Simulator .app.",
    );
  }
  if (req.sizeBytes > deps.maxBytes) {
    const mb = Math.floor(deps.maxBytes / (1024 * 1024));
    throw new HttpError(400, "invalid_request", `The file is larger than the ${mb} MB limit.`);
  }
  if ((await deps.countPending(ownerId)) >= MAX_PENDING_UPLOADS) {
    throw new HttpError(409, "conflict", "Finish or abandon your other uploads first.");
  }

  const id = deps.newId();
  const stagingKey = `staging/${id}/app.${format.ext}`;
  await deps.insertBuild({
    id,
    ownerId,
    platform: req.platform,
    appName: req.appName.trim(),
    fileName: req.fileName,
    contentType: format.contentType,
    sizeBytes: req.sizeBytes,
    stagingKey,
  });
  const uploadUrl = await deps.signUpload(stagingKey);
  return {
    buildId: id,
    uploadUrl,
    requiredHeaders: { "content-type": format.contentType, "x-upsert": "false" },
    expiresAt: new Date(
      deps.now().getTime() + UPLOAD_LIMITS.signedUploadUrlSeconds * 1000,
    ).toISOString(),
  };
}

/** APK and ZIP are both ZIP containers: local file header `PK\x03\x04`. */
function isZipContainer(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/**
 * Step 2, after the browser's upload: the stored object must exist, have the declared size and be
 * a ZIP container. It then moves to its immutable final path and can be tested; installability,
 * ABI and Simulator checks happen on the device runner, where a mismatch is an input error.
 */
export async function completeBuildUpload(
  deps: BuildsDeps,
  ownerId: string,
  buildId: string,
): Promise<{ buildId: string; status: "uploaded" }> {
  const build = await deps.loadBuild(buildId);
  if (!build || build.ownerId !== ownerId) throw new HttpError(404, "not_found", "build not found");
  if (build.status !== "awaiting_upload") {
    throw new HttpError(409, "conflict", "this build was already completed");
  }
  const size = await deps.objectSize(build.stagingKey);
  if (size === null) throw new HttpError(409, "conflict", "the file has not been uploaded yet");

  let reason: string | null = null;
  if (size !== build.sizeBytes) {
    reason = `The uploaded file has ${size} bytes, not the ${build.sizeBytes} that were declared.`;
  } else if (!isZipContainer(await deps.objectHead(build.stagingKey, 4))) {
    reason =
      build.platform === "android" ? "The file is not an APK." : "The file is not a ZIP archive.";
  }
  if (reason) {
    await deps.markRejected(build.id, reason);
    await deps.removeObject(build.stagingKey).catch(() => {});
    throw new HttpError(400, "invalid_request", reason);
  }

  const finalKey = build.stagingKey.replace(/^staging\//, "final/");
  await deps.moveObject(build.stagingKey, finalKey);
  await deps.markUploaded(build.id, finalKey);
  return { buildId: build.id, status: "uploaded" };
}
