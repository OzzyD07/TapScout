#!/usr/bin/env node
// Creates the jury accounts (docs/04 §7): confirmed email/password users, since public sign-up is
// closed. Each gets a random password. Passwords are written to .env.jury (gitignored by `.env.*`)
// for the Devpost testing instructions and are never printed. Idempotent: an existing account is
// left alone unless --reset is given, which sets a new password.
//
// Usage: node --env-file=.env scripts/create-jury-accounts.mjs [--count 3] [--reset]

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "3" },
    reset: { type: "boolean", default: false },
  },
});
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in the environment`);
  return value;
};

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const out = join(import.meta.dirname, "..", ".env.jury");
const saved = new Map(
  existsSync(out)
    ? readFileSync(out, "utf8")
        .split("\n")
        .map((l) => l.match(/^JURY_\d+=(\S+) (\S+)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]])
    : [],
);

// No lookalike characters: the password is typed by hand from the Devpost text.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const password = () => Array.from(randomBytes(16), (b) => ALPHABET[b % ALPHABET.length]).join("");

const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listError) throw listError;

const lines = [];
for (let i = 1; i <= Number(values.count); i++) {
  const email = `judge${i}@tapscout.com`;
  const existing = list.users.find((u) => u.email === email);
  let pass = saved.get(email);
  if (!existing) {
    pass = password();
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: pass,
      email_confirm: true,
    });
    if (error) throw new Error(`${email}: ${error.message}`);
    console.log(`+ ${email} created`);
  } else if (values.reset || !pass) {
    pass = password();
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password: pass });
    if (error) throw new Error(`${email}: ${error.message}`);
    console.log(`~ ${email} password reset`);
  } else {
    console.log(`= ${email} exists`);
  }
  lines.push(`JURY_${i}=${email} ${pass}`);
}
writeFileSync(out, `# Jury accounts: email password (never commit)\n${lines.join("\n")}\n`);
console.log(`credentials written to .env.jury (${lines.length} accounts)`);
