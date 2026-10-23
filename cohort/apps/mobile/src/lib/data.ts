/**
 * Live data layer: every screen reads from and writes to Supabase.
 * Reads are public (RLS); writes need a signed-in user.
 */
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
  cat: string;
  firm: string;
  role: string;
  loc: string;
  pay: string;
  tags: string[];
};

export type Resource = {
  id: string;
  cat: string;
  course: string;
  title: string;
  uploaded_by: string;
  meta: string;
};

export type Profile = {
  id: string;
  full_name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
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
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('applications').select('job_id').eq('user_id', userId!);
      if (error) throw error;
      return new Set((data as { job_id: string }[]).map((r) => r.job_id));
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
    mutationFn: async ({ firm, role, userId }: { firm: string; role: string; userId: string }) => {
      const { error } = await supabase
        .from('jobs')
        .insert({ cat: 'Jobs', firm, loc: '', pay: '', posted_by: userId, role, tags: [] });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ course, title, uploadedBy, userId }: { course: string; title: string; uploadedBy: string; userId: string }) => {
      const { error } = await supabase
        .from('resources')
        .insert({ cat: 'Notes', course, meta: 'Just shared', owner_id: userId, title, uploaded_by: uploadedBy });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  });
}

export type ThreadSummary = {
  id: string;
  otherName: string;
  lastMessage: string;
  lastAt: string;
};

/** Threads the signed-in user participates in, with the other person's name. */
export function useThreads(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['threads', userId],
    queryFn: async (): Promise<ThreadSummary[]> => {
      const { data: mine, error: e1 } = await supabase
        .from('thread_participants')
        .select('thread_id')
        .eq('user_id', userId!);
      if (e1) throw e1;
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
        .select('thread_id, body, created_at')
        .in('thread_id', ids)
        .order('created_at', { ascending: false });
      if (e3) throw e3;
      const lastOf = new Map<string, { body: string; created_at: string }>();
      for (const m of msgs as { thread_id: string; body: string; created_at: string }[]) {
        if (!lastOf.has(m.thread_id)) lastOf.set(m.thread_id, m);
      }
      return (others as { thread_id: string; user_id: string }[]).map((o) => ({
        id: o.thread_id,
        otherName: nameOf.get(o.user_id) || 'Member',
        lastMessage: lastOf.get(o.thread_id)?.body ?? '',
        lastAt: lastOf.get(o.thread_id)?.created_at ?? '',
      }));
    },
  });
}

export function useThreadMessages(threadId: string | null) {
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
