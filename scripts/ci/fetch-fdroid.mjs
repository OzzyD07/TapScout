#!/usr/bin/env node
// Downloads the pinned F-Droid APKs of the benchmark set (scripts/benchmark/apps.json), checks
// each against its pinned sha256 and writes a build manifest next to it. A hash mismatch fails
// the job: the file is never published.
//
// Usage: node scripts/ci/fetch-fdroid.mjs --out <dir> [--app <key>]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { out: { type: "string", default: "out" }, app: { type: "string" } },
});
const root = join(import.meta.dirname, "..", "..");
const { apps } = JSON.parse(await readFile(join(root, "scripts/benchmark/apps.json"), "utf8"));
await mkdir(values.out, { recursive: true });

for (const app of apps) {
  const android = app.android;
  if (android?.kind !== "fdroid" || (values.app && values.app !== app.key)) continue;
  const name = `${android.package}_${android.versionCode}.apk`;
  const res = await fetch(`https://f-droid.org/repo/${name}`, {
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`${app.key}: F-Droid HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== android.sha256) {
    throw new Error(`${app.key}: sha256 ${sha256} does not match the pinned ${android.sha256}`);
  }
  const file = join(values.out, `bench-${app.key}-android-${android.abi}.apk`);
  await writeFile(file, bytes);
  execFileSync(
    process.execPath,
    [
      join(root, "scripts/ci/build-manifest.mjs"),
      "--file",
      file,
      "--platform",
      "android",
      "--variant",
      "benchmark",
      "--arch",
      android.abi,
      "--app",
      app.name,
      "--benchmark",
      app.key,
      "--source",
      `https://f-droid.org/packages/${android.package}/`,
      "--ref",
      `${android.versionName} (${android.versionCode})`,
      "--toolchain",
      "F-Droid release build",
    ],
    { stdio: "inherit" },
  );
}
