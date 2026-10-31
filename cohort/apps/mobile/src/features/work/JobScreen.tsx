import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createElement, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Pill } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { type ResumeFile, useApplyToJob, useJob, useMyApplications, useToggleApplication } from '@/lib/data';
import { itemShareUrl, shareItemLink } from '@/lib/share';
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
  const applyToJob = useApplyToJob(userId);
  const [coverNote, setCoverNote] = useState('');
  const [resume, setResume] = useState<ResumeFile | null>(null);
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
  const mine = applications.data?.get(j.id);
  const apply = () => {
    if (!userId) {
      toast.show('Sign in to apply', 'info');
      return;
    }
    if (applied) {
      const doWithdraw = () =>
        toggleApplication.mutate(
          { applied, jobId: j.id },
          {
            onError: () => toast.show('Could not update your application. Try again.', 'error'),
            onSuccess: () => toast.show('Application withdrawn', 'success'),
          },
        );
      const prompt = 'Withdraw this application? Your cover note and resume are removed from this opening.';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm(prompt)) doWithdraw();
      } else {
        Alert.alert('Withdraw application', prompt, [
          { style: 'cancel', text: 'Keep it' },
          { style: 'destructive', text: 'Withdraw', onPress: doWithdraw },
        ]);
      }
      return;
    }
    applyToJob.mutate(
      { coverNote, jobId: j.id, resume },
      {
        onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not send your application. Try again.', 'error'),
        onSuccess: () => toast.show('Application sent', 'success'),
      },
    );
  };

  const share = () => {
    const url = itemShareUrl('job', j.id);
    void shareItemLink(url, `${j.role} at ${j.firm} - on Cohort`).then((ok) =>
      toast.show(ok ? (Platform.OS === 'web' ? 'Link copied' : 'Shared') : url, ok ? 'success' : 'info'),
    );
  };

  const details = (
    <Card style={[styles.panel, landscape && styles.panelLeft]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[styles.cat, { flex: 1 }]}>{j.cat}</Text>
        <Pressable accessibilityLabel="Share this opening" accessibilityRole="button" onPress={share}>
          <Ionicons color={colors.brand} name="share-social-outline" size={18} />
        </Pressable>
      </View>
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
        {!!j.openings && (
          <View style={styles.row}>
            <Ionicons color={colors.ink3} name="people-outline" size={15} />
            <View>
              <Text style={styles.rowLabel}>Openings</Text>
              <Text style={styles.rowValue}>Hiring {j.openings} {j.openings === 1 ? 'person' : 'people'}</Text>
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
      {applied ? (
        <>
          <Text style={styles.meta}>
            You have applied to this opening. The firm can see your Cohort profile
            {mine?.resume_name ? ', your resume' : ''} and message you directly.
          </Text>
          {mine?.cover_note ? (
            <View style={{ gap: 4 }}>
              <Text style={styles.rowLabel}>Your cover note</Text>
              <Text style={styles.desc}>{mine.cover_note}</Text>
            </View>
          ) : null}
          {mine?.resume_name ? (
            <View style={styles.resumeRow}>
              <Ionicons color={colors.brandDeep} name="document-text-outline" size={15} />
              <Text style={styles.resumeName}>{mine.resume_name}</Text>
            </View>
          ) : null}
          <Pressable
            disabled={toggleApplication.isPending}
            onPress={apply}
            style={[styles.primaryBtn, styles.appliedBtn]}
          >
            <Text style={[styles.primaryBtnText, styles.appliedBtnText]}>
              {toggleApplication.isPending ? 'Updating…' : '✓ Applied - withdraw'}
            </Text>
          </Pressable>
        </>
      ) : userId ? (
        <>
          <Text style={styles.meta}>
            The firm sees your Cohort profile, your note and resume if you add them, and can message you directly.
          </Text>
          <Text style={styles.rowLabel}>Cover note (optional)</Text>
          <TextInput
            maxLength={2000}
            multiline
            onChangeText={setCoverNote}
            placeholder="A few lines on why you fit this opening…"
            placeholderTextColor={colors.ink3}
            style={styles.noteInput}
            value={coverNote}
          />
          <Text style={styles.rowLabel}>Resume (PDF, up to 5 MB, optional)</Text>
          {Platform.OS === 'web'
            ? createElement('input', {
                accept: 'application/pdf',
                'aria-label': 'Resume PDF',
                onChange: (e: { target: { files: FileList | null } }) => {
                  const f = e.target.files?.[0];
                  if (f) setResume({ mimeType: f.type, name: f.name, size: f.size, uri: URL.createObjectURL(f) });
                },
                type: 'file',
              })
            : (
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'] });
                  if (!r.canceled) setResume(r.assets[0]);
                }}
                style={styles.resumePick}
              >
                <Text style={styles.resumePickText}>{resume ? 'Change PDF' : 'Choose PDF'}</Text>
              </Pressable>
            )}
          {resume && (
            <View style={styles.resumeRow}>
              <Ionicons color={colors.brandDeep} name="document-text-outline" size={15} />
              <Text style={styles.resumeName}>{resume.name}</Text>
              <Pressable accessibilityLabel="Remove resume" accessibilityRole="button" onPress={() => setResume(null)}>
                <Ionicons color={colors.ink3} name="close" size={15} />
              </Pressable>
            </View>
          )}
          <Pressable
            disabled={applyToJob.isPending}
            onPress={apply}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>
              {applyToJob.isPending ? 'Sending…' : 'Apply now'}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.meta}>Sign in to apply for this opening.</Text>
          <Pressable onPress={apply} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Sign in to apply</Text>
          </Pressable>
        </>
      )}
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
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill,
    marginTop: spacing.sm, paddingVertical: 12,
  },
  primaryBtnText: { ...typeScale.body, color: colors.brandDeep, fontWeight: '600' },
  appliedBtn: { backgroundColor: colors.card, borderColor: colors.lineWarm, borderWidth: 1 },
  appliedBtnText: { color: colors.ink },
  meta: { ...typeScale.caption, color: colors.ink3 },
  noteInput: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, minHeight: 90, padding: 10, textAlignVertical: 'top',
  },
  resumeRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  resumeName: { ...typeScale.caption, color: colors.ink, flex: 1 },
  resumePick: {
    alignItems: 'center', borderColor: colors.lineWarm, borderRadius: radius.pill, borderWidth: 1, paddingVertical: 10,
  },
  resumePickText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
  desc: { ...typeScale.body, color: colors.ink, lineHeight: 21 },
});
