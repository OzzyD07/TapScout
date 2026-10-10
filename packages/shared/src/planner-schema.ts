import { z } from "zod";
import { PlannerOutput } from "./actions.js";

export const ReportSummaryOutput = z.object({
  /** Every finding label the summary mentions; first, so the model commits to them before writing. */
  referencedFindingIds: z.array(z.string()).max(50),
  summary: z.string().max(3000),
});
export type ReportSummaryOutput = z.infer<typeof ReportSummaryOutput>;

/** Server-registered response schemas the relay may request (docs/02 §8: no arbitrary schemas). */
export const RESPONSE_SCHEMAS = {
  planner_output_v1: PlannerOutput,
  report_summary_v1: ReportSummaryOutput,
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
