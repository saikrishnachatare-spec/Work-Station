alter table public.resources add column if not exists file_path text;
alter table public.resources add column if not exists file_name text;
alter table public.resources add column if not exists mime_type text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('resources','resources',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy resource_files_insert on storage.objects for insert to authenticated
with check(bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active_member());
create policy resource_files_read on storage.objects for select to authenticated
using(bucket_id='resources');
create policy resource_files_delete on storage.objects for delete to authenticated
using(bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text);
