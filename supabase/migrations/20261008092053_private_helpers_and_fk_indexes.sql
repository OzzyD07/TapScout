-- Security advisor: SECURITY DEFINER helpers must not be callable through the REST API.
-- RLS policies call the helper from a schema that PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.can_read_run(p_run_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.test_runs r
    where r.id = p_run_id
      and (r.owner_id = (select auth.uid()) or r.is_shared_sample)
  );
$$;
revoke execute on function private.can_read_run(uuid) from public, anon;
grant execute on function private.can_read_run(uuid) to authenticated;

alter policy platform_sessions_select on public.platform_sessions using (private.can_read_run(run_id));
alter policy screen_states_select on public.screen_states using (private.can_read_run(run_id));
alter policy transitions_select on public.transitions using (private.can_read_run(run_id));
alter policy run_events_select on public.run_events using (private.can_read_run(run_id));
alter policy artifacts_select on public.artifacts using (private.can_read_run(run_id) and status = 'ready');
alter policy check_results_select on public.check_results using (private.can_read_run(run_id));
alter policy findings_select on public.findings using (private.can_read_run(run_id));
alter policy reports_select on public.reports using (private.can_read_run(run_id));

drop function public.can_read_run(uuid);

-- Performance advisor: cover foreign keys (cascading deletes and run/session lookups).
create index artifacts_session_idx on public.artifacts (session_id);
create index check_results_run_idx on public.check_results (run_id);
create index dispatch_outbox_run_idx on public.dispatch_outbox (run_id);
create index findings_session_idx on public.findings (session_id);
create index model_budgets_run_idx on public.model_budgets (run_id);
create index model_reservations_budget_idx on public.model_reservations (budget_id);
create index platform_sessions_build_idx on public.platform_sessions (build_id);
create index reports_report_attempt_idx on public.reports (report_attempt_id);
create index screen_states_run_idx on public.screen_states (run_id);
create index test_runs_android_build_idx on public.test_runs (android_build_id);
create index test_runs_ios_build_idx on public.test_runs (ios_build_id);
create index transitions_from_state_idx on public.transitions (from_state_id);
create index transitions_run_idx on public.transitions (run_id);
create index transitions_to_state_idx on public.transitions (to_state_id);
create index usage_records_report_attempt_idx on public.usage_records (report_attempt_id);
create index usage_records_session_idx on public.usage_records (session_id);
