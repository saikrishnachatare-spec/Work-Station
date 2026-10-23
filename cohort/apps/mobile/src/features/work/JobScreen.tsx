import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Pill } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useJob, useMyApplications, useToggleApplication } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

/**
 * Detailed window for one hiring post. On wide/web screens the layout is
 * landscape-oriented: details on the left, the application panel on the right.
 */
export function JobScreen({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const job = useJob(id);
  const applications = useMyApplications(userId);
  const toggleApplication = useToggleApplication(userId);
  const { width } = useWindowDimensions();
  const landscape = Platform.OS === 'web' && width >= 720;

  if (job.isLoading) {
    return <View style={styles.page}><ListSkeleton count={1} /></View>;
  }
  if (!job.data) {
    return (
      <View style={styles.page}>
        <EmptyState body="This opening was removed or the link is wrong." icon="briefcase-outline" title="Opening not found" />
      </View>
    );
  }

  const j = job.data;
  const applied = applications.data?.has(j.id) ?? false;
  const apply = () => {
    if (!userId) {
      toast.show('Sign in to apply', 'info');
      return;
    }
    toggleApplication.mutate(
      { applied, jobId: j.id },
      {
        onError: () => toast.show('Could not update your application. Try again.', 'error'),
        onSuccess: () => toast.show(applied ? 'Application withdrawn' : 'Application sent', 'success'),
      },
    );
  };

  const details = (
    <Card style={[styles.panel, landscape && styles.panelLeft]}>
      <Text style={styles.cat}>{j.cat}</Text>
      <Text style={styles.role}>{j.role}</Text>
      <Text style={styles.firm}>{j.firm}</Text>
      <View style={styles.rows}>
        {!!j.loc && (
          <View style={styles.row}>
            <Ionicons color={colors.ink3} name="location-outline" size={15} />
            <View>
              <Text style={styles.rowLabel}>Location</Text>
              <Text style={styles.rowValue}>{j.loc}</Text>
            </View>
          </View>
        )}
        {!!j.pay && (
          <View style={styles.row}>
            <Ionicons color={colors.ink3} name="cash-outline" size={15} />
            <View>
              <Text style={styles.rowLabel}>Pay</Text>
              <Text style={styles.rowValue}>{j.pay}</Text>
            </View>
          </View>
        )}
        {!!j.deadline && (
          <View style={styles.row}>
            <Ionicons color={colors.ink3} name="calendar-outline" size={15} />
            <View>
              <Text style={styles.rowLabel}>Apply by</Text>
              <Text style={styles.rowValue}>
                {new Date(`${j.deadline}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
          </View>
        )}
      </View>
      {!!j.description && (
        <View style={{ gap: 4, marginTop: spacing.xs }}>
          <Text style={styles.rowLabel}>About this opening</Text>
          <Text style={styles.desc}>{j.description}</Text>
        </View>
      )}
      {(j.tags ?? []).length > 0 && (
        <View style={styles.pills}>
          {(j.tags ?? []).map((t) => <Pill key={t} label={t} />)}
        </View>
      )}
    </Card>
  );

  const applyPanel = (
    <Card style={[styles.panel, landscape && styles.panelRight]}>
      <Text style={styles.applyTitle}>Your application</Text>
      <Text style={styles.meta}>
        {applied
          ? 'You have applied to this opening. The firm can see your Cohort profile and message you directly.'
          : userId
            ? 'Apply with one tap. The firm sees your Cohort profile and can message you directly.'
            : 'Sign in to apply for this opening.'}
      </Text>
      <Pressable
        disabled={toggleApplication.isPending}
        onPress={apply}
        style={[styles.primaryBtn, applied && styles.appliedBtn]}
      >
        <Text style={[styles.primaryBtnText, applied && styles.appliedBtnText]}>
          {toggleApplication.isPending ? 'Updating…' : applied ? '✓ Applied - withdraw' : userId ? 'Apply now' : 'Sign in to apply'}
        </Text>
      </Pressable>
    </Card>
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons color={colors.brand} name="chevron-back" size={16} />
        <Text style={styles.backText}>Back to Work</Text>
      </Pressable>
      <View style={landscape ? styles.landscapeWrap : styles.stack}>
        {details}
        {applyPanel}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  backBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  stack: { gap: spacing.md },
  landscapeWrap: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  panel: { gap: spacing.sm, padding: spacing.lg },
  panelLeft: { flex: 2 },
  panelRight: { flex: 1, minWidth: 260 },
  cat: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  role: { ...typeScale.screenTitle, color: colors.ink },
  firm: { ...typeScale.body, color: colors.ink2 },
  rows: { gap: spacing.sm, marginTop: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  rowLabel: { ...typeScale.caption, color: colors.ink3 },
  rowValue: { ...typeScale.body, color: colors.ink },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  applyTitle: { ...typeScale.sectionTitle, color: colors.ink },
  primaryBtn: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill,
    marginTop: spacing.sm, paddingVertical: 12,
  },
  primaryBtnText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
  appliedBtn: { backgroundColor: colors.card, borderColor: colors.lineWarm, borderWidth: 1 },
  appliedBtnText: { color: colors.ink },
  meta: { ...typeScale.caption, color: colors.ink3 },
  desc: { ...typeScale.body, color: colors.ink, lineHeight: 21 },
});
