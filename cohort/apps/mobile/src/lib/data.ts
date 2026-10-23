/**
 * Live data layer: every screen reads from and writes to Supabase.
 * Reads are public (RLS); writes need a signed-in user.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type Post = {
  id: string;
  author_id: string | null;
  author_name: string;
  author_role: string;
  kind: 'post' | 'announcement' | 'message';
  body: string;
  pinned: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  purpose: string;
  description: string;
  member_count: number;
  created_by: string | null;
};

export type Job = {
  id: string;
  status?: 'open' | 'closed';
  cat: string;
  firm: string;
  role: string;
  loc: string;
  pay: string;
  tags: string[];
  description: string;
  deadline: string | null;
  created_at?: string;
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type Resource = {
  id: string;
  cat: string;
  course: string;
  title: string;
  uploaded_by: string;
  file_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  meta: string;
  subject?: string;
};

export type Profile = {
  course?: string;
  level?: string;
  avatar_path?: string | null;
  id: string;
  full_name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  verified_at?: string | null;
  account_type?: 'individual' | 'firm' | 'enterprise';
  org_name?: string;
  created_at: string;
};

export type Thread = { id: string; created_at: string };
export type Message = { id: string; thread_id: string; sender_id: string | null; body: string; created_at: string };

/** Relative label like "2h ago" for timestamps. */
export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function usePosts() {
  return useQuery({
    queryKey: ['posts'],
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Post[];
    },
  });
}

export function useMyLikes(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['likes', userId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('post_likes').select('post_id').eq('user_id', userId!);
      if (error) throw error;
      return new Set((data as { post_id: string }[]).map((r) => r.post_id));
    },
  });
}

export function useToggleLike(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, liked }: { liked: boolean; postId: string }) => {
      if (!userId) throw new Error('Sign in to like posts');
      if (liked) {
        const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['likes', userId] });
    },
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ authorId, authorName, body }: { authorId: string; authorName: string; body: string }) => {
      const { error } = await supabase
        .from('posts')
        .insert({ author_id: authorId, author_name: authorName, author_role: '', body, kind: 'post' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await supabase.from('groups').select('*').order('member_count', { ascending: false });
      if (error) throw error;
      return data as Group[];
    },
  });
}

export function useMyGroups(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['my-groups', userId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('group_members').select('group_id').eq('user_id', userId!);
      if (error) throw error;
      return new Set((data as { group_id: string }[]).map((r) => r.group_id));
    },
  });
}

export function useToggleGroup(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, member }: { groupId: string; member: boolean }) => {
      if (!userId) throw new Error('Sign in to join circles');
      if (member) {
        const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['my-groups', userId] });
    },
  });
}

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async (): Promise<Job[]> => {
      const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });
}

export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await supabase.from('resources').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Resource[];
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
  });
}

export function useMyProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile', userId],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return (data as Profile) ?? null;
    },
  });
}

export function useMyApplications(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['applications', userId],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('applications').select('job_id, status').eq('user_id', userId!);
      if (error) throw error;
      return new Map((data as { job_id: string; status: string }[]).map((r) => [r.job_id, r.status]));
    },
  });
}

export function useToggleApplication(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applied, jobId }: { applied: boolean; jobId: string }) => {
      if (!userId) throw new Error('Sign in to apply');
      if (applied) {
        const { error } = await supabase.from('applications').delete().eq('job_id', jobId).eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('applications').insert({ job_id: jobId, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications', userId] }),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ description, name, purpose, userId }: { description: string; name: string; purpose: string; userId: string }) => {
      const { data, error } = await supabase
        .from('groups')
        .insert({ created_by: userId, description, member_count: 0, name, purpose })
        .select('id')
        .single();
      if (error) throw error;
      // Creator automatically joins their circle
      await supabase.from('group_members').insert({ group_id: data.id, user_id: userId });
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['my-groups', variables.userId] });
    },
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cat = 'Jobs', deadline = '', description = '', firm, loc = '', pay = '', role, userId,
    }: {
      cat?: string; deadline?: string; description?: string; firm: string; loc?: string; pay?: string; role: string; userId: string;
    }) => {
      const row: Record<string, unknown> = {
        cat, description, firm, loc, pay, posted_by: userId, role, tags: [],
      };
      if (deadline) row.deadline = deadline;
      const { error } = await supabase.from('jobs').insert(row);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useMyPostedJobs(userId?: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['my-jobs', userId],
    queryFn: async (): Promise<Job[]> => {
      const { data, error } = await supabase.from('jobs').select('*').eq('posted_by', userId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });
}

export type Application = { id: string; job_id: string; user_id: string; created_at: string; status: 'new' | 'reviewed' | 'shortlisted' | 'rejected' };

export function useUpdateApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, status }: { applicationId: string; status: string }) => {
      const { error } = await supabase.from('applications').update({ status }).eq('id', applicationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-applications'] }),
  });
}

