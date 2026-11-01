-- 0066: the profile editor writes a city field, but no numbered migration ever
-- added it (the only definition sat in the orphan create-table file
-- 20261023000100_profiles.sql, ineffective because 0001 already created the
-- table). Every member profile save failed with PGRST204 "Could not find the
-- 'city' column". Add the column for real.
alter table public.profiles add column if not exists city text not null default '';
