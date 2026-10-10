-- Test accounts for builds behind a sign-in (docs/02 §8). The username and password are stored
-- only as AES-256-GCM ciphertext made on the server with APP_CREDENTIALS_ENCRYPTION_KEY, and are
-- decrypted only for the device runner of a run on that build. No client role can read the table.
create table public.build_test_accounts (
  build_id uuid primary key references public.app_builds (id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) between 16 and 4000),
  key_version smallint not null default 1,
  created_at timestamptz not null default now()
);

alter table public.build_test_accounts enable row level security;
revoke all on public.build_test_accounts from anon, authenticated;

-- Readable flag for the build list (the secret itself stays in build_test_accounts).
alter table public.app_builds add column has_test_account boolean not null default false;
