create table if not exists plans (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workflow_state text not null default 'awaiting-user-selection',
  is_paused boolean not null default false,
  reply_to text not null default '',
  event_brief text not null default '',
  event_title text not null default '',
  event_type text not null default '',
  event_theme text not null default '',
  event_budget numeric not null default 0,
  event_budget_label text not null default '',
  event_location text not null default '',
  event_date_window text not null default '',
  event_guest_count integer not null default 0,
  event_planner_summary text not null default '',
  final_selection_vendor_id text,
  final_selection_vendor_name text not null default '',
  final_selection_selected_at timestamptz
);

create index if not exists idx_plans_user_id on plans(user_id);
create index if not exists idx_plans_updated_at on plans(updated_at desc);

create table if not exists plan_suggestions (
  plan_id text not null references plans(id) on delete cascade,
  sort_order integer not null,
  value text not null,
  primary key (plan_id, sort_order)
);

create table if not exists plan_vendors (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  rank integer not null,
  name text not null,
  category text not null,
  rating numeric not null default 0,
  score integer not null default 0,
  estimated_quote numeric not null default 0,
  summary text not null default '',
  status text not null default 'available',
  email text not null default '',
  intended_email text not null default ''
);

create index if not exists idx_plan_vendors_plan_id on plan_vendors(plan_id);

create table if not exists plan_vendor_service_areas (
  vendor_id text not null references plan_vendors(id) on delete cascade,
  sort_order integer not null,
  area text not null,
  primary key (vendor_id, sort_order)
);

create table if not exists plan_outbound_messages (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  vendor_id text references plan_vendors(id) on delete set null,
  type text not null,
  created_at timestamptz not null default now(),
  subject text not null default '',
  intended_recipient text not null default '',
  delivered_to text,
  delivery_ok boolean not null default false,
  delivery_skipped boolean not null default false,
  delivery_reason text,
  delivery_provider text,
  delivery_message_id text,
  delivery_mode text,
  delivery_app_inbox text,
  delivery_test_mode boolean,
  delivery_stage text,
  raw_delivery jsonb not null default '{}'::jsonb
);

create index if not exists idx_plan_outbound_messages_plan_id on plan_outbound_messages(plan_id, created_at);

create table if not exists plan_inbound_messages (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  vendor_id text references plan_vendors(id) on delete set null,
  received_at timestamptz not null default now(),
  from_email text not null default '',
  subject text not null default '',
  body_text text not null default ''
);

create index if not exists idx_plan_inbound_messages_plan_id on plan_inbound_messages(plan_id, received_at);
