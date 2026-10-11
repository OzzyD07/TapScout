// Benchmark-mode evaluation (docs/07 A5) for runs on the real-app set: which of the app's main
// screens the session reached, where and why it stopped, how often interruptions and loading
// indicators showed up, and the manual verdict of each finding. Used by evaluate-run.mjs; lives
// under quality/ because runtime code may not read the expectations.
//
// A main screen counts as reached when one stored hierarchy of the session matches all of its
// `all` markers and, if given, at least one of its `any` markers. Markers match a text, label,
// content-desc, name or value attribute exactly (case-insensitive), or contain it when written
// as "~text". The expectations are fixed per app before looking at runs; markers may be tightened
// after a run shows them ambiguous, never to favour a result.

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const EVIDENCE_BUCKET = process.env.STORAGE_EVIDENCE_BUCKET || "evidence";

/** Benchmark expectations whose `app` is the build's app name, or null. */
export async function loadBenchmark(dir, appName) {
  if (!existsSync(dir)) return null;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const spec = JSON.parse(await readFile(join(dir, file), "utf8"));
    if (spec.app === appName) return spec;
  }
  return null;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1))
      : (ENTITIES[e] ?? m),
  );

/** All visible strings of a hierarchy (Android and iOS attribute names). */
export function hierarchyStrings(xml) {
  const out = [];
  for (const m of xml.matchAll(/\s(?:text|content-desc|label|name|value|hint)="([^"]*)"/g)) {
    const v = decode(m[1]).trim();
    if (v) out.push(v.toLowerCase());
  }
  return out;
}

function markerHit(strings, marker) {
  const m = marker.toLowerCase();
  return m.startsWith("~") ? strings.some((s) => s.includes(m.slice(1))) : strings.includes(m);
}

export function screenMatches(strings, screen) {
  const all = screen.all ?? [];
  const any = screen.any ?? [];
  return (
    all.every((m) => markerHit(strings, m)) &&
    (!any.length || any.some((m) => markerHit(strings, m)))
  );
}

/** Top package of an Android hierarchy (first node with a package attribute). */
function topPackage(xml) {
  return /\spackage="([^"]+)"/.exec(xml)?.[1];
}

const LOADING = [
  /class="android\.widget\.ProgressBar"/,
  /type="XCUIElementTypeActivityIndicator"/,
  /\s(?:text|label|name|content-desc)="(?:Loading|Loading…|Loading\.\.\.)"/i,
];

/** Downloads (or reuses) the session's stored hierarchies, ordered by step. */
async function sessionHierarchies(db, runId, sessionId, cacheDir) {
  const { data: rows, error } = await db
    .from("artifacts")
    .select("id, object_key, step_index, created_at")
    .eq("session_id", sessionId)
    .eq("kind", "hierarchy")
    .eq("status", "ready")
    .order("created_at");
  if (error) throw error;
  await mkdir(cacheDir, { recursive: true });
  const out = [];
  for (const [i, row] of (rows ?? []).entries()) {
    const file = join(cacheDir, `${String(i).padStart(3, "0")}-step${row.step_index ?? "x"}.xml`);
    let xml;
    if (existsSync(file)) xml = await readFile(file, "utf8");
    else {
      const { data, error: dl } = await db.storage.from(EVIDENCE_BUCKET).download(row.object_key);
      if (dl) throw new Error(`${runId}: hierarchy ${row.id}: ${dl.message}`);
      xml = await data.text();
      await writeFile(file, xml);
    }
    out.push({ step: row.step_index, xml });
  }
  return out;
}

/** A verdict's `region` matches when every coordinate it names equals the finding's symptom region. */
function regionMatches(want, finding) {
  if (!want) return true;
  const got = finding.data?.evidence?.find((e) => e.role === "symptom")?.region;
  return Boolean(got) && Object.entries(want).every(([k, v]) => got[k] === v);
}

function verdictFor(spec, platform, finding) {
  const v = (spec.verdicts ?? []).find(
    (x) =>
      x.check === finding.check_id &&
      (!x.platform || x.platform === platform) &&
      (!x.titleIncludes || finding.title.toLowerCase().includes(x.titleIncludes.toLowerCase())) &&
      regionMatches(x.region, finding),
  );
  return v ? { verdict: v.verdict, reason: v.reason } : { verdict: "unmarked" };
}

