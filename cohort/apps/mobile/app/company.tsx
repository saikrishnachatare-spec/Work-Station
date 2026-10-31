/**
 * Company panel (web route: /company): the separate dashboard for firm and
 * company accounts. Member (individual) accounts keep the normal app; org
 * accounts land here after sign-in. Everything reads and writes the same
 * live tables as the member app - openings posted here appear under Work.
 */
import { SeoHead } from '@/components/SeoHead';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ScreenHeader, SectionTitle } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import {
  timeAgo,
  useApplicationsForJobs,
  useCreateJob,
  useMyPostedJobs,
  useMyProfile,
  useProfiles,
  useStartThread,
  useUpdateApplicationStatus,
} from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const SECTIONS = ['Overview', 'Openings', 'Post an opening', 'Company profile'] as const;
const JOB_CATS = ['Jobs', 'Articleship', 'Industrial training', 'Stock Audits', 'Gig work'];

export default function CompanyScreen() {
  const router = useRouter();
  const { loading, session } = useAuth();
  const userId = session?.user?.id;
  const profile = useMyProfile(userId);
  const jobs = useMyPostedJobs(userId);
  const jobIds = (jobs.data ?? []).map((j) => j.id);
  const applications = useApplicationsForJobs(jobIds);
  const profiles = useProfiles();
  const toast = useToast();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Overview');
  const [closing, setClosing] = useState('');

  const updateStatus = useUpdateApplicationStatus();
  const startThread = useStartThread(userId);
  const createJob = useCreateJob();

  // Post-an-opening form state
  const orgName = profile.data?.org_name || '';
  const [role, setRole] = useState('');
  const [jobCat, setJobCat] = useState('Jobs');
  const [jobLoc, setJobLoc] = useState('');
  const [jobPay, setJobPay] = useState('');
  const [jobDeadline, setJobDeadline] = useState('');
  const [jobDesc, setJobDesc] = useState('');

  // Company profile form state, seeded once the profile loads (render-phase
  // adjustment: React's recommended alternative to setState-in-effect).
  const [coName, setCoName] = useState('');
  const [coHeadline, setCoHeadline] = useState('');
  const [coBio, setCoBio] = useState('');
  const [coWebsite, setCoWebsite] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [seededFor, setSeededFor] = useState('');
  if (profile.data && seededFor !== profile.data.id) {
    setSeededFor(profile.data.id);
    setCoName(profile.data.org_name || '');
    setCoHeadline(profile.data.headline || '');
    setCoBio(profile.data.bio || '');
    setCoWebsite((profile.data.links ?? []).find((l) => l.label === 'Website')?.url || '');
  }

  const isOrg = profile.data?.account_type === 'firm' || profile.data?.account_type === 'enterprise';
  const isAdmin = profile.data?.role === 'admin';

  if (loading || (userId && profile.isLoading)) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Loading the company panel…</Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.center}>
        <SeoHead noindex description="Company panel for firm and company accounts." path="/company" title="Company panel" />
        <Text style={styles.body}>Sign in with a firm or company account to open the company panel.</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.cta}>
          <Text style={styles.ctaText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (!isOrg && !isAdmin) {
    return (
      <View style={styles.center}>
        <SeoHead noindex description="Company panel for firm and company accounts." path="/company" title="Company panel" />
        <Text style={styles.body}>
          This panel is for firm and company accounts. Your account is an individual member account -
          the member app is your home.
        </Text>
        <Pressable onPress={() => router.replace('/')} style={styles.cta}>
          <Text style={styles.ctaText}>Back to the member app</Text>
        </Pressable>
      </View>
    );
  }

  const verified = !!profile.data?.verified_at;
  const kindLabel = profile.data?.account_type === 'firm' ? 'Firm account' : 'Company account';
  const allApps = applications.data ?? [];
  const openJobs = (jobs.data ?? []).filter((j) => j.status !== 'closed');
  const awaiting = allApps.filter((a) => a.status === 'new').length;
  const shortlisted = allApps.filter((a) => a.status === 'shortlisted').length;

  // Firm/company accounts are exempt from the connect-before-message gate
  // (same exemption the member app's hiring dashboard uses).
  const contactChip = (otherId: string) => (
    <Pressable
      disabled={startThread.isPending}
      onPress={() =>
        startThread.mutate(
          { firstMessage: '', otherUserId: otherId },
          {
            onError: () => toast.show('Could not start the conversation. Try again.', 'error'),
            onSuccess: () => router.push('/messages'),
          },
        )
      }
      style={styles.actionChip}
    >
      <Text style={styles.actionChipText}>Message</Text>
    </Pressable>
  );

  const openResume = async (path: string) => {
    const { data, error } = await supabase.storage.from('resumes').createSignedUrl(path, 300);
    if (error || !data) {
      toast.show('Could not open the resume. Try again.', 'error');
      return;
    }
    Linking.openURL(data.signedUrl).catch(() => toast.show('Could not open the resume. Try again.', 'error'));
  };
  const nameOf = (id: string) => (profiles.data ?? []).find((p) => p.id === id)?.full_name || 'Member';
  const profileOf = (id: string) => (profiles.data ?? []).find((p) => p.id === id);

  const toggleOpen = async (jobId: string, jobRole: string, current: string) => {
    const next = current === 'open' ? 'closed' : 'open';
    setClosing(jobId);
    const { error } = await supabase.from('jobs').update({ status: next }).eq('id', jobId);
    setClosing('');
    if (error) {
      toast.show('Could not update the opening. Try again.', 'error');
    } else {
      toast.show(next === 'closed' ? `"${jobRole}" closed. Applicants keep their history.` : `"${jobRole}" reopened.`, 'success');
      jobs.refetch();
      applications.refetch();
    }
  };

  const submitJob = () => {
    const r = role.trim();
    if (!r) {
      toast.show('Name the role first', 'info');
      return;
    }
    if (jobDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(jobDeadline.trim())) {
      toast.show('Deadline must be YYYY-MM-DD (or leave it empty)', 'error');
      return;
    }
    if (jobCat !== 'Gig work' && !verified) {
      toast.show('Job openings need a verified profile. Gig work is open to everyone.', 'info');
      return;
    }
    createJob.mutate(
      {
        cat: jobCat, deadline: jobDeadline.trim(), description: jobDesc.trim(),
        firm: orgName || 'Your organisation', loc: jobLoc.trim(), pay: jobPay.trim(), role: r, userId,
      },
      {
        onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not post. Try again.', 'error'),
        onSuccess: () => {
          toast.show(`"${r}" is live under Work & hiring.`, 'success');
          setRole(''); setJobLoc(''); setJobPay(''); setJobDeadline(''); setJobDesc('');
          setSection('Openings');
        },
      },
    );
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    const links = coWebsite.trim() ? [{ label: 'Website', url: coWebsite.trim() }] : [];
    const { error } = await supabase
      .from('profiles')
      .update({ bio: coBio.trim(), headline: coHeadline.trim(), links, org_name: coName.trim() })
      .eq('id', userId);
    setSavingProfile(false);
    if (error) {
      toast.show('Could not save the company profile. Try again.', 'error');
    } else {
      toast.show('Company profile saved.', 'success');
      profile.refetch();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SeoHead noindex description="Company panel for firm and company accounts." path="/company" title="Company panel" />
      <ScreenHeader sub={`${kindLabel}${verified ? ' · verified' : ' · not verified yet'}`} title={orgName || 'Company panel'} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {SECTIONS.map((s) => (
          <Pressable key={s} onPress={() => setSection(s)} style={[styles.segBtn, s === section && styles.segOn]}>
            <Text style={[styles.segText, s === section && styles.segTextOn]}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {section === 'Overview' && (
        <View style={{ gap: spacing.md }}>
          {!verified && (
            <Card style={{ gap: spacing.xs }}>
              <Text style={styles.strong}>Verification pending</Text>
              <Text style={styles.meta}>
                Your organisation can post gig work now. Jobs, articleship, industrial training and stock audit
                openings unlock once the Cohort team verifies this account. Use the Request verification button
                on the Account screen of the member app to ask for a review.
              </Text>
            </Card>
          )}
          <View style={styles.statGrid}>
            {([
              ['Open openings', openJobs.length, 'Openings'],
              ['Closed openings', (jobs.data ?? []).length - openJobs.length, 'Openings'],
              ['Total applicants', allApps.length, 'Openings'],
              ['Awaiting review', awaiting, 'Openings'],
              ['Shortlisted', shortlisted, 'Openings'],
            ] as const).map(([label, n, target]) => (
              <Pressable key={label} onPress={() => setSection(target as (typeof SECTIONS)[number])}>
                <Card style={styles.stat}>
                  <Text style={styles.statNum}>{n}</Text>
                  <Text style={styles.meta}>{label}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setSection('Post an opening')} style={styles.cta}>
            <Text style={styles.ctaText}>Post an opening</Text>
          </Pressable>
          <SectionTitle title="Latest applicants" />
          {allApps.length === 0 ? (
            <Text style={styles.meta}>No applicants yet. They appear here as members apply to your openings.</Text>
          ) : (
            allApps.slice(0, 5).map((a) => {
              const job = (jobs.data ?? []).find((j) => j.id === a.job_id);
              return (
                <Card key={a.id} style={styles.row}>
                  <Avatar name={nameOf(a.user_id)} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong}>{nameOf(a.user_id)}</Text>
                    <Text style={styles.meta}>
                      {job ? `for ${job.role} · ` : ''}applied {timeAgo(a.created_at ?? new Date().toISOString())} · {a.status}
                    </Text>
                  </View>
                </Card>
              );
            })
          )}
        </View>
      )}

      {section === 'Openings' && (
        <View style={{ gap: spacing.md }}>
          {jobs.isLoading ? <ListSkeleton /> : null}
          {jobs.data && jobs.data.length === 0 && (
            <EmptyState body="Openings you post appear here with their applicants." title="No openings yet" />
          )}
          {(jobs.data ?? []).map((j) => {
            const apps = allApps.filter((a) => a.job_id === j.id);
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
                  <Pressable disabled={closing === j.id} onPress={() => toggleOpen(j.id, j.role, j.status ?? 'open')} style={styles.actionChip}>
                    <Text style={styles.actionChipText}>{closing === j.id ? 'Saving…' : j.status === 'closed' ? 'Reopen' : 'Close'}</Text>
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
                        {contactChip(a.user_id)}
                        {a.resume_path ? (
                          <Pressable onPress={() => openResume(a.resume_path!)} style={styles.actionChip}>
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
        </View>
      )}

      {section === 'Post an opening' && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>Post an opening</Text>
          <Text style={styles.meta}>
            Posted as {orgName || 'your organisation'}. It goes live under Work & hiring for every member.
            {verified ? '' : ' Until your account is verified, only gig work can be posted.'}
          </Text>
          <TextInput onChangeText={setRole} placeholder="Role, e.g. Articleship, statutory audit" placeholderTextColor={colors.ink3} style={styles.input} value={role} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {JOB_CATS.map((c) => {
              const locked = c !== 'Gig work' && !verified;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={c}
                  onPress={() => !locked && setJobCat(c)}
                  style={[styles.segBtn, c === jobCat && styles.segOn, locked && { opacity: 0.4 }]}
                >
                  <Text style={[styles.segText, c === jobCat && styles.segTextOn]}>{c}{locked ? ' 🔒' : ''}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput onChangeText={setJobLoc} placeholder="Location, e.g. Hyderabad or Remote" placeholderTextColor={colors.ink3} style={styles.input} value={jobLoc} />
          <TextInput onChangeText={setJobPay} placeholder="Pay / stipend, e.g. ₹8,000 per month" placeholderTextColor={colors.ink3} style={styles.input} value={jobPay} />
          <TextInput onChangeText={setJobDeadline} placeholder="Deadline YYYY-MM-DD (optional)" placeholderTextColor={colors.ink3} style={styles.input} value={jobDeadline} />
          <TextInput
            multiline
            onChangeText={setJobDesc}
            placeholder="About this opening (what the person will do)"
            placeholderTextColor={colors.ink3}
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            value={jobDesc}
          />
          <Pressable disabled={createJob.isPending} onPress={submitJob} style={styles.cta}>
            <Text style={styles.ctaText}>{createJob.isPending ? 'Posting…' : 'Post opening'}</Text>
          </Pressable>
        </Card>
      )}

      {section === 'Company profile' && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>Company profile</Text>
          <Text style={styles.meta}>
            This is what members see about your organisation on openings and your public profile.
          </Text>
          <Text style={styles.label}>Organisation name</Text>
          <TextInput onChangeText={setCoName} placeholder="Firm or company name" placeholderTextColor={colors.ink3} style={styles.input} value={coName} />
          <Text style={styles.label}>Headline</Text>
          <TextInput onChangeText={setCoHeadline} placeholder="One line, e.g. Mid-size CA firm in Hyderabad" placeholderTextColor={colors.ink3} style={styles.input} value={coHeadline} />
          <Text style={styles.label}>About</Text>
          <TextInput
            multiline
            onChangeText={setCoBio}
            placeholder="What your organisation does, and what articles / employees work on"
            placeholderTextColor={colors.ink3}
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            value={coBio}
          />
          <Text style={styles.label}>Website</Text>
          <TextInput autoCapitalize="none" onChangeText={setCoWebsite} placeholder="https://…" placeholderTextColor={colors.ink3} style={styles.input} value={coWebsite} />
          <Pressable disabled={savingProfile} onPress={saveProfile} style={styles.cta}>
            <Text style={styles.ctaText}>{savingProfile ? 'Saving…' : 'Save company profile'}</Text>
          </Pressable>
        </Card>
      )}

      <View style={{ marginTop: spacing.sm }}>
        <Pressable onPress={() => router.push('/work')} style={styles.actionChip}>
          <Text style={styles.actionChipText}>Browse the member app</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '700' },
  body: { ...typeScale.body, color: colors.ink2, textAlign: 'center' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  label: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
  section: { ...typeScale.caption, color: colors.ink, fontWeight: '700', marginTop: spacing.xs },
  cta: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingVertical: 12 },
  ctaText: { color: colors.brandDeep, fontWeight: '700' },
  segBtn: {
    backgroundColor: colors.card, borderColor: '#e7d9cf', borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8,
  },
  segOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  segText: { ...typeScale.caption, color: colors.ink2, fontWeight: '500' },
  segTextOn: { color: colors.brandDeep, fontWeight: '600' },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { alignItems: 'center', minWidth: 100, paddingVertical: 16 },
  statNum: { ...typeScale.screenTitle, color: colors.brand },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  actionChip: { alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.hairline, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  actionChipText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
});
