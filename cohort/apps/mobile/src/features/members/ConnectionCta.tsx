import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Connection } from '@/lib/data';
import { colors, radius, spacing } from '@/theme';

type Props = {
  canBypassGate?: boolean;
  connection: Connection | null;
  onAccept: () => void;
  onConnect: () => void;
  onDecline: () => void;
  onMessage: () => void;
  onWithdraw: () => void;
  pending: boolean;
  userId: string | undefined;
};

/** Connect / pending / message actions for a member profile, LinkedIn-style. */
export function ConnectionCta({ canBypassGate, connection, onAccept, onConnect, onDecline, onMessage, onWithdraw, pending, userId }: Props) {
  if (canBypassGate || connection?.status === 'accepted') {
    return (
      <View style={styles.row}>
        <Pressable disabled={pending} onPress={onMessage} style={[styles.cta, pending && styles.disabled]}>
          <Text style={styles.ctaText}>Message</Text>
        </Pressable>
        <Pressable accessibilityLabel="Remove connection" disabled={pending} onPress={onWithdraw} style={styles.secondary}>
          <Text style={styles.secondaryText}>Connected ✓</Text>
        </Pressable>
      </View>
    );
  }

  if (connection?.status === 'pending') {
    if (connection.requester_id === userId) {
      return (
        <Pressable accessibilityLabel="Withdraw connection request" disabled={pending} onPress={onWithdraw} style={[styles.secondary, pending && styles.disabled]}>
          <Text style={styles.secondaryText}>Request sent — withdraw</Text>
        </Pressable>
      );
    }
    return (
      <View style={styles.row}>
        <Pressable disabled={pending} onPress={onAccept} style={[styles.cta, pending && styles.disabled]}>
          <Text style={styles.ctaText}>Accept request</Text>
        </Pressable>
        <Pressable disabled={pending} onPress={onDecline} style={[styles.secondary, pending && styles.disabled]}>
          <Text style={styles.secondaryText}>Decline</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable disabled={pending} onPress={onConnect} style={[styles.cta, pending && styles.disabled]}>
      <Text style={styles.ctaText}>{pending ? 'Sending…' : 'Connect'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: { backgroundColor: colors.brand, borderRadius: radius.input, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  ctaText: { color: colors.card, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  row: { flexDirection: 'row', gap: spacing.sm },
  secondary: { borderColor: colors.lineWarm, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 8 },
  secondaryText: { color: colors.ink2, fontSize: 14, fontWeight: '600' },
});
