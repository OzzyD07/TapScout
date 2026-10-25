import { MAX_BUILD_BYTES } from "@tapscout/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ChevronRightIcon, ClockIcon, ListIcon, PhoneIcon, TabletIcon } from "@/components/icons";
import { Badge, Card, CardHeader, relativeTime, runTone } from "@/components/ui";
import { runStatusLabel } from "@/lib/runs/timeline";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { type BuildOption, StartTestForm } from "./start-test-form";
import { UploadBuild } from "./upload-build";

interface BuildRow {
  id: string;
  platform: "android" | "ios";
  app_name: string;
  file_name: string;
  sample_variant: string | null;
  is_sample: boolean;
  created_at: string;
  has_test_account: boolean;
  test_note: string | null;
}

interface RunRow {
  id: string;
  status: string;
  modes: string[];
  created_at: string;
  is_shared_sample: boolean;
  cancel_requested_at: string | null;
  android_build_id: string | null;
  ios_build_id: string | null;
}

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [builds, runs] = await Promise.all([
    supabase
      .from("app_builds")
      .select(
        "id, platform, app_name, file_name, sample_variant, is_sample, created_at, has_test_account, test_note",
      )
      .in("validation_status", ["uploaded", "accepted"])
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<BuildRow[]>(),
    supabase
      .from("test_runs")
      .select(
        "id, status, modes, created_at, is_shared_sample, cancel_requested_at, android_build_id, ios_build_id",
      )
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<RunRow[]>(),
  ]);

  // Newest first: a build the user just uploaded is preselected, otherwise the sample app.
  const options: BuildOption[] = (builds.data ?? []).map((b) => ({
    id: b.id,
    platform: b.platform,
    appName: b.app_name,
    detail: b.is_sample
      ? `sample${b.sample_variant ? `: ${b.sample_variant}` : ""}`
      : `${b.file_name} · ${new Date(b.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}`,
    isSample: b.is_sample,
    testAccount: b.has_test_account,
    note: b.test_note ?? undefined,
  }));
  const maxMb = Math.floor(
    (Number(process.env.STORAGE_BUILDS_MAX_BYTES) || MAX_BUILD_BYTES) / (1024 * 1024),
  );
  const now = Date.now();

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tests</h1>
          <p className="text-sm text-muted">
            An NVIDIA Nemotron agent explores your Android and iOS builds without test scripts and
            reports what it can show with evidence.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {builds.error ? (
              <Card className="px-5 py-4 text-sm text-danger">Could not load builds.</Card>
            ) : (
              <StartTestForm builds={options} />
            )}
            <UploadBuild maxMb={maxMb} />
          </div>

          <Card as="section" className="lg:sticky lg:top-20">
            <CardHeader
              title="Recent runs"
              description={runs.data?.length ? `Last ${runs.data.length}` : undefined}
              icon={<ListIcon size={14} />}
            />
            {runs.error ? (
              <p className="px-5 py-4 text-sm text-danger">Could not load runs.</p>
            ) : runs.data.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <ClockIcon size={20} className="text-faint" />
                <p className="text-sm text-muted">No runs yet. Start a test to see it here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {runs.data.map((r) => {
                  const active =
                    !r.cancel_requested_at && (r.status === "running" || r.status === "queued");
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/runs/${r.id}`}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium">
                              {r.id.slice(0, 8)}
                            </span>
                            <span className="flex items-center gap-1 text-muted">
                              {r.android_build_id ? <PhoneIcon size={13} /> : null}
                              {r.ios_build_id ? <TabletIcon size={13} /> : null}
                              <span className="sr-only">
                                {[r.android_build_id && "Android", r.ios_build_id && "iOS"]
                                  .filter(Boolean)
                                  .join(" and ")}
                              </span>
                            </span>
                            <span
                              className="ml-auto text-xs text-faint"
                              title={new Date(r.created_at).toLocaleString("en")}
                            >
                              {relativeTime(r.created_at, now)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.is_shared_sample ? (
                              <Badge tone="neutral">Sample run</Badge>
                            ) : (
                              <Badge
                                tone={runTone(r.status, Boolean(r.cancel_requested_at))}
                                dot
                                pulse={active}
                              >
                                {runStatusLabel(r.status, Boolean(r.cancel_requested_at))}
                              </Badge>
                            )}
                            <span className="truncate text-xs text-muted">
                              {r.modes.length === 5
                                ? "Full autonomous test"
                                : `${r.modes.length} ${r.modes.length === 1 ? "mode" : "modes"}`}
                            </span>
                          </div>
                        </div>
                        <ChevronRightIcon
                          size={16}
                          className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-muted"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
