import { z } from "zod";
import { CommandOutcome } from "./actions.js";
import { Id, Timestamp, Uuid } from "./common.js";
import {
  Capability,
  CapabilitySupport,
  CheckStatus,
  FindingVerification,
  SessionPhase,
  Severity,
  StopReason,
  TestMode,
} from "./enums.js";

/** Observable counters. No coverage percentage: the app's total size is unknown (docs/02 §6). */
export const SessionCounters = z.object({
  screensObserved: z.number().int().nonnegative(),
  transitionsObserved: z.number().int().nonnegative(),
  actionsExecuted: z.number().int().nonnegative(),
  checksRun: z.number().int().nonnegative(),
  plannerCalls: z.number().int().nonnegative(),
  visionCalls: z.number().int().nonnegative(),
});
export type SessionCounters = z.infer<typeof SessionCounters>;

const payloads = {
  phase_changed: z.object({
    from: SessionPhase,
    to: SessionPhase,
    reason: z.string().max(300).optional(),
  }),
  capability_probe: z.object({ results: z.partialRecord(Capability, CapabilitySupport) }),
  observation: z.object({
    observationId: Id,
    screenStateId: Id.optional(),
    isNewState: z.boolean(),
    elementCount: z.number().int().nonnegative(),
    screenshotArtifactId: Id.optional(),
  }),
  action_planned: z.object({
    commandId: Id,
    goalId: z.string(),
    summary: z.string().max(200),
    decisionSummary: z.string().max(280),
    source: z.enum(["planner", "deterministic", "replay"]),
  }),
  action_executed: z.object({
    commandId: Id,
    summary: z.string().max(200),
    outcome: CommandOutcome,
    durationMs: z.number().int().nonnegative(),
    screenshotArtifactId: Id.optional(),
    resultSummary: z.string().max(300).optional(),
  }),
  check_result: z.object({
    checkId: z.string(),
    mode: TestMode,
    status: CheckStatus,
    summary: z.string().max(300),
  }),
  finding_candidate: z.object({
    findingId: Id,
    mode: TestMode,
    title: z.string().max(160),
    severity: Severity.optional(),
  }),
  finding_updated: z.object({
    findingId: Id,
    verification: FindingVerification,
    reproductionLabel: z.string().max(120),
  }),
  blocked: z.object({
    kind: z.enum(["access", "infrastructure", "unsupported", "input"]),
    reason: z.string().max(400),
  }),
  counters: SessionCounters,
  stopped: z.object({ reason: StopReason, detail: z.string().max(300).optional() }),
  note: z.object({ level: z.enum(["info", "warn", "error"]), message: z.string().max(500) }),
} as const;

export type RunEventType = keyof typeof payloads;

const base = {
  /** Client-generated id; the server deduplicates retries on it. */
  eventId: Uuid,
  runId: Id,
  sessionId: Id,
  attemptId: Id,
  /** Runner-local monotonic counter, for debugging and ordering inside an attempt. */
  clientSequence: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative().optional(),
  occurredAt: Timestamp,
  phase: SessionPhase,
};

function variant<T extends RunEventType>(type: T) {
  return z.object({ ...base, type: z.literal(type), payload: payloads[type] });
}

/** Event as sent by the runner. */
export const RunEventInput = z.discriminatedUnion("type", [
  variant("phase_changed"),
  variant("capability_probe"),
  variant("observation"),
  variant("action_planned"),
  variant("action_executed"),
  variant("check_result"),
  variant("finding_candidate"),
  variant("finding_updated"),
  variant("blocked"),
  variant("counters"),
  variant("stopped"),
  variant("note"),
]);
export type RunEventInput = z.infer<typeof RunEventInput>;

/**
 * Event as stored and read by the browser. `sequence` is assigned by the database per
 * session and is the reconnect cursor: read history with `sequence > lastSeen`,
 * then deduplicate realtime deliveries by `eventId`.
 */
export type RunEvent = RunEventInput & { sequence: number; receivedAt: string };

export const RUN_EVENT_BATCH_MAX = 50;
