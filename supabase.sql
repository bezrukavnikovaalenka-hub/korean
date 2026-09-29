-- Run once in Supabase → SQL Editor → New query → Run.
-- One row per person: their whole study progress as JSON.
create table if not exists public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

create policy "read own progress" on public.progress
  for select to authenticated using (auth.uid() = user_id);
create policy "insert own progress" on public.progress
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own progress" on public.progress
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Let signed-in users reach the table through the API (row-level security above still limits them to their own row).
grant select, insert, update on public.progress to authenticated;
