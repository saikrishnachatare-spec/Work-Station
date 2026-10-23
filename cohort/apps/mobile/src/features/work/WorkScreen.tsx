import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { JOB_FILTERS } from '@/lib/demo-data';
import { useJobs, useMyApplications, useToggleApplication } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function WorkScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const jobs = useJobs();
  const applications = useMyApplications(userId);
  const toggleApplication = useToggleApplication(userId);

  const items = (jobs.data ?? []).filter((j) => filter === 'All' || j.cat === filter);
  const total = (jobs.data ?? []).length;

  const apply = (jobId: string) => {
    if (!userId) {
      toast.show('Sign in to apply', 'info');
      return;
    }
    const applied = applications.data?.has(jobId) ?? false;
    toggleApplication.mutate(
      { applied, jobId },
      {
        onError: () => toast.show('Could not save your application. Try again.', 'error'),
        onSuccess: () => toast.show(applied ? 'Application withdrawn' : 'Application saved', 'success'),
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Articleship, jobs, gig work and industrial training." title="Work & hiring" />
      <Card style={styles.banner}>
        <Ionicons color={colors.brandDeep} name="notifications-outline" size={18} />
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>Vacancy scan</Text>
          <Text style={styles.meta}>{total} opening{total === 1 ? '' : 's'} listed right now.</Text>
        </View>
      </Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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
            <Pressable onPress={() => apply(j.id)} style={[styles.btn, applied && styles.btnDone]}>
              <Text style={[styles.btnText, applied && styles.btnTextDone]}>
                {applied ? '✓ Applied' : 'Apply'}
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
    borderColor: '#eed5c4', flexDirection: 'row', gap: spacing.sm,
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
    backgroundColor: colors.brand, borderColor: colors.brand, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8,
  },
  btnDone: { backgroundColor: colors.card },
  btnText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  btnTextDone: { color: colors.brand },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
