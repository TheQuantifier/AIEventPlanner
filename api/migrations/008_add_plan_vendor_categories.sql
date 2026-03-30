create table if not exists plan_vendor_categories (
  plan_id text not null references plans(id) on delete cascade,
  sort_order integer not null,
  category_key text not null,
  label text not null,
  description text not null default '',
  is_selected boolean not null default true,
  primary key (plan_id, sort_order)
);

create index if not exists idx_plan_vendor_categories_plan_id
  on plan_vendor_categories(plan_id, sort_order);
