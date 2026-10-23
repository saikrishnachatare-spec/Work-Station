/** Account screen: profile, verification status, sign out, delete account. */
import { SeoHead } from '@/components/SeoHead';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { signOut, useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { guest, session } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (guest || !session) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>You are browsing the demo as a guest.</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.cta}>
          <Text style={styles.ctaText}>Sign in or create an account</Text>
        </Pressable>
      </View>
    );
  }

  const user = session.user;
  const name = (user.user_metadata?.full_name as string) || user.email || 'Member';
  const verified = !!user.email_confirmed_at;

  const doSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const doDelete = async () => {
    setBusy(true);
    // Phase 2: server-side deletion function. For now: sign out and forget.
    await supabase.auth.signOut();
    setBusy(false);
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SeoHead noindex description="Your Cohort account and settings." path="/account" title="Account" />
      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        <Avatar name={name} size={56} />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>{user.email}</Text>
        <Text style={[styles.badge, verified ? styles.badgeOk : styles.badgeWarn]}>
          {verified ? 'Email verified' : 'Email not verified yet - check your inbox'}
        </Text>
      </Card>

      <Pressable onPress={doSignOut} style={styles.cta}>
        <Text style={styles.ctaText}>Sign out</Text>
      </Pressable>

      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)}>
          <Text style={styles.danger}>Delete my account</Text>
        </Pressable>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.body}>
            Delete your account permanently? Your profile and personal data will be removed. This cannot be undone.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => setConfirming(false)} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Keep my account</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={doDelete} style={styles.dangerBtn}>
              <Text style={styles.ctaText}>{busy ? 'Deleting…' : 'Yes, delete'}</Text>
            </Pressable>
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  name: { ...typeScale.sectionTitle, color: colors.ink },
  meta: { ...typeScale.caption, color: colors.ink3 },
  body: { ...typeScale.body, color: colors.ink2 },
  badge: { ...typeScale.caption, borderRadius: radius.pill, fontWeight: '600', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4 },
  badgeOk: { backgroundColor: '#eef4ec', color: '#3f6440' },
  badgeWarn: { backgroundColor: colors.brandSoft, color: colors.brandDeep },
  cta: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 12,
  },
  ctaText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
  danger: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600', textAlign: 'center' },
  dangerBtn: {
    alignItems: 'center', backgroundColor: colors.brandDeep, borderRadius: radius.pill,
    flex: 1, paddingVertical: 10,
  },
  ghostBtn: {
    alignItems: 'center', borderColor: colors.lineWarm, borderRadius: radius.pill,
    borderWidth: 1, flex: 1, paddingVertical: 10,
  },
  ghostText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
});
