import { z } from "zod";
import { Bounds, Id, Timestamp, VersionStamp } from "./common.js";
import {
  CheckStatus,
  Confidence,
  EvidenceKind,
  ExpectationBasis,
  FindingVerification,
  Platform,
  Severity,
  StoreCheckStatus,
  TestMode,
} from "./enums.js";

/** Max valid replays and max total replay attempts per finding (docs/03 §7). */
export const REPLAY_LIMITS = { maxValid: 3, maxAttempts: 4 } as const;

export const BlockedAttempt = z.object({
  reason: z.enum(["reset_failed", "access_blocked", "infrastructure", "budget", "cancelled"]),
  detail: z.string().max(300).optional(),
});
export type BlockedAttempt = z.infer<typeof BlockedAttempt>;

/**
 * Reproduction counts. `n/m` = `symptomCount / validAttempts`, counted only over replays
 * after the first observation. Blocked attempts are listed separately and never folded
 * into the denominator (docs/03 §7).
 */
export const Reproduction = z
  .object({
    target: z.number().int().min(0).max(REPLAY_LIMITS.maxValid),
    started: z.number().int().min(0).max(REPLAY_LIMITS.maxAttempts),
    valid: z.number().int().min(0).max(REPLAY_LIMITS.maxValid),
    symptom: z.number().int().min(0),
    blocked: z.array(BlockedAttempt).default([]),
  })
  .refine((r) => r.symptom <= r.valid, { message: "symptom count cannot exceed valid attempts" })
  .refine((r) => r.valid + r.blocked.length <= r.started, {
    message: "valid + blocked attempts cannot exceed started attempts",
  });
export type Reproduction = z.infer<typeof Reproduction>;

const NUMBER_WORDS = ["zero", "one", "two", "three", "four"];

/** Human label, e.g. `Reproduced 1/2; one blocked attempt` or `Observed; reproduction not attempted`. */
export function formatReproduction(r: Reproduction): string {
  const blocked = r.blocked.length;
  const blockedText =
    blocked === 0
      ? ""
      : `; ${NUMBER_WORDS[blocked] ?? blocked} blocked attempt${blocked === 1 ? "" : "s"}`;
  if (r.started === 0) return "Observed; reproduction not attempted";
  if (r.valid === 0) return `Observed; reproduction incomplete${blockedText}`;
  return `Reproduced ${r.symptom}/${r.valid}${blockedText}`;
}

export const ReplayStep = z.object({
  index: z.number().int().nonnegative(),
  /** Semantic description, e.g. "Tap 'Edit profile'". Coordinates alone are never a replay. */
  description: z.string().max(300),
  locator: z.string().max(300).optional(),
  screenshotArtifactId: Id.optional(),
});
export type ReplayStep = z.infer<typeof ReplayStep>;

export const ReplayDefinition = z.object({
  precondition: z.string().max(500),
  resets: z.array(z.enum(["app_process", "device_settings", "local_app_data", "backend_fixture"])),
  path: z.array(ReplayStep),
  perturbation: z.string().max(300).optional(),
  observe: z.string().max(300),
  restore: z.string().max(300).optional(),
});
export type ReplayDefinition = z.infer<typeof ReplayDefinition>;

export const EvidenceRef = z.object({
  artifactId: Id,
  role: z.enum(["before", "after", "symptom", "replay", "log", "audit"]),
  /** Region in that screenshot's pixel space, if the finding points at an element. */
  region: Bounds.optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const Finding = z.object({
  findingId: Id,
  runId: Id,
  sessionId: Id,
  platform: Platform,
  mode: TestMode,
  checkId: z.string().optional(),
  title: z.string().max(160),
  expected: z.string().max(600),
  observed: z.string().max(600),
  expectationBasis: ExpectationBasis,
  evidenceKind: EvidenceKind,
  verification: FindingVerification,
  reproduction: Reproduction,
  confidence: Confidence,
  severity: Severity,
  severityRationale: z.string().max(400),
  workaround: z.string().max(300).optional(),
  conditions: z.array(z.string().max(120)).default([]),
  replay: ReplayDefinition.optional(),
  evidence: z.array(EvidenceRef),
  versions: VersionStamp,
  createdAt: Timestamp,
});
export type Finding = z.infer<typeof Finding>;

export const CheckResult = z.object({
  checkId: z.string(),
  mode: TestMode,
  platform: Platform,
  status: CheckStatus,
  /** Only used by Store Readiness checks. */
  storeStatus: StoreCheckStatus.optional(),
  summary: z.string().max(400),
  /** Which screens/states the result applies to — a pass is only valid for the tested scope. */
  scope: z.string().max(300),
  ruleRef: z.object({ ruleId: z.string(), sourceUrl: z.url(), checkedOn: z.iso.date() }).optional(),
  findingIds: z.array(Id).default([]),
  evidence: z.array(EvidenceRef).default([]),
});
export type CheckResult = z.infer<typeof CheckResult>;
