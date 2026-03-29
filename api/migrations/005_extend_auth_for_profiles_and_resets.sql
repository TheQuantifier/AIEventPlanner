alter table app_users
  add column if not exists email text,
  add column if not exists full_name text;

create unique index if not exists idx_app_users_email_lower on app_users (lower(email)) where email is not null;

create table if not exists app_password_resets (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_app_password_resets_user_id on app_password_resets(user_id);
