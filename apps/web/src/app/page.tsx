import { MODES } from "@tapscout/shared";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

interface BuildRow {
  id: string;
  platform: "android" | "ios";
  app_name: string;
  sample_variant: string | null;
  validation_status: string;
  is_sample: boolean;
}

interface RunRow {
  id: string;
  status: string;
  modes: string[];
  created_at: string;
  is_shared_sample: boolean;
}

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [builds, runs] = await Promise.all([
    supabase
      .from("app_builds")
      .select("id, platform, app_name, sample_variant, validation_status, is_sample")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<BuildRow[]>(),
    supabase
      .from("test_runs")
      .select("id, status, modes, created_at, is_shared_sample")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<RunRow[]>(),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TapScout</h1>
          <p className="text-sm text-muted">Autonomous QA for Android and iOS</p>
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
        <h2 className="text-lg font-semibold">Builds</h2>
        {builds.error ? (
          <p className="text-sm text-danger">Could not load builds.</p>
        ) : builds.data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
            No builds yet. Sample Android and iOS builds will appear here.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {builds.data.map((b) => (
              <li key={b.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-medium">
                  {b.app_name}{" "}
                  <span className="text-sm text-muted">
                    · {b.platform === "ios" ? "iOS Simulator" : "Android"}
                  </span>
                </p>
                <p className="text-sm text-muted">
                  {b.is_sample ? `Sample (${b.sample_variant ?? "default"})` : "Uploaded"} ·{" "}
                  {b.validation_status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Test modes</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => (
            <li key={m.mode} className="rounded-xl border border-border bg-surface p-4">
              <p className="font-medium">{m.label}</p>
              <p className="text-sm text-muted">{m.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent runs</h2>
        {runs.error ? (
          <p className="text-sm text-danger">Could not load runs.</p>
        ) : runs.data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
            No runs yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {runs.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                <span>{r.modes.length} modes</span>
                <span className="text-muted">{new Date(r.created_at).toLocaleString("en")}</span>
                <span className="font-medium">
                  {r.is_shared_sample ? "Previously completed sample run" : r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
