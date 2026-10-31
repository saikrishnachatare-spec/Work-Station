/**
 * Cohort admin panel (web route: /admin).
 * Access is grant-only: the signed-in user's profile must carry role = 'admin',
 * enforced by Supabase RLS (is_admin()) on every mutation - the panel only
 * surfaces what the database already permits. Public signup always creates a
 * normal user; admins are made here, one admin to another.
 */
import { SeoHead } from '@/components/SeoHead';
import { useToast } from '@/components/Toast';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { createElement, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import {
  useAdminAnalytics,
  timeAgo, useActivityLog, useLiveAdminFeed, useGroups, useJobs, useMyProfile, usePosts, useProfiles, useResources, useTrash,
  type ActivityRow, type TrashRow, useCreateResource,
  usePendingVerificationRequests, useReviewVerificationRequest,
} from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

type ErrorLog = {
  id: string;
  created_at: string;
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
};

function useErrorLogs(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: async (): Promise<ErrorLog[]> => {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ErrorLog[];
    },
    queryKey: ['error_logs'],
  });
}

const SECTIONS = ['Overview', 'Live', 'Analytics', 'Users', 'Posts', 'Announcements', 'Resources', 'Groups', 'Jobs', 'Reports', 'Errors', 'Activity', 'Trash'] as const;

function ActionBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.removeBtn}>
      <Text style={styles.removeText}>{label}</Text>
    </Pressable>
  );
}

function AddBar({ ph1, ph2, cta, onAdd }: { ph1: string; ph2?: string; cta: string; onAdd: (a: string, b: string) => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const submit = () => {
    if (!a.trim()) return;
    onAdd(a.trim(), b.trim());
    setA(''); setB('');
  };
  return (
    <Card style={{ gap: spacing.sm }}>
      <TextInput onChangeText={setA} onSubmitEditing={submit} placeholder={ph1} placeholderTextColor={colors.ink3} style={styles.input} value={a} />
      {ph2 ? <TextInput onChangeText={setB} onSubmitEditing={submit} placeholder={ph2} placeholderTextColor={colors.ink3} style={styles.input} value={b} /> : null}
      <Pressable onPress={submit} style={styles.cta}><Text style={styles.ctaText}>{cta}</Text></Pressable>
    </Card>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.gate}>
      <SeoHead noindex description="Cohort admin panel." path="/admin" title="Admin" />
      <Card style={{ alignItems: 'center', gap: spacing.md, maxWidth: 420, width: '100%' }}>
        {children}
      </Card>
    </View>
  );
}

