import { z } from "zod";

/** Per-platform budget. Selected modes share it; it is never multiplied by mode count (docs/03 §9). */
export const PlatformBudget = z.object({
  budgetVersion: z.string(),
  hardTimeoutMinutes: z.number().int().positive(),
  qaSoftStopMinute: z.number().int().positive(),
  preparationMaxMinutes: z.number().int().positive(),
  maxDeviceActions: z.number().int().positive(),
  maxPlannerRequests: z.number().int().positive(),
  maxVisionRequests: z.number().int().nonnegative(),
  maxRepairsPerDecision: z.number().int().nonnegative(),
  maxTransientRetries: z.number().int().nonnegative(),
  maxInconclusiveAttemptsPerTarget: z.number().int().positive(),
  loopDetectionRepeats: z.number().int().positive(),
  tokens: z.object({
    plannerInput: z.number().int().positive(),
    plannerOutput: z.number().int().positive(),
    visionInput: z.number().int().nonnegative(),
    visionOutput: z.number().int().nonnegative(),
  }),
  /** Share of QA time: exploration / selected checks / replay / recovery. */
  timeSplit: z.object({
    explore: z.number(),
    checks: z.number(),
    replay: z.number(),
    recovery: z.number(),
  }),
});
export type PlatformBudget = z.infer<typeof PlatformBudget>;

export const ReportBudget = z.object({
  plannedMinutes: z.number().int().positive(),
  hardTimeoutMinutes: z.number().int().positive(),
  summaryInputTokens: z.number().int().positive(),
  summaryOutputTokens: z.number().int().positive(),
});
export type ReportBudget = z.infer<typeof ReportBudget>;

/** Pilot defaults from docs/03 §9 — proposals to be measured, not guarantees. */
export const DEFAULT_PLATFORM_BUDGET: PlatformBudget = {
  budgetVersion: "2026-10-06.v1",
  hardTimeoutMinutes: 20,
  qaSoftStopMinute: 17,
  preparationMaxMinutes: 5,
  maxDeviceActions: 120,
  maxPlannerRequests: 30,
  maxVisionRequests: 30,
  maxRepairsPerDecision: 1,
  maxTransientRetries: 2,
  maxInconclusiveAttemptsPerTarget: 2,
  loopDetectionRepeats: 3,
  tokens: { plannerInput: 90_000, plannerOutput: 13_000, visionInput: 75_000, visionOutput: 9_000 },
  timeSplit: { explore: 0.35, checks: 0.35, replay: 0.2, recovery: 0.1 },
};

export const DEFAULT_REPORT_BUDGET: ReportBudget = {
  plannedMinutes: 3,
  hardTimeoutMinutes: 5,
  summaryInputTokens: 20_000,
  summaryOutputTokens: 4_000,
};
