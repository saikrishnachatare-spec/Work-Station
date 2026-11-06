-- SYNTHETIC TEST-PREVIEW FIXTURES ONLY. Every row is invented for the isolated
-- Cloudflare test preview. No production data, no real users. IDs are
-- synthetic; no row maps to any real Clerk account, so a signed-in test user
-- stays cohortUserId=null until item-10 identity mapping.
INSERT OR REPLACE INTO profiles (id, full_name, role, status, course, level, city) VALUES
  ('syn-00000000-0000-4000-8000-000000000001','Test User One','user','active','CA','Inter','Hyderabad'),
  ('syn-00000000-0000-4000-8000-000000000002','Test User Two','user','active','CMA','Foundation','Chennai'),
  ('syn-00000000-0000-4000-8000-0000000000a1','Test Admin','admin','active','','','');
INSERT OR REPLACE INTO posts (id, author_id, author_name, author_role, kind, body, pinned, like_count, comment_count) VALUES
  ('syn-post-0000-0000-4000-8000-000000000001','syn-00000000-0000-4000-8000-000000000001','Test User One','user','post','[SYNTHETIC] Preview seed post: welcome to the Cohort test preview.',1,2,1),
  ('syn-post-0000-0000-4000-8000-000000000002','syn-00000000-0000-4000-8000-000000000002','Test User Two','user','post','[SYNTHETIC] Second seed post for feed rendering checks.',0,0,0);
INSERT OR REPLACE INTO comments (id, post_id, author_id, body) VALUES
  ('syn-cmt-0000-0000-4000-8000-000000000001','syn-post-0000-0000-4000-8000-000000000001','syn-00000000-0000-4000-8000-000000000002','[SYNTHETIC] Seed comment for thread rendering.');
INSERT OR REPLACE INTO groups (id, name, purpose, description, kind, member_count, created_by) VALUES
  ('syn-grp-0000-0000-4000-8000-000000000001','Synthetic Study Group','[SYNTHETIC] preview fixture','[SYNTHETIC] group for preview route checks','group',2,'syn-00000000-0000-4000-8000-000000000001');
INSERT OR REPLACE INTO group_members (group_id, user_id, role) VALUES
  ('syn-grp-0000-0000-4000-8000-000000000001','syn-00000000-0000-4000-8000-000000000001','admin'),
  ('syn-grp-0000-0000-4000-8000-000000000001','syn-00000000-0000-4000-8000-000000000002','member');
INSERT OR REPLACE INTO communities (id, name, about, created_by) VALUES
  ('syn-com-0000-0000-4000-8000-000000000001','Synthetic Community','[SYNTHETIC] preview fixture community','syn-00000000-0000-4000-8000-000000000001');
INSERT OR REPLACE INTO community_groups (community_id, group_id) VALUES
  ('syn-com-0000-0000-4000-8000-000000000001','syn-grp-0000-0000-4000-8000-000000000001');
INSERT OR REPLACE INTO resources (id, cat, course, subject, title, uploaded_by, meta, owner_id) VALUES
  ('syn-res-0000-0000-4000-8000-000000000001','Notes','CA','Accounts','[SYNTHETIC] Seed resource note','Test User One','synthetic fixture','syn-00000000-0000-4000-8000-000000000001');
INSERT OR REPLACE INTO jobs (id, cat, firm, role, loc, pay, tags, posted_by, description, status, openings) VALUES
  ('syn-job-0000-0000-4000-8000-000000000001','Jobs','Synthetic Firm LLP','Article Assistant','Hyderabad','10000','["synthetic"]','syn-00000000-0000-4000-8000-0000000000a1','[SYNTHETIC] preview fixture job posting.','open',2);

-- Item-2 explicit dev binding: profile row keyed to the SYNTHETIC Clerk dev
-- user used for preview sign-in. Only active because the sub is also on the
-- worker's TEST_SUB_ALLOWLIST (server-controlled, wrangler [vars]). No real
-- user, no production data, no Backend-API import (item 10 replaces this).
INSERT OR REPLACE INTO profiles (id, full_name, role, status, course, level, city, headline, bio) VALUES
  ('user_3LfjRoTDNbKKoIokRRE50PtERCb','[SYNTHETIC] Preview Tester A','user','active','CA','Inter','Hyderabad','[SYNTHETIC] preview tester','[SYNTHETIC] mapped dev identity for preview sign-in flows.');
INSERT OR REPLACE INTO group_members (group_id, user_id, role) VALUES
  ('syn-grp-0000-0000-4000-8000-000000000001','user_3LfjRoTDNbKKoIokRRE50PtERCb','member');
