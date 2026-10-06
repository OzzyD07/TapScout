import { z } from "zod";
import { DeviceProfile, Id, Sha256, Timestamp, VersionStamp } from "./common.js";
import { Platform, RunStatus, SessionPhase, StopReason, TestMode } from "./enums.js";
import { SessionCounters } from "./events.js";
import { CheckResult, Finding } from "./findings.js";

export const PlatformResult = z.object({
  platform: Platform,
  sessionId: Id,
  phase: SessionPhase,
  stopReason: StopReason.optional(),
  device: DeviceProfile.optional(),
  build: z.object({
    buildId: Id,
    sha256: Sha256.optional(),
    appId: z.string().optional(),
    version: z.string().optional(),
  }),
  counters: SessionCounters,
  checks: z.array(CheckResult),
  findingIds: z.array(Id),
  /** Access, infrastructure or input blockers that limited this platform's scope. */
  blockers: z.array(z.string().max(400)).default([]),
});
export type PlatformResult = z.infer<typeof PlatformResult>;

/** Similar findings across platforms; verification stays per platform (docs/01 §7). */
export const FindingCorrelation = z.object({
  title: z.string().max(160),
  findingIds: z.array(Id).min(2),
});
export type FindingCorrelation = z.infer<typeof FindingCorrelation>;

export const ReportSummary = z.object({
  text: z.string().max(3000),
  model: z.string(),
  /** True only after every finding/artifact reference in the text was checked against the records. */
  referencesValidated: z.boolean(),
});
export type ReportSummary = z.infer<typeof ReportSummary>;

export const Report = z.object({
  runId: Id,
  reportVersion: z.number().int().positive(),
  generatedAt: Timestamp,
  overallStatus: RunStatus,
  modes: z.array(TestMode).min(1),
  platforms: z.array(PlatformResult),
  findings: z.array(Finding),
  correlations: z.array(FindingCorrelation).default([]),
  /** Null when the model summary failed or the run was cancelled; the report is still complete. */
  summary: ReportSummary.nullable(),
  limitations: z.array(z.string().max(400)),
  versions: VersionStamp,
});
export type Report = z.infer<typeof Report>;
