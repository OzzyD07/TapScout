import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openTestAccount, parseKey, sealTestAccount } from "../src/lib/builds/secrets";

const BUILD = "22222222-2222-4222-8222-222222222222";
const account = { username: "qa@example.com", password: "s3cret!" };

describe("test account secrets", () => {
  const key = randomBytes(32);

  it("round-trips without the plaintext in the stored value", () => {
    const sealed = sealTestAccount(account, key, BUILD);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("qa@example.com");
    expect(sealed).not.toContain("s3cret");
    expect(openTestAccount(sealed, key, BUILD)).toEqual(account);
    // A fresh IV every time: the same account never looks the same twice.
    expect(sealTestAccount(account, key, BUILD)).not.toBe(sealed);
  });

  it("refuses another key, another build and a changed ciphertext", () => {
    const sealed = sealTestAccount(account, key, BUILD);
    expect(() => openTestAccount(sealed, randomBytes(32), BUILD)).toThrow();
    expect(() => openTestAccount(sealed, key, "33333333-3333-4333-8333-333333333333")).toThrow();
    const parts = sealed.split(".");
    const body = parts[3] ?? "";
    parts[3] = `${body[0] === "A" ? "B" : "A"}${body.slice(1)}`;
    expect(() => openTestAccount(parts.join("."), key, BUILD)).toThrow();
  });

  it("accepts a 32-byte key as base64 or hex only", () => {
    expect(parseKey(key.toString("base64"))?.equals(key)).toBe(true);
    expect(parseKey(key.toString("hex"))?.equals(key)).toBe(true);
    expect(parseKey("short")).toBeNull();
    expect(parseKey(undefined)).toBeNull();
  });
});
