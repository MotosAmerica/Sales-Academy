-- Motos America Sales Academy — Supabase schema
-- Run this once in the Supabase SQL Editor for your project.

-- Trainees (no password auth; just name + store selection)
create table if not exists trainees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  store text not null check (store in ('Triumph Store', 'BMW + Triumph Store')),
  role text not null default 'sales' check (role in ('sales', 'finance', 'manager', 'admin')),
  created_at timestamptz not null default now()
);

-- One row per quiz/exam attempt
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references trainees(id) on delete cascade,
  quiz_key text not null,           -- e.g. 'module-1', 'part1-exam', 'part2-exam'
  quiz_label text not null,         -- human readable, e.g. 'Module 01 Review'
  total_questions int not null,
  correct_answers int not null,
  score_pct numeric not null,
  answers jsonb not null,           -- the raw answers given, for review
  completed_at timestamptz not null default now()
);

-- Helpful index for the report dashboard
create index if not exists idx_attempts_trainee on quiz_attempts(trainee_id);
create index if not exists idx_attempts_quiz_key on quiz_attempts(quiz_key);

-- Row Level Security: allow anon key to insert/select (fine at this scale, this is an internal tool)
alter table trainees enable row level security;
alter table quiz_attempts enable row level security;

create policy "anyone can read trainees" on trainees for select using (true);
create policy "anyone can insert trainees" on trainees for insert with check (true);

create policy "anyone can read attempts" on quiz_attempts for select using (true);
create policy "anyone can insert attempts" on quiz_attempts for insert with check (true);
