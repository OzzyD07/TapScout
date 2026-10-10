import { z } from "zod";
import { PlatformBudget } from "./budget.js";
import { DeviceProfile, Id, Sha256, Timestamp, Uuid } from "./common.js";
import { ArtifactKind, Platform, StopReason, TestMode } from "./enums.js";
import { RUN_EVENT_BATCH_MAX, RunEventInput } from "./events.js";
import { PlatformResult } from "./report.js";

/** Upload limits — V1 proposals, finalised after the pilot (docs/05 §11). */
export const UPLOAD_LIMITS = {
  maxApkBytes: 300 * 1024 * 1024,
  maxZipBytes: 300 * 1024 * 1024,
  maxUnzippedBytes: 1024 * 1024 * 1024,
  /** Supabase signed upload URLs are valid for 2 hours; the provider does not allow changing it. */
  signedUploadUrlSeconds: 2 * 60 * 60,
  /** Signed download URLs for builds and evidence are short-lived and re-issued on demand. */
  signedDownloadUrlSeconds: 15 * 60,
  /** Files above this size use resumable (TUS) upload with the same signed token. */
  resumableThresholdBytes: 6 * 1024 * 1024,
} as const;

/** Private Supabase Storage buckets (docs/02 §6). */
export const STORAGE_BUCKETS = {
  builds: { name: "builds", maxBytes: 300 * 1024 * 1024 },
  evidence: { name: "evidence", maxBytes: 50 * 1024 * 1024 },
} as const;

// ---------- Browser → API ----------

export const CreateBuildUploadRequest = z.object({
  platform: Platform,
  fileName: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  contentType: z.enum(["application/vnd.android.package-archive", "application/zip"]),
  /** The user states which builds belong to the same logical app (docs/01 §2). */
  appName: z.string().min(1).max(100),
});
export type CreateBuildUploadRequest = z.infer<typeof CreateBuildUploadRequest>;

export const CreateBuildUploadResponse = z.object({
  buildId: Id,
  uploadUrl: z.url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: Timestamp,
});
export type CreateBuildUploadResponse = z.infer<typeof CreateBuildUploadResponse>;

export const CreateRunRequest = z
  .object({
    builds: z.object({ android: Id.optional(), ios: Id.optional() }),
    modes: z.array(TestMode).min(1).max(5),
  })
  .refine((r) => r.builds.android || r.builds.ios, {
    message: "select at least one platform build",
  })
  .refine((r) => new Set(r.modes).size === r.modes.length, { message: "duplicate modes" });
export type CreateRunRequest = z.infer<typeof CreateRunRequest>;

export const CreateRunResponse = z.object({
  runId: Id,
  dispatch: z.enum(["dispatched", "pending_retry"]),
});
export type CreateRunResponse = z.infer<typeof CreateRunResponse>;

export const ArtifactUrlResponse = z.object({ url: z.url(), expiresAt: Timestamp });
export type ArtifactUrlResponse = z.infer<typeof ArtifactUrlResponse>;

// ---------- Runner → API (session token, except bootstrap which uses GitHub OIDC) ----------

export const RunnerBootstrapRequest = z.object({
  runId: Id,
  platform: Platform,
});
export type RunnerBootstrapRequest = z.infer<typeof RunnerBootstrapRequest>;

export const RunnerBootstrapResponse = z.object({
  sessionId: Id,
  attemptId: Id,
  leaseVersion: z.number().int().positive(),
  sessionToken: z.string(),
  tokenExpiresAt: Timestamp,
  build: z.object({
    buildId: Id,
    downloadUrl: z.url(),
    fileName: z.string(),
    sizeBytes: z.number().int(),
  }),
  modes: z.array(TestMode),
  budget: PlatformBudget,
  heartbeatIntervalSeconds: z.number().int().positive(),
});
export type RunnerBootstrapResponse = z.infer<typeof RunnerBootstrapResponse>;

/** The lease identity comes from the runner token, never from the body. */
export const HeartbeatRequest = z.object({}).strict();
export const HeartbeatResponse = z.object({
  leaseValid: z.boolean(),
  cancelRequested: z.boolean(),
  /** A fresh token is issued on every valid heartbeat; null once the lease is lost. */
  sessionToken: z.string().nullable(),
  tokenExpiresAt: Timestamp.nullable(),
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponse>;

export const FinishSessionRequest = z.object({
  phase: z.enum(["completed", "blocked", "infrastructure_failed", "cancelled"]),
  stopReason: StopReason,
  result: PlatformResult,
  device: DeviceProfile.optional(),
});
export type FinishSessionRequest = z.infer<typeof FinishSessionRequest>;

export const EventBatchRequest = z.object({
  events: z.array(RunEventInput).min(1).max(RUN_EVENT_BATCH_MAX),
});
export type EventBatchRequest = z.infer<typeof EventBatchRequest>;

export const EventBatchResponse = z.object({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  lastSequence: z.number().int().nonnegative(),
});
export type EventBatchResponse = z.infer<typeof EventBatchResponse>;

export const ArtifactPresignRequest = z.object({
  kind: ArtifactKind.exclude(["build", "report"]),
  contentType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/json",
    "application/xml",
    "text/plain",
    "video/mp4",
  ]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  stepIndex: z.number().int().nonnegative().optional(),
});
export type ArtifactPresignRequest = z.infer<typeof ArtifactPresignRequest>;

export const ArtifactPresignResponse = z.object({
  artifactId: Id,
  objectKey: z.string(),
  uploadUrl: z.url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: Timestamp,
});
export type ArtifactPresignResponse = z.infer<typeof ArtifactPresignResponse>;

export const ArtifactCompleteRequest = z.object({
  artifactId: Id,
  sha256: Sha256,
  sizeBytes: z.number().int().positive(),
});
export type ArtifactCompleteRequest = z.infer<typeof ArtifactCompleteRequest>;

// ---------- Model relay (single model call per request; key stays on the server) ----------

export const ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().max(200_000),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const RelayPlanRequest = z.object({
  purpose: z.enum(["plan", "repair", "report_summary"]),
  messages: z.array(ChatMessage).min(1).max(20),
  /** Name of a server-side registered JSON schema; arbitrary schemas are not accepted. */
  responseSchema: z.enum(["planner_output_v1", "report_summary_v1"]),
  maxOutputTokens: z.number().int().positive().max(4_000),
});
export type RelayPlanRequest = z.infer<typeof RelayPlanRequest>;

export const RelayVisionRequest = z.object({
  /** Only an authorised artifact of the caller's session; no arbitrary URLs (docs/02 §8). */
  artifactId: Uuid,
  prompt: z.string().max(8_000),
  maxOutputTokens: z.number().int().positive().max(2_000),
});
export type RelayVisionRequest = z.infer<typeof RelayVisionRequest>;

export const ModelUsage = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** False when the provider omitted usage; unknown consumption is never counted as zero. */
  reported: z.boolean(),
});
export type ModelUsage = z.infer<typeof ModelUsage>;

export const RelayResponse = z.object({
  model: z.string(),
  content: z.string(),
  usage: ModelUsage,
  latencyMs: z.number().int().nonnegative(),
  budgetRemaining: z.object({
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    requests: z.number().int(),
  }),
});
export type RelayResponse = z.infer<typeof RelayResponse>;

// ---------- Errors ----------

export const ApiError = z.object({
  error: z.object({
    code: z.enum([
      "unauthorized",
      "forbidden",
      "not_found",
      "invalid_request",
      "lease_lost",
      "budget_exhausted",
      "cancelled",
      "conflict",
      "upstream_error",
      "internal",
    ]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