export default function AdminScreen() {
  const { loading, session } = useAuth();
  const userId = session?.user.id;
  const profile = useMyProfile(userId);
  const verificationRequests = usePendingVerificationRequests(profile.data?.role === 'admin');
  const reviewVerification = useReviewVerificationRequest();
  const qc = useQueryClient();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Overview');
  const toast = useToast();
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('All');
  const [activityWindow, setActivityWindow] = useState<'24h' | '7d' | 'All'>('7d');

  const profiles = useProfiles();
  const posts = usePosts();
  const groups = useGroups();
  const jobs = useJobs();
  const resources = useResources();
  const createResource = useCreateResource();
  const [newResTitle, setNewResTitle] = useState('');
  const [newResSubject, setNewResSubject] = useState('');
  const [newResCourse, setNewResCourse] = useState('CA');
  const [newResFile, setNewResFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const isAdmin = profile.data?.role === 'admin' && profile.data?.status !== 'suspended';
  const errorLogs = useErrorLogs(!!isAdmin);
  const [activityLimit, setActivityLimit] = useState(200);
  const activity = useActivityLog(!!isAdmin, activityLimit);
  const trash = useTrash(!!isAdmin);
  const liveConnected = useLiveAdminFeed(!!isAdmin);
  const [nowMs, setNowMs] = useState(() => new Date().getTime());
  useEffect(() => {
    const id = setInterval(() => setNowMs(new Date().getTime()), 15000);
    return () => clearInterval(id);
  }, []);
  const analytics = useAdminAnalytics(!!isAdmin);
  const reports = useQuery({queryKey:['reports'],enabled:!!isAdmin,queryFn:async()=>{const{data,error}=await supabase.from('content_reports').select('*').order('created_at',{ascending:false});if(error)throw error;return data||[];}});

  const refresh = () => {
    for (const key of ['profiles', 'posts', 'groups', 'jobs', 'resources', 'error_logs', 'activity-log', 'trash', 'admin-analytics']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  if (loading || (userId && profile.isLoading)) {
    return (
      <Centered>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.meta}>Checking admin access…</Text>
      </Centered>
    );
  }

  if (!userId) {
    return (
      <Centered>
        <View style={styles.gateIcon}><Ionicons color="#fff" name="lock-closed-outline" size={20} /></View>
        <Text style={styles.title}>Cohort admin</Text>
        <Text style={styles.meta}>
          This panel is for granted admins only. Sign in with an admin account to continue -
          there is no public admin signup.
        </Text>
        <Link href="/login" style={styles.ctaLink}><Text style={styles.ctaText}>Sign in</Text></Link>
      </Centered>
    );
  }

  if (profile.data?.role !== 'admin') {
    return (
      <Centered>
        <View style={styles.gateIcon}><Ionicons color="#fff" name="shield-outline" size={20} /></View>
        <Text style={styles.title}>Admins only</Text>
        <Text style={styles.meta}>
          {profile.data?.full_name ? `${profile.data.full_name}, your` : 'Your'} account is a normal member
          account. Admin access is granted by an existing admin from inside this panel.
        </Text>
      </Centered>
    );
  }

  if (profile.data?.role === 'admin' && profile.data?.status === 'suspended') {
    return (
      <Centered>
        <View style={styles.gateIcon}><Ionicons color="#fff" name="shield-outline" size={20} /></View>
        <Text style={styles.title}>Admin access inactive</Text>
        <Text style={styles.meta}>
          This account has the admin role but is currently suspended, so admin data is withheld
          by the backend. An active admin can reinstate the account from the Users section.
        </Text>
      </Centered>
    );
  }

  const me = profile.data;
  const admins = (profiles.data ?? []).filter((p) => p.role === 'admin');
  const announcements = (posts.data ?? []).filter((p) => p.kind === 'announcement');
  const regularPosts = (posts.data ?? []).filter((p) => p.kind !== 'announcement');

  const setRole = async (id: string, role: 'user' | 'admin') => {
    await supabase.from('profiles').update({ role }).eq('id', id);
    refresh();
  };
  const setStatus = async (id: string, status: 'active' | 'suspended') => {
    await supabase.from('profiles').update({ status }).eq('id', id);
    refresh();
  };
  const setVerified = async (id: string, verified: boolean) => {
    await supabase.from('profiles').update({ verified_at: verified ? new Date().toISOString() : null }).eq('id', id);
    refresh();
  };
  const remove = async (table: 'posts' | 'groups' | 'jobs' | 'resources', id: string) => {
    if (table === 'groups') {
      await supabase.from('groups').delete().eq('id', id);
    } else {
      const { error } = await supabase.rpc('admin_trash', { p_table: table, p_id: id });
      if (error) {
        toast.show(error.message === 'admin_only' ? 'Admin access required.' : 'Could not move to trash. Try again.', 'error');
        return;
      }
    }
    refresh();
  };
  const restoreItem = async (trashId: string) => {
    const { error } = await supabase.rpc('admin_restore', { p_trash_id: trashId });
    if (error) { toast.show('Could not restore. Try again.', 'error'); return; }
    toast.show('Restored.', 'success');
    refresh();
  };
  const purgeItem = async (t: TrashRow) => {
    if (t.entity_table === 'resources' && t.payload?.file_path) {
      await supabase.storage.from('resources').remove([t.payload.file_path]);
    }
    const { error } = await supabase.rpc('admin_purge', { p_trash_id: t.id });
    if (error) {
      toast.show(error.message === 'storage_cleanup_required' ? 'Remove the stored file first, then purge.' : 'Could not delete permanently. Try again.', 'error');
      return;
    }
    toast.show('Deleted permanently.', 'success');
    refresh();
  };
  const ACTION_LABELS: Record<string, string> = {
    signup: 'signed up', sign_in: 'signed in', post_created: 'created a post', opening_posted: 'posted an opening',
    resource_shared: 'shared a resource', group_created: 'created a group', group_removed: 'removed a group',
    application_sent: 'applied to an opening', application_reviewed: 'marked an applicant reviewed',
    application_shortlisted: 'shortlisted an applicant', application_rejected: 'declined an applicant',
    member_added: 'was added to a group', member_left: 'left a group', member_removed: 'was removed from a group',
    account_deleted: 'deleted an account', account_suspended: 'suspended an account', account_active: 'reinstated an account',
    verified: 'verified a member', unverified: 'removed verification', admin_role_admin: 'granted admin', admin_role_user: 'revoked admin',
    posts_trashed: 'trashed a post', jobs_trashed: 'trashed an opening', resources_trashed: 'trashed a resource',
    posts_restored: 'restored a post', jobs_restored: 'restored an opening', resources_restored: 'restored a resource',
    screen_view: 'opened a screen',
    posts_purged: 'permanently deleted a post', jobs_purged: 'permanently deleted an opening', resources_purged: 'permanently deleted a resource',
  };
  const publishAnnouncement = async (text: string) => {
    await supabase.from('posts').insert({
      author_id: userId,
      author_name: me?.full_name || 'Cohort team',
      author_role: 'Official',
      body: text,
      kind: 'announcement',
      pinned: true,
    });
    refresh();
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SeoHead noindex description="Cohort admin panel." path="/admin" title="Admin" />
      <Text style={styles.title}>Cohort admin</Text>
      <Text style={styles.meta}>
        Signed in as {me?.full_name || 'admin'} (admin). Every change writes straight to the live database.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {SECTIONS.map((s) => (
          <Pressable key={s} onPress={() => setSection(s)} style={[styles.segBtn, s === section && styles.segOn]}>
            <Text style={[styles.segText, s === section && styles.segTextOn]}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {section === 'Overview' && (
        <View style={{ gap: spacing.md }}>
          <View style={styles.statGrid}>
            {[
              ['Members', profiles.data?.length ?? 0], ['Admins', admins.length],
              ['Feed posts', regularPosts.length], ['Announcements', announcements.length],
              ['Resources', resources.data?.length ?? 0], ['Groups', groups.data?.length ?? 0],
              ['Job listings', jobs.data?.length ?? 0],
              // eslint-disable-next-line react-hooks/purity -- display-only recency cutoff; recomputing per render keeps the 7d window current
              ['Sign-ins (7d)', (activity.data ?? []).filter((a: ActivityRow) => a.action === 'sign_in' && Date.now() - new Date(a.created_at).getTime() < 7 * 864e5).length],
              // eslint-disable-next-line react-hooks/purity -- display-only recency cutoff, same as above
              ['New members (7d)', (activity.data ?? []).filter((a: ActivityRow) => a.action === 'signup' && Date.now() - new Date(a.created_at).getTime() < 7 * 864e5).length],
            ].map(([label, n]) => (
              <Card key={label as string} style={styles.stat}>
                <Text style={styles.statNum}>{n}</Text>
                <Text style={styles.meta}>{label}</Text>
              </Card>
            ))}
          </View>
          <SectionTitle first title="Verification requests" />
          {(verificationRequests.data ?? []).length === 0 ? (
            <Text style={styles.meta}>No pending verification requests.</Text>
          ) : null}
          {(verificationRequests.data ?? []).map((r) => {
            const member = (profiles.data ?? []).find((u) => u.id === r.user_id);
            return (
              <Card key={r.id} style={styles.row}>
                <Avatar name={member?.full_name || '?'} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{member?.full_name || 'Unnamed'}</Text>
                  <Text style={styles.meta}>
                    {[member?.headline, member?.course, member?.city].filter(Boolean).join(' · ') || 'No profile details'} · asked {timeAgo(r.created_at)}
                  </Text>
                </View>
                <Pressable
                  disabled={reviewVerification.isPending}
                  onPress={() =>
                    reviewVerification.mutate(
                      { approve: true, requestId: r.id },
                      { onError: () => toast.show('Could not verify. Try again.', 'error'), onSuccess: () => { toast.show('Verified.', 'success'); refresh(); } },
                    )
                  }
                  style={styles.smallBtn}
                >
                  <Text style={styles.smallBtnText}>Verify</Text>
                </Pressable>
                <Pressable
                  disabled={reviewVerification.isPending}
                  onPress={() =>
                    reviewVerification.mutate(
                      { approve: false, requestId: r.id },
                      { onError: () => toast.show('Could not decline. Try again.', 'error'), onSuccess: () => refresh() },
                    )
                  }
                  style={styles.smallBtn}
                >
                  <Text style={styles.smallBtnText}>Decline</Text>
                </Pressable>
              </Card>
            );
          })}
          <SectionTitle title="Admins" />
          {admins.map((u) => (
            <Card key={u.id} style={styles.row}>
              <Avatar name={u.full_name || '?'} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{u.full_name || 'Unnamed'}</Text>
                <Text style={styles.meta}>Joined {timeAgo(u.created_at)} · {u.status}</Text>
              </View>
              <Pill label={u.id === userId ? 'You' : 'Admin'} />
            </Card>
          ))}
          <Text style={styles.meta}>
            Role model: public signup only ever creates a normal member account. Admin rights are granted and
            revoked here, one admin to another, and enforced by row-level security on every table.
          </Text>
        </View>
      )}

      {section === 'Analytics' && (() => {
        const a = analytics.data;
        if (analytics.isLoading) return <ActivityIndicator color={colors.brand} />;
        if (analytics.isError || !a) return <Text style={styles.meta}>Could not load analytics.</Text>;
        const maxDay = Math.max(1, ...a.by_day.map((d) => Math.max(d.signins, d.new_members)));
        return (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.meta}>
              Real recorded activity only - nothing estimated or backfilled. Sign-ins and content counts come from the
              activity log (recording since {a.log_since ? new Date(a.log_since).toLocaleDateString() : 'no events yet'}).
              Screen views are counted only since {a.screen_tracking_since ? new Date(a.screen_tracking_since).toLocaleString() : 'not yet recorded'},
              only for signed-in members who accepted analytics in the consent note, screen names only. Message contents are never tracked.
            </Text>
            <View style={styles.statGrid}>
              {[
                ['Active members (7d)', a.active_members.signin_7d], ['Active members (30d)', a.active_members.signin_30d],
                ['Members', a.totals.members], ['Verified', a.totals.verified], ['Suspended', a.totals.suspended],
                ['Posts', a.totals.posts], ['Openings (open)', a.totals.jobs_open], ['Openings (closed)', a.totals.jobs_closed],
                ['Applications', a.totals.applications], ['Resources', a.totals.resources], ['Groups', a.totals.groups],
                ['Messages sent', a.totals.messages],
              ].map(([label, n]) => (
                <Card key={label as string} style={styles.stat}>
                  <Text style={styles.statNum}>{n}</Text>
                  <Text style={styles.meta}>{label}</Text>
                </Card>
              ))}
            </View>
            <Text style={styles.meta}>{a.basis}</Text>

            <SectionTitle first title="Last 14 days" />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand }} /><Text style={styles.meta}>Sign-ins</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandDeep }} /><Text style={styles.meta}>New members</Text></View>
            </View>
            {a.by_day.map((d) => (
              <View key={d.day} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={[styles.meta, { width: 44 }]}>{d.day.slice(5)}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.brand, width: d.signins ? `${Math.max(3, (d.signins / maxDay) * 100)}%` : 3, opacity: d.signins ? 1 : 0.15 }} />
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.brandDeep, width: d.new_members ? `${Math.max(3, (d.new_members / maxDay) * 100)}%` : 3, opacity: d.new_members ? 1 : 0.15 }} />
                </View>
                <Text style={styles.meta}>{d.signins} / {d.new_members}</Text>
              </View>
            ))}

            <SectionTitle title="Applications right now" />
            <Text style={styles.meta}>{a.funnel.scope}</Text>
            <View style={styles.statGrid}>
              {[
                ['Total', a.funnel.total], ['Waiting', a.funnel.pending], ['Reviewed', a.funnel.reviewed],
                ['Shortlisted', a.funnel.shortlisted], ['Declined', a.funnel.declined],
              ].map(([label, n]) => (
                <Card key={label as string} style={styles.stat}>
                  <Text style={styles.statNum}>{n}</Text>
                  <Text style={styles.meta}>{label}</Text>
                </Card>
              ))}
            </View>

            <SectionTitle title="Most used screens" />
            {a.screens.length === 0 ? (
              <Text style={styles.meta}>No screen views recorded yet. Counting started when this update went live.</Text>
            ) : a.screens.map((sc) => (
              <Card key={sc.screen} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>/{sc.screen}</Text>
                  <Text style={styles.meta}>{sc.members} member{sc.members === 1 ? '' : 's'}</Text>
                </View>
                <Pill label={`${sc.views} views`} />
              </Card>
            ))}

            <SectionTitle title="Openings by applications" />
            {a.per_job.length === 0 ? <Text style={styles.meta}>No openings yet.</Text> : a.per_job.map((j) => (
              <Card key={j.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{j.role} · {j.firm}</Text>
                  <Text style={styles.meta}>
                    {j.status} · {j.applications} application{j.applications === 1 ? '' : 's'}
                    {j.shortlisted ? ` · ${j.shortlisted} shortlisted` : ''}{j.declined ? ` · ${j.declined} declined` : ''}
                  </Text>
                </View>
              </Card>
            ))}

            <SectionTitle title="Most engaged posts" />
            {a.top_posts.length === 0 ? <Text style={styles.meta}>No posts yet.</Text> : a.top_posts.map((p) => (
              <Card key={p.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{p.excerpt || '(no text)'}</Text>
                  <Text style={styles.meta}>{p.author_name} · {p.like_count} likes · {p.comment_count} comments</Text>
                </View>
              </Card>
            ))}

            <SectionTitle title="Groups by size" />
            {a.groups_by_size.length === 0 ? <Text style={styles.meta}>No groups yet.</Text> : a.groups_by_size.map((g) => (
              <Card key={g.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{g.name}</Text>
                  <Text style={styles.meta}>{g.member_count} members · {g.threads} threads · {g.messages} messages</Text>
                </View>
              </Card>
            ))}

            <SectionTitle title="Most active members (30d)" />
            {a.most_active.length === 0 ? <Text style={styles.meta}>No recorded activity yet.</Text> : a.most_active.map((m) => (
              <Card key={m.actor_id} style={styles.row}>
                <Avatar name={m.name || '?'} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{m.name}</Text>
                  <Text style={styles.meta}>{m.events} recorded events · last active {timeAgo(m.last_active)}</Text>
                </View>
                <ActionBtn
                  label="Activity"
                  onPress={() => { setActorFilter(m.name || ''); setActionFilter('All'); setActivityWindow('All'); setSection('Activity'); }}
                />
              </Card>
            ))}
          </View>
        );
      })()}

      {section === 'Users' && (
        <View style={{ gap: spacing.sm }}>
          {(profiles.data ?? []).map((u) => (
            <Card key={u.id} style={styles.row}>
              <Avatar name={u.full_name || '?'} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{u.full_name || 'Unnamed'}</Text>
                <Text style={styles.meta}>
                  {u.role}{u.status === 'suspended' ? ' · suspended' : ''}{u.verified_at ? ' · verified professional' : ''} · joined {timeAgo(u.created_at)}
                </Text>
              </View>
              {u.role === 'admin' ? (
                u.id === userId ? <Pill label="You" /> : (
                  <ActionBtn label="Revoke admin" onPress={() => setRole(u.id, 'user')} />
                )
              ) : (
                <>
                  <ActionBtn label="Make admin" onPress={() => setRole(u.id, 'admin')} />
                  <ActionBtn
                    label="Activity"
                    onPress={() => { setActorFilter(u.full_name || ''); setActionFilter('All'); setActivityWindow('All'); setSection('Activity'); }}
                  />
                  <ActionBtn
                    label={u.verified_at ? 'Unverify' : 'Verify'}
                    onPress={() => setVerified(u.id, !u.verified_at)}
                  />
                  <ActionBtn
                    label={u.status === 'active' ? 'Suspend' : 'Reinstate'}
                    onPress={() => setStatus(u.id, u.status === 'active' ? 'suspended' : 'active')}
                  />
                </>
              )}
            </Card>
          ))}
        </View>
      )}

      {section === 'Posts' && (
        <View style={{ gap: spacing.sm }}>
          {regularPosts.map((p) => (
            <Card key={p.id} style={styles.row}>
              <Avatar name={p.author_name} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{p.author_name} · {p.author_role}</Text>
                <Text numberOfLines={2} style={styles.meta}>{p.body}</Text>
              </View>
              <ActionBtn label="Remove" onPress={() => remove('posts', p.id)} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Announcements' && (
        <View style={{ gap: spacing.sm }}>
          <AddBar cta="Publish announcement" onAdd={publishAnnouncement} ph1="Announcement text" />
          {announcements.map((p) => (
            <Card key={p.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{p.author_name}{p.pinned ? ' · pinned' : ''}</Text>
                <Text numberOfLines={2} style={styles.meta}>{p.body}</Text>
              </View>
              <ActionBtn label="Remove" onPress={() => remove('posts', p.id)} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Resources' && (
        <View style={{ gap: spacing.sm }}>
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.strong}>Add a resource</Text>
            <Text style={styles.meta}>Only admins can add main resources. Members share their own files under Student notes in the Resources tab.</Text>
            <TextInput
              onChangeText={setNewResTitle}
              placeholder="Title, e.g. FR revision notes"
              placeholderTextColor={colors.ink3}
              style={styles.input}
              value={newResTitle}
            />
            <TextInput
              onChangeText={setNewResSubject}
              placeholder="Subject, e.g. Financial Reporting"
              placeholderTextColor={colors.ink3}
              style={styles.input}
              value={newResSubject}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['CA', 'CMA', 'CS'].map((c) => (
                <Pressable accessibilityRole="button" key={c} onPress={() => setNewResCourse(c)} style={[styles.chip, c === newResCourse && styles.chipOn]}>
                  <Text style={[styles.chipText, c === newResCourse && styles.chipTextOn]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.meta}>PDF, PNG, JPEG or WebP, up to 10 MB.</Text>
            {Platform.OS === 'web' ? createElement('input', {
              type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp',
              'aria-label': 'Choose PDF or image',
              onChange: (event: { target: { files: FileList | null } }) => {
                const file = event.target.files?.[0];
                if (file) setNewResFile({ uri: URL.createObjectURL(file), name: file.name, lastModified: file.lastModified, size: file.size, mimeType: file.type } as DocumentPicker.DocumentPickerAsset);
              }, style: { padding: 12, backgroundColor: '#fff', borderRadius: 12 },
            }) : (
              <Pressable accessibilityRole="button" onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
                if (!result.canceled) setNewResFile(result.assets[0]);
              }} style={styles.chip}><Text style={styles.chipText}>{newResFile ? newResFile.name : 'Choose PDF or image'}</Text></Pressable>
            )}
            <View>
              <ActionBtn
                label={createResource.isPending ? 'Adding…' : 'Add resource'}
                onPress={() => {
                  const title = newResTitle.trim();
                  if (!title || !userId) { toast.show('Name the resource first', 'info'); return; }
                  createResource.mutate(
                    { course: newResCourse, file: newResFile, subject: newResSubject.trim(), title, uploadedBy: profile.data?.full_name || 'Admin', userId },
                    {
                      onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not add the resource. Try again.', 'error'),
                      onSuccess: () => { toast.show('Resource added', 'success'); setNewResTitle(''); setNewResSubject(''); setNewResFile(null); },
                    },
                  );
                }}
              />
            </View>
          </Card>
          {(resources.data ?? []).map((r) => (
            <Card key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{r.title}</Text>
                <Text style={styles.meta}>{r.meta} · by {r.uploaded_by} · {r.course}</Text>
              </View>
              <ActionBtn label="Remove" onPress={() => remove('resources', r.id)} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Groups' && (
        <View style={{ gap: spacing.sm }}>
          {(groups.data ?? []).map((g) => (
            <Card key={g.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{g.name}</Text>
                <Text style={styles.meta}>{g.purpose} · {g.member_count.toLocaleString('en-IN')} members</Text>
              </View>
              <ActionBtn label="Remove" onPress={() => remove('groups', g.id)} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Reports' && <View style={{gap:12}}>{reports.isError?<Text>Could not load reports.</Text>:reports.data?.length===0?<Text>No reports.</Text>:reports.data?.map(r=><Card key={r.id}><Text>{r.target_type}: {r.target_id}</Text><Text>{r.reason}</Text><Text>{r.status}</Text>{r.status==='open'&&<ActionBtn label="Mark reviewed" onPress={async()=>{const{error}=await supabase.from('content_reports').update({status:'reviewed'}).eq('id',r.id);if(!error)qc.invalidateQueries({queryKey:['reports']});}}/>}</Card>)}</View>}
      {section === 'Errors' && (() => {
        const rows = errorLogs.data ?? [];
        const groups = new Map<string, { key: string; message: string; url: string; count: number; first: string; last: string; stack: string | null; agents: Set<string>; ids: string[] }>();
        for (const e of rows) {
          const key = `${e.message.slice(0, 120)}|${e.url ?? 'app'}`;
          const g = groups.get(key) ?? { key, message: e.message, url: e.url ?? 'app', count: 0, first: e.created_at, last: e.created_at, stack: e.stack, agents: new Set<string>(), ids: [] as string[] };
          g.count += 1;
          if (e.created_at < g.first) g.first = e.created_at;
          if (e.created_at > g.last) { g.last = e.created_at; g.stack = e.stack; }
          if (e.user_agent) g.agents.add(e.user_agent.includes('HeadlessChrome') ? 'headless browser' : e.user_agent.slice(0, 40));
          g.ids.push(e.id);
          groups.set(key, g);
        }
        const sorted = [...groups.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
        return (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.meta}>
              Uncaught errors and failed promises from the app land here automatically. Identical errors are grouped -
              the count is how many times each happened and which browsers reported them. Headless browsers are
              often our verification runs, but the reporting browser alone never proves an entry&apos;s origin.
            </Text>
            {rows.length === 0 && (
              <Card><Text style={styles.meta}>No errors logged. That is the goal.</Text></Card>
            )}
            {sorted.map((g) => (
              <Card key={g.key} style={{ gap: 4 }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong} numberOfLines={2}>{g.message}</Text>
                    <Text style={styles.meta}>
                      {g.url} · {g.count} time{g.count === 1 ? '' : 's'} · first {timeAgo(g.first)} · latest {timeAgo(g.last)}
                    </Text>
                    <Text style={styles.meta}>{[...g.agents].join(', ')}</Text>
                  </View>
                  <ActionBtn label={g.count > 1 ? `Clear ${g.count}` : 'Clear'} onPress={async () => {
                    await supabase.from('error_logs').delete().in('id', g.ids);
                    refresh();
                  }} />
                </View>
                {g.stack ? <Text numberOfLines={3} style={styles.stack}>{g.stack}</Text> : null}
              </Card>
            ))}
          </View>
        );
      })()}

      {section === 'Live' && (() => {
        const now = nowMs;
        const all = (activity.data ?? []) as ActivityRow[];
        const recent = all.filter((a) => now - new Date(a.created_at).getTime() < 5 * 60000 && a.actor_name);
        const activeNames = Array.from(new Set(recent.map((a) => a.actor_name)));
        const lastHour = all.filter((a) => now - new Date(a.created_at).getTime() < 3600000);
        const errs = (errorLogs.data ?? []).filter((e: { created_at: string }) => now - new Date(e.created_at).getTime() < 3600000).length;
        return (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.strong}>{liveConnected ? '● Live' : '○ Reconnecting (refreshing every 30s)'}</Text>
            <Text style={styles.meta}>
              New events appear here as they are recorded: signups, sign-ins, content, hiring, group and moderation actions, and
              errors. Screen names appear only for members who accepted analytics. Message contents, passwords and typed input
              are never recorded. Members are counted as recently active from these events only, so someone idle on one screen may not show.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
              {([['Active in last 5 min', activeNames.length], ['Events in last hour', lastHour.length], ['Errors in last hour', errs]] as const).map(([k, v]) => (
                <Card key={k} style={{ padding: spacing.sm }}>
                  <Text style={styles.strong}>{v}</Text>
                  <Text style={styles.meta}>{k}</Text>
                </Card>
              ))}
            </View>
            {activeNames.length > 0 && <Text style={styles.meta}>Recently active: {activeNames.slice(0, 10).join(', ')}</Text>}
            {all.slice(0, 60).map((a) => (
              <Card key={a.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{a.actor_name || (a.action === 'account_deleted' ? 'A member' : 'Someone')} {ACTION_LABELS[a.action] ?? a.action}</Text>
                  <Text style={styles.meta}>
                    {a.action === 'screen_view' ? `/${a.entity_id} · ` : ''}
                    {typeof a.detail?.title === 'string' && a.detail.title ? `${a.detail.title} · ` : ''}
                    {typeof a.detail?.name === 'string' && a.detail.name ? `${a.detail.name} · ` : ''}
                    {timeAgo(a.created_at)}
                  </Text>
                </View>
              </Card>
            ))}
            {!activity.isLoading && all.length === 0 && <Text style={styles.meta}>No events yet.</Text>}
          </View>
        );
      })()}

      {section === 'Activity' && (() => {
        const CATEGORIES: Record<string, string[]> = {
          All: [],
          'Sign-ins': ['sign_in', 'signup'],
          Content: ['post_created', 'opening_posted', 'resource_shared', 'group_created', 'group_removed'],
          Hiring: ['application_sent', 'application_reviewed', 'application_shortlisted', 'application_rejected'],
          Screens: ['screen_view'],
          Membership: ['member_added', 'member_left', 'member_removed', 'group_admin_granted', 'group_admin_revoked'],
          Moderation: ['verified', 'unverified', 'admin_role_admin', 'admin_role_user', 'account_suspended', 'account_active',
            'posts_trashed', 'jobs_trashed', 'resources_trashed', 'posts_restored', 'jobs_restored', 'resources_restored',
            'posts_purged', 'jobs_purged', 'resources_purged', 'account_deleted'],
        };
        const windowMs = activityWindow === '24h' ? 864e5 : activityWindow === '7d' ? 7 * 864e5 : 0;
        const rows = (activity.data ?? []).filter((a: ActivityRow) => {
          if (a.action === 'screen_view' && !actorFilter.trim() && actionFilter !== 'Screens') return false;
          if (actorFilter.trim() && !(a.actor_name || '').toLowerCase().includes(actorFilter.trim().toLowerCase())) return false;
          if (actionFilter !== 'All' && !(CATEGORIES[actionFilter] ?? []).includes(a.action)) return false;
          if (windowMs && Date.now() - new Date(a.created_at).getTime() > windowMs) return false;
          return true;
        });
        return (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.meta}>
              Real events only: signups, sign-ins (from auth timestamps, at most one per member per 15 min), content created,
              moderation and hiring actions. Message contents are never logged. Screen views appear in a member&apos;s timeline and under the Screens filter.
            </Text>
            <TextInput
              placeholder="Filter by member name"
              placeholderTextColor={colors.ink3}
              style={styles.input}
              value={actorFilter}
              onChangeText={setActorFilter}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {Object.keys(CATEGORIES).map((c) => (
                <Pressable key={c} onPress={() => setActionFilter(c)} style={[styles.segBtn, c === actionFilter && styles.segOn]}>
                  <Text style={[styles.segText, c === actionFilter && styles.segTextOn]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {(['24h', '7d', 'All'] as const).map((w) => (
                <Pressable key={w} onPress={() => setActivityWindow(w)} style={[styles.segBtn, w === activityWindow && styles.segOn]}>
                  <Text style={[styles.segText, w === activityWindow && styles.segTextOn]}>{w === 'All' ? 'All time' : `Last ${w}`}</Text>
                </Pressable>
              ))}
            </View>
            {activity.isLoading && <Text style={styles.meta}>Loading…</Text>}
            {activity.isError && <Text style={styles.meta}>Could not load the activity log.</Text>}
            {rows.map((a: ActivityRow) => (
              <Card key={a.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{a.actor_name || (a.action === 'account_deleted' ? 'A member' : 'Someone')} {ACTION_LABELS[a.action] ?? a.action}</Text>
                  <Text style={styles.meta}>
                    {typeof a.detail?.title === 'string' && a.detail.title ? `${a.detail.title} · ` : ''}
                    {typeof a.detail?.role === 'string' && a.detail.role ? `${a.detail.role} · ` : ''}
                    {typeof a.detail?.name === 'string' && a.detail.name ? `${a.detail.name} · ` : ''}
                    {typeof a.detail?.member === 'string' && a.detail.member ? `${a.detail.member} · ` : ''}
                    {typeof a.detail?.group === 'string' && a.detail.group ? `${a.detail.group} · ` : ''}
                    {a.action === 'screen_view' ? `/${a.entity_id} · ` : ''}
                    {timeAgo(a.created_at)}
                  </Text>
                </View>
              </Card>
            ))}
            {!activity.isLoading && rows.length === 0 && <Text style={styles.meta}>No matching events.</Text>}
            <Text style={styles.meta}>
              Showing the latest {activityLimit} recorded events{(activity.data ?? []).length >= activityLimit ? ' (more history exists)' : ''}. Filters above narrow this window.
            </Text>
            {(activity.data ?? []).length >= activityLimit && (
              <ActionBtn label="Load older events" onPress={() => setActivityLimit((n) => n + 200)} />
            )}
          </View>
        );
      })()}
      {section === 'Trash' && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.meta}>
            Moderated content waits here. Restore brings it back; Purge deletes it forever. Account deletion by members
            themselves is always permanent and never lands here.
          </Text>
          {trash.isLoading && <Text style={styles.meta}>Loading…</Text>}
          {trash.isError && <Text style={styles.meta}>Could not load trash.</Text>}
          {(trash.data ?? []).map((t: TrashRow) => (
            <Card key={t.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{t.payload?.title || t.payload?.role || (t.payload?.body || '').slice(0, 60) || t.entity_table}</Text>
                <Text style={styles.meta}>
                  {t.entity_table} · trashed by {t.trashed_by_name || 'admin'} · {timeAgo(t.trashed_at)}
                </Text>
              </View>
              <ActionBtn label="Restore" onPress={() => restoreItem(t.id)} />
              <ActionBtn label="Purge" onPress={() => purgeItem(t)} />
            </Card>
          ))}
          {trash.data && trash.data.length === 0 && <Text style={styles.meta}>Trash is empty.</Text>}
        </View>
      )}
      {section === 'Jobs' && (
        <View style={{ gap: spacing.sm }}>
          {(jobs.data ?? []).map((j) => (
            <Card key={j.id} style={styles.row}>
              <Avatar name={j.firm} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{j.role}</Text>
                <Text style={styles.meta}>{j.firm} · {j.loc} · {j.pay}</Text>
              </View>
              <ActionBtn label="Remove" onPress={() => remove('jobs', j.id)} />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  smallBtn: { backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtnText: { color: colors.brandDeep, fontSize: 12, fontWeight: '700' },
  gate: { alignItems: 'center', backgroundColor: colors.cream, flex: 1, justifyContent: 'center', padding: spacing.lg },
  gateIcon: {
    alignItems: 'center', alignSelf: 'center', backgroundColor: colors.brandDeep,
    borderRadius: 22, height: 44, justifyContent: 'center', width: 44,
  },
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  title: { ...typeScale.screenTitle, color: colors.ink, textAlign: 'left' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  chip: {
    backgroundColor: colors.card, borderColor: colors.lineWarm, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
  chipTextOn: { color: colors.brand },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  cta: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  ctaLink: {
    backgroundColor: colors.brandSoft, borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  ctaText: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600' },
  segBtn: {
    backgroundColor: colors.card, borderColor: '#e7d9cf', borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8,
  },
  segOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  segText: { ...typeScale.caption, color: colors.ink2, fontWeight: '500' },
  segTextOn: { color: colors.brandDeep, fontWeight: '600' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { alignItems: 'center', minWidth: 100, paddingVertical: 16 },
  statNum: { ...typeScale.screenTitle, color: colors.brand },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  removeBtn: {
    borderColor: colors.brand, borderRadius: radius.pill, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  removeText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  stack: { ...typeScale.caption, color: colors.ink3, fontFamily: 'Courier' },
});
