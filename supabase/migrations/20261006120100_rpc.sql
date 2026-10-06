-- Atomic server-side operations (docs/02 §4, §7). Called only with the server secret key.
-- Custom SQLSTATEs, mapped to ApiError codes by the API:
--   AQ001 lease_lost   AQ002 cancelled   AQ003 conflict   AQ004 invalid_request   AQ005 budget_exhausted

-- ---------------------------------------------------------------------------
-- Profiles for admin-created users
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.is_terminal_phase(p_phase text) returns boolean
language sql immutable set search_path = '' as $$
  select p_phase in ('completed', 'cancelled', 'blocked', 'infrastructure_failed');
$$;

-- Locks the session and verifies the caller still holds its lease.
create function public.lock_session_lease(p_session_id uuid, p_attempt_id uuid, p_lease_version int)
returns public.platform_sessions
language plpgsql set search_path = '' as $$
declare
  s public.platform_sessions;
begin
  select * into s from public.platform_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session not found' using errcode = 'AQ004';
  end if;
  if s.attempt_id is distinct from p_attempt_id or s.lease_version <> p_lease_version then
    raise exception 'lease lost: stale attempt or lease version' using errcode = 'AQ001';
  end if;
  if public.is_terminal_phase(s.phase) then
    raise exception 'lease lost: session is terminal (%)', s.phase using errcode = 'AQ001';
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Run creation: run + sessions + budgets + dispatch outbox in one transaction
-- ---------------------------------------------------------------------------
create function public.create_test_run(
  p_owner uuid,
  p_android_build uuid,
  p_ios_build uuid,
  p_modes text[],
  p_config jsonb,
  p_version_stamp jsonb
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_run uuid;
  v_session uuid;
  v_platform text;
  v_build uuid;
  v_budget jsonb := p_config -> 'budget';
begin
  if p_android_build is null and p_ios_build is null then
    raise exception 'select at least one platform build' using errcode = 'AQ004';
  end if;
  if v_budget is null or v_budget ->> 'budgetVersion' is null then
    raise exception 'config.budget is required' using errcode = 'AQ004';
  end if;

  foreach v_platform in array array['android', 'ios'] loop
    v_build := case v_platform when 'android' then p_android_build else p_ios_build end;
    if v_build is not null and not exists (
      select 1 from public.app_builds b
      where b.id = v_build
        and b.platform = v_platform
        and (b.owner_id = p_owner or b.is_sample)
        and b.validation_status in ('uploaded', 'accepted')
        and b.object_key is not null
    ) then
      raise exception '% build is not usable', v_platform using errcode = 'AQ004';
    end if;
  end loop;

  insert into public.test_runs (owner_id, modes, android_build_id, ios_build_id, config, budget_version, version_stamp)
  values (p_owner, p_modes, p_android_build, p_ios_build, p_config, v_budget ->> 'budgetVersion', p_version_stamp)
  returning id into v_run;

  foreach v_platform in array array['android', 'ios'] loop
    v_build := case v_platform when 'android' then p_android_build else p_ios_build end;
    continue when v_build is null;

    insert into public.platform_sessions (run_id, platform, build_id)
    values (v_run, v_platform, v_build)
    returning id into v_session;

    insert into public.model_budgets (run_id, session_id, role, limit_input, limit_output, limit_requests)
    values
      (v_run, v_session, 'planner',
        (v_budget -> 'tokens' ->> 'plannerInput')::int,
        (v_budget -> 'tokens' ->> 'plannerOutput')::int,
        (v_budget ->> 'maxPlannerRequests')::int),
      (v_run, v_session, 'vision',
        (v_budget -> 'tokens' ->> 'visionInput')::int,
        (v_budget -> 'tokens' ->> 'visionOutput')::int,
        (v_budget ->> 'maxVisionRequests')::int);
  end loop;

  insert into public.dispatch_outbox (kind, run_id, idempotency_key)
  values ('dispatch_run', v_run, 'dispatch_run:' || v_run);

  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outbox claim / completion (overlapping cron calls are separated by SKIP LOCKED)
-- ---------------------------------------------------------------------------
create function public.claim_outbox(p_worker text, p_batch int, p_claim_seconds int)
returns setof public.dispatch_outbox
language plpgsql set search_path = '' as $$
begin
  -- Give up on items that exhausted their attempts.
  update public.dispatch_outbox o
     set status = 'terminal', last_error = coalesce(o.last_error, 'max attempts reached')
   where o.attempts >= o.max_attempts
     and (o.status = 'retry' or (o.status = 'claimed' and o.claim_expires_at < now()));

  return query
  with due as (
    select o.id
      from public.dispatch_outbox o
     where o.attempts < o.max_attempts
       and ((o.status in ('pending', 'retry') and o.next_retry_at <= now())
            or (o.status = 'claimed' and o.claim_expires_at < now()))
     order by o.next_retry_at
     limit greatest(1, least(p_batch, 20))
     for update skip locked
  )
  update public.dispatch_outbox o
     set status = 'claimed',
         claimed_by = p_worker,
         claim_expires_at = now() + make_interval(secs => p_claim_seconds),
         attempts = o.attempts + 1
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

-- p_outcome: 'dispatched' | 'retry' | 'terminal'. A response that is ambiguous must record
-- provider_ref (if any) and use 'retry'; the next claim reconciles with GitHub before re-dispatching.
create function public.complete_outbox(
  p_id uuid,
  p_worker text,
  p_outcome text,
  p_provider_ref jsonb,
  p_error text,
  p_retry_seconds int
) returns boolean
language plpgsql set search_path = '' as $$
declare
  v_run uuid;
begin
  if p_outcome not in ('dispatched', 'retry', 'terminal') then
    raise exception 'invalid outcome %', p_outcome using errcode = 'AQ004';
  end if;

  update public.dispatch_outbox o
     set status = p_outcome,
         provider_ref = coalesce(p_provider_ref, o.provider_ref),
         last_error = p_error,
         claim_expires_at = null,
         next_retry_at = case when p_outcome = 'retry'
                              then now() + make_interval(secs => greatest(p_retry_seconds, 5))
                              else o.next_retry_at end
   where o.id = p_id and o.claimed_by = p_worker and o.status = 'claimed'
  returning o.run_id into v_run;

  if not found then
    return false;
  end if;

  if p_outcome = 'dispatched' and p_provider_ref ? 'workflowRunId' then
    update public.test_runs
       set github_run_id = coalesce(github_run_id, (p_provider_ref ->> 'workflowRunId')::bigint)
     where id = v_run;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Runner session lease
-- ---------------------------------------------------------------------------
create function public.acquire_session_lease(
  p_run_id uuid,
  p_platform text,
  p_github_run_id bigint,
  p_github_run_attempt int,
  p_github_job_id bigint,
  p_lease_seconds int
) returns table (session_id uuid, attempt_id uuid, lease_version int, build_id uuid)
language plpgsql set search_path = '' as $$
declare
  r public.test_runs;
  s public.platform_sessions;
begin
  select * into r from public.test_runs where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'AQ004';
  end if;
  if r.cancel_requested_at is not null then
    raise exception 'run cancelled' using errcode = 'AQ002';
  end if;
  if r.github_run_id is not null and r.github_run_id <> p_github_run_id then
    raise exception 'workflow run does not belong to this test run' using errcode = 'AQ003';
  end if;

  select * into s from public.platform_sessions ps
   where ps.run_id = p_run_id and ps.platform = p_platform
   for update;
  if not found then
    raise exception 'no % session in this run', p_platform using errcode = 'AQ004';
  end if;
  if public.is_terminal_phase(s.phase) then
    raise exception 'session already terminal (%)', s.phase using errcode = 'AQ003';
  end if;
  if s.attempt_id is not null and s.lease_expires_at > now() then
    -- A second, accidentally started job must stop before touching the device.
    raise exception 'session lease is held by another attempt' using errcode = 'AQ003';
  end if;

  update public.test_runs
     set github_run_id = coalesce(github_run_id, p_github_run_id),
         github_run_attempt = p_github_run_attempt,
         status = case when status = 'queued' then 'running' else status end,
         started_at = coalesce(started_at, now())
   where id = p_run_id;

  -- A new attempt always starts clean; a half-done step is never claimed as resumed.
  update public.platform_sessions ps
     set attempt_id = gen_random_uuid(),
         attempt_no = ps.attempt_no + 1,
         lease_version = ps.lease_version + 1,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         last_heartbeat_at = now(),
         github_job_id = p_github_job_id,
         phase = 'preparing',
         checkpoint = null,
         started_at = coalesce(ps.started_at, now())
   where ps.id = s.id
  returning ps.id, ps.attempt_id, ps.lease_version, ps.build_id
    into session_id, attempt_id, lease_version, build_id;

  return next;
end;
$$;

create function public.heartbeat_session(
  p_session_id uuid,
  p_attempt_id uuid,
  p_lease_version int,
  p_lease_seconds int
) returns table (lease_valid boolean, cancel_requested boolean, lease_expires_at timestamptz)
language plpgsql set search_path = '' as $$
declare
  v_run uuid;
  v_expires timestamptz;
begin
  update public.platform_sessions ps
     set last_heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where ps.id = p_session_id
     and ps.attempt_id = p_attempt_id
     and ps.lease_version = p_lease_version
     and not public.is_terminal_phase(ps.phase)
  returning ps.run_id, ps.lease_expires_at into v_run, v_expires;

  if not found then
    return query select false, false, null::timestamptz;
    return;
  end if;

  return query
  select true, r.cancel_requested_at is not null, v_expires
    from public.test_runs r where r.id = v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events: idempotent on event_id, per-session sequence assigned under the session row lock
-- ---------------------------------------------------------------------------
create function public.append_run_events(
  p_session_id uuid,
  p_attempt_id uuid,
  p_lease_version int,
  p_events jsonb
) returns table (accepted int, duplicates int, last_sequence bigint)
language plpgsql set search_path = '' as $$
declare
  s public.platform_sessions;
  e jsonb;
  v_seq bigint;
  v_acc int := 0;
  v_dup int := 0;
  v_phase text;
  v_counters jsonb;
  v_caps jsonb;
begin
  s := public.lock_session_lease(p_session_id, p_attempt_id, p_lease_version);
  v_seq := s.next_event_seq;
  v_phase := s.phase;
  v_counters := s.counters;
  v_caps := s.capabilities;

  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'events must be an array of at most 50 items' using errcode = 'AQ004';
  end if;

  for e in select value from jsonb_array_elements(p_events) loop
    if (e ->> 'sessionId')::uuid <> p_session_id or (e ->> 'attemptId')::uuid <> p_attempt_id
       or (e ->> 'runId')::uuid <> s.run_id then
      raise exception 'event does not belong to this session attempt' using errcode = 'AQ004';
    end if;

    insert into public.run_events (
      event_id, run_id, session_id, attempt_id, sequence, client_sequence,
      step_index, type, phase, payload, occurred_at)
    values (
      (e ->> 'eventId')::uuid, s.run_id, p_session_id, p_attempt_id, v_seq + 1,
      (e ->> 'clientSequence')::bigint, (e ->> 'stepIndex')::int, e ->> 'type', e ->> 'phase',
      e -> 'payload', (e ->> 'occurredAt')::timestamptz)
    on conflict (event_id) do nothing;

    if found then
      v_seq := v_seq + 1;
      v_acc := v_acc + 1;
      case e ->> 'type'
        when 'phase_changed' then
          -- Terminal phases are only set by finish_session.
          if not public.is_terminal_phase(e -> 'payload' ->> 'to') then
            v_phase := e -> 'payload' ->> 'to';
          end if;
        when 'counters' then
          v_counters := e -> 'payload';
        when 'capability_probe' then
          v_caps := v_caps || (e -> 'payload' -> 'results');
        else
          null;
      end case;
    else
      v_dup := v_dup + 1;
    end if;
  end loop;

  update public.platform_sessions
     set next_event_seq = v_seq,
         phase = v_phase,
         counters = v_counters,
         capabilities = v_caps,
         last_heartbeat_at = now()
   where id = p_session_id;

  return query select v_acc, v_dup, v_seq;
end;
$$;

create function public.finish_session(
  p_session_id uuid,
  p_attempt_id uuid,
  p_lease_version int,
  p_phase text,
  p_stop_reason text,
  p_result jsonb,
  p_device_profile jsonb
) returns void
language plpgsql set search_path = '' as $$
begin
  if not public.is_terminal_phase(p_phase) then
    raise exception 'finish_session needs a terminal phase' using errcode = 'AQ004';
  end if;
  perform public.lock_session_lease(p_session_id, p_attempt_id, p_lease_version);

  update public.platform_sessions
     set phase = p_phase,
         stop_reason = p_stop_reason,
         result = p_result,
         device_profile = coalesce(p_device_profile, device_profile),
         finished_at = now(),
         lease_expires_at = null
   where id = p_session_id;
end;
$$;

-- Used by the maintenance endpoint after checking the provider job state.
create function public.fail_session_without_lease(p_session_id uuid, p_phase text, p_detail text)
returns boolean
language plpgsql set search_path = '' as $$
begin
  if p_phase not in ('infrastructure_failed', 'cancelled', 'blocked') then
    raise exception 'invalid phase' using errcode = 'AQ004';
  end if;
  update public.platform_sessions
     set phase = p_phase,
         phase_detail = p_detail,
         stop_reason = case p_phase when 'cancelled' then 'cancelled' else 'infrastructure_failed' end,
         finished_at = now(),
         lease_expires_at = null
   where id = p_session_id and not public.is_terminal_phase(phase);
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------
create function public.request_run_cancel(p_run_id uuid, p_user uuid) returns text
language plpgsql set search_path = '' as $$
declare
  r public.test_runs;
begin
  select * into r from public.test_runs where id = p_run_id for update;
  if not found or r.owner_id <> p_user then
    raise exception 'run not found' using errcode = 'AQ004';
  end if;
  if r.status in ('completed', 'partial', 'cancelled', 'infrastructure_failed') then
    return r.status;
  end if;

  update public.test_runs set cancel_requested_at = coalesce(cancel_requested_at, now()) where id = p_run_id;

  -- Never-started sessions end immediately; running ones see the flag in their heartbeat.
  update public.platform_sessions
     set phase = 'cancelled', stop_reason = 'cancelled', finished_at = now()
   where run_id = p_run_id and phase = 'queued';

  -- A dispatch that has not gone out yet must not go out.
  update public.dispatch_outbox
     set status = 'terminal', last_error = 'cancelled before dispatch'
   where run_id = p_run_id and kind = 'dispatch_run' and status in ('pending', 'retry');

  insert into public.dispatch_outbox (kind, run_id, idempotency_key)
  values ('cancel_run', p_run_id, 'cancel_run:' || p_run_id)
  on conflict (idempotency_key) do nothing;

  if not exists (
    select 1 from public.platform_sessions
     where run_id = p_run_id and not public.is_terminal_phase(phase)
  ) then
    update public.test_runs set status = 'cancelled', finished_at = now() where id = p_run_id;
    return 'cancelled';
  end if;
  return 'cancelling';
end;
$$;

-- ---------------------------------------------------------------------------
-- Report attempts (docs/02 §7): separate lease, never for cancelled runs
-- ---------------------------------------------------------------------------
create function public.acquire_report_lease(p_run_id uuid, p_github_run_id bigint, p_lease_seconds int)
returns table (report_attempt_id uuid, lease_version int, report_version int)
language plpgsql set search_path = '' as $$
declare
  r public.test_runs;
  v_version int;
  v_attempt_no int;
  v_id uuid;
  v_rb jsonb;
begin
  select * into r from public.test_runs where id = p_run_id for update;
  if not found then
    raise exception 'run not found' using errcode = 'AQ004';
  end if;
  if r.cancel_requested_at is not null then
    raise exception 'run cancelled' using errcode = 'AQ002';
  end if;
  if p_github_run_id is not null and r.github_run_id is not null and r.github_run_id <> p_github_run_id then
    raise exception 'workflow run does not belong to this test run' using errcode = 'AQ003';
  end if;
  if exists (select 1 from public.platform_sessions where run_id = p_run_id and not public.is_terminal_phase(phase)) then
    raise exception 'device sessions are not terminal yet' using errcode = 'AQ003';
  end if;
  if exists (select 1 from public.reports where run_id = p_run_id) then
    raise exception 'report already exists' using errcode = 'AQ003';
  end if;
  if exists (
    select 1 from public.report_attempts ra
     where ra.run_id = p_run_id and ra.phase = 'started' and ra.lease_expires_at > now()
  ) then
    raise exception 'report lease is held by another attempt' using errcode = 'AQ003';
  end if;

  update public.report_attempts set phase = 'expired'
   where run_id = p_run_id and phase = 'started';

  v_version := 1;
  select coalesce(max(ra.attempt_no), 0) + 1 into v_attempt_no
    from public.report_attempts ra where ra.run_id = p_run_id and ra.report_version = v_version;

  insert into public.report_attempts (run_id, report_version, attempt_no, lease_expires_at, last_heartbeat_at)
  values (p_run_id, v_version, v_attempt_no, now() + make_interval(secs => p_lease_seconds), now())
  returning id into v_id;

  v_rb := r.config -> 'reportBudget';
  insert into public.model_budgets (run_id, report_attempt_id, role, limit_input, limit_output, limit_requests)
  values (p_run_id, v_id, 'report',
          coalesce((v_rb ->> 'summaryInputTokens')::int, 20000),
          coalesce((v_rb ->> 'summaryOutputTokens')::int, 4000),
          3);

  return query select v_id, 1, v_version;
end;
$$;

create function public.save_report(
  p_run_id uuid,
  p_report_attempt_id uuid,
  p_lease_version int,
  p_overall_status text,
  p_data jsonb,
  p_object_key text
) returns boolean
language plpgsql set search_path = '' as $$
declare
  a public.report_attempts;
begin
  if p_overall_status not in ('completed', 'partial', 'cancelled', 'infrastructure_failed') then
    raise exception 'invalid overall status' using errcode = 'AQ004';
  end if;

  if p_report_attempt_id is not null then
    select * into a from public.report_attempts where id = p_report_attempt_id for update;
    if not found or a.run_id <> p_run_id or a.lease_version <> p_lease_version or a.phase <> 'started' then
      raise exception 'report lease lost' using errcode = 'AQ001';
    end if;
    update public.report_attempts set phase = 'completed' where id = p_report_attempt_id;
  end if;

  -- p_report_attempt_id is null only for the deterministic cancel report built by the API.
  insert into public.reports (run_id, report_version, report_attempt_id, overall_status, data, object_key)
  values (p_run_id, coalesce(a.report_version, 1), p_report_attempt_id, p_overall_status, p_data, p_object_key)
  on conflict (run_id, report_version) do nothing;

  if not found then
    return false;
  end if;

  update public.test_runs set status = p_overall_status, finished_at = now() where id = p_run_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Model budget reservation (relay): parallel calls cannot spend the same balance twice
-- ---------------------------------------------------------------------------
create function public.reserve_model_budget(
  p_session_id uuid,
  p_report_attempt_id uuid,
  p_role text,
  p_input int,
  p_output int
) returns uuid
language plpgsql set search_path = '' as $$
declare
  b public.model_budgets;
  v_id uuid;
begin
  select * into b from public.model_budgets
   where role = p_role
     and ((p_session_id is not null and session_id = p_session_id)
          or (p_report_attempt_id is not null and report_attempt_id = p_report_attempt_id))
   for update;
  if not found then
    raise exception 'no % budget for this scope', p_role using errcode = 'AQ004';
  end if;

  if b.used_requests >= b.limit_requests
     or b.used_input + b.reserved_input + p_input > b.limit_input
     or b.used_output + b.reserved_output + p_output > b.limit_output then
    raise exception '% budget exhausted', p_role using errcode = 'AQ005';
  end if;

  -- Every provider request counts, including repairs and retries.
  update public.model_budgets
     set used_requests = used_requests + 1,
         reserved_input = reserved_input + p_input,
         reserved_output = reserved_output + p_output
   where id = b.id;

  insert into public.model_reservations (budget_id, reserved_input, reserved_output)
  values (b.id, p_input, p_output)
  returning id into v_id;
  return v_id;
end;
$$;

-- When the provider did not report usage, the reservation is charged in full:
-- unknown consumption is never counted as zero.
create function public.settle_model_budget(
  p_reservation_id uuid,
  p_input int,
  p_output int,
  p_reported boolean
) returns table (remaining_input int, remaining_output int, remaining_requests int)
language plpgsql set search_path = '' as $$
declare
  m public.model_reservations;
  v_in int;
  v_out int;
begin
  select * into m from public.model_reservations where id = p_reservation_id for update;
  if not found or m.settled_at is not null then
    raise exception 'reservation not found or already settled' using errcode = 'AQ004';
  end if;

  v_in := case when p_reported then p_input else m.reserved_input end;
  v_out := case when p_reported then p_output else m.reserved_output end;

  update public.model_reservations set settled_at = now() where id = p_reservation_id;

  return query
  update public.model_budgets b
     set reserved_input = b.reserved_input - m.reserved_input,
         reserved_output = b.reserved_output - m.reserved_output,
         used_input = b.used_input + v_in,
         used_output = b.used_output + v_out
   where b.id = m.budget_id
  returning b.limit_input - b.used_input - b.reserved_input,
            b.limit_output - b.used_output - b.reserved_output,
            b.limit_requests - b.used_requests;
end;
$$;

-- ---------------------------------------------------------------------------
-- Only the server (service_role) may call these.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.handle_new_user()',
    'public.lock_session_lease(uuid, uuid, int)',
    'public.create_test_run(uuid, uuid, uuid, text[], jsonb, jsonb)',
    'public.claim_outbox(text, int, int)',
    'public.complete_outbox(uuid, text, text, jsonb, text, int)',
    'public.acquire_session_lease(uuid, text, bigint, int, bigint, int)',
    'public.heartbeat_session(uuid, uuid, int, int)',
    'public.append_run_events(uuid, uuid, int, jsonb)',
    'public.finish_session(uuid, uuid, int, text, text, jsonb, jsonb)',
    'public.fail_session_without_lease(uuid, text, text)',
    'public.request_run_cancel(uuid, uuid)',
    'public.acquire_report_lease(uuid, bigint, int)',
    'public.save_report(uuid, uuid, int, text, jsonb, text)',
    'public.reserve_model_budget(uuid, uuid, text, int, int)',
    'public.settle_model_budget(uuid, int, int, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    if f <> 'public.handle_new_user()' then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end;
$$;
