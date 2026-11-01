-- 0067: the profile editor uploads profile photos into the resources bucket
-- under <uid>/avatar-*; 0046 restricted that bucket's inserts to admins, so
-- member photo saves failed with a storage RLS 403. Allow active members to
-- add only avatar files inside their own folder; everything else in the
-- bucket stays admin-only.
create policy resource_files_insert_avatar on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and (storage.foldername(name))[2] like 'avatar-%'
    and public.is_active_member()
  );
