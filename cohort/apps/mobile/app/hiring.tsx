/** Hiring dashboard: firm/company accounts manage their openings and applicants. */
import { SeoHead } from '@/components/SeoHead';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { timeAgo } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { useApplicationsForJobs, useMyPostedJobs, useMyProfile, useProfiles } from '@/lib/data';
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

  const isOrg = profile.data?.account_type === 'firm' || profile.data?.account_type === 'enterprise';
  const nameOf = (id: string) => (profiles.data ?? []).find((p) => p.id === id)?.full_name || 'Member';

  const closeOpening = async (jobId: string, role: string) => {
    setClosing(jobId);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    setClosing('');
    if (error) {
      toast.show('Could not close the opening. Try again.', 'error');
    } else {
      toast.show(`"${role}" closed.`, 'success');
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

  if (profile.data && !isOrg) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>
          Hiring dashboards are for firm and company accounts. Your account is registered as an individual account.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.cta}>
          <Text style={styles.ctaText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SeoHead noindex description="Manage your openings and applicants." path="/hiring" title="Hiring" />
      <ScreenHeader sub={profile.data?.org_name || 'Your organisation'} title="Hiring dashboard" />
      {!profile.data?.verified_at && (
        <Card>
          <Text style={styles.body}>
            Your organisation is not verified yet, so you can post gig work only. Job openings need a verified
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
                </Text>
              </View>
              <Pressable disabled={closing === j.id} onPress={() => closeOpening(j.id, j.role)} style={styles.closeBtn}>
                <Text style={styles.closeText}>{closing === j.id ? 'Closing…' : 'Close'}</Text>
              </Pressable>
            </View>
            <Text style={styles.section}>{apps.length} applicant{apps.length === 1 ? '' : 's'}</Text>
            {apps.map((a) => (
              <View key={a.id} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <Avatar name={nameOf(a.user_id)} size={28} />
                <Text style={styles.body}>
                  {nameOf(a.user_id)} <Text style={styles.meta}>· applied {timeAgo(a.created_at ?? new Date().toISOString())}</Text>
                </Text>
              </View>
            ))}
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
  cta: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 12 },
  ctaText: { color: '#fff', fontWeight: '700' },
  closeBtn: { borderColor: colors.hairline, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  closeText: { ...typeScale.caption, color: colors.ink2 },
});
