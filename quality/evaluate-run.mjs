#!/usr/bin/env node
// Post-run quality evaluation (docs/03 §10): compares a run's findings with the ground truth of
// the sample build it tested. Lives under quality/ on purpose: runtime code may not read it.
//
// Usage: node --env-file=.env quality/evaluate-run.mjs --run <run id>
//   seeded builds are matched against quality/ground-truth/fieldnotes-<variant>-v1.json;
//   fixed (and changed_flow) builds expect no findings: every finding counts as a false positive.
//   login builds also expect no findings, plus the right access outcome: with the build's test
//   account the sign-in must be passed; without it the report must say "Sign-in required".
//   Builds of the real-app benchmark set (docs/07 A5) are scored against
//   quality/benchmark/<app>.json instead (benchmark.mjs): main screens reached, access outcome,
//   where the session stopped, and the manual verdict of every finding.
// Prints a table and writes quality/results/<run id>.json (gitignored). Never prints secrets.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { evaluateBenchmarkSession, loadBenchmark, printBenchmark } from "./benchmark.mjs";

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
  .select(
    "id, platform, phase, stop_reason, result, counters, started_at, finished_at, build:app_builds(is_sample, app_name, sample_variant, has_test_account)",
  )
  .eq("run_id", run.id);
const { data: findings } = await db
  .from("findings")
  .select("session_id, check_id, title, verification, severity, data")
  .eq("run_id", run.id);

const report = { runId: run.id, modes: run.modes, platforms: [] };
for (const s of sessions ?? []) {
  if (s.build && !s.build.is_sample) {
    const spec = await loadBenchmark(join(here, "benchmark"), s.build.app_name);
    if (!spec) throw new Error(`no quality/benchmark expectations for "${s.build.app_name}"`);
    report.platforms.push({
      benchmarkResult: await evaluateBenchmarkSession({
        db,
        run,
        session: s,
        findings: (findings ?? []).filter((f) => f.session_id === s.id),
        spec,
        cacheRoot: join(here, "results", "hierarchies"),
      }),
    });
    continue;
  }
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
  // A further finding of a detected seed's checks is the same defect seen again (another field
  // of the same broken save), not a false positive.
  const sameSeed = mine.filter(
    (f) =>
      !used.has(f) &&
      rows.some(
        (r) =>
          r.result === "detected" &&
          seeds.find((x) => x.id === r.seed)?.checkIds.includes(f.check_id),
      ),
  );
  const extra = mine.filter((f) => !used.has(f) && !sameSeed.includes(f));
  let access;
  if (variant === "login") {
    const blockers = s.result?.blockers ?? [];
    const wall = blockers.find((b) => /^(Sign-in|Access blocked)/.test(b));
    const expected = s.build?.has_test_account ? "signed in" : "Sign-in required";
    // "Signed in" needs the runner's own note that the wall was passed: in cdb25f9c (iOS) the
    // sign-in fields were not recognised, so no wall and no blocker, yet nothing was passed.
    const { data: passed } = await db
      .from("run_events")
      .select("id")
      .eq("session_id", s.id)
      .eq("type", "note")
      .like("payload->>message", "Got past the sign-in%")
      .limit(1);
    const got = wall ? wall.split(":")[0] : passed?.length ? "signed in" : "never signed in";
    access = { expected, got, ok: got === expected };
  }
  const selected = rows.filter((r) => r.result !== "mode not selected");
  report.platforms.push({
    platform: s.platform,
    variant,
    phase: s.phase,
    stopReason: s.stop_reason,
    detected: selected.filter((r) => r.result === "detected").length,
    expected: selected.length,
    access,
    sameSeed: sameSeed.map((f) => ({ check: f.check_id, title: f.title })),
    falsePositives: extra.map((f) => ({
      check: f.check_id,
      title: f.title,
      verification: f.verification,
    })),
    seeds: rows,
  });
}

for (const p of report.platforms) {
  if (p.benchmarkResult) {
    printBenchmark(p.benchmarkResult);
    continue;
  }
  console.log(
    `\n${p.platform} (${p.variant}, ${p.phase}/${p.stopReason}): detected ${p.detected}/${p.expected}, unexpected findings ${p.falsePositives.length}`,
  );
  if (p.access) {
    console.log(
      `  access            ${p.access.ok ? "ok" : "WRONG"} — expected ${p.access.expected}, got ${p.access.got}`,
    );
  }
  for (const r of p.seeds) {
    console.log(
      `  ${r.result.padEnd(17)} ${r.seed}${r.verification ? ` — ${r.verification}${r.reproduction ? ` ${r.reproduction}` : ""}` : ""}`,
    );
  }
  for (const f of p.sameSeed) console.log(`  same seed again   ${f.check}: ${f.title}`);
  for (const f of p.falsePositives) console.log(`  unexpected        ${f.check}: ${f.title}`);
}

const out = join(here, "results", `${run.id}.json`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nwritten ${out}`);
