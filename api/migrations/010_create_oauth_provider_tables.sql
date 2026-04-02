alter table app_users
  alter column password_hash drop not null;

create table if not exists app_auth_oauth_states (
  id text primary key,
  provider text not null,
  state text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists app_auth_provider_accounts (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

create unique index if not exists idx_app_auth_provider_accounts_user_provider
  on app_auth_provider_accounts(user_id, provider);

create index if not exists idx_app_auth_provider_accounts_user_id
  on app_auth_provider_accounts(user_id);
