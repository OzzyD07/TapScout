// Coverage frontier: controls seen on a screen but never tapped there. The agent uses it to reach
// untried parts of the app along observed paths without spending planner calls, and the planner
// sees it so it can head there itself (docs/06 §7: Settings and icon buttons were often missed).

import type { TestMode, UiElement } from "@tapscout/shared";
import { isBackControl } from "./functional.js";
import { actionKey, type StateGraph, type TargetIdentity } from "./state.js";

/** Never tapped without the planner: these can end the session's account or data. */
const DESTRUCTIVE = /\b(delete|remove|erase|reset|sign ?out|log ?out|deactivate|close account)\b/i;
/** Entry points where Store Readiness and Accessibility evidence usually lives. */
const ACCOUNT_HINT = /setting|account|profile|privacy|help|about|preference|gear|menu|more/i;

const nameOf = (e: Pick<UiElement, "label" | "text" | "stableId">) =>
  [e.label, e.text, e.stableId].filter(Boolean).join(" ");

/** A control the agent may tap on its own: not destructive and not a plain back button. */
export function safeToTry(e: UiElement): boolean {
  return !DESTRUCTIVE.test(nameOf(e)) && !isBackControl(e);
}

/**
 * List rows: table cells, and controls whose ids differ only by a trailing index or id
 * (`note-row-0`, `note-row-1`, `item_3f2a91c4`). Null for a control that stands alone.
 */
export function familyOf(e: Pick<UiElement, "role" | "stableId">): string | null {
  if (e.role === "cell") return "cell";
  if (!e.stableId) return null;
  const base = e.stableId.replace(/(?:[-_:.]?(?:\d+|[0-9a-f]{8,}))+$/i, "");
  return base && base !== e.stableId ? `id:${base}` : null;
}

/** Only an id or nothing: what a screen reader would also miss, and often a settings gear. */
export function iconOnly(e: Pick<UiElement, "label" | "text">): boolean {
  return !e.label?.trim() && !e.text?.trim();
}

export interface FrontierControl {
  /** Stable key for "already toured": screen label + tap action key. */
  id: string;
  screenLabel: string;
  identity: TargetIdentity;
  role: string;
  /** Short prompt text, e.g. `"Profile": icon button id=profile-settings`. */
  description: string;
  hops: number;
  score: number;
}

export class ControlLedger {
  private readonly seen = new Map<string, Map<string, { element: UiElement }>>();

  /** Remembers the tappable controls of a named screen (latest copy wins). */
  note(screenLabel: string, controls: UiElement[]) {
    const byKey = this.seen.get(screenLabel) ?? new Map();
    for (const e of controls) if (safeToTry(e)) byKey.set(actionKey("tap", e), { element: e });
    this.seen.set(screenLabel, byKey);
  }

  /**
   * Untried controls on other screens that an observed path reaches, best first: account and
   * settings entry points (strongly when Store Readiness or Accessibility is selected), icon-only
   * buttons, then the nearest.
   */
  frontier(graph: StateGraph, currentLabel: string, modes: TestMode[]): FrontierControl[] {
    const storeOrA11y = modes.includes("store_readiness") || modes.includes("accessibility");
    const out: FrontierControl[] = [];
    for (const [screenLabel, controls] of this.seen) {
      if (screenLabel === currentLabel) continue;
      const path = graph.pathBetween(currentLabel, screenLabel);
      if (!path) continue;
      const tried = new Set(
        graph
          .visited()
          .filter((s) => s.label === screenLabel)
          .flatMap((s) => [...s.tried.keys()]),
      );
      // One list row stands for the others (docs/03 §3.2): a row family is offered once, and not
      // at all after any of its rows was opened.
      const families = new Set(
        [...controls].flatMap(([k, c]) => (tried.has(k) ? [familyOf(c.element) ?? ""] : [])),
      );
      for (const [key, { element: e }] of controls) {
        const family = familyOf(e);
        if (tried.has(key) || (family && families.has(family))) continue;
        if (family) families.add(family);
        const icon = iconOnly(e);
        const hint = ACCOUNT_HINT.test(nameOf(e));
        const what = icon
          ? `icon ${e.role}${e.stableId ? ` id=${e.stableId}` : ""}`
          : `${e.role} ${JSON.stringify(e.label ?? e.text)}`;
        out.push({
          id: `${screenLabel}|${key}`,
          screenLabel,
          identity: { role: e.role, stableId: e.stableId, label: e.label, text: e.text },
          role: e.role,
          description: `${JSON.stringify(screenLabel)}: ${what}`,
          hops: path.length,
          score: (hint ? (storeOrA11y ? 3 : 1) : 0) + (icon ? 2 : 0) - path.length * 0.5,
        });
      }
    }
    return out.sort((a, b) => b.score - a.score || a.hops - b.hops);
  }
}
