-- Claims only the given run's dispatch item, so an immediate "Start Test" dispatch never takes
-- (and spends attempts of) other runs' outbox work. Same claim rules as claim_outbox.
create function public.claim_run_dispatch(p_run_id uuid, p_worker text, p_claim_seconds int)
returns setof public.dispatch_outbox
language plpgsql set search_path = '' as $$
begin
  return query
  update public.dispatch_outbox o
     set status = 'claimed',
         claimed_by = p_worker,
         claim_expires_at = now() + make_interval(secs => p_claim_seconds),
         attempts = o.attempts + 1
   where o.id = (
     select x.id from public.dispatch_outbox x
      where x.run_id = p_run_id
        and x.kind = 'dispatch_run'
        and x.attempts < x.max_attempts
        and ((x.status in ('pending', 'retry') and x.next_retry_at <= now())
             or (x.status = 'claimed' and x.claim_expires_at < now()))
      for update skip locked
      limit 1)
  returning o.*;
end;
$$;

revoke execute on function public.claim_run_dispatch(uuid, text, int) from public, anon, authenticated;
grant execute on function public.claim_run_dispatch(uuid, text, int) to service_role;
