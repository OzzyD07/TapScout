import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { RunnerApi } from "./api.js";

export type EvidenceKind = "screenshot" | "hierarchy" | "log" | "video" | "manifest";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",
  mp4: "video/mp4",
};

type UploadApi = Pick<RunnerApi, "presign" | "complete">;

async function prepare(api: UploadApi, filePath: string, kind: EvidenceKind, stepIndex?: number) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) throw new Error(`unsupported evidence file type: ${filePath}`);
  const bytes = await readFile(filePath);
  const presigned = await api.presign({ kind, contentType, sizeBytes: bytes.length, stepIndex });
  return { bytes, presigned };
}

async function transfer(
  api: UploadApi,
  bytes: Buffer,
  presigned: Awaited<ReturnType<UploadApi["presign"]>>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const res = await fetchImpl(presigned.uploadUrl, {
    method: "PUT",
    headers: presigned.requiredHeaders,
    body: bytes,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(
      `evidence upload failed with HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await api.complete({ artifactId: presigned.artifactId, sha256, sizeBytes: bytes.length });
}

/**
 * presign → direct PUT to Storage → complete. The API only marks the artifact ready after it
 * confirms the object and its size, so a failed upload never shows up as evidence.
 */
export async function uploadEvidence(
  api: UploadApi,
  filePath: string,
  kind: EvidenceKind,
  stepIndex?: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { bytes, presigned } = await prepare(api, filePath, kind, stepIndex);
  await transfer(api, bytes, presigned, fetchImpl);
  return presigned.artifactId;
}

/**
 * Background evidence uploads: the artifact id is known after the (fast) presign, so events can
 * reference it while the transfer runs; `ready` and `drain` wait for transfers where it matters
 * (a vision call on that screenshot, the session finish).
 */
export class EvidenceUploader {
  private readonly pending = new Map<string, Promise<void>>();
  failures = 0;

  constructor(
    private readonly api: UploadApi,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly log: (message: string) => void = console.warn,
  ) {}

  async start(filePath: string, kind: EvidenceKind, stepIndex?: number): Promise<string> {
    const { bytes, presigned } = await prepare(this.api, filePath, kind, stepIndex);
    const id = presigned.artifactId;
    const job = transfer(this.api, bytes, presigned, this.fetchImpl)
      .catch((error: unknown) => {
        this.failures += 1;
        this.log(`evidence upload ${id} failed: ${(error as Error).message}`);
      })
      .finally(() => this.pending.delete(id));
    this.pending.set(id, job);
    return id;
  }

  /** Resolves once this artifact's transfer has finished (or failed). */
  ready(artifactId: string): Promise<void> {
    return this.pending.get(artifactId) ?? Promise.resolve();
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending.values()]);
  }
}
