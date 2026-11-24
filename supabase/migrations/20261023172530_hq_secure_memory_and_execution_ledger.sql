
create table if not exists public.hq_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '',
  category text not null default 'general' check (char_length(category) <= 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hq_memory_items_user_created_idx
  on public.hq_memory_items (user_id, created_at desc);

alter table public.hq_memory_items enable row level security;

create policy "Users can read their own HQ memory"
  on public.hq_memory_items for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own HQ memory"
  on public.hq_memory_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own HQ memory"
  on public.hq_memory_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own HQ memory"
  on public.hq_memory_items for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.hq_memory_items to authenticated;
revoke all on public.hq_memory_items from anon;

create table if not exists public.hq_execution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null check (char_length(task_type) between 1 and 100),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'blocked')),
  provider text,
  model text,
  input_summary text not null default '',
  output_summary text not null default '',
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hq_execution_runs_user_created_idx
  on public.hq_execution_runs (user_id, created_at desc);

create index if not exists hq_execution_runs_status_idx
  on public.hq_execution_runs (status, created_at desc);

alter table public.hq_execution_runs enable row level security;

create policy "Users can read their own execution records"
  on public.hq_execution_runs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own execution records"
  on public.hq_execution_runs for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own execution records"
  on public.hq_execution_runs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.hq_execution_runs to authenticated;
revoke all on public.hq_execution_runs from anon;
