-- Smoke test for the core RPCs and RLS. Runs in a transaction and rolls back.
-- Usage: scripts/db-smoke.sh (local Supabase must be running).
\set ON_ERROR_STOP on
begin;

-- Fixtures -------------------------------------------------------------------
insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-00000000000a', 'jury@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-00000000000b', 'other@example.test', 'authenticated', 'authenticated');

insert into public.app_builds (id, owner_id, is_sample, sample_variant, platform, app_name, file_name, content_type,
                               size_bytes, staging_key, object_key, validation_status)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', true, 'seeded', 'android',
        'FieldNotes', 'app.apk', 'application/vnd.android.package-archive', 1000, 'staging/a', 'builds/a/app.apk', 'accepted'),
       ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', true, 'seeded', 'ios',
        'FieldNotes', 'app.zip', 'application/zip', 1000, 'staging/i', 'builds/i/app.zip', 'accepted'),
       ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', false, null, 'android',
        'Private', 'p.apk', 'application/vnd.android.package-archive', 1000, 'staging/p', 'builds/p/app.apk', 'accepted');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- Profile trigger
do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles created by trigger';
end $$;

-- Run creation ---------------------------------------------------------------
do $$
declare
  v_run uuid;
  v_cfg jsonb := '{"budget":{"budgetVersion":"test.v1","maxPlannerRequests":2,"maxVisionRequests":1,
    "tokens":{"plannerInput":1000,"plannerOutput":200,"visionInput":500,"visionOutput":100}},
    "reportBudget":{"summaryInputTokens":100,"summaryOutputTokens":50}}';
begin
  -- Someone else's private build is rejected.
  begin
    perform public.create_test_run('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000003',
      null, array['functional'], v_cfg, '{}');
    raise exception 'expected AQ004';
  exception when sqlstate 'AQ004' then null;
  end;

  v_run := public.create_test_run('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002', array['functional', 'ui_ux'], v_cfg, '{"agent":"test"}');
  insert into ctx values ('run', v_run);

  assert (select count(*) from public.platform_sessions where run_id = v_run) = 2, 'two sessions';
  assert (select count(*) from public.model_budgets where run_id = v_run) = 4, 'planner+vision budgets per session';
  assert (select status from public.dispatch_outbox where run_id = v_run) = 'pending', 'outbox pending';
end $$;

-- Outbox claim/complete --------------------------------------------------------
do $$
declare
  v_run uuid := (select v::uuid from ctx where k = 'run');
  o public.dispatch_outbox;
begin
  select * into o from public.claim_outbox('worker-1', 10, 60) where run_id = v_run;
  assert o.status = 'claimed' and o.attempts = 1, 'claimed once';
  assert not exists (select 1 from public.claim_outbox('worker-2', 10, 60) where run_id = v_run), 'no double claim';
  assert not public.complete_outbox(o.id, 'worker-2', 'dispatched', null, null, 0), 'other worker cannot complete';
  assert public.complete_outbox(o.id, 'worker-1', 'dispatched', '{"workflowRunId": 777}', null, 0), 'complete';
  assert (select github_run_id from public.test_runs where id = v_run) = 777, 'workflow run bound';
end $$;

-- Session lease ----------------------------------------------------------------
do $$
declare
  v_run uuid := (select v::uuid from ctx where k = 'run');
  l record;
begin
  begin
    perform public.acquire_session_lease(v_run, 'android', 999, 1, 1, 120);
    raise exception 'expected AQ003 for foreign workflow';
  exception when sqlstate 'AQ003' then null;
  end;

  select * into l from public.acquire_session_lease(v_run, 'android', 777, 1, 11, 120);
  insert into ctx values ('ses', l.session_id), ('att', l.attempt_id), ('lv', l.lease_version);
  assert l.lease_version = 1, 'first lease';

  begin
    perform public.acquire_session_lease(v_run, 'android', 777, 1, 12, 120);
    raise exception 'expected AQ003 for duplicate job';
  exception when sqlstate 'AQ003' then null;
  end;
  assert (select status from public.test_runs where id = v_run) = 'running', 'run running';
end $$;

-- Events: sequence + idempotency + side effects --------------------------------
do $$
declare
  v_run text := (select v from ctx where k = 'run');
  v_ses text := (select v from ctx where k = 'ses');
  v_att text := (select v from ctx where k = 'att');
  v_events jsonb;
  r record;
begin
  v_events := jsonb_build_array(
    jsonb_build_object('eventId', 'a0000000-0000-0000-0000-000000000001', 'runId', v_run, 'sessionId', v_ses,
      'attemptId', v_att, 'clientSequence', 1, 'occurredAt', now(), 'phase', 'preparing', 'type', 'phase_changed',
      'payload', '{"from":"preparing","to":"exploring"}'::jsonb),
    jsonb_build_object('eventId', 'a0000000-0000-0000-0000-000000000002', 'runId', v_run, 'sessionId', v_ses,
      'attemptId', v_att, 'clientSequence', 2, 'occurredAt', now(), 'phase', 'exploring', 'type', 'counters',
      'payload', '{"screensObserved":1,"transitionsObserved":0,"actionsExecuted":0,"checksRun":0,"plannerCalls":0,"visionCalls":0}'::jsonb));

  select * into r from public.append_run_events(v_ses::uuid, v_att::uuid, 1, v_events);
  assert r.accepted = 2 and r.duplicates = 0 and r.last_sequence = 2, 'first batch';

  select * into r from public.append_run_events(v_ses::uuid, v_att::uuid, 1, v_events);
  assert r.accepted = 0 and r.duplicates = 2 and r.last_sequence = 2, 'retry is deduplicated';

  assert (select phase from public.platform_sessions where id = v_ses::uuid) = 'exploring', 'phase applied';
  assert (select counters ->> 'screensObserved' from public.platform_sessions where id = v_ses::uuid) = '1', 'counters applied';

  begin
    perform public.append_run_events(v_ses::uuid, v_att::uuid, 99, v_events);
    raise exception 'expected AQ001 for stale lease';
  exception when sqlstate 'AQ001' then null;
  end;
