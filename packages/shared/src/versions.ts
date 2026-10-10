import type { VersionStamp } from "./common.js";

/** Identities stamped on every run, report and finding; bump when behaviour changes. */
export const AGENT_VERSION = "agent-2026-10-10.f2";
export const PROMPT_VERSION = "planner-2026-10-10.v2";
export const CHECK_PACK_VERSION = "functional-2026-10-10.v1";
export const RULE_PACK_VERSION = "none";
export const DEFAULT_PLANNER_MODEL = "nvidia/Nemotron-3_5-Lightning";

export function runVersionStamp(
  budgetVersion: string,
  plannerModel = DEFAULT_PLANNER_MODEL,
): VersionStamp {
  return {
    agent: AGENT_VERSION,
    prompt: PROMPT_VERSION,
    checkPack: CHECK_PACK_VERSION,
    rulePack: RULE_PACK_VERSION,
    budget: budgetVersion,
    plannerModel,
  };
}
