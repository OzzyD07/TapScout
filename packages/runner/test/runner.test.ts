import type { RunEventInput } from "@tapscout/shared";
import { describe, expect, it, vi } from "vitest";
import { RunnerApi, RunnerApiError } from "../src/api.js";
import { EventSink } from "../src/events.js";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RunnerApi", () => {
  it("retries network failures and 5xx, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(response(503, { error: { code: "upstream_error", message: "busy" } }))
      .mockResolvedValueOnce(response(200, { accepted: 1, duplicates: 0, lastSequence: 1 }));
    const api = new RunnerApi({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      sleep: async () => {},
    });
    api.setToken("t");
    expect(await api.events([])).toEqual({ accepted: 1, duplicates: 0, lastSequence: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a lost lease", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response(409, { error: { code: "lease_lost", message: "stale" } }));
    const api = new RunnerApi({
      baseUrl: "https://api.test",
      fetch: fetchImpl,
      sleep: async () => {},
    });
    api.setToken("t");
    await expect(api.events([])).rejects.toMatchObject({ status: 409, code: "lease_lost" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry an exhausted model budget, and caps relay retries at 2", async () => {
    const exhausted = vi
      .fn()
      .mockResolvedValue(response(429, { error: { code: "budget_exhausted", message: "spent" } }));
    const api = new RunnerApi({
      baseUrl: "https://api.test",
      fetch: exhausted,
      sleep: async () => {},
    });
    api.setToken("t");
    const body = {
      purpose: "plan" as const,
      messages: [{ role: "user" as const, content: "x" }],
      responseSchema: "planner_output_v1" as const,
      maxOutputTokens: 100,
    };
    await expect(api.relayPlan(body)).rejects.toMatchObject({ code: "budget_exhausted" });
    expect(exhausted).toHaveBeenCalledTimes(1);

    const upstream = vi.fn(async () =>
      response(502, { error: { code: "upstream_error", message: "down" } }),
    );
    const api2 = new RunnerApi({
      baseUrl: "https://api.test",
      fetch: upstream,
      sleep: async () => {},
    });
    api2.setToken("t");
    await expect(api2.relayPlan(body)).rejects.toMatchObject({ status: 502 });
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("rotates the session token from heartbeats", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      response(200, {
        leaseValid: true,
        cancelRequested: false,
        sessionToken: "new",
        tokenExpiresAt: null,
      }),
    );
    const api = new RunnerApi({ baseUrl: "https://api.test", fetch: fetchImpl });
    api.setToken("old");
    await api.heartbeat();
    await api.heartbeat();
    const auth = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(auth.authorization).toBe("Bearer new");
  });

  it("is an Error subclass with the API code", () => {
    expect(new RunnerApiError(400, "invalid_request", "x")).toBeInstanceOf(Error);
  });
});

describe("EventSink", () => {
  const ids = { runId: "r", sessionId: "s", attemptId: "a" };

  it("keeps order, sequence and phase, and resends the same eventIds after a failure", async () => {
    const sent: RunEventInput[][] = [];
    let fail = true;
    const sink = new EventSink(
      {
        events: async (batch) => {
          sent.push(batch);
          if (fail) {
            fail = false;
            throw new Error("network");
          }
          return { accepted: batch.length, duplicates: 0, lastSequence: batch.length };
        },
      },
      ids,
    );
    sink.emit({ type: "note", payload: { level: "info", message: "a" } });
    sink.emit({ type: "phase_changed", payload: { from: "preparing", to: "exploring" } });
    sink.emit({ type: "note", payload: { level: "info", message: "b" } });

    await expect(sink.flush()).rejects.toThrow("network");
    expect(sink.pending).toBe(3);
    await sink.flush();
    expect(sink.pending).toBe(0);

    const [first, retry] = sent;
    expect(retry?.map((e) => e.eventId)).toEqual(first?.map((e) => e.eventId));
    expect(retry?.map((e) => e.clientSequence)).toEqual([1, 2, 3]);
    expect(retry?.[2]?.phase).toBe("exploring");
  });
});
