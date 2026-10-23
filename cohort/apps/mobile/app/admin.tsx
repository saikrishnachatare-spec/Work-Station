/**
 * Cohort admin panel (web route: /admin).
 * Access is grant-only: the signed-in user's profile must carry role = 'admin',
 * enforced by Supabase RLS (is_admin()) on every mutation - the panel only
 * surfaces what the database already permits. Public signup always creates a
 * normal user; admins are made here, one admin to another.
 */
import { SeoHead } from '@/components/SeoHead';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import {
  timeAgo, useGroups, useJobs, useMyProfile, usePosts, useProfiles, useResources,
} from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const SECTIONS = ['Overview', 'Users', 'Posts', 'Announcements', 'Resources', 'Groups', 'Jobs'] as const;

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
  const qc = useQueryClient();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Overview');

  const profiles = useProfiles();
  const posts = usePosts();
  const groups = useGroups();
  const jobs = useJobs();
  const resources = useResources();

  const refresh = () => {
    for (const key of ['profiles', 'posts', 'groups', 'jobs', 'resources']) {
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
  const remove = async (table: 'posts' | 'groups' | 'jobs' | 'resources', id: string) => {
    await supabase.from(table).delete().eq('id', id);
    refresh();
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
            ].map(([label, n]) => (
              <Card key={label as string} style={styles.stat}>
                <Text style={styles.statNum}>{n}</Text>
                <Text style={styles.meta}>{label}</Text>
              </Card>
            ))}
          </View>
          <SectionTitle first title="Admins" />
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

      {section === 'Users' && (
        <View style={{ gap: spacing.sm }}>
          {(profiles.data ?? []).map((u) => (
            <Card key={u.id} style={styles.row}>
              <Avatar name={u.full_name || '?'} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{u.full_name || 'Unnamed'}</Text>
                <Text style={styles.meta}>
                  {u.role}{u.status === 'suspended' ? ' · suspended' : ''} · joined {timeAgo(u.created_at)}
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
  gate: { alignItems: 'center', backgroundColor: colors.cream, flex: 1, justifyContent: 'center', padding: spacing.lg },
  gateIcon: {
    alignItems: 'center', alignSelf: 'center', backgroundColor: colors.brand,
    borderRadius: 22, height: 44, justifyContent: 'center', width: 44,
  },
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  title: { ...typeScale.screenTitle, color: colors.ink, textAlign: 'left' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  cta: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  ctaLink: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  ctaText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
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
});
