import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGithubOidcToken } from "../src/api.js";

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetchGithubOidcToken", () => {
  beforeEach(() => {
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "https://token.example/oidc?x=1");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("retries a server error from GitHub's token service (5984db7b: one 503 ended a session)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(503))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(200, { value: "oidc-token" }));
    await expect(fetchGithubOidcToken("tapscout", fetchImpl, 0)).resolves.toBe("oidc-token");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("audience=tapscout");
  });

  it("does not retry a client error, and gives up after four server errors", async () => {
    const denied = vi.fn().mockResolvedValue(json(403));
    await expect(fetchGithubOidcToken("tapscout", denied, 0)).rejects.toThrow("HTTP 403");
    expect(denied).toHaveBeenCalledTimes(1);

    const down = vi.fn().mockResolvedValue(json(503));
    await expect(fetchGithubOidcToken("tapscout", down, 0)).rejects.toThrow("HTTP 503");
    expect(down).toHaveBeenCalledTimes(4);
  });
});
