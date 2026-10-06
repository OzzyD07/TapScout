-- Core schema for TapScout (docs/02 §6).
-- Writes happen only on the server (secret key) or through the RPCs in the next migration.
-- Browsers read through RLS: own runs, plus explicitly shared sample runs/builds.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: roles are assigned by an admin, never taken from user_metadata.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'jury' check (role in ('jury', 'developer', 'admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Builds
-- ---------------------------------------------------------------------------
create table public.app_builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  is_sample boolean not null default false,
  sample_variant text check (sample_variant in ('seeded', 'fixed', 'changed_flow')),
  platform text not null check (platform in ('android', 'ios')),
  app_name text not null check (char_length(app_name) between 1 and 100),
  file_name text not null,
  content_type text not null check (content_type in ('application/vnd.android.package-archive', 'application/zip')),
  size_bytes bigint not null check (size_bytes > 0),
  staging_key text not null unique,
  -- Immutable key the runner downloads from; set at finalize, never re-pointed.
  object_key text unique,
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  app_id text,
  app_version text,
  min_os text,
  abis text[],
  source_commit text,
  validation_status text not null default 'awaiting_upload'
    check (validation_status in ('awaiting_upload', 'uploaded', 'accepted', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index app_builds_owner_idx on public.app_builds (owner_id, created_at desc);
create index app_builds_sample_idx on public.app_builds (is_sample) where is_sample;

-- ---------------------------------------------------------------------------
-- Runs and platform sessions
-- ---------------------------------------------------------------------------
create table public.test_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- A real, previously completed run shown to every signed-in user as a labelled sample.
  is_shared_sample boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial', 'cancelled', 'infrastructure_failed')),
  modes text[] not null check (
    cardinality(modes) between 1 and 5
    and modes <@ array['functional', 'stress', 'ui_ux', 'accessibility', 'store_readiness']
  ),
  android_build_id uuid references public.app_builds (id),
  ios_build_id uuid references public.app_builds (id),
  config jsonb not null,
  budget_version text not null,
  version_stamp jsonb not null default '{}'::jsonb,
  github_run_id bigint,
  github_run_attempt int,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (android_build_id is not null or ios_build_id is not null)
);
create index test_runs_owner_idx on public.test_runs (owner_id, created_at desc);
create index test_runs_shared_idx on public.test_runs (is_shared_sample) where is_shared_sample;
create index test_runs_active_idx on public.test_runs (status) where status in ('queued', 'running');

create table public.platform_sessions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  build_id uuid not null references public.app_builds (id),
  phase text not null default 'queued' check (phase in (
    'queued', 'preparing', 'exploring', 'testing', 'reproducing', 'reporting',
    'completed', 'cancelled', 'blocked', 'infrastructure_failed')),
  stop_reason text check (stop_reason in (
    'goals_exhausted', 'budget_exhausted', 'access_blocked', 'unsupported', 'cancelled', 'infrastructure_failed')),
  phase_detail text,
  -- Lease: only the holder of (attempt_id, lease_version) may act or write results.
  attempt_id uuid,
  attempt_no int not null default 0,
  lease_version int not null default 0,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  github_job_id bigint,
  device_profile jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  counters jsonb not null default '{}'::jsonb,
  checkpoint jsonb,
  result jsonb,
  next_event_seq bigint not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  unique (run_id, platform)
);
create index platform_sessions_run_idx on public.platform_sessions (run_id);
create index platform_sessions_active_idx on public.platform_sessions (lease_expires_at)
  where phase not in ('completed', 'cancelled', 'blocked', 'infrastructure_failed');

-- ---------------------------------------------------------------------------
-- Durable work: dispatch outbox and report attempts (docs/02 §7)
-- ---------------------------------------------------------------------------
create table public.dispatch_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dispatch_run', 'dispatch_report', 'cancel_run')),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'dispatched', 'retry', 'terminal')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  next_retry_at timestamptz not null default now(),
  claimed_by text,
  claim_expires_at timestamptz,
  -- e.g. {"workflowRunId": 123} — needed before any re-dispatch after an ambiguous response.
  provider_ref jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dispatch_outbox_due_idx on public.dispatch_outbox (next_retry_at)
  where status in ('pending', 'retry', 'claimed');

create table public.report_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  report_version int not null,
  attempt_no int not null,
  lease_version int not null default 1,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  phase text not null default 'started' check (phase in ('started', 'completed', 'failed', 'expired')),
  error text,
  created_at timestamptz not null default now(),
  unique (run_id, report_version, attempt_no)
);

-- ---------------------------------------------------------------------------
-- Screen/state graph (platform specific, docs/03 §3.2)
-- ---------------------------------------------------------------------------
create table public.screen_states (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid not null references public.platform_sessions (id) on delete cascade,
  fingerprint text not null,
  label text,
  conditions jsonb not null default '{}'::jsonb,
  visits int not null default 1,
  first_seen_step int not null,
  representative_artifact_id uuid,
  created_at timestamptz not null default now(),
  unique (session_id, fingerprint)
);

create table public.transitions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid not null references public.platform_sessions (id) on delete cascade,
  from_state_id uuid not null references public.screen_states (id) on delete cascade,
  to_state_id uuid references public.screen_states (id) on delete cascade,
  step_index int not null,
  action jsonb not null,
  locator jsonb,
  outcome text not null check (outcome in ('ok', 'failed', 'timeout', 'uncertain', 'rejected')),
  evidence_artifact_id uuid,
  created_at timestamptz not null default now()
);
create index transitions_session_idx on public.transitions (session_id, step_index);

