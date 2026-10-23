import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenBits';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/session';
import { useToast } from '@/components/Toast';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const TARGETS = ['post', 'user', 'job'] as const;
type Target = (typeof TARGETS)[number];

export default function Safety() {
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const { session } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const type = (TARGETS as readonly string[]).includes(params.type) ? (params.type as Target) : null;

  const blocks = useQuery({
    enabled: !!session && type === 'user',
    queryFn: async () => {
      const { data, error } = await supabase.from('user_blocks').select('blocked_id');
      if (error) throw error;
      return data ?? [];
    },
    queryKey: ['blocks', session?.user.id],
  });
  const blocked = blocks.data?.some((b) => b.blocked_id === params.id) ?? false;

  const report = async () => {
    if (!session) { toast.show('Sign in to report', 'info'); return; }
    if (reason.trim().length < 5) { toast.show('Explain the concern in at least 5 characters', 'info'); return; }
    setBusy(true);
    const { error } = await supabase.from('content_reports').insert({
      reporter_id: session.user.id, target_type: type, target_id: params.id, reason: reason.trim(),
    });
    setBusy(false);
    if (error) toast.show('Could not submit report', 'error');
    else setDone(true);
  };

  const block = async () => {
    if (!session) return;
    setBusy(true);
    const r = blocked
      ? await supabase.from('user_blocks').delete().eq('blocker_id', session.user.id).eq('blocked_id', params.id)
      : await supabase.from('user_blocks').insert({ blocker_id: session.user.id, blocked_id: params.id });
    setBusy(false);
    if (r.error) toast.show('Could not update block', 'error');
    else {
      await qc.invalidateQueries({ queryKey: ['blocks'] });
      toast.show(blocked ? 'User unblocked' : 'User blocked', 'success');
    }
  };

  if (!type || !params.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Open Report from a post, listing or conversation.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Reports go to Cohort admins." title={`Report ${type}`} />
      <Card style={{ gap: spacing.sm }}>
        {done ? (
          <>
            <Text style={styles.strong}>Report submitted</Text>
            <Text style={styles.body}>
              An admin will review it. Reporting does not automatically remove the {type}.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Explain the concern. A report goes to Cohort admins for review; it does not automatically
              remove the {type}.
            </Text>
            <TextInput
              accessibilityLabel="Reason for report"
              maxLength={2000}
              multiline
              onChangeText={setReason}
              placeholder="What is the concern?"
              placeholderTextColor={colors.ink3}
              style={[styles.input, { minHeight: 96 }]}
              value={reason}
            />
            <Pressable accessibilityRole="button" disabled={busy} onPress={report} style={[styles.cta, busy && { opacity: 0.6 }]}>
              <Text style={styles.ctaText}>{busy ? 'Submitting…' : 'Submit report'}</Text>
            </Pressable>
          </>
        )}
      </Card>
      {type === 'user' && params.id !== session?.user.id && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>{blocked ? 'This user is blocked' : 'Block this user'}</Text>
          <Text style={styles.body}>
            Blocking stops direct messages in both directions. Existing conversations remain visible.
            Shared groups are not blocked. You can undo this here.
          </Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={block} style={[styles.cta, blocked && styles.ghostCta, busy && { opacity: 0.6 }]}>
            <Text style={[styles.ctaText, blocked && styles.ghostText]}>{blocked ? 'Unblock user' : 'Block user'}</Text>
          </Pressable>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg },
  strong: { ...typeScale.sectionTitle, color: colors.ink },
  body: { ...typeScale.body, color: colors.ink2, lineHeight: 21 },
  input: {
    ...typeScale.body, backgroundColor: colors.cream, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, padding: 12,
  },
  cta: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 12 },
  ctaText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
  ghostCta: { backgroundColor: colors.card, borderColor: colors.brand, borderWidth: 1 },
  ghostText: { color: colors.brand },
});
