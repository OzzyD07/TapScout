import { z } from "zod";
import { DeviceProfile, Id, Sha256, Timestamp, VersionStamp } from "./common.js";
import { Platform, RunStatus, SessionPhase, StopReason, TestMode } from "./enums.js";
import { SessionCounters } from "./events.js";
import { CheckResult, Finding } from "./findings.js";

/** Limits of the screen map one session reports (the rest is left out, never truncated mid-way). */
export const SCREEN_MAP_LIMITS = { screens: 40, edges: 120 } as const;

/**
 * Screens a session reached and the moves it observed between them (docs/07 C2): named screens
 * with their first screenshot, and the taps and backs that led from one to another.
 */
export const ScreenMap = z.object({
  screens: z
    .array(
      z.object({
        label: z.string().max(80),
        visits: z.number().int().positive(),
        firstStep: z.number().int().nonnegative(),
        screenshotArtifactId: Id.optional(),
      }),
    )
    .max(SCREEN_MAP_LIMITS.screens),
  edges: z
    .array(
      z.object({
        from: z.string().max(80),
        to: z.string().max(80),
        type: z.enum(["tap", "back"]),
        /** Name of the tapped control, when it has one. */
        via: z.string().max(80).optional(),
      }),
    )
    .max(SCREEN_MAP_LIMITS.edges),
});
export type ScreenMap = z.infer<typeof ScreenMap>;

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
  screenMap: ScreenMap.optional(),
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
  /** `[F1]`-style labels used in the text → the finding each one points at. */
  findingRefs: z.record(z.string().regex(/^F\d+$/), Id).default({}),
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
