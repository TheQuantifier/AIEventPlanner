alter table app_users
  add column if not exists automated_outreach_events_used integer not null default 0,
  add column if not exists automated_negotiation_events_used integer not null default 0;

update app_users
set automated_outreach_events_used = greatest(automated_outreach_events_used, automated_event_count),
    automated_negotiation_events_used = greatest(automated_negotiation_events_used, automated_event_count);

alter table plans
  add column if not exists outreach_usage_applied boolean not null default false,
  add column if not exists negotiation_usage_applied boolean not null default false;
