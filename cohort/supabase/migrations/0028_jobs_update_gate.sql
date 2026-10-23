-- Close the update-side bypass: non-admins cannot convert a gig into an
-- opening, move ownership, or otherwise end with a row they could not insert.
drop policy jobs_update on public.jobs;
create policy jobs_update on public.jobs for update to authenticated
  using (auth.uid() = posted_by or public.is_admin())
  with check (
    public.is_admin()
    or (posted_by = auth.uid() and (cat = 'Gig work' or public.is_verified_member()))
  );
