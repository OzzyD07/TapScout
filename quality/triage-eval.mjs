#!/usr/bin/env node
// Offline measurement of finding triage (docs/07 B11): the stored findings that carry a manual
// verdict (quality/benchmark/<app>.json) and the seeded FieldNotes defects (known true positives)
// are reviewed by the model with the same input the runner builds, and the answers are compared
// with the verdicts. Lives under quality/: runtime code may not read the verdicts.
//
// Usage: node --env-file=.env quality/triage-eval.mjs [--model nvidia/Nemotron-3_5-Lightning]
//          [--thinking] [--seeded-runs 4]
// Prints the agreement table and writes quality/results/triage-<model>-<time>.json (gitignored).
// Never prints secrets.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { sessionHierarchies, verdictFor } from "./benchmark.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const shared = await import(pathToFileURL(join(root, "packages/shared/dist/index.js")).href);
const runner = await import(pathToFileURL(join(root, "packages/runner/dist/triage.js")).href);
const observer = await import(pathToFileURL(join(root, "packages/runner/dist/observer.js")).href);

const { values } = parseArgs({
  options: {
    model: { type: "string", default: "nvidia/Nemotron-3_5-Lightning" },
    thinking: { type: "boolean", default: false },
    "seeded-runs": { type: "string", default: "4" },
  },
});
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in the environment`);
  return value;
};
const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
});
const baseUrl = env("TOKEN_FACTORY_BASE_URL").replace(/\/?$/, "/");
/** Android emulator of the device jobs: 420 dpi. */
const ANDROID_SCALE = 2.625;

// ---- Labelled findings ------------------------------------------------------------------------

const specs = [];
for (const f of (await readdir(join(here, "benchmark"))).filter((x) => x.endsWith(".json"))) {
  specs.push(JSON.parse(await readFile(join(here, "benchmark", f), "utf8")));
}
const triaged = [...runner.TRIAGED_CHECKS];

/** Completed sessions of the given builds, oldest first. */
async function sessionsOf(buildIds) {
  const { data, error } = await db
    .from("platform_sessions")
    .select("id, run_id, platform, build_id, started_at")
    .in("build_id", buildIds)
    .eq("phase", "completed")
    .order("started_at");
  if (error) throw error;
  return data ?? [];
}

const cases = [];
const seen = new Set();

for (const spec of specs) {
  const { data: builds } = await db
    .from("app_builds")
    .select("id")
    .eq("app_name", spec.app)
    .eq("is_sample", false);
  if (!builds?.length) continue;
  for (const s of await sessionsOf(builds.map((b) => b.id))) {
    const { data: findings } = await db
      .from("findings")
      .select("id, check_id, title, data")
      .eq("session_id", s.id)
      .in("check_id", triaged);
    for (const f of findings ?? []) {
      const v = verdictFor(spec, s.platform, f);
      if (v.verdict === "unmarked") continue;
      const region = f.data.evidence?.find((e) => e.role === "symptom")?.region;
      const key = `${spec.app}|${f.check_id}|${f.title}|${JSON.stringify(region)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cases.push({ app: spec.app, session: s, finding: f, label: v.verdict });
    }
  }
}

// Seeded FieldNotes defects found by the triaged checks are true positives by construction.
const seededManifest = JSON.parse(
  await readFile(join(here, "ground-truth", "fieldnotes-seeded-v1.json"), "utf8"),
);
const seededChecks = new Set(seededManifest.seeds.flatMap((s) => s.checkIds));
const { data: seededBuilds } = await db
  .from("app_builds")
  .select("id")
  .eq("is_sample", true)
  .eq("sample_variant", "seeded")
  .eq("platform", "android");
const seededSessions = (await sessionsOf((seededBuilds ?? []).map((b) => b.id))).slice(
  -Number(values["seeded-runs"]),
);
for (const s of seededSessions) {
  const { data: findings } = await db
    .from("findings")
    .select("id, check_id, title, data")
    .eq("session_id", s.id)
    .in("check_id", triaged);
  for (const f of findings ?? []) {
    if (!seededChecks.has(f.check_id)) continue;
    cases.push({ app: "FieldNotes seeded", session: s, finding: f, label: "true_positive" });
  }
}

// ---- Screens of the evidence ---------------------------------------------------------------------

