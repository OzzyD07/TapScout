// TEMPORARY probe (not committed): does the vision model give usable tap coordinates?
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [runPrefix, platform, ...steps] = process.argv.slice(2);
const out = process.env.PROBE_OUT;
const db = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);
const { data: runs } = await db
  .from("test_runs")
  .select("id")
  .order("created_at", { ascending: false })
  .limit(200);
const run = runs.find((r) => r.id.startsWith(runPrefix));
const { data: sess } = await db
  .from("platform_sessions")
  .select("id")
  .eq("run_id", run.id)
  .eq("platform", platform)
  .single();
for (const step of steps.map(Number)) {
  const { data: arts } = await db
    .from("artifacts")
    .select("kind, object_key")
    .eq("session_id", sess.id)
    .eq("step_index", step);
  for (const a of arts) {
    const { data } = await db.storage.from("evidence").download(a.object_key);
    const buf = Buffer.from(await data.arrayBuffer());
    writeFileSync(
      `${out}/${platform}-${step}.${a.kind === "screenshot" ? "png" : a.kind === "hierarchy" ? "xml" : "txt"}`,
      buf,
    );
  }
  console.log(step, arts.map((a) => a.kind).join(","));
}
