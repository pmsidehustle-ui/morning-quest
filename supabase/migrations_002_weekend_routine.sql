-- Weekend/Non-school routine support (Fri/Sat/Sun)
-- Adds:
-- 1) settings.weekend_deadline_time (default 09:30)
-- 2) tasks applicability flags for school vs non-school days

alter table public.settings
  add column if not exists weekend_deadline_time text not null default '09:30';

alter table public.tasks
  add column if not exists applies_school boolean not null default true,
  add column if not exists applies_nonschool boolean not null default true;

-- Optional: mark likely school-only tasks as not applying on non-school days
update public.tasks
set applies_nonschool = false
where lower(name) in ('pack school bag','school hat','lunch','check timetable','check school bag','uniform')
  and applies_school = true;
