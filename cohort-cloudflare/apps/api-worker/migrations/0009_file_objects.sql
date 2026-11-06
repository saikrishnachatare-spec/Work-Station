-- Preview file ledger. Bytes stay in private R2; all access through worker.
-- Pending/deleting entries remain recorded for explicit safe cleanup/retry.
CREATE TABLE file_objects (
  bucket TEXT NOT NULL CHECK(bucket IN ('resources','student-notes','resumes','post-images')),
  path TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  state TEXT NOT NULL CHECK(state IN ('pending','ready','deleting','deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(bucket,path)
);
CREATE INDEX file_objects_owner_bucket_created ON file_objects(owner_id,bucket,created_at);

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER posts_file_ready_insert BEFORE INSERT ON posts
WHEN new.image_path IS NOT NULL 
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='post-images' AND path=new.image_path AND (state<>'ready' OR owner_id<>new.author_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER posts_file_ready_update BEFORE UPDATE OF image_path ON posts
WHEN new.image_path IS NOT NULL AND new.image_path IS NOT old.image_path
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='post-images' AND path=new.image_path AND (state<>'ready' OR owner_id<>new.author_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER resources_file_ready_insert BEFORE INSERT ON resources
WHEN new.file_path IS NOT NULL 
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='resources' AND path=new.file_path AND (state<>'ready' OR owner_id<>new.owner_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER resources_file_ready_update BEFORE UPDATE OF file_path ON resources
WHEN new.file_path IS NOT NULL AND new.file_path IS NOT old.file_path
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='resources' AND path=new.file_path AND (state<>'ready' OR owner_id<>new.owner_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER student_notes_file_ready_insert BEFORE INSERT ON student_notes
WHEN new.file_path IS NOT NULL 
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='student-notes' AND path=new.file_path AND (state<>'ready' OR owner_id<>new.owner_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER student_notes_file_ready_update BEFORE UPDATE OF file_path ON student_notes
WHEN new.file_path IS NOT NULL AND new.file_path IS NOT old.file_path
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='student-notes' AND path=new.file_path AND (state<>'ready' OR owner_id<>new.owner_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER applications_file_ready_insert BEFORE INSERT ON applications
WHEN new.resume_path IS NOT NULL 
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='resumes' AND path=new.resume_path AND (state<>'ready' OR owner_id<>new.user_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER applications_file_ready_update BEFORE UPDATE OF resume_path ON applications
WHEN new.resume_path IS NOT NULL AND new.resume_path IS NOT old.resume_path
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='resumes' AND path=new.resume_path AND (state<>'ready' OR owner_id<>new.user_id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER profiles_file_ready_insert BEFORE INSERT ON profiles
WHEN new.avatar_path IS NOT NULL 
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='resources' AND path=new.avatar_path AND (state<>'ready' OR owner_id<>new.id));
END;

-- Serialize attachment against cleanup of ledger-tracked objects. Legacy rows
-- without a ledger are preserved; routes refuse new unknown references.
CREATE TRIGGER profiles_file_ready_update BEFORE UPDATE OF avatar_path ON profiles
WHEN new.avatar_path IS NOT NULL AND new.avatar_path IS NOT old.avatar_path
BEGIN
  SELECT RAISE(ABORT,'file_not_ready') WHERE EXISTS (
    SELECT 1 FROM file_objects WHERE bucket='resources' AND path=new.avatar_path AND (state<>'ready' OR owner_id<>new.id));
END;
