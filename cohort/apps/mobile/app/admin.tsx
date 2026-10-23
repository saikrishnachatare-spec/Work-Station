/**
 * Cohort admin panel (web route: /admin).
 * Access is grant-only: admins are made from inside the panel by an existing
 * admin, starting with the founder account. There is no public admin signup;
 * public registration always creates a normal user account.
 * The passcode gate below is a Phase-1 demo placeholder - Phase 2 replaces it
 * with Supabase auth plus an admins table and row-level security.
 */
import { SeoHead } from '@/components/SeoHead';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import { nextId, updateDemo, useDemo } from '@/store/demo';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const ADMIN_PASSCODE = 'cohort-admin';
const SECTIONS = ['Overview', 'Users', 'Posts', 'Announcements', 'Resources', 'Groups', 'Jobs'] as const;

function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const tryUnlock = () => {
    if (code.trim() === ADMIN_PASSCODE) onUnlock();
    else setError(true);
  };
  return (
    <View style={styles.gate}>
      <SeoHead noindex description="Cohort admin panel." path="/admin" title="Admin" />
      <Card style={{ gap: spacing.md, maxWidth: 420, width: '100%' }}>
        <View style={styles.gateIcon}><Ionicons color="#fff" name="lock-closed-outline" size={20} /></View>
        <Text style={styles.title}>Cohort admin</Text>
        <Text style={styles.meta}>
          Invite-only. Admin access is granted by an existing admin from inside the panel -
          there is no public admin signup. Enter your admin passcode to continue.
        </Text>
        <TextInput
          autoFocus
          onChangeText={(t) => { setCode(t); setError(false); }}
          onSubmitEditing={tryUnlock}
          placeholder="Admin passcode"
          placeholderTextColor={colors.ink3}
          secureTextEntry
          style={styles.input}
          value={code}
        />
        {error && <Text style={styles.error}>Wrong passcode. If you should have access, ask an admin to grant it.</Text>}
        <Pressable onPress={tryUnlock} style={styles.cta}><Text style={styles.ctaText}>Unlock panel</Text></Pressable>
      </Card>
    </View>
  );
}

