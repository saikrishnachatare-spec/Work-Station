import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { JOB_FILTERS } from '@/lib/demo-data';
import { useJobAlertPref, useJobs, useMyApplications, useSaveJobAlert, useMyProfile } from '@/lib/data';
import { itemShareUrl, shareItemLink } from '@/lib/share';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function WorkScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  const toast = useToast();
  const { session } = useAuth();
  const profile = useMyProfile(session?.user?.id);
  const userId = session?.user?.id;
  const jobs = useJobs();
  const applications = useMyApplications(userId);
  const alertPref = useJobAlertPref(userId);
  const saveAlert = useSaveJobAlert(userId);
  const [alertText, setAlertText] = useState('');
  // Render-time derivation from the loaded preference (React-sanctioned
  // "adjust state when props change" pattern; no effect needed).
  const [loadedKeywords, setLoadedKeywords] = useState('');
  if (alertPref.data && alertPref.data.keywords !== loadedKeywords) {
    setLoadedKeywords(alertPref.data.keywords);
    if (!alertText) setAlertText(alertPref.data.keywords);
  }

  const items = (jobs.data ?? []).filter((j) => filter === 'All' || j.cat === filter);
  const total = (jobs.data ?? []).length;

  const keywords = (alertPref.data?.keywords ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  const lastSeen = alertPref.data?.last_seen_at ?? '';
  const newMatches = (jobs.data ?? []).filter((j) => {
    if (keywords.length === 0 || !lastSeen) return false;
    const hay = [j.role, j.firm, j.cat, j.description, j.loc, (j.tags ?? []).join(' ')].filter(Boolean).join(' ').toLowerCase();
    const isNew = (j as { created_at?: string }).created_at ? (j as { created_at?: string }).created_at! > lastSeen : false;
    return isNew && keywords.some((k) => hay.includes(k));
  });

  // The list never applies or withdraws inline: applying needs the cover note
  // and resume form on the job page, and withdrawing is confirmed there too.
  const openJob = (jobId: string) => {
    if (!userId) toast.show('Sign in to apply', 'info');
    router.push({ params: { id: jobId }, pathname: '/job' });
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Jobs, articleship, industrial training, stock audits and gig work." title="Work & hiring" />
      {userId && (
        <Pressable onPress={() => router.push('/hiring')}>
          <Card style={styles.banner}>
            <Ionicons color={colors.brandDeep} name="briefcase-outline" size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{profile.data?.org_name || 'Your openings'}</Text>
              <Text style={styles.meta}>Manage your openings and applicants.</Text>
            </View>
            <Ionicons color={colors.ink3} name="chevron-forward" size={15} />
          </Card>
        </Pressable>
      )}
      <Card style={styles.banner}>
        <Ionicons color={colors.brandDeep} name="notifications-outline" size={18} />
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>Vacancy scan</Text>
          <Text style={styles.meta}>{total} opening{total === 1 ? '' : 's'} listed right now.</Text>
        </View>
      </Card>
      {userId && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>Vacancy alerts</Text>
          <Text style={styles.meta}>
            Get a note here when a new opening matches your keywords. Alerts appear when you open Cohort - no emails or push yet.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              onChangeText={setAlertText}
              placeholder="Keywords, e.g. articleship, audit"
              placeholderTextColor={colors.ink3}
              style={[styles.alertInput, { flex: 1 }]}
              value={alertText}
            />
            <Pressable
              accessibilityRole="button"
              disabled={saveAlert.isPending}
              onPress={() => saveAlert.mutate(
                { keywords: alertText.trim() },
                { onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not save', 'error'),
                  onSuccess: () => toast.show('Alert saved', 'success') },
              )}
              style={styles.alertBtn}
            >
              <Text style={styles.alertBtnText}>{saveAlert.isPending ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
          {keywords.length > 0 && newMatches.length > 0 && (
            <View style={styles.alertHit}>
              <Text style={styles.alertHitText}>
                {newMatches.length} new opening{newMatches.length === 1 ? '' : 's'} match{newMatches.length === 1 ? 'es' : ''} your alert: {newMatches.map((j) => j.role).slice(0, 3).join(', ')}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => saveAlert.mutate({ keywords: alertPref.data!.keywords, markSeen: true })}>
                <Text style={styles.alertDismiss}>Mark seen</Text>
              </Pressable>
            </View>
          )}
          {keywords.length > 0 && newMatches.length === 0 && (
            <Text style={styles.meta}>No new matches since your last visit.</Text>
          )}
        </Card>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.chips}>
        {JOB_FILTERS.map((f) => <Chip key={f} label={f} active={f === filter} onPress={() => setFilter(f)} />)}
      </ScrollView>
      {jobs.isLoading && <ListSkeleton count={3} />}
      {jobs.isError && (
        <EmptyState
          actionLabel="Try again"
          body="Openings could not load. Check your connection and try again."
          icon="cloud-offline-outline"
          onAction={() => jobs.refetch()}
          title="Could not load openings"
        />
      )}
      {!jobs.isLoading && !jobs.isError && items.length === 0 && (
        <EmptyState
          body={`No ${filter === 'All' ? '' : filter.toLowerCase()} openings right now. New ones appear here as firms post them.`}
          icon="briefcase-outline"
          title="No openings"
        />
      )}
      {items.map((j) => {
        const applied = applications.data?.has(j.id) ?? false;
        return (
        <Pressable key={j.id} onPress={() => router.push({ params: { id: j.id }, pathname: '/job' })}>
        <Card>
          <View style={styles.jobTop}>
            <Avatar name={j.firm} size={42} />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{j.role}</Text>
              <Text style={styles.meta}>{j.firm} · {j.loc}</Text>
            </View>
          </View>
          <View style={styles.tagsRow}>
            <Text style={styles.pay}>{j.pay}</Text>
            {j.tags.map((t) => <Text key={t} style={styles.tag}>{t}</Text>)}
          </View>
          <View style={styles.foot}>
            <Text style={styles.meta}>{j.cat}</Text>
            <Pressable
              accessibilityLabel={`Share ${j.role}`}
              accessibilityRole="button"
              onPress={() => {
                const url = itemShareUrl('job', j.id);
                void shareItemLink(url, `${j.role} at ${j.firm} - on Cohort`).then((ok) =>
                  toast.show(ok ? (Platform.OS === 'web' ? 'Link copied' : 'Shared') : url, ok ? 'success' : 'info'),
                );
              }}
            >
              <Ionicons color={colors.brand} name="share-social-outline" size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={(e) => { e.stopPropagation?.(); openJob(j.id); }} style={[styles.btn, applied && styles.btnDone]}>
              <Text style={[styles.btnText, applied && styles.btnTextDone]}>
                {applied ? `✓ ${({ reviewed: 'Under review', shortlisted: 'Shortlisted', rejected: 'Not selected' } as Record<string, string>)[applications.data?.get(j.id)?.status ?? ''] ?? 'Applied'}` : 'Apply'}
              </Text>
            </Pressable>
          </View>
        </Card>
        </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  banner: {
    alignItems: 'center', backgroundColor: colors.brandSoft,
    borderColor: '#CBE2F6', flexDirection: 'row', gap: spacing.sm,
  },
  alertBtn: {
    backgroundColor: colors.brandSoft, borderRadius: radius.input, justifyContent: 'center', paddingHorizontal: 14,
  },
  alertBtnText: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600' },
  alertDismiss: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  alertHit: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.tile,
    flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', padding: 10,
  },
  alertHitText: { ...typeScale.caption, color: colors.brandDeep, flex: 1 },
  alertInput: {
    ...typeScale.body, backgroundColor: colors.cream, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, padding: 10,
  },
  chips: { gap: spacing.sm },
  jobTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  tagsRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pay: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '700' },
  tag: {
    ...typeScale.caption, backgroundColor: colors.raised, borderRadius: 8,
    color: colors.ink2, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3,
  },
  foot: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  btn: {
    backgroundColor: colors.brandSoft, borderColor: colors.brandSoft, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8,
  },
  btnDone: { backgroundColor: colors.card },
  btnText: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600' },
  btnTextDone: { color: colors.brand },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
