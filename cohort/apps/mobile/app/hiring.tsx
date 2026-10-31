/** Hiring dashboard: firm/company accounts manage their openings and applicants. */
import { SeoHead } from '@/components/SeoHead';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { timeAgo, useApplicationsForJobs, useMyPostedJobs, useMyProfile, useProfiles, useUpdateApplicationStatus } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export default function HiringScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const profile = useMyProfile(userId);
  const jobs = useMyPostedJobs(userId);
  const jobIds = (jobs.data ?? []).map((j) => j.id);
  const applications = useApplicationsForJobs(jobIds);
  const profiles = useProfiles();
  const toast = useToast();
  const [closing, setClosing] = useState('');

  const updateStatus = useUpdateApplicationStatus();

  const openResume = async (path: string, name?: string | null) => {
    const { data, error } = await supabase.storage.from('resumes').createSignedUrl(path, 300);
    if (error || !data) {
      toast.show('Could not open the resume. Try again.', 'error');
      return;
    }
    Linking.openURL(data.signedUrl).catch(() => toast.show('Could not open the resume. Try again.', 'error'));
  };
  const nameOf = (id: string) => (profiles.data ?? []).find((p) => p.id === id)?.full_name || 'Member';
  const profileOf = (id: string) => (profiles.data ?? []).find((p) => p.id === id);

  const toggleOpen = async (jobId: string, role: string, current: string) => {
    const next = current === 'open' ? 'closed' : 'open';
    setClosing(jobId);
    const { error } = await supabase.from('jobs').update({ status: next }).eq('id', jobId);
    setClosing('');
    if (error) {
      toast.show('Could not update the opening. Try again.', 'error');
    } else {
      toast.show(next === 'closed' ? `"${role}" closed. Applicants keep their application history.` : `"${role}" reopened.`, 'success');
      jobs.refetch();
      applications.refetch();
    }
  };

  if (!userId) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Sign in to manage hiring.</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.cta}>
          <Text style={styles.ctaText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SeoHead noindex description="Manage your openings and applicants." path="/hiring" title="Hiring" />
      <ScreenHeader sub={profile.data?.org_name || 'Your openings and applicants'} title="Hiring dashboard" />
      {!profile.data?.verified_at && (
        <Card>
          <Text style={styles.body}>
            Your account is not verified yet, so you can post gig work only. Job openings need a verified
            professional profile - the Cohort team reviews and marks verified accounts.
          </Text>
        </Card>
      )}
      <Pressable onPress={() => router.push('/create')} style={styles.cta}>
        <Text style={styles.ctaText}>Post an opening</Text>
      </Pressable>
      {jobs.isLoading ? <ListSkeleton /> : null}
      {jobs.data && jobs.data.length === 0 && (
        <EmptyState body="Openings you post appear here with their applicants." title="No openings yet" />
      )}
      {(jobs.data ?? []).map((j) => {
        const apps = (applications.data ?? []).filter((a) => a.job_id === j.id);
        return (
          <Card key={j.id} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{j.role}</Text>
                <Text style={styles.meta}>
                  {j.cat}{j.loc ? ` · ${j.loc}` : ''}{j.pay ? ` · ${j.pay}` : ''} · posted {timeAgo(j.created_at ?? new Date().toISOString())}
                  {j.status === 'closed' ? ' · CLOSED' : ''}
                </Text>
              </View>
              <Pressable disabled={closing === j.id} onPress={() => toggleOpen(j.id, j.role, j.status ?? 'open')} style={styles.closeBtn}>
                <Text style={styles.closeText}>{closing === j.id ? 'Saving…' : j.status === 'closed' ? 'Reopen' : 'Close'}</Text>
              </Pressable>
            </View>
            <Text style={styles.section}>{apps.length} applicant{apps.length === 1 ? '' : 's'}</Text>
            {apps.map((a) => {
              const statusLabel = ({ new: 'New', reviewed: 'Under review', shortlisted: 'Shortlisted', rejected: 'Not selected' } as Record<string, string>)[a.status] ?? 'New';
              return (
                <View key={a.id} style={{ gap: spacing.xs }}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <Avatar name={nameOf(a.user_id)} size={28} />
                    <View style={{ flex: 1 }}>
                      <Pressable accessibilityRole="button" onPress={() => router.push({ params: { id: a.user_id }, pathname: '/member' })}>
                        <Text style={styles.body}>
                          {nameOf(a.user_id)} <Text style={styles.meta}>· applied {timeAgo(a.created_at ?? new Date().toISOString())}</Text>
                        </Text>
                      </Pressable>
                      {(() => {
                        const ap = profileOf(a.user_id);
                        const cred = [ap?.course, ap?.level].filter(Boolean).join(' · ');
                        return cred ? <Text style={styles.meta}>{cred}</Text> : null;
                      })()}
                      <Text style={[styles.meta, a.status === 'shortlisted' && { color: colors.brandDeep }, a.status === 'rejected' && { color: colors.danger }]}>
                        {statusLabel}
                      </Text>
                      {a.cover_note ? <Text style={styles.meta}>Note: {a.cover_note}</Text> : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {a.resume_path ? (
                      <Pressable onPress={() => openResume(a.resume_path!, a.resume_name)} style={styles.actionChip}>
                        <Text style={styles.actionChipText}>Resume{a.resume_name ? ` (${a.resume_name})` : ''}</Text>
                      </Pressable>
                    ) : null}
                    {a.status !== 'shortlisted' && (
                      <Pressable disabled={updateStatus.isPending} onPress={() => updateStatus.mutate({ applicationId: a.id, status: 'shortlisted' })} style={styles.actionChip}>
                        <Text style={styles.actionChipText}>Shortlist</Text>
                      </Pressable>
                    )}
                    {a.status !== 'reviewed' && a.status !== 'shortlisted' && (
                      <Pressable disabled={updateStatus.isPending} onPress={() => updateStatus.mutate({ applicationId: a.id, status: 'reviewed' })} style={styles.actionChip}>
                        <Text style={styles.actionChipText}>Mark reviewed</Text>
                      </Pressable>
                    )}
                    {a.status !== 'rejected' && (
                      <Pressable disabled={updateStatus.isPending} onPress={() => updateStatus.mutate({ applicationId: a.id, status: 'rejected' })} style={styles.actionChip}>
                        <Text style={styles.actionChipText}>Decline</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '700' },
  body: { ...typeScale.body, color: colors.ink2 },
  meta: { ...typeScale.caption, color: colors.ink3 },
  section: { ...typeScale.caption, color: colors.ink, fontWeight: '700', marginTop: spacing.xs },
  cta: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingVertical: 12 },
  ctaText: { color: colors.brandDeep, fontWeight: '700' },
  closeBtn: { borderColor: colors.hairline, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  closeText: { ...typeScale.caption, color: colors.ink2 },
  actionChip: { backgroundColor: colors.card, borderColor: colors.hairline, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  actionChipText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
});
