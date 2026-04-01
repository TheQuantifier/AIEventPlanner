create table if not exists calendar_auth_states (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  provider text not null,
  state text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists calendar_accounts (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  email text,
  display_name text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id)
);

create index if not exists calendar_accounts_user_id_idx on calendar_accounts(user_id);

create table if not exists calendar_events (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  plan_id text,
  calendar_account_id text not null references calendar_accounts(id) on delete cascade,
  provider text not null,
  calendar_id text,
  external_event_id text not null,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  time_zone text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_account_id, external_event_id)
);

create index if not exists calendar_events_user_id_idx on calendar_events(user_id);
