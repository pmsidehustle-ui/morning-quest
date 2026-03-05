-- Run this if you already created tables and want to add Boss Battle / Pet Evolution / Treasure Chests
alter table public.wallet
  add column if not exists pet_stage int not null default 1,
  add column if not exists chest_tokens int not null default 0,
  add column if not exists last_chest_ymd text;