/** Benchmark evaluation of one platform session. */
export async function evaluateBenchmarkSession({ db, run, session, findings, spec, cacheRoot }) {
  const platform = session.platform;
  const appPackage = spec.android?.package;
  const hierarchies = await sessionHierarchies(
    db,
    run.id,
    session.id,
    join(cacheRoot, run.id, platform),
  );

  const screens = (spec.screens ?? [])
    .filter((s) => !s.platforms || s.platforms.includes(platform))
    .map((s) => {
      const hit = hierarchies.find((h) => screenMatches(hierarchyStrings(h.xml), s));
      return { id: s.id, name: s.name, reached: Boolean(hit), firstStep: hit?.step ?? null };
    });

  // Steps whose top window is not the app (permission controller, another app, the launcher).
  const foreign = hierarchies
    .filter((h) => platform === "android" && appPackage && topPackage(h.xml) !== appPackage)
    .map((h) => ({ step: h.step, package: topPackage(h.xml) }));
  const loading = hierarchies
    .filter((h) => LOADING.some((re) => re.test(h.xml)))
    .map((h) => h.step);

  const { data: events } = await db
    .from("run_events")
    .select("type, step_index, payload")
    .eq("session_id", session.id)
    .in("type", ["action_executed", "note", "blocked", "stopped"])
    .order("sequence");
  const actions = (events ?? []).filter((e) => e.type === "action_executed");
  const notes = (events ?? [])
    .filter((e) => e.type === "note" && e.payload.level !== "info")
    .map((e) => e.payload.message);
  const interruptions = (events ?? [])
    .filter(
      (e) =>
        e.type === "note" && /covered the app|System dialog|interruption/i.test(e.payload.message),
    )
    .map((e) => ({ step: e.step_index, message: e.payload.message }));
  const stopped = (events ?? []).find((e) => e.type === "stopped")?.payload;
  const last = hierarchies.at(-1);

  const blockers = session.result?.blockers ?? [];
  const wall = blockers.find((b) => /^(Sign-in|Access blocked)/.test(b));
  const expectedAccess = spec.access ?? "open";
  const gotAccess = wall ? wall.split(":")[0] : "open";
  const accessOk =
    expectedAccess === "open"
      ? !wall
      : expectedAccess === "sign_in_required"
        ? /^Sign-in required/.test(wall ?? "")
        : // optional_sign_in: a blocker for the screens behind sign-in is fair, an access-blocked
          // stop for the whole app is not.
          session.stop_reason !== "access_blocked";

  const marked = findings.map((f) => ({
    check: f.check_id,
    title: f.title,
    verification: f.verification,
    severity: f.severity,
    ...verdictFor(spec, platform, f),
  }));
  const durationMin =
    session.started_at && session.finished_at
      ? (Date.parse(session.finished_at) - Date.parse(session.started_at)) / 60_000
      : null;

  return {
    platform,
    app: spec.app,
    benchmark: spec.key,
    phase: session.phase,
    stopReason: session.stop_reason,
    stopDetail: stopped?.detail ?? null,
    durationMin: durationMin === null ? null : Math.round(durationMin * 10) / 10,
    counters: session.counters ?? {},
    blockers,
    access: { expected: expectedAccess, got: gotAccess, ok: accessOk },
    screens,
    reached: screens.filter((s) => s.reached).length,
    expected: screens.length,
    observations: hierarchies.length,
    foreignWindowSteps: foreign,
    loadingSteps: loading,
    interruptions,
    warnings: notes.slice(0, 20),
    lastActions: actions.slice(-5).map((a) => ({
      step: a.step_index,
      summary: a.payload.summary,
      outcome: a.payload.outcome,
      result: a.payload.resultSummary,
    })),
    lastScreenTexts: last ? [...new Set(hierarchyStrings(last.xml))].slice(0, 12) : [],
    findings: marked,
  };
}

export function printBenchmark(p) {
  const c = p.counters;
  console.log(
    `\n${p.app} — ${p.platform} (${p.phase}/${p.stopReason}${p.durationMin !== null ? `, ${p.durationMin} min` : ""}): main screens ${p.reached}/${p.expected}, ${c.screensObserved ?? "?"} states, ${c.actionsExecuted ?? "?"} actions, ${c.plannerCalls ?? "?"} planner calls`,
  );
  console.log(
    `  access            ${p.access.ok ? "ok" : "WRONG"} — expected ${p.access.expected}, got ${p.access.got}`,
  );
  for (const b of p.blockers) console.log(`  blocker           ${b}`);
  for (const s of p.screens) {
    console.log(
      `  ${s.reached ? "reached " : "missed  "}          ${s.name}${s.reached ? ` (step ${s.firstStep})` : ""}`,
    );
  }
  if (p.interruptions.length) {
    for (const i of p.interruptions)
      console.log(`  interruption      step ${i.step}: ${i.message}`);
  }
  if (p.foreignWindowSteps.length) {
    const pk = [...new Set(p.foreignWindowSteps.map((f) => f.package))].join(", ");
    console.log(`  foreign window    ${p.foreignWindowSteps.length} observation(s): ${pk}`);
  }
  console.log(`  loading shown     ${p.loadingSteps.length}/${p.observations} observation(s)`);
  for (const w of p.warnings.slice(0, 8)) console.log(`  warning           ${w}`);
  if (p.stopDetail) console.log(`  stop detail       ${p.stopDetail}`);
  for (const a of p.lastActions) {
    console.log(
      `  last action       ${a.step}: ${a.summary} → ${a.outcome}${a.result ? `, ${a.result}` : ""}`,
    );
  }
  console.log(`  last screen       ${p.lastScreenTexts.join(" | ")}`);
  for (const f of p.findings) {
    console.log(`  finding [${f.verdict}] ${f.check} (${f.verification}): ${f.title}`);
  }
  const n = (v) => p.findings.filter((f) => f.verdict === v).length;
  if (p.findings.length) {
    const fp = n("false_positive");
    console.log(
      `  verdicts          ${n("true_positive")} true, ${fp} false positive, ${n("unsure")} unsure, ${n("unmarked")} unmarked → false-positive rate ${Math.round((100 * fp) / p.findings.length)}%`,
    );
  }
}
