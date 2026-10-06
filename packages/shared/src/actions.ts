import { z } from "zod";
import { Bounds, Id } from "./common.js";
import { ExpectationBasis, SCHEMA_VERSION, TestMode } from "./enums.js";

/**
 * Text the planner may ask to type. The model never sees or produces secrets:
 * `credential_ref` names a credential that only the adapter resolves (docs/03 §3.1).
 */
export const TextInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.string().max(200) }),
  z.object({
    kind: z.literal("generator"),
    generator: z.enum([
      "empty",
      "long_text",
      "emoji_unicode",
      "whitespace",
      "numeric",
      "email_like",
    ]),
  }),
  z.object({ kind: z.literal("credential_ref"), key: z.string().max(64) }),
]);
export type TextInput = z.infer<typeof TextInput>;

/**
 * Environment changes are applied only by trusted adapter code with fixed parameters
 * and only when the capability probe passed.
 */
export const EnvironmentChange = z.enum([
  "rotate_landscape",
  "rotate_portrait",
  "appearance_dark",
  "appearance_light",
  "font_scale_large",
  "font_scale_default",
]);
export type EnvironmentChange = z.infer<typeof EnvironmentChange>;

/** The bounded tool set the planner can propose (docs/02 §5, docs/03 §5.3). */
export const ProposedAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tap"), targetRef: z.string() }),
  z.object({
    type: z.literal("type"),
    targetRef: z.string(),
    input: TextInput,
    submit: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("scroll"),
    direction: z.enum(["up", "down", "left", "right"]),
    targetRef: z.string().optional(),
  }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("hide_keyboard") }),
  z.object({ type: z.literal("relaunch"), clearData: z.boolean().default(false) }),
  z.object({ type: z.literal("background"), seconds: z.number().int().min(1).max(30) }),
  z.object({
    type: z.literal("rapid_tap"),
    targetRef: z.string(),
    count: z.number().int().min(2).max(5),
  }),
  z.object({ type: z.literal("environment"), change: EnvironmentChange }),
  z.object({ type: z.literal("wait"), milliseconds: z.number().int().min(100).max(5000) }),
]);
export type ProposedAction = z.infer<typeof ProposedAction>;
export type ActionType = ProposedAction["type"];

export const ExpectedObservation = z.object({
  kind: z.enum([
    "state_change",
    "same_screen_feedback",
    "navigation_back",
    "no_visible_change",
    "app_exit",
  ]),
  basis: ExpectationBasis,
  description: z.string().max(300),
});
export type ExpectedObservation = z.infer<typeof ExpectedObservation>;

export const ProposedGoal = z.object({
  goalId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  kind: z.enum(["explore", "flow", "check", "reproduce"]),
  mode: TestMode.optional(),
  description: z.string().max(200),
});
export type ProposedGoal = z.infer<typeof ProposedGoal>;

/**
 * Planner (Nemotron) output. Always validated locally even when the provider enforces
 * `json_schema`; a schema-valid output can still be a wrong action (docs/03 §5.1).
 */
export const PlannerOutput = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  goalId: z.string(),
  observationId: Id,
  nextAction: ProposedAction,
  expectedObservation: ExpectedObservation,
  /** Short user-visible decision summary. Not chain-of-thought. */
  decisionSummary: z.string().max(280),
  proposedGoals: z.array(ProposedGoal).max(5).default([]),
});
export type PlannerOutput = z.infer<typeof PlannerOutput>;

/** Locator strategies in priority order (docs/03 §5.1). */
export const Locator = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("stable_id"), value: z.string() }),
  z.object({
    strategy: z.literal("semantic"),
    role: z.string(),
    label: z.string().optional(),
    text: z.string().optional(),
    index: z.number().int().nonnegative().default(0),
  }),
  z.object({ strategy: z.literal("coordinate"), bounds: Bounds, verifiedVisually: z.boolean() }),
]);
export type Locator = z.infer<typeof Locator>;

/** A validated, adapter-ready command. Only the validator produces these. */
export const DeviceCommand = z.object({
  commandId: Id,
  observationId: Id,
  action: ProposedAction,
  locator: Locator.optional(),
  source: z.enum(["planner", "deterministic", "replay"]),
  timeoutMs: z.number().int().positive().max(60_000),
});
export type DeviceCommand = z.infer<typeof DeviceCommand>;

export const CommandOutcome = z.enum(["ok", "failed", "timeout", "uncertain", "rejected"]);
export type CommandOutcome = z.infer<typeof CommandOutcome>;

/** One-line, user-facing description of an action for the timeline. */
export function describeAction(action: ProposedAction, targetLabel?: string): string {
  const target = targetLabel ? `"${targetLabel}"` : "element";
  switch (action.type) {
    case "tap":
      return `Tap ${target}`;
    case "type": {
      const what =
        action.input.kind === "literal"
          ? "text"
          : action.input.kind === "generator"
            ? `${action.input.generator.replace(/_/g, " ")} input`
            : "test credential";
      return `Type ${what} into ${target}${action.submit ? " and submit" : ""}`;
    }
    case "scroll":
      return `Scroll ${action.direction}`;
    case "back":
      return "Go back";
    case "hide_keyboard":
      return "Hide keyboard";
    case "relaunch":
      return action.clearData ? "Relaunch app with cleared data" : "Relaunch app";
    case "background":
      return `Send app to background for ${action.seconds}s`;
    case "rapid_tap":
      return `Rapid tap ${target} ×${action.count}`;
    case "environment":
      return `Change environment: ${action.change.replace(/_/g, " ")}`;
    case "wait":
      return `Wait ${action.milliseconds}ms`;
  }
}
