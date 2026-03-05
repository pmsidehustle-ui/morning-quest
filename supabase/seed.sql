-- OPTIONAL seed data
-- 1) Create a family
insert into public.families (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Our Family')
on conflict do nothing;

-- 2) Settings
insert into public.settings (family_id, leave_house_time, bus_time)
values ('11111111-1111-1111-1111-111111111111', '07:25', '07:35')
on conflict (family_id) do update set leave_house_time = excluded.leave_house_time, bus_time = excluded.bus_time;

-- 3) PROFILES
-- Replace the UUIDs below with the real auth.users UUIDs (from Supabase Auth → Users)
-- Son:
-- insert into public.profiles (id, family_id, role, display_name) values ('SON-UUID', '1111..', 'child', 'Jack');
-- Parent 1:
-- insert into public.profiles (id, family_id, role, display_name) values ('PARENT1-UUID', '1111..', 'parent', 'Dad');
-- Parent 2:
-- insert into public.profiles (id, family_id, role, display_name) values ('PARENT2-UUID', '1111..', 'parent', 'Mum');

-- 4) Wallet rows (also replace UUIDs)
-- insert into public.wallet (user_id, family_id) values ('SON-UUID', '11111111-1111-1111-1111-111111111111');

-- 5) Tasks (10)
delete from public.tasks where family_id = '11111111-1111-1111-1111-111111111111';

insert into public.tasks (family_id, title, coin_value, is_required, sort_order) values
('11111111-1111-1111-1111-111111111111','Get dressed',5,true,1),
('11111111-1111-1111-1111-111111111111','Eat breakfast',10,true,2),
('11111111-1111-1111-1111-111111111111','Take meds',10,true,3),
('11111111-1111-1111-1111-111111111111','Brush teeth',5,true,4),
('11111111-1111-1111-1111-111111111111','Deodorant / hair',5,true,5),
('11111111-1111-1111-1111-111111111111','Pack school bag',15,true,6),
('11111111-1111-1111-1111-111111111111','Lunch / snack packed',10,true,7),
('11111111-1111-1111-1111-111111111111','Fill water bottle',10,true,8),
('11111111-1111-1111-1111-111111111111','Shoes + hat/jumper',5,true,9),
('11111111-1111-1111-1111-111111111111','Ready at the door',15,true,10);

-- 6) Rewards
delete from public.rewards where family_id = '11111111-1111-1111-1111-111111111111';

insert into public.rewards (family_id, title, coin_cost, requires_parent_approval) values
('11111111-1111-1111-1111-111111111111','20 min phone apps',30,true),
('11111111-1111-1111-1111-111111111111','30 min PlayStation',50,true),
('11111111-1111-1111-1111-111111111111','1 TV episode',40,true),
('11111111-1111-1111-1111-111111111111','Choose dessert',80,true),
('11111111-1111-1111-1111-111111111111','Movie night',120,true);