const screenCache = new Map();
async function screenFor(c) {
  const artifactId = c.finding.data.evidence?.find((e) => e.role === "symptom")?.artifactId;
  if (!artifactId) return undefined;
  const { data: shot } = await db
    .from("artifacts")
    .select("step_index")
    .eq("id", artifactId)
    .maybeSingle();
  if (shot?.step_index == null) return undefined;
  const cacheKey = `${c.session.id}|${shot.step_index}`;
  if (screenCache.has(cacheKey)) return screenCache.get(cacheKey);
  const all = await sessionHierarchies(
    db,
    c.session.run_id,
    c.session.id,
    join(here, "results", "hierarchies", c.session.run_id, c.session.platform),
  );
  const hit = all.filter((h) => h.step === shot.step_index).at(-1);
  if (!hit || c.session.platform !== "android") return undefined;
  const screen = observer.normalizeHierarchy("android", hit.xml, { scale: 1 });
  const root = /<hierarchy[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/.exec(hit.xml);
  const value = {
    title: screen.title,
    elements: screen.elements,
    widthPx: Number(root?.[1] ?? 1080),
    heightPx: Number(root?.[2] ?? 2400),
    unitScale: ANDROID_SCALE,
  };
  screenCache.set(cacheKey, value);
  return value;
}

// ---- Model calls (one per session batch, like the runner) ---------------------------------------

/** One model call; a dropped connection or a 5xx is retried twice. */
async function chat(messages) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await chatOnce(messages);
    } catch (error) {
      if (attempt >= 3 || /model 4\d\d/.test(error.message)) throw error;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

async function chatOnce(messages) {
  const body = {
    model: values.model,
    messages,
    temperature: 0.2,
    max_tokens: values.thinking ? 6000 : 1500,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "finding_triage_v1",
        schema: shared.responseJsonSchema("finding_triage_v1"),
      },
    },
    chat_template_kwargs: { enable_thinking: values.thinking },
  };
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("TOKEN_FACTORY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`model ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return {
    content: json.choices?.[0]?.message?.content ?? "",
    usage: json.usage,
    ms: Date.now() - t0,
  };
}

const bySession = new Map();
for (const c of cases) {
  const list = bySession.get(c.session.id) ?? [];
  list.push(c);
  bySession.set(c.session.id, list);
}

const results = [];
let inputTokens = 0;
let outputTokens = 0;
let calls = 0;
let totalMs = 0;
for (const group of bySession.values()) {
  for (let i = 0; i < group.length; i += runner.MAX_TRIAGE_ITEMS) {
    const batch = group.slice(i, i + runner.MAX_TRIAGE_ITEMS);
    const items = [];
    for (const [j, c] of batch.entries()) {
      const f = c.finding.data;
      items.push(
        runner.triageItem(
          `T${j + 1}`,
          { ...f, findingId: c.finding.id, checkId: c.finding.check_id },
          await screenFor(c),
        ),
      );
    }
    const answer = await chat(runner.triageMessages(batch[0].session.platform, items));
    calls += 1;
    totalMs += answer.ms;
    inputTokens += answer.usage?.prompt_tokens ?? 0;
    outputTokens += answer.usage?.completion_tokens ?? 0;
    const verdicts = runner.parseTriage(answer.content, items);
    for (const [j, c] of batch.entries()) {
      const v = verdicts.get(items[j].id);
      results.push({
        app: c.app,
        check: c.finding.check_id,
        title: c.finding.title,
        label: c.label,
        triage: v?.verdict ?? "no_answer",
        reason: v?.reason,
        input: items[j].text,
      });
    }
  }
}

// ---- Agreement --------------------------------------------------------------------------------

const labels = ["true_positive", "false_positive", "unsure"];
const answers = ["likely_true", "needs_review", "likely_false", "no_answer"];
console.log(`model ${values.model}, thinking ${values.thinking ? "on" : "off"}`);
console.log(
  `${cases.length} labelled findings, ${calls} calls, ${inputTokens} / ${outputTokens} tokens, ${(totalMs / calls / 1000).toFixed(1)} s per call`,
);
console.log(`\n${"manual verdict".padEnd(16)}${answers.map((a) => a.padStart(14)).join("")}`);
for (const l of labels) {
  const row = results.filter((r) => r.label === l);
  console.log(
    `${`${l} (${row.length})`.padEnd(16)}${answers
      .map((a) => String(row.filter((r) => r.triage === a).length).padStart(14))
      .join("")}`,
  );
}
const tp = results.filter((r) => r.label === "true_positive");
const fp = results.filter((r) => r.label === "false_positive");
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "—");
console.log(
  `\nfalse positives lowered: ${pct(fp.filter((r) => r.triage === "likely_false").length, fp.length)}` +
    `   true positives lowered (should be low): ${pct(tp.filter((r) => r.triage === "likely_false").length, tp.length)}`,
);
for (const r of results.filter(
  (x) =>
    (x.label === "true_positive" && x.triage === "likely_false") ||
    (x.label === "false_positive" && x.triage === "likely_true"),
)) {
  console.log(`  disagree [${r.label} → ${r.triage}] ${r.app}: ${r.title} — ${r.reason ?? ""}`);
}

const out = join(
  here,
  "results",
  `triage-${values.model.replace(/[^\w.-]+/g, "_")}${values.thinking ? "-thinking" : ""}-${Date.now()}.json`,
);
await writeFile(
  out,
  JSON.stringify({ model: values.model, thinking: values.thinking, results }, null, 2),
);
console.log(`\nwritten ${out}`);
