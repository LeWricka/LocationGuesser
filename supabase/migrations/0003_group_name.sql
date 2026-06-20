-- 0003_group_name — el grupo ("viaje") puede tener un nombre legible.
alter table public.groups add column if not exists name text;