export function useApplicationsForJobs(jobIds: string[]) {
  const key = jobIds.slice().sort().join(',');
  return useQuery({
    enabled: jobIds.length > 0,
    queryKey: ['job-applications', key],
    queryFn: async (): Promise<Application[]> => {
      const { data, error } = await supabase.from('applications').select('*').in('job_id', jobIds).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Application[];
    },
  });
}

export type ActivityRow = {
  id: string; actor_name: string; action: string; entity_type: string; entity_id: string;
  detail: Record<string, unknown>; created_at: string;
};

export function useActivityLog(enabled: boolean, limit = 200) {
  return useQuery({
    enabled,
    queryKey: ['activity-log', limit],
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      return data as ActivityRow[];
    },
  });
}

export type TrashRow = {
  id: string; entity_table: string; entity_id: string;
  payload: Record<string, string>; trashed_by_name: string; trashed_at: string;
};

export function useTrash(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['trash'],
    queryFn: async (): Promise<TrashRow[]> => {
      const { data, error } = await supabase.from('trash').select('*').is('restored_at', null).order('trashed_at', { ascending: false });
      if (error) throw error;
      return data as TrashRow[];
    },
  });
}

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ course, subject = '', title, uploadedBy, userId, file }: {
      course: string; subject?: string; title: string; uploadedBy: string; userId: string;
      file?: { uri: string; name: string; mimeType?: string; size?: number } | null;
    }) => {
      if (!file) throw new Error('Choose a PDF or image');
      if ((file.size ?? 0) > 10 * 1024 * 1024) throw new Error('Maximum file size is 10 MB');
      const mime = file.mimeType || 'application/pdf';
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new Error('Choose a PDF, PNG, JPEG or WebP');
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const bytes = await (await fetch(file.uri)).arrayBuffer();
      const { error: uploadError } = await supabase.storage.from('resources').upload(path, bytes, { contentType: mime });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from('resources').insert({ cat: 'Notes', course, subject,
        meta: `${Math.ceil(bytes.byteLength / 1024)} KB`, owner_id: userId, title, uploaded_by: uploadedBy,
        file_path: path, file_name: file.name, mime_type: mime });
      if (error) { await supabase.storage.from('resources').remove([path]); throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  });
}

export type JobAlertPref = { user_id: string; keywords: string; last_seen_at: string };

export function useJobAlertPref(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['job-alert', userId],
    queryFn: async (): Promise<JobAlertPref | null> => {
      const { data, error } = await supabase.from('job_alert_prefs').select('*').eq('user_id', userId!).maybeSingle();
      if (error) throw error;
      return (data as JobAlertPref) ?? null;
    },
  });
}

export function useSaveJobAlert(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ keywords, markSeen }: { keywords: string; markSeen?: boolean }) => {
      if (!userId) throw new Error('Sign in to set alerts');
      const row: Record<string, unknown> = { keywords, updated_at: new Date().toISOString(), user_id: userId };
      if (markSeen) row.last_seen_at = new Date().toISOString();
      const { error } = await supabase.from('job_alert_prefs').upsert(row, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-alert', userId] }),
  });
}

