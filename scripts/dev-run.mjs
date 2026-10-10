#!/usr/bin/env node
// Developer tool: create a TapScout run on the sample builds and dispatch qa-run.yml, the same
// steps the API performs for "Start Test" (atomic run + outbox → claim → dispatch → record).
// Usage: node --env-file=.env scripts/dev-run.mjs --owner <email> [--platforms both|android|ios]
//        [--modes functional,ui_ux] [--variant fixed]

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const root = join(import.meta.dirname, "..");
const shared = await import(pathToFileURL(join(root, "packages/shared/dist/index.js")).href);

const { values } = parseArgs({
  options: {
    owner: { type: "string" },
    platforms: { type: "string", default: "both" },
    modes: { type: "string", default: "functional" },
    variant: { type: "string", default: "fixed" },
  },
});
const env = (n) => {
  if (!process.env[n]) throw new Error(`missing ${n}`);
  return process.env[n];
};
if (!values.owner) throw new Error("--owner <email> is required");

const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: users, error: usersError } = await db.auth.admin.listUsers({ perPage: 200 });
if (usersError) throw usersError;
const owner = users.users.find((u) => u.email === values.owner);
if (!owner) throw new Error(`no user ${values.owner}`);

async function sampleBuild(platform) {
  const { data, error } = await db
    .from("app_builds")
    .select("id")
    .eq("is_sample", true)
    .eq("platform", platform)
    .eq("sample_variant", values.variant)
    .eq("validation_status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`no ${values.variant} sample build for ${platform}`);
  return data.id;
}

const wantAndroid = values.platforms !== "ios";
const wantIos = values.platforms !== "android";
const config = {
  budget: shared.DEFAULT_PLATFORM_BUDGET,
  reportBudget: shared.DEFAULT_REPORT_BUDGET,
};
const { data: runId, error: createError } = await db.rpc("create_test_run", {
  p_owner: owner.id,
  p_android_build: wantAndroid ? await sampleBuild("android") : null,
  p_ios_build: wantIos ? await sampleBuild("ios") : null,
  p_modes: values.modes.split(","),
  p_config: config,
  p_version_stamp: {
    agent: "f1-pilot",
    prompt: "none",
    checkPack: "none",
    rulePack: "none",
    budget: config.budget.budgetVersion,
    plannerModel: "none",
  },
});
if (createError) throw createError;
console.log(`run ${runId} created for ${values.owner}`);

const worker = `dev-run:${process.pid}`;
const { data: claimed, error: claimError } = await db.rpc("claim_outbox", {
  p_worker: worker,
  p_batch: 20,
  p_claim_seconds: 120,
});
if (claimError) throw claimError;
const item = claimed.find((o) => o.run_id === runId && o.kind === "dispatch_run");
if (!item) throw new Error("dispatch outbox item was not claimable");

const repo = env("GITHUB_REPOSITORY");
const res = await fetch(
  `https://api.github.com/repos/${repo}/actions/workflows/${process.env.GITHUB_WORKFLOW_ID || "qa-run.yml"}/dispatches`,
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("GITHUB_DISPATCH_TOKEN")}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ref: process.env.GITHUB_WORKFLOW_REF || "main",
      inputs: { run_id: runId, platforms: values.platforms },
      return_run_details: true,
    }),
  },
);
const text = await res.text();
const details = text ? JSON.parse(text) : {};
if (!res.ok) {
  await db.rpc("complete_outbox", {
    p_id: item.id,
    p_worker: worker,
    p_outcome: "retry",
    p_provider_ref: null,
    p_error: `HTTP ${res.status}`,
    p_retry_seconds: 60,
  });
  throw new Error(`dispatch failed: HTTP ${res.status} ${text.slice(0, 200)}`);
}
const providerRef = details.workflow_run_id ? { workflowRunId: details.workflow_run_id } : null;
await db.rpc("complete_outbox", {
  p_id: item.id,
  p_worker: worker,
  p_outcome: "dispatched",
  p_provider_ref: providerRef,
  p_error: null,
  p_retry_seconds: 0,
});
console.log(
  `dispatched qa-run${details.html_url ? `: ${details.html_url}` : " (no run details returned)"}`,
);
