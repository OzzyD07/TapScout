// Screen map for the report (docs/07 C2): the named screens a session reached, each with one
// screenshot, and the observed taps and backs between them (StateGraph.edges). Several screen
// states can share a name (the same form with the keyboard open); the map shows one node per name.

import { SCREEN_MAP_LIMITS, type ScreenMap } from "@tapscout/shared";
import type { StateGraph, TargetIdentity } from "./state.js";

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Screenshot per screen name, preferring one without the keyboard or a dialog over it. */
export class ScreenShots {
  private readonly shots = new Map<string, { artifactId: string; clean: boolean }>();

  note(label: string, artifactId: string, clean: boolean): void {
    const known = this.shots.get(label);
    if (!known || (clean && !known.clean)) this.shots.set(label, { artifactId, clean });
  }

  get(label: string): string | undefined {
    return this.shots.get(label)?.artifactId;
  }
}

/** The tapped control's name; a text field's text may be a typed value and is never used. */
function controlName(target: TargetIdentity | undefined): string | undefined {
  if (!target) return undefined;
  const name = target.label ?? (target.role === "text_field" ? undefined : target.text);
  return name?.trim() ? clip(name.trim()) : target.stableId ? clip(target.stableId) : undefined;
}

export function buildScreenMap(graph: StateGraph, shots: ScreenShots): ScreenMap {
  const byLabel = new Map<string, ScreenMap["screens"][number]>();
  for (const s of graph.visited()) {
    const label = clip(s.label);
    const known = byLabel.get(label);
    if (known) {
      known.visits += s.visits;
      known.firstStep = Math.min(known.firstStep, s.firstSeenStep);
      continue;
    }
    byLabel.set(label, {
      label,
      visits: s.visits,
      firstStep: s.firstSeenStep,
      screenshotArtifactId: shots.get(s.label),
    });
  }
  // The earliest screens are kept when an app has more than the map holds.
  const screens = [...byLabel.values()]
    .sort((a, b) => a.firstStep - b.firstStep)
    .slice(0, SCREEN_MAP_LIMITS.screens);
  const kept = new Set(screens.map((s) => s.label));
  const edges: ScreenMap["edges"] = [];
  for (const e of graph.edges) {
    const from = clip(e.fromLabel);
    const to = clip(e.toLabel);
    if (!kept.has(from) || !kept.has(to)) continue;
    if (edges.some((x) => x.from === from && x.to === to && x.type === e.type)) continue;
    const via = e.type === "tap" ? controlName(e.target) : undefined;
    edges.push({ from, to, type: e.type, ...(via ? { via } : {}) });
    if (edges.length === SCREEN_MAP_LIMITS.edges) break;
  }
  return { screens, edges };
}
