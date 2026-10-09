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

/**
 * presign → direct PUT to Storage → complete. The API only marks the artifact ready after it
 * confirms the object and its size, so a failed upload never shows up as evidence.
 */
export async function uploadEvidence(
  api: Pick<RunnerApi, "presign" | "complete">,
  filePath: string,
  kind: EvidenceKind,
  stepIndex?: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) throw new Error(`unsupported evidence file type: ${filePath}`);

  const bytes = await readFile(filePath);
  const presigned = await api.presign({ kind, contentType, sizeBytes: bytes.length, stepIndex });
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
  return presigned.artifactId;
}
