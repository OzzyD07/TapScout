import Link from "next/link";
import { redirect } from "next/navigation";
import { runStatusLabel } from "@/lib/runs/timeline";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import { type BuildOption, StartTestForm } from "./start-test-form";

interface BuildRow {
  id: string;
  platform: "android" | "ios";
  app_name: string;
  sample_variant: string | null;
  is_sample: boolean;
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
      .select("id, platform, app_name, sample_variant, is_sample")
      .eq("validation_status", "accepted")
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

  // Newest accepted build per platform; the sample app is the default choice for the jury.
  const options: BuildOption[] = [];
  for (const platform of ["android", "ios"] as const) {
    const b = builds.data?.find((x) => x.platform === platform);
    if (b) {
      options.push({
        id: b.id,
        platform,
        label: `${b.app_name} · ${platform === "ios" ? "iOS Simulator" : "Android"}${b.is_sample ? " (sample)" : ""}`,
      });
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TapScout</h1>
          <p className="text-sm text-muted">
            Autonomous QA for Android and iOS — no test scripts required
          </p>
        </div>
        <form action={signOut} className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{user.email}</span>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-surface"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Start a test</h2>
        {builds.error ? (
          <p className="text-sm text-danger">Could not load builds.</p>
        ) : (
          <StartTestForm builds={options} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent runs</h2>
        {runs.error ? (
          <p className="text-sm text-danger">Could not load runs.</p>
        ) : runs.data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
            No runs yet. Start a test above.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {runs.data.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4 text-sm hover:bg-bg"
                >
                  <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                  <span className="text-muted">
                    {[r.android_build_id && "Android", r.ios_build_id && "iOS"]
                      .filter(Boolean)
                      .join(" + ")}{" "}
                    · {r.modes.length} {r.modes.length === 1 ? "mode" : "modes"}
                  </span>
                  <span className="text-muted">{new Date(r.created_at).toLocaleString("en")}</span>
                  <span className="font-medium">
                    {r.is_shared_sample
                      ? "Previously completed sample run"
                      : runStatusLabel(r.status, Boolean(r.cancel_requested_at))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
