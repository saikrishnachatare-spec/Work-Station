-- 0049: applications carry an optional cover note and resume (PDF).
-- Resumes live in a private 'resumes' bucket: only the applicant, admins and
-- posters of jobs the applicant applied to can read a file.

alter table public.applications add column if not exists cover_note text not null default '';
alter table public.applications add column if not exists resume_path text;
alter table public.applications add column if not exists resume_name text;
alter table public.applications drop constraint if exists applications_cover_note_len;
alter table public.applications add constraint applications_cover_note_len check (char_length(cover_note) <= 2000);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy resumes_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_member());
create policy resumes_update_own on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy resumes_read on storage.objects for select to authenticated
  using (
    bucket_id = 'resumes' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.applications a
        join public.jobs j on j.id = a.job_id
        where a.resume_path = name and j.posted_by = auth.uid()
      )
    )
  );
