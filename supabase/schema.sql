-- Morning Quest schema (single-family friendly)
-- Run in Supabase SQL editor.

-- 1) Families
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 2) Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  role text not null check (role in ('child','parent')),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- 3) Settings (one per family)
create table if not exists public.settings (
  family_id uuid primary key references public.families(id) on delete cascade,
  leave_house_time text not null default '07:25', -- HH:MM
  bus_time text not null default '07:35',         -- HH:MM
  updated_at timestamptz not null default now()
);

-- 4) Wallet (one per user)
create table if not exists public.wallet (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  coin_balance int not null default 0,
  streak_count int not null default 0,
  shields_available int not null default 0,
  last_run_ymd text,
  last_perfect_ymd text,
  pet_hunger int not null default 60,
  pet_happiness int not null default 60,
  pet_stage int not null default 1,
  chest_tokens int not null default 0,
  last_chest_ymd text,
  updated_at timestamptz not null default now()
);

-- 5) Tasks (family-wide)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  coin_value int not null default 10,
  is_required boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 6) Daily runs (per user per day)
create table if not exists public.daily_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date_ymd text not null, -- YYYY-MM-DD in Australia/Sydney
  is_school_day boolean not null default true,
  completed_at timestamptz,
  perfect_morning boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, date_ymd)
);

-- 7) Task completions
create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_run_id uuid not null references public.daily_runs(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (daily_run_id, task_id)
);

-- 8) Rewards (family-wide)
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  coin_cost int not null default 50,
  requires_parent_approval boolean not null default true,
  created_at timestamptz not null default now()
);

-- 9) Reward requests
create table if not exists public.reward_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  status text not null check (status in ('pending','approved','denied')) default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ----------------------------
-- RLS
-- ----------------------------
alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.wallet enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_runs enable row level security;
alter table public.task_completions enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_requests enable row level security;

-- Helper: is parent in same family
create or replace function public.is_parent_same_family(target_family uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'parent'
      and p.family_id = target_family
  );
$$;

-- families: only parents can view (optional)
create policy "parents can select family"
on public.families
for select
to authenticated
using (public.is_parent_same_family(id));

-- profiles: users can read themselves, parents can read all in family
create policy "profiles self select"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_parent_same_family(family_id)
);

create policy "profiles self update"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- settings: parents can read/write, child can read
create policy "settings select in family"
on public.settings
for select
to authenticated
using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.family_id = settings.family_id)
);

create policy "settings parents update"
on public.settings
for update
to authenticated
using (public.is_parent_same_family(family_id))
with check (public.is_parent_same_family(family_id));

-- wallet: user can read/update self; parents can read child's wallet; only parents can update other's wallet (not used here)
create policy "wallet select self or parent"
on public.wallet
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_parent_same_family(family_id)
);

create policy "wallet update self"
on public.wallet
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- tasks & rewards: all family members can read; only parents can write
create policy "tasks select family"
on public.tasks
for select
to authenticated
using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.family_id = tasks.family_id)
);

create policy "tasks parents insert"
on public.tasks
for insert
to authenticated
with check (public.is_parent_same_family(family_id));

create policy "tasks parents update"
on public.tasks
for update
to authenticated
using (public.is_parent_same_family(family_id))
with check (public.is_parent_same_family(family_id));

create policy "rewards select family"
on public.rewards
for select
to authenticated
using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.family_id = rewards.family_id)
);

create policy "rewards parents insert"
on public.rewards
for insert
to authenticated
with check (public.is_parent_same_family(family_id));

create policy "rewards parents update"
on public.rewards
for update
to authenticated
using (public.is_parent_same_family(family_id))
with check (public.is_parent_same_family(family_id));

-- daily runs & completions: user can write their own; parents can read all in family
create policy "daily_runs select self or parent"
on public.daily_runs
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_parent_same_family(family_id)
);

create policy "daily_runs insert self"
on public.daily_runs
for insert
to authenticated
with check (user_id = auth.uid());

create policy "daily_runs update self"
on public.daily_runs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "task_completions select self or parent"
on public.task_completions
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_parent_same_family(family_id)
);

create policy "task_completions insert self"
on public.task_completions
for insert
to authenticated
with check (user_id = auth.uid());

-- reward requests: child can create & read own; parents can read family; only parents can decide
create policy "reward_requests select self or parent"
on public.reward_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_parent_same_family(family_id)
);

create policy "reward_requests insert self"
on public.reward_requests
for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

create policy "reward_requests parents update decision"
on public.reward_requests
for update
to authenticated
using (public.is_parent_same_family(family_id))
with check (public.is_parent_same_family(family_id));

