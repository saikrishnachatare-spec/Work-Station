-- Post images: authenticated read policy so the Storage API can locate objects
-- (needed for delete-by-path; bucket is public for rendering, mirrors resource_files_read).
drop policy if exists post_images_read on storage.objects;
create policy post_images_read on storage.objects for select to authenticated
  using (bucket_id = 'post-images');
