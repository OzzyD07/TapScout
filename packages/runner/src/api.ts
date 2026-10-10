import type {
  ApiError,
  ArtifactPresignResponse,
  EventBatchResponse,
  FinishSessionRequest,
  HeartbeatResponse,
  RelayPlanRequest,
  RelayResponse,
  RelayVisionRequest,
  RunEventInput,
  RunnerBootstrapResponse,
} from "@tapscout/shared";

export class RunnerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`${status} ${code}: ${message}`);
    this.name = "RunnerApiError";
  }
}

/**
 * Errors that a retry can fix: network failures, 5xx and rate limits. Never retried: 4xx decisions,
 * including an exhausted model budget (also 429).
 */
function retryable(error: unknown): boolean {
  if (error instanceof RunnerApiError) {
    if (error.code === "budget_exhausted") return false;
    return error.status >= 500 || error.status === 429;
  }
  return true;
}

export interface RunnerApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class RunnerApi {
  private token: string | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: RunnerApiOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.retries = options.retries ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  setToken(token: string): void {
    this.token = token;
  }

  private async post<T>(
    path: string,
    body: unknown,
    bearer?: string,
    opts: { retries?: number; timeoutMs?: number } = {},
  ): Promise<T> {
    const auth = bearer ?? this.token;
    if (!auth) throw new Error("runner API called before bootstrap");
    const retries = opts.retries ?? this.retries;
    let attempt = 0;
    for (;;) {
      try {
        const res = await this.fetchImpl(new URL(path, this.options.baseUrl), {
          method: "POST",
          headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        const text = await res.text();
        const json = text ? (JSON.parse(text) as unknown) : {};
        if (!res.ok) {
          const err = (json as ApiError).error;
          throw new RunnerApiError(
            res.status,
            err?.code ?? "http_error",
            err?.message ?? text.slice(0, 200),
          );
        }
        return json as T;
      } catch (error) {
        attempt += 1;
        if (attempt > retries || !retryable(error)) throw error;
        await this.sleep(500 * 2 ** (attempt - 1));
      }
    }
  }

  bootstrap(oidcToken: string, runId: string, platform: "android" | "ios") {
    return this.post<RunnerBootstrapResponse>(
      "/api/runner/bootstrap",
      { runId, platform },
      oidcToken,
    );
  }

  async heartbeat(): Promise<HeartbeatResponse> {
    const res = await this.post<HeartbeatResponse>("/api/runner/heartbeat", {});
    if (res.sessionToken) this.token = res.sessionToken;
    return res;
  }

  events(events: RunEventInput[]) {
    return this.post<EventBatchResponse>("/api/runner/events", { events });
  }

  presign(body: { kind: string; contentType: string; sizeBytes: number; stepIndex?: number }) {
    return this.post<ArtifactPresignResponse>("/api/runner/artifacts", body);
  }

  complete(body: { artifactId: string; sha256: string; sizeBytes: number }) {
    return this.post<{ artifactId: string; status: "ready" }>(
      "/api/runner/artifacts/complete",
      body,
    );
  }

  /**
   * One Nemotron call through the relay. At most 2 transient retries; each retry is a new provider
   * request and is charged to the planner budget (docs/03 §9).
   */
  relayPlan(body: RelayPlanRequest) {
    return this.post<RelayResponse>("/api/relay/plan", body, undefined, {
      retries: 2,
      timeoutMs: 60_000,
    });
  }

  relayVision(body: RelayVisionRequest) {
    return this.post<RelayResponse>("/api/relay/vision", body, undefined, {
      retries: 1,
      timeoutMs: 60_000,
    });
  }

  finish(body: FinishSessionRequest) {
    return this.post<{ ok: true }>("/api/runner/finish", body);
  }
}

/** GitHub Actions OIDC token for the configured audience (requires `id-token: write`). */
export async function fetchGithubOidcToken(audience: string, fetchImpl: typeof fetch = fetch) {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !requestToken) {
    throw new Error("GitHub OIDC is not available: the job needs `permissions: id-token: write`");
  }
  const res = await fetchImpl(`${url}&audience=${encodeURIComponent(audience)}`, {
    headers: { authorization: `Bearer ${requestToken}` },
  });
  if (!res.ok) throw new Error(`OIDC token request failed with HTTP ${res.status}`);
  const { value } = (await res.json()) as { value?: string };
  if (!value) throw new Error("OIDC token response had no value");
  return value;
}
