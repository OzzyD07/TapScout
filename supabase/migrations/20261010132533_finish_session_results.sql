-- finish_session also stores the session's check results and findings, in the same transaction
-- as the terminal phase and under the same lease check: a runner that lost its lease writes
-- nothing. Platform, run and session columns come from the session row, never from the payload.

drop function if exists public.finish_session(uuid, uuid, int, text, text, jsonb, jsonb);

create function public.finish_session(
  p_session_id uuid,
  p_attempt_id uuid,
  p_lease_version int,
  p_phase text,
  p_stop_reason text,
  p_result jsonb,
  p_device_profile jsonb,
  p_checks jsonb default '[]'::jsonb,
  p_findings jsonb default '[]'::jsonb
) returns void
language plpgsql set search_path = '' as $$
declare
  s public.platform_sessions;
begin
  if not public.is_terminal_phase(p_phase) then
    raise exception 'finish_session needs a terminal phase' using errcode = 'AQ004';
  end if;
  perform public.lock_session_lease(p_session_id, p_attempt_id, p_lease_version);
  select * into s from public.platform_sessions where id = p_session_id;

  insert into public.check_results (run_id, session_id, platform, mode, check_id, status, store_status, data)
  select s.run_id, s.id, s.platform, c ->> 'mode', c ->> 'checkId', c ->> 'status', c ->> 'storeStatus', c
    from jsonb_array_elements(coalesce(p_checks, '[]'::jsonb)) as c
  on conflict (session_id, check_id) do update
    set mode = excluded.mode,
        status = excluded.status,
        store_status = excluded.store_status,
        data = excluded.data;

  insert into public.findings (id, run_id, session_id, platform, mode, check_id, title, verification, severity, data)
  select (f ->> 'findingId')::uuid, s.run_id, s.id, s.platform, f ->> 'mode', f ->> 'checkId',
         f ->> 'title', f ->> 'verification', f ->> 'severity', f
    from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) as f
  on conflict (id) do update
    set mode = excluded.mode,
        check_id = excluded.check_id,
        title = excluded.title,
        verification = excluded.verification,
        severity = excluded.severity,
        data = excluded.data
    where public.findings.session_id = excluded.session_id;

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

revoke execute on function public.finish_session(uuid, uuid, int, text, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_session(uuid, uuid, int, text, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;
