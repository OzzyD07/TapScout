import type { SessionPhase } from "@tapscout/shared";

/** A run event as the browser reads it from the database (snake_case row → camelCase). */
export interface TimelineEvent {
  eventId: string;
  sessionId: string;
  sequence: number;
  type: string;
  phase: string;
  stepIndex: number | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface RunEventRow {
  event_id: string;
  session_id: string;
  sequence: number;
  type: string;
  phase: string;
  step_index: number | null;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export function fromRow(row: RunEventRow): TimelineEvent {
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    sequence: Number(row.sequence),
    type: row.type,
    phase: row.phase,
    stepIndex: row.step_index,
    occurredAt: row.occurred_at,
    payload: row.payload ?? {},
  };
}

/**
 * Realtime deliveries and history reads overlap after a reconnect; events are deduplicated by
 * eventId and ordered by the database sequence per session (docs/02 §6).
 */
export function mergeEvents(current: TimelineEvent[], incoming: TimelineEvent[]): TimelineEvent[] {
  const byId = new Map(current.map((e) => [e.eventId, e]));
  for (const e of incoming) byId.set(e.eventId, e);
  return [...byId.values()].sort(
    (a, b) => a.sessionId.localeCompare(b.sessionId) || a.sequence - b.sequence,
  );
}

export type Tone = "neutral" | "info" | "ok" | "warn" | "danger";

export interface DescribedEvent {
  title: string;
  detail?: string;
  tone: Tone;
  screenshotArtifactId?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function describeEvent(e: TimelineEvent): DescribedEvent | null {
  const p = e.payload;
  switch (e.type) {
    case "phase_changed":
      return {
        title: `Phase: ${phaseLabel(str(p.to) as SessionPhase)}`,
        detail: str(p.reason),
        tone: "info",
      };
    case "observation":
      return {
        title: p.isNewState ? "Observed a new screen" : "Observed the screen",
        tone: "neutral",
        screenshotArtifactId: str(p.screenshotArtifactId),
      };
    case "action_planned":
      return {
        title: `Plan: ${str(p.summary) ?? "next action"}`,
        detail: str(p.decisionSummary),
        tone: "info",
      };
    case "action_executed": {
      const outcome = str(p.outcome);
      return {
        title: `${str(p.summary) ?? "Action"} — ${outcome ?? "done"}`,
        detail: str(p.resultSummary),
        tone: outcome === "ok" ? "ok" : outcome === "uncertain" ? "warn" : "danger",
        screenshotArtifactId: str(p.screenshotArtifactId),
      };
    }
    case "check_result":
      return {
        title: `Check ${str(p.checkId)}: ${str(p.status)}`,
        detail: str(p.summary),
        tone: "info",
      };
    case "finding_candidate":
      return { title: `Finding candidate: ${str(p.title)}`, tone: "warn" };
    case "finding_updated":
      return {
        title: `Finding ${str(p.verification)}`,
        detail: str(p.reproductionLabel),
        tone: "warn",
      };
    case "blocked":
      return { title: `Blocked (${str(p.kind)})`, detail: str(p.reason), tone: "danger" };
    case "stopped":
      return {
        title: `Stopped: ${(str(p.reason) ?? "").replace(/_/g, " ")}`,
        detail: str(p.detail),
        tone: "neutral",
      };
    case "note":
      return {
        title: str(p.message) ?? "Note",
        tone: p.level === "error" ? "danger" : p.level === "warn" ? "warn" : "neutral",
      };
    case "counters":
    case "capability_probe":
      return null; // Shown as session state, not as timeline rows.
    default:
      return { title: e.type, tone: "neutral" };
  }
}

const PHASE_LABELS: Record<SessionPhase, string> = {
  queued: "Queued",
  preparing: "Preparing",
  exploring: "Exploring",
  testing: "Testing",
  reproducing: "Reproducing",
  reporting: "Reporting",
  completed: "Completed",
  cancelled: "Cancelled",
  blocked: "Blocked",
  infrastructure_failed: "Infrastructure failed",
};

export function phaseLabel(phase: SessionPhase | string | undefined): string {
  return PHASE_LABELS[phase as SessionPhase] ?? String(phase ?? "unknown");
}

export function phaseTone(phase: string): Tone {
  if (phase === "completed") return "ok";
  if (phase === "cancelled" || phase === "queued") return "neutral";
  if (phase === "blocked") return "warn";
  if (phase === "infrastructure_failed") return "danger";
  return "info";
}

export function runStatusLabel(status: string, cancelRequested: boolean): string {
  if (cancelRequested && (status === "queued" || status === "running")) return "Cancelling";
  return (
    {
      queued: "Queued",
      running: "Running",
      completed: "Completed",
      partial: "Partial",
      cancelled: "Cancelled",
      infrastructure_failed: "Infrastructure failed",
    }[status] ?? status
  );
}

/** Latest screenshot for a session, for the large device preview. */
export function latestScreenshot(events: TimelineEvent[], sessionId: string): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e?.sessionId !== sessionId) continue;
    const id = describeEvent(e)?.screenshotArtifactId;
    if (id) return id;
  }
  return undefined;
}
