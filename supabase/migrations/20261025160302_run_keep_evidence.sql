-- Evidence retention (Supabase Free: 1 GB of storage). Screenshots and hierarchies of finished runs
-- are removed after a while unless the run is kept: showcase runs for the jury and the docs.
alter table public.test_runs add column keep_evidence boolean not null default false;

-- An artifact whose object was removed to free storage; the browser gets a 404 instead of a
-- signed URL to nothing.
alter table public.artifacts drop constraint if exists artifacts_status_check;
alter table public.artifacts add constraint artifacts_status_check
  check (status in ('pending', 'ready', 'failed', 'expired'));