-- ---------------------------------------------------------------------------
-- Events: sequence is assigned per session by append_run_events (reconnect cursor)
-- ---------------------------------------------------------------------------
create table public.run_events (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid not null references public.platform_sessions (id) on delete cascade,
  attempt_id uuid not null,
  sequence bigint not null,
  client_sequence bigint not null,
  step_index int,
  type text not null,
  phase text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (session_id, sequence)
);
create index run_events_run_idx on public.run_events (run_id, session_id, sequence);

-- ---------------------------------------------------------------------------
-- Artifacts (R2 object keys; never signed URLs)
-- ---------------------------------------------------------------------------
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid references public.platform_sessions (id) on delete cascade,
  attempt_id uuid,
  kind text not null check (kind in ('screenshot', 'hierarchy', 'log', 'video', 'manifest', 'report')),
  object_key text not null unique,
  content_type text not null,
  size_bytes bigint,
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  step_index int,
  created_at timestamptz not null default now(),
  ready_at timestamptz
);
create index artifacts_run_idx on public.artifacts (run_id, session_id, step_index);

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid not null references public.platform_sessions (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  mode text not null,
  check_id text not null,
  status text not null check (status in ('passed_within_scope', 'failed', 'inconclusive', 'not_tested', 'unsupported')),
  store_status text check (store_status in (
    'evidence_found', 'potential_risk', 'needs_additional_information', 'not_applicable', 'not_assessed')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (session_id, check_id)
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid not null references public.platform_sessions (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  mode text not null,
  check_id text,
  title text not null,
  verification text not null check (verification in ('observed', 'reproduced', 'potential_issue', 'manual_review_required')),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  -- Full Finding contract (packages/shared findings.ts).
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index findings_run_idx on public.findings (run_id, platform);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  report_version int not null,
  report_attempt_id uuid references public.report_attempts (id),
  overall_status text not null,
  data jsonb not null,
  object_key text,
  created_at timestamptz not null default now(),
  unique (run_id, report_version)
);

-- ---------------------------------------------------------------------------
-- Usage and model budgets
-- ---------------------------------------------------------------------------
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid references public.platform_sessions (id) on delete cascade,
  report_attempt_id uuid references public.report_attempts (id) on delete cascade,
  kind text not null check (kind in ('model', 'runner_minutes', 'artifact_bytes')),
  model text,
  purpose text,
  input_tokens int,
  output_tokens int,
  usage_reported boolean,
  latency_ms int,
  quantity numeric,
  estimated_cost_usd numeric(12, 6),
  created_at timestamptz not null default now()
);
create index usage_records_run_idx on public.usage_records (run_id);

-- One row per (session or report attempt, role). Reservations stop parallel calls from
-- spending the same balance twice (docs/03 §9).
create table public.model_budgets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.test_runs (id) on delete cascade,
  session_id uuid references public.platform_sessions (id) on delete cascade,
  report_attempt_id uuid references public.report_attempts (id) on delete cascade,
  role text not null check (role in ('planner', 'vision', 'report')),
  limit_input int not null,
  limit_output int not null,
  limit_requests int not null,
  used_input int not null default 0,
  used_output int not null default 0,
  used_requests int not null default 0,
  reserved_input int not null default 0,
  reserved_output int not null default 0,
  check (num_nonnulls(session_id, report_attempt_id) = 1)
);
create unique index model_budgets_session_role_idx on public.model_budgets (session_id, role) where session_id is not null;
create unique index model_budgets_report_role_idx on public.model_budgets (report_attempt_id, role) where report_attempt_id is not null;

