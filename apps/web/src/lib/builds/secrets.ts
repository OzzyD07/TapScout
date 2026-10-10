import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TestAccount } from "@tapscout/shared";

/** Format: `v1.<iv>.<tag>.<ciphertext>`, base64url parts, AES-256-GCM. */
const PREFIX = "v1";

/** The 32-byte key from APP_CREDENTIALS_ENCRYPTION_KEY (base64 or 64 hex characters). */
export function parseKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  return key.length === 32 ? key : null;
}

/** The build id is authenticated data: a ciphertext cannot be moved to another build. */
export function sealTestAccount(account: TestAccount, key: Buffer, buildId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(buildId));
  const data = Buffer.concat([cipher.update(JSON.stringify(account), "utf8"), cipher.final()]);
  return [PREFIX, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Throws when the key is wrong, the ciphertext was changed or it belongs to another build. */
export function openTestAccount(sealed: string, key: Buffer, buildId: string): TestAccount {
  const [prefix, iv, tag, data] = sealed.split(".");
  if (prefix !== PREFIX || !iv || !tag || !data) throw new Error("unknown test account format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(buildId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return TestAccount.parse(JSON.parse(plain));
}
