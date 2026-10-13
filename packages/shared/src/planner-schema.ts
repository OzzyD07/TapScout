import { z } from "zod";
import { PlannerOutput } from "./actions.js";

export const ReportSummaryOutput = z.object({
  /** Every finding label the summary mentions; first, so the model commits to them before writing. */
  referencedFindingIds: z.array(z.string()).max(50),
  summary: z.string().max(3000),
});
export type ReportSummaryOutput = z.infer<typeof ReportSummaryOutput>;

/** One review per finding id of the request (docs/07 B11). */
export const FindingTriageOutput = z.object({
  items: z
    .array(
      z.object({
        id: z.string().max(10),
        /** First, so the verdict follows from the stated evidence. */
        reason: z.string().max(300),
        verdict: z.enum(["likely_true", "likely_false", "needs_review"]),
      }),
    )
    .max(20),
});
export type FindingTriageOutput = z.infer<typeof FindingTriageOutput>;

/** App-level test plan (docs/07 B11-2): what the app is and the goals a tester would cover. */
export const TestPlanOutput = z.object({
  appType: z.string().max(80),
  goals: z
    .array(
      z.object({
        goalId: z.string().max(42),
        description: z.string().max(200),
        targets: z.array(z.string().max(60)).max(4),
      }),
    )
    .max(6),
});
export type TestPlanOutput = z.infer<typeof TestPlanOutput>;

/** Server-registered response schemas the relay may request (docs/02 §8: no arbitrary schemas). */
export const RESPONSE_SCHEMAS = {
  planner_output_v1: PlannerOutput,
  report_summary_v1: ReportSummaryOutput,
  finding_triage_v1: FindingTriageOutput,
  test_plan_v1: TestPlanOutput,
} as const;
export type ResponseSchemaName = keyof typeof RESPONSE_SCHEMAS;

/**
 * JSON Schema for the provider's `response_format: json_schema`. Uses the input shape so
 * fields with defaults stay optional for the model. Local Zod validation is always applied.
 */
export function responseJsonSchema(name: ResponseSchemaName): Record<string, unknown> {
  return z.toJSONSchema(RESPONSE_SCHEMAS[name], { io: "input", target: "draft-7" }) as Record<
    string,
    unknown
  >;
}
