"use client";

import { MODES } from "@tapscout/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { CheckView, FindingView } from "@/lib/report/view";
import {
  describeEvent,
  fromRow,
  latestScreenshot,
  mergeEvents,
  phaseLabel,
  phaseTone,
  type RunEventRow,
  runStatusLabel,
  type TimelineEvent,
  type Tone,
} from "@/lib/runs/timeline";
import { createClient } from "@/lib/supabase/browser";

export interface RunSnapshot {
  id: string;
  status: string;
  modes: string[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelRequested: boolean;
  isSharedSample: boolean;
  canCancel: boolean;
  githubRunId: number | null;
}

export interface SessionSnapshot {
  id: string;
  platform: "android" | "ios";
  phase: string;
  stop_reason: string | null;
  phase_detail: string | null;
  counters: Partial<
    Record<"screensObserved" | "transitionsObserved" | "actionsExecuted" | "checksRun", number>
  >;
  device_profile: { osVersion?: string; deviceName?: string; environment?: string } | null;
  started_at: string | null;
  finished_at: string | null;
  build: { app_name: string; file_name: string; sample_variant: string | null } | null;
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-border/60 text-text",
  info: "bg-accent/15 text-accent",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted",
  info: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

function runTone(status: string, cancelRequested: boolean): Tone {
  if (cancelRequested && (status === "queued" || status === "running")) return "warn";
  if (status === "completed") return "ok";
  if (status === "partial") return "warn";
  if (status === "infrastructure_failed") return "danger";
  if (status === "running") return "info";
  return "neutral";
}

const platformName = (p: string) => (p === "ios" ? "iOS Simulator" : "Android Emulator");
const time = (iso: string) => new Date(iso).toLocaleTimeString("en", { hour12: false });

export interface ReportSnapshot {
  overallStatus: string;
  createdAt: string;
  limitations: string[];
  checks: CheckView[];
  findings: FindingView[];
}

const CHECK_STATUS: Record<string, { label: string; tone: Tone }> = {
  passed_within_scope: { label: "Passed (within scope)", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  inconclusive: { label: "Inconclusive", tone: "warn" },
  not_tested: { label: "Not tested", tone: "neutral" },
  unsupported: { label: "Unsupported", tone: "neutral" },
};

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "danger",
  high: "danger",
  medium: "warn",
  low: "neutral",
  info: "neutral",
};

const checkName = (id: string) =>
  ({
    "functional.flow_transitions": "Screen transitions",
    "functional.form_feedback": "Form feedback",
    "functional.return_paths": "Return paths",
    "functional.persistence": "Saved data after relaunch",
    "a11y.control_labels": "Control labels",
    "a11y.touch_targets": "Touch target size",
    "ui.keyboard_occlusion": "Controls under the keyboard",
    "ui.text_clipping": "Clipped text (AI estimate)",
    "store.account_deletion": "In-app account deletion",
    "store.privacy_policy": "Privacy policy",
    "stress.long_text": "Long text input",
    "stress.crash": "Unexpected app exit",
  })[id] ?? id;

const STORE_STATUS: Record<string, { label: string; tone: Tone }> = {
  evidence_found: { label: "Evidence found", tone: "ok" },
  potential_risk: { label: "Potential risk", tone: "warn" },
  needs_additional_information: { label: "Needs more information", tone: "neutral" },
  not_applicable: { label: "Not applicable", tone: "neutral" },
  not_assessed: { label: "Not assessed", tone: "neutral" },
};

export function RunView(props: {
  report: ReportSnapshot | null;
  run: RunSnapshot;
  sessions: SessionSnapshot[];
  events: TimelineEvent[];
}) {
  const router = useRouter();
  const [run, setRun] = useState(props.run);
  const [sessions, setSessions] = useState(props.sessions);
  const [events, setEvents] = useState(props.events);
  const [selected, setSelected] = useState(props.sessions[0]?.id ?? "");
  const [pinnedShot, setPinnedShot] = useState<string | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [cancelling, startCancel] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const backfill = useCallback(async () => {
    // History is authoritative; realtime only notifies. Re-read after every (re)connect.
    const supabase = createClient();
    const { data } = await supabase
      .from("run_events")
      .select("event_id, session_id, sequence, type, phase, step_index, occurred_at, payload")
      .eq("run_id", run.id)
      .order("sequence")
      .limit(2000);
    if (data) setEvents((cur) => mergeEvents(cur, (data as RunEventRow[]).map(fromRow)));
  }, [run.id]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`run:${run.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "run_events", filter: `run_id=eq.${run.id}` },
        (msg) => setEvents((cur) => mergeEvents(cur, [fromRow(msg.new as RunEventRow)])),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "platform_sessions",
          filter: `run_id=eq.${run.id}`,
        },
        (msg) => {
          const row = msg.new as SessionSnapshot;
          setSessions((cur) =>
            cur.map((s) => (s.id === row.id ? { ...s, ...row, build: s.build } : s)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "test_runs", filter: `id=eq.${run.id}` },
        (msg) => {
          const row = msg.new as {
            status: string;
            cancel_requested_at: string | null;
            finished_at: string | null;
          };
          setRun((cur) => ({
            ...cur,
            status: row.status,
            cancelRequested: Boolean(row.cancel_requested_at),
            finishedAt: row.finished_at,
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports", filter: `run_id=eq.${run.id}` },
        () => router.refresh(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("live");
          void backfill();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive("offline");
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [run.id, backfill, router]);

  const session = sessions.find((s) => s.id === selected) ?? sessions[0];
  const sessionEvents = useMemo(
    () => events.filter((e) => e.sessionId === session?.id),
    [events, session?.id],
  );
  const shot = pinnedShot ?? (session ? latestScreenshot(events, session.id) : undefined);
  const active = run.status === "queued" || run.status === "running";

  function cancel() {
    setCancelError(null);
    startCancel(async () => {
      const res = await fetch(`/api/runs/${run.id}/cancel`, { method: "POST" });
      if (!res.ok) setCancelError("Could not cancel the run. Try again.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Run <span className="font-mono text-xl">{run.id.slice(0, 8)}</span>
            </h1>
            <Badge tone={runTone(run.status, run.cancelRequested)}>
              {runStatusLabel(run.status, run.cancelRequested)}
            </Badge>
            <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
              <span
                className={`h-2 w-2 rounded-full ${live === "live" ? "bg-ok" : live === "offline" ? "bg-danger" : "bg-warn"}`}
              />
              {live === "live" ? "Live" : live === "offline" ? "Reconnecting…" : "Connecting…"}
            </span>
          </div>
          {run.isSharedSample ? (
            <p className="text-sm font-medium text-warn">Previously completed sample run</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {run.modes.map((m) => (
              <Badge key={m} tone="neutral">
                {MODES.find((x) => x.mode === m)?.label ?? m}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted">
            Created {new Date(run.createdAt).toLocaleString("en")}
            {run.finishedAt ? ` · finished ${new Date(run.finishedAt).toLocaleString("en")}` : ""}
          </p>
        </div>
        {run.canCancel && active && !run.cancelRequested ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              {cancelling ? "Cancelling…" : "Cancel run"}
            </button>
            {cancelError ? <p className="text-xs text-danger">{cancelError}</p> : null}
          </div>
        ) : null}
      </header>

      {props.report ? (
        <section
          aria-label="Report"
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Report</h2>
            <Badge tone={runTone(props.report.overallStatus, false)}>
              {runStatusLabel(props.report.overallStatus, false)}
            </Badge>
          </div>
          <p className="text-sm text-muted">
            {sessions.map((s) => `${platformName(s.platform)}: ${phaseLabel(s.phase)}`).join(" · ")}
          </p>
          {props.report.findings.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Findings</h3>
              {props.report.findings.map((f) => (
                <article
                  key={f.findingId}
                  className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[f.severity] ?? "neutral"}>{f.severity}</Badge>
                    <span className="font-medium">{f.title}</span>
                    <span className="text-xs text-muted">
                      {platformName(f.platform)} · {f.reproduction}
                    </span>
                  </div>
                  <p className="text-muted">
                    <span className="font-medium text-text">Expected:</span> {f.expected}
                  </p>
                  <p className="text-muted">
                    <span className="font-medium text-text">Observed:</span> {f.observed}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="text-muted">Basis: {f.basis.replace(/_/g, " ")}</span>
                    {f.evidence.map((e) => (
                      <button
                        key={`${e.role}-${e.artifactId}`}
                        type="button"
                        className="text-accent"
                        onClick={() => {
                          const s = sessions.find((x) => x.platform === f.platform);
                          if (s) setSelected(s.id);
                          setPinnedShot(e.artifactId);
                        }}
                      >
                        {e.role} screenshot
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {props.report.checks.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Checks</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {props.report.checks.map((c) => (
                  <li
                    key={`${c.platform}-${c.checkId}`}
                    className="flex flex-col gap-0.5 border-b border-border py-1 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <span className="flex shrink-0 items-center gap-2 sm:w-72">
                      {c.storeStatus ? (
                        <Badge tone={STORE_STATUS[c.storeStatus]?.tone ?? "neutral"}>
                          {STORE_STATUS[c.storeStatus]?.label ?? c.storeStatus}
                        </Badge>
                      ) : (
                        <Badge tone={CHECK_STATUS[c.status]?.tone ?? "neutral"}>
                          {CHECK_STATUS[c.status]?.label ?? c.status}
                        </Badge>
                      )}
                      <span>
                        {checkName(c.checkId)}{" "}
                        <span className="text-xs text-muted">
                          ({c.platform === "ios" ? "iOS" : "Android"})
                        </span>
                      </span>
                    </span>
                    <span className="text-xs text-muted">{c.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="list-disc pl-5 text-xs text-muted">
            {props.report.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div role="tablist" aria-label="Platforms" className="flex gap-2 border-b border-border">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === session?.id}
            onClick={() => {
              setSelected(s.id);
              setPinnedShot(null);
            }}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
              s.id === session?.id
                ? "border-accent text-text"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {platformName(s.platform)}
            <Badge tone={phaseTone(s.phase)}>{phaseLabel(s.phase)}</Badge>
          </button>
        ))}
      </div>

      {session ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-4">
            <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[2rem] border-8 border-text/85 bg-surface shadow-lg">
              {shot ? (
                // biome-ignore lint/performance/noImgElement: signed Storage redirect, not a static asset
                <img
                  key={shot}
                  src={`/api/artifacts/${shot}`}
                  alt={`Latest ${platformName(session.platform)} screenshot`}
                  className="block aspect-[9/19.5] w-full object-cover object-top"
                  onError={(e) => {
                    // The runner uploads evidence in the background: retry briefly until ready.
                    const img = e.currentTarget;
                    const tries = Number(img.dataset.tries ?? 0);
                    if (tries < 5) {
                      img.dataset.tries = String(tries + 1);
                      setTimeout(() => {
                        img.src = `/api/artifacts/${shot}?retry=${tries + 1}`;
                      }, 1500);
                    }
                  }}
                />
              ) : (
                <div className="flex aspect-[9/19.5] items-center justify-center p-6 text-center text-sm text-muted">
                  {session.phase === "queued" ? "Waiting for a runner…" : "No screenshot yet"}
                </div>
              )}
            </div>
            {pinnedShot ? (
              <button
                type="button"
                onClick={() => setPinnedShot(null)}
                className="text-xs text-accent"
              >
                Back to the latest screenshot
              </button>
            ) : null}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ["Screens", session.counters.screensObserved],
                  ["Transitions", session.counters.transitionsObserved],
                  ["Actions", session.counters.actionsExecuted],
                  ["Checks", session.counters.checksRun],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-surface p-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-lg font-semibold">{value ?? 0}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-lg border border-border bg-surface p-3 text-xs text-muted">
              <p>
                {session.build?.app_name ?? "App"}
                {session.build?.sample_variant ? ` (sample: ${session.build.sample_variant})` : ""}
              </p>
              <p>
                {platformName(session.platform)}
                {session.device_profile?.osVersion
                  ? ` · OS ${session.device_profile.osVersion}`
                  : ""}
              </p>
              {session.stop_reason ? (
                <p>Stop reason: {session.stop_reason.replace(/_/g, " ")}</p>
              ) : null}
              {session.phase_detail ? <p>{session.phase_detail}</p> : null}
              <p className="mt-1">No coverage percentage is shown: the app's size is unknown.</p>
            </div>
          </aside>

          <section aria-label="Timeline" className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Timeline</h2>
            {sessionEvents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
                Events appear here as the runner works.
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
                {[...sessionEvents].reverse().map((e) => {
                  const d = describeEvent(e);
                  if (!d) return null;
                  return (
                    <li key={e.eventId} className="flex gap-3 p-3 text-sm">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[d.tone]}`}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium">{d.title}</p>
                          <time
                            className="shrink-0 font-mono text-xs text-muted"
                            dateTime={e.occurredAt}
                          >
                            {time(e.occurredAt)}
                          </time>
                        </div>
                        {d.detail ? <p className="text-muted">{d.detail}</p> : null}
                        {d.screenshotArtifactId ? (
                          <button
                            type="button"
                            onClick={() => setPinnedShot(d.screenshotArtifactId ?? null)}
                            className="self-start text-xs font-medium text-accent"
                          >
                            View screenshot
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      ) : (
        <p className="text-sm text-muted">This run has no platform sessions.</p>
      )}
    </div>
  );
}
