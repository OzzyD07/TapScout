-- Sample builds belong to the system, not to a user account.
alter table public.app_builds alter column owner_id drop not null;
alter table public.app_builds
  add constraint app_builds_owner_or_sample check (owner_id is not null or is_sample);

-- Private Storage buckets (docs/02 §6). No storage.objects policies: every signed upload or
-- download URL is created on the server with the secret key. The 50 MB limit is the Free-plan
-- maximum; `builds` is raised to 300 MB after the Pro upgrade.
-- Guarded because a database-only local stack has no storage schema.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('builds', 'builds', false, 52428800,
     array['application/vnd.android.package-archive', 'application/zip']),
    ('evidence', 'evidence', false, 52428800,
     array['image/png', 'image/jpeg', 'image/webp', 'application/json', 'application/xml',
           'text/plain', 'video/mp4'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end;
$$;
