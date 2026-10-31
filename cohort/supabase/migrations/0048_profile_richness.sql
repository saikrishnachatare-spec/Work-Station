-- 0048: richer member profiles - headline, bio, links, skills, experience, education.
-- Audience is unchanged: existing RLS already limits profile reads to signed-in
-- members and writes to the profile owner. guard_profile_privileges (0015) only
-- restricts role/status/id, so members can edit these fields on their own row.

alter table public.profiles
  add column if not exists headline text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists skills text[] not null default '{}',
  add column if not exists experience jsonb not null default '[]'::jsonb,
  add column if not exists education jsonb not null default '[]'::jsonb;

-- Shape and size guards: keep rows small and arrays well-formed.
alter table public.profiles
  add constraint profiles_headline_len check (char_length(headline) <= 120),
  add constraint profiles_bio_len check (char_length(bio) <= 2000),
  add constraint profiles_links_shape check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  add constraint profiles_experience_shape check (jsonb_typeof(experience) = 'array' and jsonb_array_length(experience) <= 10),
  add constraint profiles_education_shape check (jsonb_typeof(education) = 'array' and jsonb_array_length(education) <= 10),
  add constraint profiles_skills_len check (array_length(skills, 1) is null or array_length(skills, 1) <= 15);
