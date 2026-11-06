-- 0005: 0048 profile-richness columns, needed by the item-2 profile endpoints.
-- Mirrors 0048_profile_richness.sql: headline (<=120), bio (<=2000), links
-- (jsonb array <=5), skills (text[] <=15), experience/education (jsonb <=10).
-- D1 has no jsonb/text[]: stored as JSON text, validated in the worker and by
-- CHECK constraints here.
ALTER TABLE profiles ADD COLUMN headline TEXT NOT NULL DEFAULT '' CHECK (length(headline) <= 120);
ALTER TABLE profiles ADD COLUMN bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 2000);
ALTER TABLE profiles ADD COLUMN links TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(links) AND json_type(links) = 'array');
ALTER TABLE profiles ADD COLUMN skills TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(skills) AND json_type(skills) = 'array');
ALTER TABLE profiles ADD COLUMN experience TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(experience) AND json_type(experience) = 'array');
ALTER TABLE profiles ADD COLUMN education TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(education) AND json_type(education) = 'array');
