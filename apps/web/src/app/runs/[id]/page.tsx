import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fromRow, type RunEventRow } from "@/lib/runs/timeline";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { type RunSnapshot, RunView, type SessionSnapshot } from "./run-view";

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Read with the user's own session: RLS decides whether this run is visible.
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("test_runs")
    .select(
      "id, owner_id, status, modes, created_at, started_at, finished_at, cancel_requested_at, is_shared_sample, github_run_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!run) notFound();

  const [{ data: sessions }, { data: events }, { data: report }] = await Promise.all([
    supabase
      .from("platform_sessions")
      .select(
        "id, platform, phase, stop_reason, phase_detail, counters, device_profile, started_at, finished_at, build:app_builds(app_name, file_name, sample_variant)",
      )
      .eq("run_id", id)
      .order("platform"),
    supabase
      .from("run_events")
      .select("event_id, session_id, sequence, type, phase, step_index, occurred_at, payload")
      .eq("run_id", id)
      .order("sequence")
      .limit(2000),
    supabase
      .from("reports")
      .select("report_version, overall_status, data, created_at")
      .eq("run_id", id)
      .order("report_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const snapshot: RunSnapshot = {
    id: run.id,
    status: run.status,
    modes: run.modes,
    createdAt: run.created_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    cancelRequested: Boolean(run.cancel_requested_at),
    isSharedSample: run.is_shared_sample,
    canCancel: run.owner_id === user.id,
    githubRunId: run.github_run_id,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← All runs
      </Link>
      <RunView
        run={snapshot}
        sessions={(sessions ?? []) as unknown as SessionSnapshot[]}
        events={((events ?? []) as RunEventRow[]).map(fromRow)}
        report={
          report
            ? {
                overallStatus: report.overall_status,
                createdAt: report.created_at,
                limitations: (report.data as { limitations?: string[] }).limitations ?? [],
              }
            : null
        }
      />
    </div>
  );
}
