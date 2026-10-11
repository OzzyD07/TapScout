// In-app interruptions (docs/07 A1): what's-new and announcement dialogs, onboarding pages,
// terms and cookie consent shown right after launch. They are answered without the planner so
// its budget goes to the app itself (benchmark run 0b8ca5e6 spent 9 actions on two dialogs and
// tapped links that left the app). Pure: decides from one observation.

import type { UiElement } from "@tapscout/shared";
import type { NormalizedScreen } from "./observer.js";

export type InAppInterruptionKind = "dialog" | "onboarding" | "consent";

export interface InAppInterruption {
  kind: InAppInterruptionKind;
  target: UiElement;
  /** The button's visible name. */
  label: string;
}

/** A screen with more controls than this is an app screen, not an interruption. */
const MAX_CONTROLS = 6;

/** Answers in order of preference; each list is tried before the next. */
const ANSWERS: { kind: InAppInterruptionKind; pattern: RegExp }[] = [
  // Consent: the most privacy-preserving choice first (decline non-essential cookies).
  {
    kind: "consent",
    pattern:
      /^(reject all|reject|decline( all)?|only necessary|necessary only|use necessary cookies only|refuse)$/i,
  },
  { kind: "onboarding", pattern: /^skip( (intro|tutorial|for now))?$/i },
  {
    kind: "dialog",
    pattern:
      /^(ok|okay|done|got it|close|dismiss|not now|later|maybe later|remind me later|no thanks|no, thanks|cancel)$/i,
  },
  { kind: "consent", pattern: /^(i agree|agree|accept|accept all|allow|continue)$/i },
  { kind: "onboarding", pattern: /^(get started|start|let's go|let’s go|next|continue)$/i },
];

/** Roles that count as controls of a screen. */
const CONTROLS = new Set(["button", "link", "switch", "checkbox", "tab", "cell"]);

function nameOf(e: UiElement): string {
  return (e.label ?? e.text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The button that clears an in-app interruption, or null when this looks like an ordinary app
 * screen: a screen with text fields (a form or a sign-in) is never treated as one, nor is a
 * screen with many controls. `tried` holds the labels already tapped on this screen state, so a
 * button that did not clear it is not tapped again.
 */
export function inAppInterruption(
  screen: NormalizedScreen,
  tried: ReadonlySet<string> = new Set(),
): InAppInterruption | null {
  if (screen.keyboardVisible) return null;
  const visible = screen.elements.filter((e) => e.visible && e.enabled);
  if (visible.some((e) => e.role === "text_field")) return null;
  const controls = visible.filter((e) => CONTROLS.has(e.role));
  if (controls.length === 0 || controls.length > MAX_CONTROLS) return null;
  for (const answer of ANSWERS) {
    const hit = controls.find((e) => {
      const name = nameOf(e);
      return name && !tried.has(name) && answer.pattern.test(name);
    });
    if (hit) return { kind: answer.kind, target: hit, label: nameOf(hit) };
  }
  return null;
}
