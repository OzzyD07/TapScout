import { z } from "zod";

/** Version of every contract in this package. Bump on any breaking change. */
export const SCHEMA_VERSION = "1" as const;

export const Platform = z.enum(["android", "ios"]);
export type Platform = z.infer<typeof Platform>;

/** The five combinable test modes (docs/01 §3). */
export const TestMode = z.enum([
  "functional",
  "stress",
  "ui_ux",
  "accessibility",
  "store_readiness",
]);
export type TestMode = z.infer<typeof TestMode>;

/** Overall run status (docs/01 §7). `queued` covers the time before any session starts. */
export const RunStatus = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "cancelled",
  "infrastructure_failed",
]);
export type RunStatus = z.infer<typeof RunStatus>;

/** Per-platform session phase (docs/01 §7). The last five are terminal. */
export const SessionPhase = z.enum([
  "queued",
  "preparing",
  "exploring",
  "testing",
  "reproducing",
  "reporting",
  "completed",
  "cancelled",
  "blocked",
  "infrastructure_failed",
]);
export type SessionPhase = z.infer<typeof SessionPhase>;

export const TERMINAL_SESSION_PHASES = [
  "completed",
  "cancelled",
  "blocked",
  "infrastructure_failed",
] as const satisfies readonly SessionPhase[];

export function isTerminalSessionPhase(phase: SessionPhase): boolean {
  return (TERMINAL_SESSION_PHASES as readonly SessionPhase[]).includes(phase);
}

/** Result of a single check. `unsupported` is an environment fact, not an app bug. */
export const CheckStatus = z.enum([
  "passed_within_scope",
  "failed",
  "inconclusive",
  "not_tested",
  "unsupported",
]);
export type CheckStatus = z.infer<typeof CheckStatus>;

/** Store Readiness uses its own vocabulary (docs/03 §6.5). */
export const StoreCheckStatus = z.enum([
  "evidence_found",
  "potential_risk",
  "needs_additional_information",
  "not_applicable",
  "not_assessed",
]);
export type StoreCheckStatus = z.infer<typeof StoreCheckStatus>;

export const FindingVerification = z.enum([
  "observed",
  "reproduced",
  "potential_issue",
  "manual_review_required",
]);
export type FindingVerification = z.infer<typeof FindingVerification>;

/** Why a session stopped (docs/03 §9). */
export const StopReason = z.enum([
  "goals_exhausted",
  "budget_exhausted",
  "access_blocked",
  "unsupported",
  "cancelled",
  "infrastructure_failed",
]);
export type StopReason = z.infer<typeof StopReason>;

/** What the expected behaviour is based on (docs/03 §6.1). */
export const ExpectationBasis = z.enum([
  "developer_contract",
  "observed_invariant",
  "runtime_signal",
  "platform_rule",
  "ui_semantics",
  "heuristic",
]);
export type ExpectationBasis = z.infer<typeof ExpectationBasis>;

/** How a finding's evidence was produced: measurement, AI estimate and taste are kept apart. */
export const EvidenceKind = z.enum([
  "measured",
  "tool_audit",
  "runtime_signal",
  "ai_visual",
  "subjective",
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const Severity = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof Severity>;

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

export const ArtifactKind = z.enum([
  "build",
  "screenshot",
  "hierarchy",
  "log",
  "video",
  "manifest",
  "report",
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

export const ArtifactStatus = z.enum(["pending", "ready", "failed"]);
export type ArtifactStatus = z.infer<typeof ArtifactStatus>;

export const BuildValidationStatus = z.enum([
  "awaiting_upload",
  "uploaded",
  "accepted",
  "rejected",
]);
export type BuildValidationStatus = z.infer<typeof BuildValidationStatus>;

export const OutboxKind = z.enum(["dispatch_run", "dispatch_report", "cancel_run"]);
export type OutboxKind = z.infer<typeof OutboxKind>;

export const OutboxStatus = z.enum(["pending", "claimed", "dispatched", "retry", "terminal"]);
export type OutboxStatus = z.infer<typeof OutboxStatus>;

/** Device/environment capabilities checked by the adapter probe (docs/03 §5.2). */
export const Capability = z.enum([
  "tap",
  "type_text",
  "scroll",
  "screenshot",
  "hierarchy",
  "back",
  "app_lifecycle",
  "rapid_tap",
  "software_keyboard",
  "rotation",
  "permission_dialog",
  "appearance",
  "font_scale",
  "network_toggle",
  "accessibility_audit",
  "crash_log",
]);
export type Capability = z.infer<typeof Capability>;

export const CapabilitySupport = z.enum(["supported", "unsupported", "unknown"]);
export type CapabilitySupport = z.infer<typeof CapabilitySupport>;