export type ThreadSummary = {
  otherUserId?: string;
  id: string;
  otherName: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

/** Threads the signed-in user participates in, with the other person's name. */
export function useThreads(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['threads', userId],
    queryFn: async (): Promise<ThreadSummary[]> => {
      const { data: mine, error: e1 } = await supabase
        .from('thread_participants')
        .select('thread_id, last_read_at')
        .eq('user_id', userId!);
      if (e1) throw e1;
      const lastRead = new Map((mine as { thread_id: string; last_read_at: string }[]).map((r) => [r.thread_id, r.last_read_at]));
      const ids = (mine as { thread_id: string }[]).map((r) => r.thread_id);
      if (ids.length === 0) return [];
      const { data: others, error: e2 } = await supabase
        .from('thread_participants')
        .select('thread_id, user_id')
        .in('thread_id', ids)
        .neq('user_id', userId!);
      if (e2) throw e2;
      const otherIds = (others as { user_id: string }[]).map((r) => r.user_id);
      const { data: names } = await supabase.from('profiles').select('id, full_name').in('id', otherIds);
      const nameOf = new Map((names ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
      const { data: msgs, error: e3 } = await supabase
        .from('messages')
        .select('thread_id, body, created_at, sender_id')
        .in('thread_id', ids)
        .order('created_at', { ascending: false });
      if (e3) throw e3;
      const lastOf = new Map<string, { body: string; created_at: string }>();
      const unreadOf = new Map<string, number>();
      for (const m of msgs as { thread_id: string; body: string; created_at: string; sender_id: string | null }[]) {
        if (!lastOf.has(m.thread_id)) lastOf.set(m.thread_id, m);
        const readAt = lastRead.get(m.thread_id);
        if (m.sender_id && m.sender_id !== userId && (!readAt || m.created_at > readAt)) {
          unreadOf.set(m.thread_id, (unreadOf.get(m.thread_id) ?? 0) + 1);
        }
      }
      return (others as { thread_id: string; user_id: string }[]).map((o) => ({
        id: o.thread_id,
        otherUserId: o.user_id,
        otherName: nameOf.get(o.user_id) || 'Member',
        lastMessage: lastOf.get(o.thread_id)?.body ?? '',
        lastAt: lastOf.get(o.thread_id)?.created_at ?? '',
        unread: unreadOf.get(o.thread_id) ?? 0,
      }));
    },
  });
}

/** Mark a thread read up to now for the signed-in user. */
export function useMarkThreadRead(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await supabase.rpc('mark_thread_read', { p_thread: threadId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threads', userId] }),
  });
}

export function useThreadMessages(threadId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.channel(`messages:${threadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` }, () => {
        qc.invalidateQueries({ queryKey: ['messages', threadId] });
        qc.invalidateQueries({ queryKey: ['threads'] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [threadId, qc]);
  return useQuery({
    enabled: !!threadId,
    queryKey: ['messages', threadId],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    refetchInterval: 5000,
  });
}

export function useStartThread(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ otherUserId, firstMessage }: { firstMessage: string; otherUserId: string }) => {
      if (!userId) throw new Error('Sign in to send messages');
      const { data: thread, error: e1 } = await supabase.from('threads').insert({}).select('id').single();
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from('thread_participants')
        .insert([{ thread_id: thread.id, user_id: userId }, { thread_id: thread.id, user_id: otherUserId }]);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('messages').insert({ body: firstMessage, sender_id: userId, thread_id: thread.id });
      if (e3) throw e3;
      return thread.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threads', userId] }),
  });
}

export function useSendMessage(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, threadId }: { body: string; threadId: string }) => {
      if (!userId) throw new Error('Sign in to send messages');
      const { error } = await supabase.from('messages').insert({ body, sender_id: userId, thread_id: threadId });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['messages', v.threadId] });
      qc.invalidateQueries({ queryKey: ['threads', userId] });
    },
  });
}

/* ---------- Group chat, invites, and single-item reads ---------- */

export type GroupInvitePreview = { group_id: string; name: string; purpose: string; member_count: number };

/** Get (or create on demand) the chat thread owned by a group. */
export async function getGroupThreadId(groupId: string): Promise<string> {
  const { data: existing, error: e1 } = await supabase
    .from('threads')
    .select('id')
    .eq('group_id', groupId)
    .maybeSingle();
  if (e1) throw e1;
  if (existing) return existing.id as string;
  const { data: created, error: e2 } = await supabase
    .from('threads')
    .insert({ group_id: groupId })
    .select('id')
    .single();
  if (e2) throw e2;
  return created.id as string;
}

export function useGroupThread(groupId: string | null, userId: string | undefined) {
  return useQuery({
    enabled: !!groupId && !!userId,
    queryKey: ['group-thread', groupId],
    queryFn: () => getGroupThreadId(groupId!),
  });
}

/** Get (or create) the shareable invite link for a group the user belongs to. */
export async function getGroupInviteLink(groupId: string, userId: string): Promise<string> {
  const { data: existing, error: e1 } = await supabase
    .from('group_invites')
    .select('token')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  let token = existing?.token as string | undefined;
  if (!token) {
    const { data: created, error: e2 } = await supabase
      .from('group_invites')
      .insert({ created_by: userId, group_id: groupId })
      .select('token')
      .single();
    if (e2) throw e2;
    token = created.token as string;
  }
  return `https://cohort-pi-eight.vercel.app/join?token=${token}`;
}

/** Public invite preview (no membership required). */
export function useInvitePreview(token: string | null) {
  return useQuery({
    enabled: !!token,
    queryKey: ['invite', token],
    queryFn: async (): Promise<GroupInvitePreview | null> => {
      const { data, error } = await supabase.rpc('group_by_invite_token', { p_token: token! });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as GroupInvitePreview) ?? null;
    },
  });
}

export function useJoinByToken(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string): Promise<string> => {
      if (!userId) throw new Error('Sign in to join');
      const { data, error } = await supabase.rpc('join_group_by_token', { p_token: token });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-groups', userId] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

/** Add other people to a group the user belongs to. */
export function useAddGroupMembers(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, memberIds }: { groupId: string; memberIds: string[] }) => {
      if (!userId) throw new Error('Sign in to add people');
      const rows = memberIds.map((id) => ({ group_id: groupId, user_id: id }));
      const { error } = await supabase.from('group_members').upsert(rows, { onConflict: 'group_id,user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['my-groups', userId] });
    },
  });
}

