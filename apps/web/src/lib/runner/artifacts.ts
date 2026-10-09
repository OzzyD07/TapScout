import {
  ArtifactCompleteRequest,
  ArtifactPresignRequest,
  type ArtifactPresignResponse,
  UPLOAD_LIMITS,
} from "@tapscout/shared";
import { fromZodError, HttpError } from "@/lib/api/errors";
import { authenticateDevice } from "./service";
import type { RunnerScope } from "./token";

type DeviceScope = Extract<RunnerScope, { kind: "device" }>;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/json": "json",
  "application/xml": "xml",
  "text/plain": "txt",
  "video/mp4": "mp4",
};

export interface ArtifactRow {
  id: string;
  runId: string;
  sessionId: string;
  attemptId: string;
  kind: string;
  objectKey: string;
  contentType: string;
  stepIndex: number | null;
}

/** Storage and database access for evidence uploads; injected so the rules can be tested. */
export interface ArtifactDeps {
  signingKey: string;
  /** True while (sessionId, attemptId, leaseVersion) still holds a non-terminal lease. */
  leaseIsCurrent(scope: DeviceScope): Promise<boolean>;
  insertPending(row: ArtifactRow): Promise<void>;
  signUpload(objectKey: string): Promise<{ signedUrl: string }>;
  findPending(artifactId: string, scope: DeviceScope): Promise<ArtifactRow | null>;
  objectSize(objectKey: string): Promise<number | null>;
  markReady(artifactId: string, sha256: string, sizeBytes: number): Promise<void>;
  publishableKey: string;
  newId(): string;
}

async function requireCurrentLease(deps: ArtifactDeps, token: string): Promise<DeviceScope> {
  const scope = await authenticateDevice(deps, token);
  if (!(await deps.leaseIsCurrent(scope))) {
    throw new HttpError(409, "lease_lost", "session lease is no longer held by this attempt");
  }
  return scope;
}

/** Evidence object keys are derived on the server; the runner never chooses a path. */
export function evidenceKey(scope: DeviceScope, kind: string, artifactId: string, ext: string) {
  return `runs/${scope.runId}/${scope.sessionId}/${scope.attemptId}/${kind}s/${artifactId}.${ext}`;
}

export async function presignArtifact(
  deps: ArtifactDeps,
  token: string,
  body: unknown,
): Promise<ArtifactPresignResponse> {
  const scope = await requireCurrentLease(deps, token);
  const parsed = ArtifactPresignRequest.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);

  const id = deps.newId();
  const ext = EXTENSIONS[parsed.data.contentType] ?? "bin";
  const objectKey = evidenceKey(scope, parsed.data.kind, id, ext);
  await deps.insertPending({
    id,
    runId: scope.runId,
    sessionId: scope.sessionId,
    attemptId: scope.attemptId,
    kind: parsed.data.kind,
    objectKey,
    contentType: parsed.data.contentType,
    stepIndex: parsed.data.stepIndex ?? null,
  });
  const { signedUrl } = await deps.signUpload(objectKey);

  return {
    artifactId: id,
    objectKey,
    uploadUrl: signedUrl,
    // The publishable key is public; Storage's gateway expects it next to the signed token.
    requiredHeaders: {
      "content-type": parsed.data.contentType,
      "x-upsert": "false",
      apikey: deps.publishableKey,
    },
    expiresAt: new Date(Date.now() + UPLOAD_LIMITS.signedUploadUrlSeconds * 1000).toISOString(),
  };
}

/** An artifact becomes `ready` only after the object is really in Storage with the stated size. */
export async function completeArtifact(deps: ArtifactDeps, token: string, body: unknown) {
  const scope = await requireCurrentLease(deps, token);
  const parsed = ArtifactCompleteRequest.safeParse(body);
  if (!parsed.success) throw fromZodError(parsed.error);

  const row = await deps.findPending(parsed.data.artifactId, scope);
  if (!row) throw new HttpError(404, "not_found", "no pending artifact for this session attempt");

  const size = await deps.objectSize(row.objectKey);
  if (size === null) throw new HttpError(409, "conflict", "object has not been uploaded");
  if (size !== parsed.data.sizeBytes) {
    throw new HttpError(
      409,
      "conflict",
      `uploaded size ${size} does not match ${parsed.data.sizeBytes}`,
    );
  }
  await deps.markReady(row.id, parsed.data.sha256, size);
  return { artifactId: row.id, status: "ready" as const };
}
