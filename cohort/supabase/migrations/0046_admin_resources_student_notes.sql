-- 0046: main resources become admin-only (added from the admin panel); a new
-- student_notes layer where any active member can share notes/files.

-- 1. Main resources: only admins may add. Reads stay public, owners/admins
--    keep update/delete so nothing already shared breaks.
drop policy resources_insert on public.resources;
create policy resources_insert on public.resources
  for insert to authenticated
  with check (auth.uid() = owner_id and public.is_admin());

-- The resources storage bucket follows the same rule: admin uploads only.
drop policy resource_files_insert on storage.objects;
create policy resource_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public.is_admin()
  );

-- 2. Student notes: any active member can share; reads stay public like the
--    rest of the app's content; owner or admin can edit/remove.
create table public.student_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) >= 1 and char_length(title) <= 300),
  subject text not null default '' check (char_length(subject) <= 120),
  meta text not null default '' check (char_length(meta) <= 100),
  uploader_name text not null default '',
  owner_id uuid,
  file_path text,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.student_notes enable row level security;

create policy student_notes_read on public.student_notes
  for select using (true);
create policy student_notes_insert on public.student_notes
  for insert to authenticated
  with check (auth.uid() = owner_id and public.is_active_member());
create policy student_notes_update on public.student_notes
  for update to authenticated
  using (auth.uid() = owner_id or public.is_admin());
create policy student_notes_delete on public.student_notes
  for delete to authenticated
  using (auth.uid() = owner_id or public.is_admin());

-- Files for student notes live in their own bucket, same shape as resources.
insert into storage.buckets (id, name, public) values ('student-notes', 'student-notes', false);

create policy student_note_files_read on storage.objects
  for select using (bucket_id = 'student-notes');
create policy student_note_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-notes'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public.is_active_member()
  );
create policy student_note_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-notes'
    and ((storage.foldername(name))[1] = (auth.uid())::text or public.is_admin())
  );

-- Admin activity log sees shared notes like it sees shared resources.
create or replace function public.log_student_note_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_log(actor_id, actor_name, action, entity_type, entity_id, detail)
  values (new.owner_id, coalesce(new.uploader_name, ''), 'note_shared', 'student_notes', new.id::text,
          jsonb_build_object('title', new.title));
  return new;
end $$;

create trigger student_notes_log
  after insert on public.student_notes
  for each row execute function public.log_student_note_activity();
