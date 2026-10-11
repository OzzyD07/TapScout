-- The `login` sample variant: FieldNotes behind a sign-in screen (docs/05 §20).
alter table public.app_builds drop constraint app_builds_sample_variant_check;
alter table public.app_builds add constraint app_builds_sample_variant_check
  check (sample_variant in ('seeded', 'fixed', 'changed_flow', 'login'));