end $$;

-- Heartbeat --------------------------------------------------------------------
do $$
declare
  r record;
begin
  select * into r from public.heartbeat_session((select v::uuid from ctx where k = 'ses'),
    (select v::uuid from ctx where k = 'att'), 1, 120);
  assert r.lease_valid and not r.cancel_requested, 'heartbeat ok';
  select * into r from public.heartbeat_session((select v::uuid from ctx where k = 'ses'), gen_random_uuid(), 1, 120);
  assert not r.lease_valid, 'stale attempt heartbeat rejected';
end $$;

-- Model budget -----------------------------------------------------------------
do $$
declare
  v_ses uuid := (select v::uuid from ctx where k = 'ses');
  v_res uuid;
  r record;
begin
  v_res := public.reserve_model_budget(v_ses, null, 'planner', 600, 100);
  begin
    perform public.reserve_model_budget(v_ses, null, 'planner', 600, 100);
    raise exception 'expected AQ005: reserved balance cannot be spent twice';
  exception when sqlstate 'AQ005' then null;
  end;
  select * into r from public.settle_model_budget(v_res, 0, 0, false);
  assert r.remaining_input = 400 and r.remaining_output = 100, 'unreported usage is charged in full';
  assert r.remaining_requests = 1, 'sent request counted; rejected reservation never reached the provider';
end $$;

-- RLS --------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true); end $$;
do $$ begin
  assert (select count(*) from public.test_runs) = 1, 'owner sees own run';
  assert (select count(*) from public.run_events) = 2, 'owner sees events';
  assert (select count(*) from public.app_builds) = 2, 'owner sees sample builds only';
  begin
    perform 1 from public.dispatch_outbox;
    raise exception 'expected permission denied on outbox';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.run_events (event_id, run_id, session_id, attempt_id, sequence, client_sequence, type, phase, payload, occurred_at)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 1, 'note', 'exploring', '{}', now());
    raise exception 'expected permission denied on insert';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_test_run(null, null, null, null, null, null);
    raise exception 'expected permission denied on rpc';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true); end $$;
do $$ begin
  assert (select count(*) from public.test_runs) = 0, 'other user cannot see the run';
  assert (select count(*) from public.run_events) = 0, 'other user cannot see events';
end $$;
reset role;

-- Finish, report, cancel ---------------------------------------------------------
do $$
declare
  v_run uuid := (select v::uuid from ctx where k = 'run');
  l record;
  v_status text;
begin
  begin
    perform public.acquire_report_lease(v_run, 777, 300);
    raise exception 'expected AQ003: sessions not terminal';
  exception when sqlstate 'AQ003' then null;
  end;

  perform public.finish_session((select v::uuid from ctx where k = 'ses'), (select v::uuid from ctx where k = 'att'),
    1, 'completed', 'goals_exhausted', '{}', null);
  perform public.fail_session_without_lease(
    (select id from public.platform_sessions where run_id = v_run and platform = 'ios'), 'infrastructure_failed', 'runner lost');

  select * into l from public.acquire_report_lease(v_run, 777, 300);
  assert public.save_report(v_run, l.report_attempt_id, l.lease_version, 'partial', '{}', null), 'report saved';
  assert not public.save_report(v_run, null, 0, 'partial', '{}', null), 'report version deduplicated';
  assert (select status from public.test_runs where id = v_run) = 'partial', 'run partial';

  -- Cancel before dispatch: no device job, no report lease.
  v_run := public.create_test_run('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
    null, array['functional'], '{"budget":{"budgetVersion":"t","maxPlannerRequests":1,"maxVisionRequests":1,
    "tokens":{"plannerInput":1,"plannerOutput":1,"visionInput":1,"visionOutput":1}}}', '{}');
  v_status := public.request_run_cancel(v_run, '00000000-0000-0000-0000-00000000000a');
  assert v_status = 'cancelled', 'queued run cancels immediately';
  assert (select status from public.dispatch_outbox where run_id = v_run and kind = 'dispatch_run') = 'terminal',
    'pending dispatch dropped';
  begin
    perform public.acquire_session_lease(v_run, 'android', 1, 1, 1, 60);
    raise exception 'expected AQ002';
  exception when sqlstate 'AQ002' then null;
  end;
  begin
    perform public.acquire_report_lease(v_run, null, 60);
    raise exception 'expected AQ002';
  exception when sqlstate 'AQ002' then null;
  end;
end $$;

\echo 'rpc_smoke: all assertions passed'
rollback;
