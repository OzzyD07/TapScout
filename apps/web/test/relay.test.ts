import { describe, expect, it, vi } from "vitest";
import { createTokenFactoryChat, stripThinking } from "../src/lib/relay/provider";
import { type RelayDeps, relayPlan, relayVision } from "../src/lib/relay/service";
import { issueRunnerToken } from "../src/lib/runner/token";

const signingKey = "k".repeat(48);
const device = {
  kind: "device" as const,
  runId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  attemptId: "33333333-3333-4333-8333-333333333333",
  leaseVersion: 1,
};
const report = {
  kind: "report" as const,
  runId: device.runId,
  reportAttemptId: "44444444-4444-4444-8444-444444444444",
  leaseVersion: 1,
};
const artifactId = "55555555-5555-4555-8555-555555555555";

function deps(overrides: Partial<RelayDeps> = {}): RelayDeps {
  return {
    signingKey,
    models: { planner: "nvidia/Nemotron-3_5-Lightning", vision: "openbmb/MiniCPM-V-4_5" },
    chat: vi.fn(async () => ({
      ok: true as const,
      content: '{"ok":true}',
      usage: { inputTokens: 900, outputTokens: 120 },
      latencyMs: 800,
    })),
    rpc: vi.fn(async (fn: string) =>
      fn === "reserve_model_budget"
        ? { data: "66666666-6666-4666-8666-666666666666", error: null }
        : {
            data: [{ remaining_input: 89_100, remaining_output: 12_880, remaining_requests: 29 }],
            error: null,
          },
    ),
    deviceLeaseIsCurrent: vi.fn(async () => true),
    reportLeaseIsCurrent: vi.fn(async () => true),
    loadScreenshot: vi.fn(async () => ({
      bytes: new Uint8Array([137, 80]),
      contentType: "image/png",
    })),
    recordUsage: vi.fn(async () => {}),
    ...overrides,
  };
}

const planBody = {
  purpose: "plan",
  messages: [
    { role: "system", content: "rules" },
    { role: "user", content: "observation" },
  ],
  responseSchema: "planner_output_v1",
  maxOutputTokens: 600,
};

const tokenFor = async (scope: typeof device | typeof report) =>
  (await issueRunnerToken(scope, signingKey)).token;