create table public.model_reservations (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.model_budgets (id) on delete cascade,
  reserved_input int not null,
  reserved_output int not null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_builds_touch before update on public.app_builds
  for each row execute function public.touch_updated_at();
create trigger dispatch_outbox_touch before update on public.dispatch_outbox
  for each row execute function public.touch_updated_at();
create trigger findings_touch before update on public.findings
  for each row execute function public.touch_updated_at();
create trigger check_results_touch before update on public.check_results
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security. Browsers only SELECT; there are no client write policies.
-- ---------------------------------------------------------------------------
create function public.can_read_run(p_run_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.test_runs r
    where r.id = p_run_id
      and (r.owner_id = (select auth.uid()) or r.is_shared_sample)
  );
$$;
revoke execute on function public.can_read_run(uuid) from public, anon;
grant execute on function public.can_read_run(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.app_builds enable row level security;
alter table public.test_runs enable row level security;
alter table public.platform_sessions enable row level security;
alter table public.dispatch_outbox enable row level security;
alter table public.report_attempts enable row level security;
alter table public.screen_states enable row level security;
alter table public.transitions enable row level security;
alter table public.run_events enable row level security;
alter table public.artifacts enable row level security;
alter table public.check_results enable row level security;
alter table public.findings enable row level security;
alter table public.reports enable row level security;
alter table public.usage_records enable row level security;
alter table public.model_budgets enable row level security;
alter table public.model_reservations enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy app_builds_select on public.app_builds
  for select to authenticated using (owner_id = (select auth.uid()) or is_sample);

create policy test_runs_select on public.test_runs
  for select to authenticated using (owner_id = (select auth.uid()) or is_shared_sample);

create policy platform_sessions_select on public.platform_sessions
  for select to authenticated using (public.can_read_run(run_id));
create policy screen_states_select on public.screen_states
  for select to authenticated using (public.can_read_run(run_id));
create policy transitions_select on public.transitions
  for select to authenticated using (public.can_read_run(run_id));
create policy run_events_select on public.run_events
  for select to authenticated using (public.can_read_run(run_id));
create policy artifacts_select on public.artifacts
  for select to authenticated using (public.can_read_run(run_id) and status = 'ready');
create policy check_results_select on public.check_results
  for select to authenticated using (public.can_read_run(run_id));
create policy findings_select on public.findings
  for select to authenticated using (public.can_read_run(run_id));
create policy reports_select on public.reports
  for select to authenticated using (public.can_read_run(run_id));
-- dispatch_outbox, report_attempts, usage_records, model_budgets, model_reservations:
-- RLS enabled with no policies => server only.

-- Defense in depth: browsers never write, and server-only tables are not readable.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.dispatch_outbox, public.report_attempts, public.usage_records,
  public.model_budgets, public.model_reservations from anon, authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Realtime: live progress (binary data never goes through realtime)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.run_events, public.platform_sessions, public.test_runs, public.reports;
