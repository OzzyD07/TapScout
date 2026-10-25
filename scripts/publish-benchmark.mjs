#!/usr/bin/env node
// Publishes the latest successful build-benchmark artifacts (docs/07 A5) as ordinary user builds:
// owned by --owner (not samples), app_name from the build manifest. Each APK / Simulator .app.zip
// is uploaded to the private `builds` bucket and registered in app_builds. Idempotent: a build
// the owner already has with the same sha256 is skipped. Never prints secrets.
//
// Usage: node --env-file=.env scripts/publish-benchmark.mjs [--owner tester@tapscout.com]
//        [--run-id <build-benchmark run id>]

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const shared = await import(
  pathToFileURL(join(import.meta.dirname, "..", "packages/shared/dist/index.js")).href
);

const { values } = parseArgs({
  options: {
    "run-id": { type: "string" },
    owner: { type: "string", default: "tester@tapscout.com" },
  },
});
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in the environment`);
  return value;
};

const repo = process.env.GITHUB_REPOSITORY || "OzzyD07/TapScout";
const gh = async (path) => {
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: {
      authorization: `Bearer ${env("GITHUB_DISPATCH_TOKEN")}`,
      accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status}`);
  return res;
};

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = process.env.STORAGE_BUILDS_BUCKET || "builds";

const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (usersError) throw usersError;
const owner = users.users.find((u) => u.email === values.owner);
if (!owner) throw new Error(`no user ${values.owner}`);

// A run whose jobs partly failed still has usable artifacts; take the latest completed one.
const runId =
  values["run-id"] ??
  (
    await (
      await gh("actions/workflows/build-benchmark.yml/runs?status=completed&per_page=1")
    ).json()
  ).workflow_runs?.[0]?.id;
if (!runId) throw new Error("no completed build-benchmark run found");
console.log(`build-benchmark run ${runId}`);

async function publish(manifest, bytes) {
  const label = `${manifest.platform}/${manifest.benchmark} ${manifest.file}`;
  const { data: existing } = await supabase
    .from("app_builds")
    .select("id")
    .eq("owner_id", owner.id)
    .eq("sha256", manifest.sha256)
    .maybeSingle();
  if (existing) {
    console.log(`= ${label} already published as ${existing.id}`);
    return;
  }

  const id = randomUUID();
  const objectKey = `final/${id}/${manifest.file}`;
  const contentType =
    manifest.platform === "android" ? "application/vnd.android.package-archive" : "application/zip";
  // Builds above one part (Supabase Free: 50 MB per object) are stored in parts, as uploads are.
  const partKeys = shared.buildPartKeys(objectKey, bytes.length);
  for (const [i, key] of partKeys.entries()) {
    const start = i * shared.BUILD_PART_BYTES;
    const upload = await supabase.storage
      .from(bucket)
      .upload(key, bytes.subarray(start, start + shared.BUILD_PART_BYTES), {
        contentType,
        upsert: false,
      });
    if (upload.error) throw new Error(`${label}: upload failed: ${upload.error.message}`);
  }

  const { error } = await supabase.from("app_builds").insert({
    id,
    owner_id: owner.id,
    is_sample: false,
    platform: manifest.platform,
    app_name: manifest.app,
    file_name: manifest.file,
    content_type: contentType,
    size_bytes: bytes.length,
    staging_key: objectKey,
    object_key: objectKey,
    sha256: manifest.sha256,
    app_version: manifest.upstream?.ref?.slice(0, 40) ?? null,
    abis: manifest.platform === "android" ? [manifest.arch] : null,
    source_commit: manifest.sourceCommit,
    validation_status: "accepted",
  });
  if (error) {
    await supabase.storage.from(bucket).remove(partKeys);
    throw new Error(`${label}: database insert failed: ${error.message}`);
  }
  console.log(`+ ${label} → ${id} (${(manifest.sizeBytes / 1048576).toFixed(1)} MB)`);
}

const { artifacts } = await (await gh(`actions/runs/${runId}/artifacts?per_page=50`)).json();
const work = await mkdtemp(join(tmpdir(), "tapscout-benchmark-"));

try {
  for (const artifact of artifacts.filter((a) => /^bench-.+-(android|ios)$/.test(a.name))) {
    const dir = join(work, artifact.name);
    const zip = `${dir}.zip`;
    await writeFile(
      zip,
      Buffer.from(await (await gh(`actions/artifacts/${artifact.id}/zip`)).arrayBuffer()),
    );
    execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);

    for (const manifestFile of (await readdir(dir)).filter((f) => f.endsWith(".manifest.json"))) {
      const manifest = JSON.parse(await readFile(join(dir, manifestFile), "utf8"));
      const bytes = await readFile(join(dir, manifest.file));
      if (bytes.length !== manifest.sizeBytes) {
        throw new Error(`${manifest.benchmark}: size does not match manifest`);
      }
      await publish(manifest, bytes);
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
