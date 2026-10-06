import type { TestMode } from "./enums.js";

export interface ModeInfo {
  mode: TestMode;
  label: string;
  description: string;
}

export const MODES: readonly ModeInfo[] = [
  {
    mode: "functional",
    label: "Functional / User Flows",
    description:
      "Discovers normal user flows and checks transitions, form feedback and persistence.",
  },
  {
    mode: "stress",
    label: "Bug / Stress",
    description:
      "Single-variable perturbations: empty/long/emoji input, lifecycle, rapid taps, keyboard.",
  },
  {
    mode: "ui_ux",
    label: "UI / UX",
    description:
      "Occluded actions, clipping, overlap and safe-area candidates, measured where possible.",
  },
  {
    mode: "accessibility",
    label: "Accessibility",
    description: "Labels, touch target candidates, large text and supported platform audits.",
  },
  {
    mode: "store_readiness",
    label: "Store Readiness",
    description: "Dated rule pack checks such as account deletion and privacy policy reachability.",
  },
];

/** `Full Autonomous Test` is a preset that selects every supported mode (docs/01 §3). */
export const FULL_AUTONOMOUS_PRESET: readonly TestMode[] = MODES.map((m) => m.mode);
