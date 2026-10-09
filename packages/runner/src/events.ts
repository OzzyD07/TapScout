import { randomUUID } from "node:crypto";
import { RUN_EVENT_BATCH_MAX, type RunEventInput, type SessionPhase } from "@tapscout/shared";
import type { RunnerApi } from "./api.js";

type EventBody = Pick<RunEventInput, "type" | "payload"> & { stepIndex?: number };

export interface SessionIds {
  runId: string;
  sessionId: string;
  attemptId: string;
}

/**
 * Buffers events and sends them in order. Each event keeps its eventId across retries, so a
 * resend after a network failure is deduplicated by the database instead of duplicated.
 */
export class EventSink {
  private queue: RunEventInput[] = [];
  private clientSequence = 0;
  private flushing: Promise<void> = Promise.resolve();
  phase: SessionPhase = "preparing";

  constructor(
    private readonly api: Pick<RunnerApi, "events">,
    private readonly ids: SessionIds,
  ) {}

  emit(event: EventBody): RunEventInput {
    this.clientSequence += 1;
    const full = {
      eventId: randomUUID(),
      ...this.ids,
      clientSequence: this.clientSequence,
      occurredAt: new Date().toISOString(),
      phase: this.phase,
      ...event,
    } as RunEventInput;
    this.queue.push(full);
    if (event.type === "phase_changed") this.phase = (event.payload as { to: SessionPhase }).to;
    return full;
  }

  /**
   * Sends everything queued so far; concurrent calls are serialised to keep order. A failed flush
   * leaves the events queued and does not poison later flushes.
   */
  flush(): Promise<void> {
    this.flushing = this.flushing
      .catch(() => undefined)
      .then(async () => {
        while (this.queue.length > 0) {
          const batch = this.queue.slice(0, RUN_EVENT_BATCH_MAX);
          await this.api.events(batch);
          this.queue.splice(0, batch.length);
        }
      });
    return this.flushing;
  }

  get pending(): number {
    return this.queue.length;
  }
}
