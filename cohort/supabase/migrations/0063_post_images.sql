-- 0063: optional image on feed posts (image renders above the text).
alter table public.posts add column if not exists image_path text;

-- Post images are as public as the posts themselves (posts_read is public),
-- so the bucket is public; writes stay owner-scoped like resumes.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

drop policy if exists post_images_insert on storage.objects;
create policy post_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (auth.uid())::text and public.is_active_member());

drop policy if exists post_images_delete on storage.objects;
create policy post_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (((storage.foldername(name))[1] = (auth.uid())::text) or public.is_admin()));
