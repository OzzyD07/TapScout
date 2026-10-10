#!/usr/bin/env node
// Post-run quality evaluation (docs/03 §10): compares a run's findings with the ground truth of
// the sample build it tested. Lives under quality/ on purpose: runtime code may not read it.
//
// Usage: node --env-file=.env quality/evaluate-run.mjs --run <run id>
//   seeded builds are matched against quality/ground-truth/fieldnotes-<variant>-v1.json;
//   fixed (and changed_flow) builds expect no findings: every finding counts as a false positive.
// Prints a table and writes quality/results/<run id>.json (gitignored). Never prints secrets.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { run: { type: "string" } } });
if (!values.run) {
  console.error("usage: node --env-file=.env quality/evaluate-run.mjs --run <run id>");
  process.exit(2);
}
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in the environment`);
  return value;
};
const db = createClient(
  process.env.SUPABASE_URL ?? env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SECRET_KEY"),
  { auth: { persistSession: false } },
);

// Accept a full id or the 8-character prefix shown in the UI and logs.
const { data: recent, error: runError } = await db
  .from("test_runs")
  .select("id, modes, status")
  .order("created_at", { ascending: false })
  .limit(500);
const run = (recent ?? []).find((r) => r.id.startsWith(values.run));
if (runError || !run) throw new Error(`run ${values.run} not found`);

const { data: sessions } = await db
  .from("platform_sessions")
  .select("id, platform, phase, stop_reason, build:app_builds(sample_variant)")
  .eq("run_id", run.id);
const { data: findings } = await db
  .from("findings")
  .select("session_id, check_id, title, verification, severity, data")
  .eq("run_id", run.id);

const report = { runId: run.id, modes: run.modes, platforms: [] };
for (const s of sessions ?? []) {
  const variant = s.build?.sample_variant ?? "unknown";
  const manifestPath = join(here, "ground-truth", `fieldnotes-${variant}-v1.json`);
  const seeds = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, "utf8")).seeds.filter((seed) =>
        seed.platforms.includes(s.platform),
      )
    : [];
  const mine = (findings ?? []).filter((f) => f.session_id === s.id);
  const used = new Set();
  const rows = seeds.map((seed) => {
    const testable = run.modes.includes(seed.mode);
    const hit = mine.find((f) => seed.checkIds.includes(f.check_id) && !used.has(f));
    if (hit) used.add(hit);
    return {
      seed: seed.id,
      mode: seed.mode,
      result: !testable ? "mode not selected" : hit ? "detected" : "missed",
      verification: hit?.verification,
      reproduction: hit?.data?.reproduction
        ? `${hit.data.reproduction.symptom}/${hit.data.reproduction.valid}`
        : undefined,
      finding: hit?.title,
    };
  });
  const extra = mine.filter((f) => !used.has(f));
  const selected = rows.filter((r) => r.result !== "mode not selected");
  report.platforms.push({
    platform: s.platform,
    variant,
    phase: s.phase,
    stopReason: s.stop_reason,
    detected: selected.filter((r) => r.result === "detected").length,
    expected: selected.length,
    falsePositives: extra.map((f) => ({
      check: f.check_id,
      title: f.title,
      verification: f.verification,
    })),
    seeds: rows,
  });
}

for (const p of report.platforms) {
  console.log(
    `\n${p.platform} (${p.variant}, ${p.phase}/${p.stopReason}): detected ${p.detected}/${p.expected}, unexpected findings ${p.falsePositives.length}`,
  );
  for (const r of p.seeds) {
    console.log(
      `  ${r.result.padEnd(17)} ${r.seed}${r.verification ? ` — ${r.verification}${r.reproduction ? ` ${r.reproduction}` : ""}` : ""}`,
    );
  }
  for (const f of p.falsePositives) console.log(`  unexpected        ${f.check}: ${f.title}`);
}

const out = join(here, "results", `${run.id}.json`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nwritten ${out}`);
