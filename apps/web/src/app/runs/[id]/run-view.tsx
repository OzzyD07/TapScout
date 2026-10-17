"use client";

import { MODES } from "@tapscout/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeftIcon,
  ExternalIcon,
  EyeIcon,
  PhoneIcon,
  TabletIcon,
  XIcon,
} from "@/components/icons";
import {
  Badge,
  buttonClass,
  Card,
  DOT_CLASSES,
  platformName,
  platformShort,
  runTone,
  Stat,
  Tag,
} from "@/components/ui";
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
} from "@/lib/runs/timeline";
import { createClient } from "@/lib/supabase/browser";
import { ReportSection, type ReportSnapshot } from "./report-section";

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

const time = (iso: string) => new Date(iso).toLocaleTimeString("en", { hour12: false });

/** "12 min 30 s" between two timestamps (or until now). */
function duration(from: string | null, to: string | null): string | null {
  if (!from) return null;
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

type Filter = "all" | "actions" | "findings" | "notes";
const FILTERS: { value: Filter; label: string; types: string[] | null }[] = [
  { value: "all", label: "All", types: null },
  { value: "actions", label: "Actions", types: ["action_planned", "action_executed"] },
  {
    value: "findings",
    label: "Checks & findings",
    types: ["check_result", "finding_candidate", "finding_updated", "blocked"],
  },
  { value: "notes", label: "Notes", types: ["note", "phase_changed", "stopped"] },
];

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
  const [filter, setFilter] = useState<Filter>("all");
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
  const types = FILTERS.find((f) => f.value === filter)?.types;
  const shown = useMemo(
    () =>
      [...sessionEvents]
        .reverse()
        .filter((e) => !types || types.includes(e.type))
        .flatMap((e) => {
          const d = describeEvent(e);
          return d ? [{ e, d }] : [];
        }),
    [sessionEvents, types],
  );
  const shot = pinnedShot ?? (session ? latestScreenshot(events, session.id) : undefined);
  const active = run.status === "queued" || run.status === "running";
  const sessionActive = session
    ? !["completed", "cancelled", "blocked", "infrastructure_failed"].includes(session.phase)
    : false;

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
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-text"
        >
          <ArrowLeftIcon size={14} /> Tests
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Run <span className="font-mono">{run.id.slice(0, 8)}</span>
              </h1>
              <Badge tone={runTone(run.status, run.cancelRequested)} dot pulse={active}>
                {runStatusLabel(run.status, run.cancelRequested)}
              </Badge>
              {run.isSharedSample ? (
                <Badge tone="warn">Previously completed sample run</Badge>
              ) : null}
              <span
                className="inline-flex items-center gap-1.5 text-xs text-muted"
                aria-live="polite"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${live === "live" ? "bg-ok" : live === "offline" ? "bg-danger" : "bg-warn"} ${live === "live" && active ? "animate-pulse-dot" : ""}`}
                />
                {live === "live" ? "Live" : live === "offline" ? "Reconnecting…" : "Connecting…"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {run.modes.map((m) => (
                <Tag key={m}>{MODES.find((x) => x.mode === m)?.label ?? m}</Tag>
              ))}
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>Created {new Date(run.createdAt).toLocaleString("en")}</span>
              {run.finishedAt ? (
                <span>Finished {new Date(run.finishedAt).toLocaleString("en")}</span>
              ) : null}
              {duration(run.startedAt ?? run.createdAt, run.finishedAt) ? (
                <span suppressHydrationWarning>
                  {run.finishedAt ? "Took" : "Running for"}{" "}
                  {duration(run.startedAt ?? run.createdAt, run.finishedAt)}
                </span>
              ) : null}
              {run.githubRunId ? (
                <a
                  href={`https://github.com/OzzyD07/TapScout/actions/runs/${run.githubRunId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-text"
                >
                  Runner logs <ExternalIcon size={11} />
                </a>
              ) : null}
            </p>
          </div>
          {run.canCancel && active && !run.cancelRequested ? (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button
                type="button"
                onClick={cancel}
                disabled={cancelling}
                className={buttonClass("danger", "sm")}
              >
                <XIcon size={14} />
                {cancelling ? "Cancelling…" : "Cancel run"}
              </button>
              {cancelError ? <p className="text-xs text-danger">{cancelError}</p> : null}
            </div>
          ) : null}
        </div>
      </header>

      {props.report ? (
        <ReportSection
          report={props.report}
          phases={sessions.map((s) => ({ platform: s.platform, phase: s.phase }))}
          onShowEvidence={(platform, artifactId) => {
            const s = sessions.find((x) => x.platform === platform);
            if (s) setSelected(s.id);
            setPinnedShot(artifactId);
            requestAnimationFrame(() =>
              document
                .getElementById("evidence-viewer")
                ?.scrollIntoView({ block: "center", behavior: "smooth" }),
            );
          }}
        />
      ) : active ? (
        <Card className="flex items-start gap-3 px-4 py-3 text-sm sm:px-5">
          <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse-dot rounded-full bg-accent" />
          <p className="text-muted">
            <span className="font-medium text-text">The agent is working.</span> Follow it live
            below; the report with findings, checks and a screen map appears here when every
            platform has finished.
          </p>
        </Card>
      ) : null}

      <Card as="section" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
          <h2 className="text-sm font-semibold">Session</h2>
          <div
            role="tablist"
            aria-label="Platforms"
            className="flex gap-1 rounded-lg border border-border bg-surface-2 p-0.5"
          >
            {sessions.map((s) => {
              const on = s.id === session?.id;
              const Icon = s.platform === "ios" ? TabletIcon : PhoneIcon;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setSelected(s.id);
                    setPinnedShot(null);
                  }}
                  className={`flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors ${
                    on
                      ? "bg-surface text-text shadow-xs ring-1 ring-border"
                      : "text-muted hover:text-text"
                  }`}
                >
                  <Icon size={14} />
                  {platformShort(s.platform)}
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[phaseTone(s.phase)]}`}
                    title={phaseLabel(s.phase)}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {session ? (
          <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-4 border-border p-4 sm:p-5 lg:border-r">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={phaseTone(session.phase)} dot pulse={sessionActive}>
                  {phaseLabel(session.phase)}
                </Badge>
                {pinnedShot ? (
                  <button
                    type="button"
                    onClick={() => setPinnedShot(null)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Back to live screen
                  </button>
                ) : (
                  <span className="text-xs text-faint">
                    {sessionActive ? "Latest screenshot" : "Last screenshot"}
                  </span>
                )}
              </div>
              <div
                id="evidence-viewer"
                className="relative mx-auto w-full max-w-[260px] scroll-mt-24 rounded-[2.25rem] border border-border-strong bg-text/90 p-2 shadow-lg dark:bg-surface-2"
              >
                <div className="overflow-hidden rounded-[1.75rem] bg-surface">
                  {shot ? (
                    // biome-ignore lint/performance/noImgElement: signed Storage redirect, not a static asset
                    <img
                      key={shot}
                      src={`/api/artifacts/${shot}`}
                      alt={`${pinnedShot ? "Selected" : "Latest"} ${platformName(session.platform)} screenshot`}
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
                    <div className="flex aspect-[9/19.5] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
                      {session.platform === "ios" ? (
                        <TabletIcon size={22} />
                      ) : (
                        <PhoneIcon size={22} />
                      )}
                      {session.phase === "queued" ? "Waiting for a runner…" : "No screenshot yet"}
                    </div>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <Stat label="Screens" value={session.counters.screensObserved ?? 0} />
                <Stat label="Transitions" value={session.counters.transitionsObserved ?? 0} />
                <Stat label="Actions" value={session.counters.actionsExecuted ?? 0} />
                <Stat label="Checks" value={session.counters.checksRun ?? 0} />
              </dl>
              <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2/50 p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">App</dt>
                  <dd className="truncate text-right font-medium">
                    {session.build?.app_name ?? "App"}
                    {session.build?.sample_variant ? (
                      <span className="font-normal text-muted">
                        {" "}
                        · {session.build.sample_variant}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Device</dt>
                  <dd className="text-right">
                    {platformName(session.platform)}
                    {session.device_profile?.osVersion
                      ? ` · ${session.device_profile.osVersion}`
                      : ""}
                  </dd>
                </div>
                {duration(session.started_at, session.finished_at) ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Time</dt>
                    <dd className="font-mono" suppressHydrationWarning>
                      {duration(session.started_at, session.finished_at)}
                    </dd>
                  </div>
                ) : null}
                {session.stop_reason ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Stopped</dt>
                    <dd className="text-right">{session.stop_reason.replace(/_/g, " ")}</dd>
                  </div>
                ) : null}
                {session.phase_detail ? (
                  <p className="mt-1 border-t border-border pt-2 text-muted">
                    {session.phase_detail}
                  </p>
                ) : null}
              </dl>
              <p className="text-xs text-faint">
                No coverage percentage is shown: the size of the app is unknown.
              </p>
            </aside>

            <section aria-label="Timeline" className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 sm:px-5">
                <h3 className="text-sm font-semibold">
                  Timeline{" "}
                  <span className="font-mono text-xs font-normal text-muted">{shown.length}</span>
                </h3>
                {/* biome-ignore lint/a11y/useSemanticElements: a toolbar of toggle buttons */}
                <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={filter === f.value}
                      onClick={() => setFilter(f.value)}
                      className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                        filter === f.value
                          ? "bg-text text-bg"
                          : "text-muted hover:bg-surface-2 hover:text-text"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {shown.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted">
                  {sessionEvents.length === 0
                    ? "Events appear here as the runner works."
                    : "Nothing of this kind yet."}
                </p>
              ) : (
                <ol className="max-h-[760px] overflow-y-auto px-4 py-2 sm:px-5">
                  {shown.map(({ e, d }) => (
                    <li key={e.eventId} className="relative flex gap-3 py-2.5 pl-1">
                      <span className="absolute top-0 bottom-0 left-[7.5px] w-px bg-border" />
                      <span
                        className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-surface ${DOT_CLASSES[d.tone]}`}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 font-medium break-words">{d.title}</p>
                          <time
                            className="shrink-0 font-mono text-[11px] text-faint"
                            dateTime={e.occurredAt}
                          >
                            {e.stepIndex !== null ? `#${e.stepIndex} · ` : ""}
                            {time(e.occurredAt)}
                          </time>
                        </div>
                        {d.detail ? <p className="text-muted break-words">{d.detail}</p> : null}
                        {d.screenshotArtifactId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPinnedShot(d.screenshotArtifactId ?? null);
                              if (window.matchMedia("(max-width: 1023px)").matches) {
                                document
                                  .getElementById("evidence-viewer")
                                  ?.scrollIntoView({ block: "center", behavior: "smooth" });
                              }
                            }}
                            className={`mt-0.5 inline-flex w-fit items-center gap-1 text-xs font-medium ${
                              pinnedShot === d.screenshotArtifactId
                                ? "text-text"
                                : "text-accent hover:underline"
                            }`}
                          >
                            <EyeIcon size={12} />
                            {pinnedShot === d.screenshotArtifactId ? "Showing" : "View screenshot"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-muted">This run has no platform sessions.</p>
        )}
      </Card>
    </div>
  );
}
