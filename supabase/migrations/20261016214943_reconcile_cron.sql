-- Maintenance job (docs/02 §7): Supabase Cron calls the web app's /api/internal/reconcile every
-- minute. The bearer secret (CRON_AUTH_SECRET) lives in Vault; it is set from the server side
-- with set_reconcile_secret so it never appears in a migration.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.set_reconcile_secret(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if coalesce(length(p_secret), 0) < 16 then
    raise exception 'secret too short' using errcode = 'AQ004';
  end if;
  select id into v_id from vault.secrets where name = 'reconcile_cron_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'reconcile_cron_secret', 'Bearer for /api/internal/reconcile');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

revoke execute on function public.set_reconcile_secret(text) from public, anon, authenticated;
grant execute on function public.set_reconcile_secret(text) to service_role;

-- Does nothing until the secret is set; the HTTP answer is only logged in net._http_response.
select cron.schedule(
  'tapscout-reconcile',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://tap-scout-zeta.vercel.app/api/internal/reconcile',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || s.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
  from vault.decrypted_secrets s
  where s.name = 'reconcile_cron_secret';
  $cron$
);
