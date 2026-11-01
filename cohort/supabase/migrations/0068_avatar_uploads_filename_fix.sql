-- 0068: 0067 matched (storage.foldername(name))[2] for avatar files, but
-- foldername() returns only the directory segments - for '<uid>/avatar-...'
-- that is just { <uid> }, so [2] is always null and the policy never matched
-- (uploads still 403). Match the filename in the object name instead.
drop policy resource_files_insert_avatar on storage.objects;
create policy resource_files_insert_avatar on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and name like '%/avatar-%'
    and public.is_active_member()
  );
