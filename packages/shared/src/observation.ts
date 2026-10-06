import { z } from "zod";
import { Bounds, Id, Timestamp } from "./common.js";

/** Normalised role, so the planner sees one vocabulary on both platforms. */
export const ElementRole = z.enum([
  "button",
  "text",
  "text_field",
  "image",
  "switch",
  "checkbox",
  "link",
  "tab",
  "list",
  "cell",
  "scroll_view",
  "dialog",
  "keyboard",
  "web_view",
  "other",
]);
export type ElementRole = z.infer<typeof ElementRole>;

/**
 * One UI element of a single observation. `ref` is only valid inside that observation
 * (docs/03 §3.1); persistent locators are re-resolved at runtime.
 */
export const UiElement = z.object({
  ref: z.string().regex(/^el-\d+$/),
  parentRef: z.string().optional(),
  role: ElementRole,
  platformClass: z.string(),
  label: z.string().max(500).optional(),
  text: z.string().max(500).optional(),
  /** Android resource-id or iOS accessibility identifier, when present. */
  stableId: z.string().max(300).optional(),
  bounds: Bounds,
  visible: z.boolean(),
  enabled: z.boolean(),
  focused: z.boolean().default(false),
  clickable: z.boolean().default(false),
  checked: z.boolean().optional(),
  /** True when the value was replaced because the field is (or looks like) a secret. */
  masked: z.boolean().default(false),
});
export type UiElement = z.infer<typeof UiElement>;

export const ScreenGeometry = z.object({
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  /** Screenshot pixels per dp (Android) or pt (iOS). */
  scale: z.number().positive(),
  /** Regions hidden before any VLM call or live sharing because a secret could be visible. */
  redactedRegions: z.array(Bounds).default([]),
});
export type ScreenGeometry = z.infer<typeof ScreenGeometry>;

export const ObservedConditions = z.object({
  orientation: z.enum(["portrait", "landscape"]),
  keyboardVisible: z.boolean(),
  dialogVisible: z.boolean(),
  appearance: z.enum(["light", "dark", "unknown"]),
  fontScale: z.number().positive().optional(),
  /** Only set when the network state of the app under test was actually verified. */
  network: z.enum(["baseline", "offline_verified", "unknown"]).default("baseline"),
});
export type ObservedConditions = z.infer<typeof ObservedConditions>;

export const ObservationQuality = z.object({
  hierarchyTruncated: z.boolean(),
  captureSkewMs: z.number().int().nonnegative(),
  stable: z.boolean(),
  missing: z.array(z.enum(["screenshot", "hierarchy", "app_state"])).default([]),
});
export type ObservationQuality = z.infer<typeof ObservationQuality>;

export const Observation = z.object({
  observationId: Id,
  runId: Id,
  sessionId: Id,
  attemptId: Id,
  stepIndex: z.number().int().nonnegative(),
  capturedAt: Timestamp,
  app: z.object({
    appId: z.string(),
    foreground: z.boolean(),
    processAlive: z.boolean(),
    activity: z.string().optional(),
  }),
  screenshotArtifactId: Id.optional(),
  screen: ScreenGeometry,
  elements: z.array(UiElement),
  conditions: ObservedConditions,
  quality: ObservationQuality,
});
export type Observation = z.infer<typeof Observation>;