describe("relayPlan", () => {
  it("reserves, calls Nemotron with the registered schema and thinking off, then settles", async () => {
    const d = deps();
    const res = await relayPlan(d, await tokenFor(device), planBody);

    expect(res.content).toBe('{"ok":true}');
    expect(res.usage).toEqual({ inputTokens: 900, outputTokens: 120, reported: true });
    expect(res.budgetRemaining).toEqual({
      inputTokens: 89_100,
      outputTokens: 12_880,
      requests: 29,
    });

    const rpc = vi.mocked(d.rpc);
    expect(rpc.mock.calls[0]?.[0]).toBe("reserve_model_budget");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_session_id: device.sessionId,
      p_report_attempt_id: null,
      p_role: "planner",
      p_output: 600,
    });
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_input: 900, p_output: 120, p_reported: true });

    const request = vi.mocked(d.chat).mock.calls[0]?.[0];
    expect(request?.model).toBe("nvidia/Nemotron-3_5-Lightning");
    expect(request?.disableThinking).toBe(true);
    expect(request?.jsonSchema?.name).toBe("planner_output_v1");
    expect(d.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "plan", usageReported: true, inputTokens: 900 }),
    );
  });

  it("refuses a caller after the lease was lost, before any model call", async () => {
    const d = deps({ deviceLeaseIsCurrent: vi.fn(async () => false) });
    await expect(relayPlan(d, await tokenFor(device), planBody)).rejects.toMatchObject({
      status: 409,
      code: "lease_lost",
    });
    expect(d.rpc).not.toHaveBeenCalled();
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("maps an exhausted budget to 429 and does not call the provider", async () => {
    const d = deps({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "AQ005", message: "planner budget exhausted" },
      })),
    });
    await expect(relayPlan(d, await tokenFor(device), planBody)).rejects.toMatchObject({
      status: 429,
      code: "budget_exhausted",
    });
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("charges the full reservation when the provider timed out without usage", async () => {
    const d = deps({
      chat: vi.fn(async () => ({
        ok: false as const,
        status: null,
        mayHaveConsumed: true,
        message: "model request timed out",
        latencyMs: 45_000,
      })),
    });
    await expect(relayPlan(d, await tokenFor(device), planBody)).rejects.toMatchObject({
      status: 504,
      code: "upstream_error",
    });
    expect(vi.mocked(d.rpc).mock.calls[1]?.[1]).toMatchObject({ p_reported: false });
    expect(d.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ usageReported: false, inputTokens: null }),
    );
  });

  it("releases the reservation when the provider rejected the request (4xx)", async () => {
    const d = deps({
      chat: vi.fn(async () => ({
        ok: false as const,
        status: 400,
        mayHaveConsumed: false,
        message: "provider HTTP 400",
        latencyMs: 100,
      })),
    });
    await expect(relayPlan(d, await tokenFor(device), planBody)).rejects.toMatchObject({
      status: 502,
    });
    expect(vi.mocked(d.rpc).mock.calls[1]?.[1]).toMatchObject({
      p_input: 0,
      p_output: 0,
      p_reported: true,
    });
  });

  it("keeps device and report purposes apart", async () => {
    await expect(
      relayPlan(deps(), await tokenFor(device), {
        ...planBody,
        purpose: "report_summary",
        responseSchema: "report_summary_v1",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(relayPlan(deps(), await tokenFor(report), planBody)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("charges report summaries to the report attempt budget", async () => {
    const d = deps();
    await relayPlan(d, await tokenFor(report), {
      ...planBody,
      purpose: "report_summary",
      responseSchema: "report_summary_v1",
    });
    expect(vi.mocked(d.rpc).mock.calls[0]?.[1]).toMatchObject({
      p_session_id: null,
      p_report_attempt_id: report.reportAttemptId,
      p_role: "report",
    });
  });

  it("rejects arbitrary response schemas", async () => {
    await expect(
      relayPlan(deps(), await tokenFor(device), { ...planBody, responseSchema: "anything" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("relayVision", () => {
  it("sends only the session's own screenshot, as a data URL", async () => {
    const d = deps();
    await relayVision(d, await tokenFor(device), {
      artifactId,
      prompt: "Describe the screen",
      maxOutputTokens: 300,
    });
    expect(d.loadScreenshot).toHaveBeenCalledWith(artifactId, expect.objectContaining(device));
    const request = vi.mocked(d.chat).mock.calls[0]?.[0];
    expect(request?.model).toBe("openbmb/MiniCPM-V-4_5");
    const content = request?.messages[1]?.content;
    expect(Array.isArray(content) && content[1]?.type === "image_url").toBe(true);
    expect(JSON.stringify(content)).toContain("data:image/png;base64,");
    expect(vi.mocked(d.rpc).mock.calls[0]?.[1]).toMatchObject({ p_role: "vision" });
  });

  it("returns 404 for an artifact outside the session and never reserves budget", async () => {
    const d = deps({ loadScreenshot: vi.fn(async () => null) });
    await expect(
      relayVision(d, await tokenFor(device), { artifactId, prompt: "x", maxOutputTokens: 100 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("does not accept URLs instead of artifact ids", async () => {
    await expect(
      relayVision(deps(), await tokenFor(device), {
        artifactId: "https://example.com/x.png",
        prompt: "x",
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses report tokens", async () => {
    await expect(
      relayVision(deps(), await tokenFor(report), { artifactId, prompt: "x", maxOutputTokens: 1 }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("provider", () => {
  it("strips closed and unterminated thinking blocks", () => {
    expect(stripThinking("<think>hmm</think>\n{}")).toBe("{}");
    expect(stripThinking("answer <think>never closed")).toBe("answer");
  });

  it("sends chat_template_kwargs and json_schema, and reads usage", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "<think>x</think>{}" } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          }),
          { status: 200 },
        ),
    );
    const chat = createTokenFactoryChat({
      apiKey: "secret",
      baseUrl: "https://api.test/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await chat({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 50,
      jsonSchema: { name: "s", schema: { type: "object" } },
      disableThinking: true,
      timeoutMs: 1000,
    });
    expect(res).toMatchObject({ ok: true, content: "{}", usage: { inputTokens: 10 } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.test/v1/chat/completions");
    const sent = JSON.parse(String(init?.body));
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(sent.response_format.type).toBe("json_schema");
  });

  it("marks 5xx as possibly consumed and 4xx as not", async () => {
    const make = (status: number) =>
      createTokenFactoryChat({
        apiKey: "k",
        baseUrl: "https://api.test/v1/",
        fetch: (async () => new Response("{}", { status })) as unknown as typeof fetch,
      });
    const req = { model: "m", messages: [], maxTokens: 1, timeoutMs: 1000 };
    expect(await make(503)(req)).toMatchObject({ ok: false, mayHaveConsumed: true });
    expect(await make(422)(req)).toMatchObject({ ok: false, mayHaveConsumed: false });
  });
});