function RowActions({ onDelete, deleteLabel = 'Remove' }: { onDelete: () => void; deleteLabel?: string }) {
  return (
    <Pressable onPress={onDelete} style={styles.removeBtn}>
      <Text style={styles.removeText}>{deleteLabel}</Text>
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

export default function AdminScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Overview');
  const demo = useDemo((s) => s);

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;

  const admins = demo.users.filter((u) => u.role === 'admin');

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Cohort admin</Text>
      <Text style={styles.meta}>Signed in as Chatare Saikrishna (founder admin). Changes apply to the live demo data instantly.</Text>

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
              ['Users', demo.users.length], ['Admins', admins.length], ['Feed posts', demo.feed.length],
              ['Announcements', demo.feed.filter((f) => f.type === 'announcement').length],
              ['Resources', demo.resources.length], ['Groups', demo.groups.length], ['Job listings', demo.jobs.length],
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
              <Avatar name={u.name} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{u.name}</Text>
                <Text style={styles.meta}>{u.detail}</Text>
              </View>
              <Pill label="Admin" />
            </Card>
          ))}
          <AddBar
            cta="Grant admin"
            onAdd={(name) => {
              if (!name) return;
              const existing = demo.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
              if (existing) {
                updateDemo({ users: demo.users.map((u) => (u.id === existing.id ? { ...u, role: 'admin' as const } : u)) });
              } else {
                updateDemo({
                  users: [...demo.users, { id: nextId('u'), name, detail: 'Invited as admin', role: 'admin', status: 'active' }],
                });
              }
            }}
            ph1="Name or email of the person to make admin"
          />
          <Text style={styles.meta}>
            Role model: public signup only ever creates a normal user account. Admin rights are granted here,
            one admin to another, and can be revoked the same way. Phase 2 enforces this in Supabase (admins table + RLS).
          </Text>
        </View>
      )}

      {section === 'Users' && (
        <View style={{ gap: spacing.sm }}>
          {demo.users.map((u) => (
            <Card key={u.id} style={styles.row}>
              <Avatar name={u.name} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{u.name}</Text>
                <Text style={styles.meta}>{u.detail} · {u.status}</Text>
              </View>
              {u.role === 'admin' && u.id !== 'u1' ? (
                <RowActions deleteLabel="Revoke admin" onDelete={() =>
                  updateDemo({ users: demo.users.map((x) => (x.id === u.id ? { ...x, role: 'user' as const } : x)) })} />
              ) : u.role === 'admin' ? <Pill label="Owner" /> : (
                <RowActions deleteLabel={u.status === 'active' ? 'Suspend' : 'Reinstate'} onDelete={() =>
                  updateDemo({
                    users: demo.users.map((x) =>
                      x.id === u.id ? { ...x, status: x.status === 'active' ? 'suspended' as const : 'active' as const } : x),
                  })} />
              )}
            </Card>
          ))}
        </View>
      )}

      {section === 'Posts' && (
        <View style={{ gap: spacing.sm }}>
          {demo.feed.filter((f) => f.type !== 'announcement').map((f) => (
            <Card key={f.id} style={styles.row}>
              <Avatar name={f.author} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{f.author} · {f.role}</Text>
                <Text numberOfLines={2} style={styles.meta}>{f.text}</Text>
              </View>
              <RowActions onDelete={() => updateDemo({ feed: demo.feed.filter((x) => x.id !== f.id) })} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Announcements' && (
        <View style={{ gap: spacing.sm }}>
          <AddBar
            cta="Publish announcement"
            onAdd={(text) =>
              updateDemo({
                feed: [{
                  id: nextId('f'), type: 'announcement', author: 'Cohort team', role: 'Official',
                  time: 'just now', pinned: true, text, likes: 0, comments: 0,
                }, ...demo.feed],
              })}
            ph1="Announcement text"
          />
          {demo.feed.filter((f) => f.type === 'announcement').map((f) => (
            <Card key={f.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{f.author}</Text>
                <Text numberOfLines={2} style={styles.meta}>{f.text}</Text>
              </View>
              <RowActions onDelete={() => updateDemo({ feed: demo.feed.filter((x) => x.id !== f.id) })} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Resources' && (
        <View style={{ gap: spacing.sm }}>
          <AddBar
            cta="Add resource"
            onAdd={(title, course) =>
              updateDemo({
                resources: [{
                  id: nextId('r'), cat: 'Notes', course: course || 'CA Inter', title,
                  by: 'Cohort team', meta: 'PDF · just added',
                }, ...demo.resources],
              })}
            ph1="Resource title"
            ph2="Course, e.g. CA Final"
          />
          {demo.resources.map((r) => (
            <Card key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{r.title}</Text>
                <Text style={styles.meta}>{r.meta} · by {r.by} · {r.course}</Text>
              </View>
              <RowActions onDelete={() => updateDemo({ resources: demo.resources.filter((x) => x.id !== r.id) })} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Groups' && (
        <View style={{ gap: spacing.sm }}>
          {demo.groups.map((g) => (
            <Card key={g.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{g.name}</Text>
                <Text style={styles.meta}>{g.purpose} · {g.members.toLocaleString('en-IN')} members</Text>
              </View>
              <RowActions onDelete={() => updateDemo({ groups: demo.groups.filter((x) => x.id !== g.id) })} />
            </Card>
          ))}
        </View>
      )}

      {section === 'Jobs' && (
        <View style={{ gap: spacing.sm }}>
          <AddBar
            cta="Add listing"
            onAdd={(role, firm) =>
              updateDemo({
                jobs: [{
                  id: nextId('j'), cat: 'Jobs', firm: firm || 'New firm', role,
                  loc: 'Hyderabad', pay: 'Competitive', tags: ['New'],
                }, ...demo.jobs],
              })}
            ph1="Role"
            ph2="Firm or company"
          />
          {demo.jobs.map((j) => (
            <Card key={j.id} style={styles.row}>
              <Avatar name={j.firm} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{j.role}</Text>
                <Text style={styles.meta}>{j.firm} · {j.loc} · {j.pay}</Text>
              </View>
              <RowActions onDelete={() => updateDemo({ jobs: demo.jobs.filter((x) => x.id !== j.id) })} />
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
  ctaText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  error: { ...typeScale.caption, color: colors.brandDeep },
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
