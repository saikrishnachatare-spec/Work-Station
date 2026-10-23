/**
 * One-time analytics consent banner (web only). Vercel Web Analytics is
 * cookie-less, but nothing loads until the visitor accepts; declining stores
 * the choice and loads nothing. Native builds never see this.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { getConsent, setConsent } from '@/lib/analytics';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function ConsentBanner() {
  // Decide on the client only: the static export pass has no window.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || getConsent() !== null) return;
    // Defer past the effect body: react-hooks/set-state-in-effect rejects
    // synchronous setState, and the banner must wait for mount anyway.
    const id = setTimeout(() => setVisible(true), 0);
    return () => clearTimeout(id);
  }, []);
  if (!visible) return null;

  const choose = (choice: 'accepted' | 'declined') => {
    setConsent(choice);
    setVisible(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>A quick note on analytics</Text>
        <Text style={styles.meta}>
          Cohort uses privacy-friendly, cookie-less analytics to see which features get used.
          No personal data, no cross-site tracking.
        </Text>
      </View>
      <Pressable onPress={() => choose('accepted')} style={styles.accept}>
        <Text style={styles.acceptText}>Accept</Text>
      </Pressable>
      <Pressable onPress={() => choose('declined')} style={styles.decline}>
        <Text style={styles.declineText}>Decline</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center', backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.card, borderWidth: 1, bottom: spacing.lg, flexDirection: 'row',
    gap: spacing.sm, left: spacing.lg, padding: spacing.md, position: 'absolute',
    right: spacing.lg, zIndex: 50,
  },
  title: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  accept: {
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  acceptText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  decline: {
    borderColor: colors.lineWarm, borderRadius: radius.pill, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  declineText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
});