/** Leave a group: removes only the caller's own membership row. */
export function useLeaveGroup(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      if (!userId) throw new Error('Sign in to leave a group');
      const { data, error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Could not leave - membership row was not removed.');
    },
    onSuccess: (_d, groupId) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['my-groups', userId] });
      qc.invalidateQueries({ queryKey: ['group-members', groupId] });
    },
  });
}

export function useGroupMembers(groupId: string | null) {
  return useQuery({
    enabled: !!groupId,
    queryKey: ['group-members', groupId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('group_members').select('user_id').eq('group_id', groupId!);
      if (error) throw error;
      return (data as { user_id: string }[]).map((r) => r.user_id);
    },
  });
}

export type GroupMemberRow = { user_id: string; role: 'admin' | 'member' };

export function useGroupMemberRows(groupId: string | null) {
  return useQuery({
    enabled: !!groupId,
    queryKey: ['group-member-rows', groupId],
    queryFn: async (): Promise<GroupMemberRow[]> => {
      const { data, error } = await supabase.from('group_members').select('user_id, role').eq('group_id', groupId!);
      if (error) throw error;
      return data as GroupMemberRow[];
    },
  });
}

export function useGroup(groupId: string | null) {
  return useQuery({
    enabled: !!groupId,
    queryKey: ['group', groupId],
    queryFn: async (): Promise<{ id: string; name: string; created_by: string } | null> => {
      const { data, error } = await supabase.from('groups').select('id, name, created_by').eq('id', groupId!).maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; created_by: string } | null;
    },
  });
}

export function useSetGroupMemberRole(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) => {
      const { data, error } = await supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', memberId).select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('not_permitted');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-member-rows', groupId] }),
  });
}

export function useRemoveGroupMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', memberId).select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('not_permitted');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-member-rows', groupId] });
      qc.invalidateQueries({ queryKey: ['group-members', groupId] });
    },
  });
}

export function usePost(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['post', id],
    queryFn: async (): Promise<Post | null> => {
      const { data, error } = await supabase.from('posts').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data as Post) ?? null;
    },
  });
}

export function useJob(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['job', id],
    queryFn: async (): Promise<Job | null> => {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data as Job) ?? null;
    },
  });
}

/* ---------- Post comments ---------- */

export function useComments(postId: string | null) {
  return useQuery({
    enabled: !!postId,
    queryKey: ['comments', postId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Comment[];
    },
  });
}

export function useAddComment(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, postId }: { body: string; postId: string }) => {
      if (!userId) throw new Error('Sign in to comment');
      const { error } = await supabase.from('comments').insert({ author_id: userId, body, post_id: postId });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['comments', v.postId] });
      qc.invalidateQueries({ queryKey: ['post', v.postId] });
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

/** Own-content writes return a row so RLS no-ops cannot look successful. */
export function useEditOwnContent(table: 'posts' | 'comments', userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      if (!userId || !body.trim()) throw new Error('Sign in and enter text');
      const { data, error } = await supabase.from(table).update({ body: body.trim() })
        .eq('id', id).eq('author_id', userId).select('id').single();
      if (error || !data) throw error || new Error('Nothing updated');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); qc.invalidateQueries({ queryKey: ['post'] }); qc.invalidateQueries({ queryKey: ['comments'] }); },
  });
}
export function useDeleteOwnContent(table: 'posts' | 'comments', userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error('Sign in first');
      const { data, error } = await supabase.from(table).delete().eq('id', id).eq('author_id', userId).select('id').single();
      if (error || !data) throw error || new Error('Nothing deleted');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); qc.invalidateQueries({ queryKey: ['post'] }); qc.invalidateQueries({ queryKey: ['comments'] }); },
  });
}

export type AdminAnalytics = {
  generated_at: string; log_since: string | null; screen_tracking_since: string | null;
  totals: Record<string, number>;
  active_members: { signin_7d: number; signin_30d: number };
  funnel: Record<string, number>;
  by_day: { day: string; signins: number; new_members: number }[];
  screens: { screen: string; views: number; members: number }[];
  per_job: { id: string; role: string; firm: string; status: string; applications: number; shortlisted: number; declined: number; reviewed: number }[];
  top_posts: { id: string; excerpt: string; author_name: string; like_count: number; comment_count: number }[];
  groups_by_size: { id: string; name: string; member_count: number; threads: number; messages: number }[];
  most_active: { actor_id: string; name: string; events: number; last_active: string }[];
};

export function useAdminAnalytics(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['admin-analytics'],
    queryFn: async (): Promise<AdminAnalytics> => {
      const { data, error } = await supabase.rpc('admin_analytics');
      if (error) throw error;
      return data as AdminAnalytics;
    },
  });
}
