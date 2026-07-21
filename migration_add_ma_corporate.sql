-- Migration: add "MA Corporate" as a Manager-only store
-- Run this ONCE in your Supabase SQL Editor, on your EXISTING project.
-- (schema.sql itself won't re-apply this to a table that already exists.)

-- 1. Drop the old store check constraint and add the new one that includes
--    "MA Corporate". Postgres auto-names check constraints, so we look it up
--    by pattern rather than guessing the exact generated name.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'trainees'::regclass
    and pg_get_constraintdef(oid) like '%store = ANY%';

  if constraint_name is not null then
    execute format('alter table trainees drop constraint %I', constraint_name);
  end if;
end $$;

alter table trainees
  add constraint trainees_store_check
  check (store in ('Cascade Moto Portland', 'Tampa Bay Motos', 'Triumph of Santa Monica', 'Triumph Columbia River', 'MA Corporate'));

-- 2. Add the rule that MA Corporate can only ever be paired with the
--    manager (or admin) role — enforced at the database level, not just
--    in the website's UI.
alter table trainees
  add constraint corporate_is_manager_only
  check (store <> 'MA Corporate' or role in ('manager', 'admin'));
