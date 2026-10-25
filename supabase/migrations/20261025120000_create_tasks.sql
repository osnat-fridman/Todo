-- Shared task list (ARCHITECTURE.md 2.3) and access for the app_backend role (ADR-2).
-- Requires the app_backend role to exist in the project before this migration is applied.
-- Written to be safe to re-run.

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       varchar(100) null,
  description varchar(2000) null,
  due_date    date null,
  completed   boolean not null default false,
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- At least one of title/description must contain a non-whitespace character.
  constraint tasks_title_or_description check (title ~ '\S' or description ~ '\S'),
  constraint tasks_position_nonnegative check (position >= 0)
);

-- No UNIQUE on position, so reorders can update positions atomically.
create index if not exists tasks_position_id_idx on public.tasks (position, id);

-- Lock the table away from the public Data API roles; only app_backend may use it.
alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;

grant usage on schema public to app_backend;
grant select, insert, update, delete on public.tasks to app_backend;

drop policy if exists tasks_app_backend_all on public.tasks;
create policy tasks_app_backend_all on public.tasks
  for all to app_backend
  using (true)
  with check (true);
