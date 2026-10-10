// State graph and memory (docs/03 §3.2): screen-state fingerprints, visits, transitions and
// loop detection. A fingerprint ignores field values, clock-like digits and long body text so a
// typed name or a changing list row does not create a "new screen".

import { createHash } from "node:crypto";
import type { UiElement } from "@tapscout/shared";

const STRUCTURAL = new Set(["button", "text_field", "switch", "checkbox", "link", "tab", "dialog"]);

function norm(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 60);
}

export interface FingerprintInput {
  elements: UiElement[];
  keyboardVisible: boolean;
  dialogVisible: boolean;
  topPackage?: string;
}

/** Stable id of a screen state: structure and headings, not content. */
export function fingerprint(screen: FingerprintInput): string {
  const parts = new Set<string>();
  for (const e of screen.elements) {
    if (STRUCTURAL.has(e.role)) parts.add(`${e.role}:${e.stableId ?? norm(e.label ?? e.text)}`);
  }
  // The top few short texts are usually the title and section headings.
  const headings = screen.elements
    .filter((e) => e.role === "text" && (e.text ?? e.label ?? "").length <= 40)
    .sort((a, b) => a.bounds.y - b.bounds.y)
    .slice(0, 3)
    .map((e) => `h:${norm(e.text ?? e.label)}`);
  const key = [
    screen.topPackage ?? "",
    screen.keyboardVisible ? "kb" : "",
    screen.dialogVisible ? "dlg" : "",
    ...[...parts].sort(),
    ...headings,
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export interface ScreenState {
  id: string;
  fingerprint: string;
  label: string;
  visits: number;
  firstSeenStep: number;
  /** actionKey → how often it was tried here and where it led. */
  tried: Map<string, { count: number; summary: string; results: string[] }>;
}

export interface HistoryEntry {
  step: number;
  fromLabel: string;
  summary: string;
  result: string;
}

export class StateGraph {
  private readonly states = new Map<string, ScreenState>();
  private readonly recentPairs: string[] = [];
  readonly history: HistoryEntry[] = [];
  transitions = 0;

  constructor(private readonly loopRepeats = 3) {}

  get size(): number {
    return this.states.size;
  }

  get(fp: string): ScreenState | undefined {
    return this.states.get(fp);
  }

  /** Records a visit; returns the state and whether it was seen for the first time. */
  visit(fp: string, label: string, step: number): { state: ScreenState; isNew: boolean } {
    const existing = this.states.get(fp);
    if (existing) {
      existing.visits += 1;
      return { state: existing, isNew: false };
    }
    const state: ScreenState = {
      id: `state-${this.states.size + 1}`,
      fingerprint: fp,
      label: label || `Screen ${this.states.size + 1}`,
      visits: 1,
      firstSeenStep: step,
      tried: new Map(),
    };
    this.states.set(fp, state);
    return { state, isNew: true };
  }

  /** Links an executed action to the state it produced. */
  record(fromFp: string, actionKey: string, summary: string, toFp: string | null, step: number) {
    const from = this.states.get(fromFp);
    const to = toFp ? this.states.get(toFp) : undefined;
    const result =
      toFp === null
        ? "left the app"
        : toFp === fromFp
          ? "same screen"
          : to && from && to.label === from.label
            ? "updated this screen"
            : `opened ${JSON.stringify(to?.label ?? "a new screen")}`;
    if (from) {
      const entry = from.tried.get(actionKey) ?? { count: 0, summary, results: [] };
      entry.count += 1;
      entry.results.push(result);
      from.tried.set(actionKey, entry);
    }
    if (toFp && toFp !== fromFp) this.transitions += 1;
    this.history.push({ step, fromLabel: from?.label ?? "?", summary, result });
    this.recentPairs.push(`${fromFp}|${actionKey}`);
    if (this.recentPairs.length > 12) this.recentPairs.shift();
  }

  /** True when the same action has been taken from the same state `loopRepeats` times recently. */
  isLooping(fp: string, actionKey: string): boolean {
    const pair = `${fp}|${actionKey}`;
    return this.recentPairs.filter((p) => p === pair).length >= this.loopRepeats;
  }

  /** True when the last `n` recorded actions all stayed on the same screen. */
  stuckFor(n: number): boolean {
    const tail = this.history.slice(-n);
    return tail.length === n && tail.every((h) => h.result === "same screen");
  }

  visited(): ScreenState[] {
    return [...this.states.values()];
  }
}

/** Identity of an action for loop detection: type + target identity, never the observation ref. */
export function actionKey(type: string, target?: UiElement, extra = ""): string {
  const who = target ? (target.stableId ?? norm(target.label ?? target.text) ?? "") : "";
  return `${type}:${who}${extra ? `:${extra}` : ""}`;
}
