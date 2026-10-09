#!/usr/bin/env node
// Publishes the latest successful build-sample artifacts as sample builds: uploads each APK /
// Simulator .app.zip to the private `builds` bucket and registers it in app_builds (is_sample).
// Idempotent: a build with the same sha256 is not uploaded twice. Never prints secrets.
//
// Usage: node --env-file=.env scripts/publish-sample.mjs [--run-id <build-sample run id>]

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({ options: { "run-id": { type: "string" } } });
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in the environment`);
  return value;
};

const repo = process.env.GITHUB_REPOSITORY || "OzzyD07/TapScout";
const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env("GITHUB_DISPATCH_TOKEN")}`,
      accept: "application/vnd.github+json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status}`);
  return res;
};

const runId =
  values["run-id"] ??
  (await (await gh("actions/workflows/build-sample.yml/runs?status=success&per_page=1")).json())
    .workflow_runs?.[0]?.id;
if (!runId) throw new Error("no successful build-sample run found");
console.log(`build-sample run ${runId}`);

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = process.env.STORAGE_BUILDS_BUCKET || "builds";

const { artifacts } = await (await gh(`actions/runs/${runId}/artifacts?per_page=50`)).json();
const work = await mkdtemp(join(tmpdir(), "tapscout-publish-"));

try {
  for (const artifact of artifacts.filter((a) => /^fieldnotes-.+-(android|ios)$/.test(a.name))) {
    const dir = join(work, artifact.name);
    const zip = `${dir}.zip`;
    // GitHub redirects to a pre-signed blob URL; fetch drops our token on the cross-origin hop.
    await writeFile(
      zip,
      Buffer.from(await (await gh(`actions/artifacts/${artifact.id}/zip`)).arrayBuffer()),
    );
    execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);

    for (const manifestFile of (await readdir(dir)).filter((f) => f.endsWith(".manifest.json"))) {
      const manifest = JSON.parse(await readFile(join(dir, manifestFile), "utf8"));
      const label = `${manifest.platform}/${manifest.variant} ${manifest.file}`;

      const { data: existing } = await supabase
        .from("app_builds")
        .select("id")
        .eq("is_sample", true)
        .eq("sha256", manifest.sha256)
        .maybeSingle();
      if (existing) {
        console.log(`= ${label} already published as ${existing.id}`);
        continue;
      }

      const bytes = await readFile(join(dir, manifest.file));
      if (bytes.length !== manifest.sizeBytes)
        throw new Error(`${label}: size does not match manifest`);
      const id = randomUUID();
      const objectKey = `final/${id}/${manifest.file}`;
      const contentType =
        manifest.platform === "android"
          ? "application/vnd.android.package-archive"
          : "application/zip";

      const upload = await supabase.storage
        .from(bucket)
        .upload(objectKey, bytes, { contentType, upsert: false });
      if (upload.error) throw new Error(`${label}: upload failed: ${upload.error.message}`);

      const { error } = await supabase.from("app_builds").insert({
        id,
        owner_id: null,
        is_sample: true,
        sample_variant: manifest.variant,
        platform: manifest.platform,
        app_name: "FieldNotes",
        file_name: manifest.file,
        content_type: contentType,
        size_bytes: manifest.sizeBytes,
        staging_key: objectKey,
        object_key: objectKey,
        sha256: manifest.sha256,
        app_id: "dev.tapscout.fieldnotes",
        app_version: "1.0.0",
        abis: manifest.platform === "android" ? [manifest.arch] : null,
        source_commit: manifest.sourceCommit,
        validation_status: "accepted",
      });
      if (error) {
        await supabase.storage.from(bucket).remove([objectKey]);
        throw new Error(`${label}: database insert failed: ${error.message}`);
      }
      console.log(`+ ${label} → ${id} (${(manifest.sizeBytes / 1048576).toFixed(1)} MB)`);
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
