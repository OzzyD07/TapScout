/**
 * Nebius Token Factory chat completions (OpenAI-compatible). One provider request per call; the
 * relay decides budgets and retries are the runner's business. Never logs the API key.
 */

export type ProviderContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string | ProviderContentPart[];
}

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  maxTokens: number;
  temperature?: number;
  /** Registered schema only; the relay never forwards a caller-supplied schema. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Both models emit reasoning by default; TapScout turns it off (docs/05 §12 probe). */
  disableThinking?: boolean;
  timeoutMs: number;
}

export type ProviderResult =
  | {
      ok: true;
      content: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      latencyMs: number;
    }
  | {
      ok: false;
      /** HTTP status from the provider, or null for timeouts and network failures. */
      status: number | null;
      /** True when the provider may have consumed tokens (5xx, timeout, network failure). */
      mayHaveConsumed: boolean;
      message: string;
      latencyMs: number;
    };

export type ChatFn = (request: ProviderRequest) => Promise<ProviderResult>;

/** Removes `<think>…</think>` blocks (and an unterminated leading one) from model output. */
export function stripThinking(content: string): string {
  const closed = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = closed.search(/<think>/i);
  return (open >= 0 ? closed.slice(0, open) : closed).trim();
}

function usageFrom(json: unknown): { inputTokens: number; outputTokens: number } | null {
  const usage = (json as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } })
    ?.usage;
  const input = usage?.prompt_tokens;
  const output = usage?.completion_tokens;
  if (typeof input !== "number" || typeof output !== "number") return null;
  return { inputTokens: input, outputTokens: output };
}

export function createTokenFactoryChat(options: {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
}): ChatFn {
  const fetchImpl = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/?$/, "/");
  return async (request) => {
    const started = Date.now();
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
    };
    if (request.jsonSchema) {
      body.response_format = { type: "json_schema", json_schema: request.jsonSchema };
    }
    if (request.disableThinking) body.chat_template_kwargs = { enable_thinking: false };

    let res: Response;
    try {
      res = await fetchImpl(new URL("chat/completions", base), {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const timedOut = (error as Error).name === "TimeoutError";
      return {
        ok: false,
        status: null,
        mayHaveConsumed: true,
        message: timedOut ? "model request timed out" : "model request failed",
        latencyMs: Date.now() - started,
      };
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON body; handled below.
    }
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        mayHaveConsumed: res.status >= 500,
        message: `provider HTTP ${res.status}`,
        latencyMs,
      };
    }
    const content = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
      ?.message?.content;
    if (typeof content !== "string") {
      return {
        ok: false,
        status: res.status,
        mayHaveConsumed: true,
        message: "provider returned no message content",
        latencyMs,
      };
    }
    return { ok: true, content: stripThinking(content), usage: usageFrom(json), latencyMs };
  };
}
