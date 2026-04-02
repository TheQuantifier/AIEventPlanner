alter table app_users
  add column if not exists account_type text not null default 'free',
  add column if not exists automated_event_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_account_type_check'
  ) then
    alter table app_users
      add constraint app_users_account_type_check
      check (account_type in ('free', 'pro', 'business', 'admin', 'test'));
  end if;
end $$;

alter table plans
  add column if not exists automation_event_sequence integer;

update app_users
set account_type = 'test'
where account_type <> 'test';
