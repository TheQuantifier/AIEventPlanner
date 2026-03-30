create table if not exists ai_response_cache (
  cache_key text primary key,
  cache_kind text not null,
  response_json jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_response_cache_expires_at on ai_response_cache(expires_at);
