alter table app_users
  add column if not exists organization text not null default '';

create table if not exists app_account_action_codes (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  purpose text not null,
  code_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_app_account_action_codes_user_purpose
  on app_account_action_codes(user_id, purpose, created_at desc);
