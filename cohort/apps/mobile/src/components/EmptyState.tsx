/** Friendly empty state: icon, title, explanation and an optional action. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type as typeScale } from '@/theme';

type EmptyStateProps = {
  actionLabel?: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  title: string;
};

export function EmptyState({ actionLabel, body, icon = 'file-tray-outline', onAction, title }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons color={colors.brand} name={icon} size={28} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  actionText: { color: '#fff', fontSize: typeScale.body.fontSize, fontWeight: '600' },
  body: {
    color: colors.ink2,
    fontSize: typeScale.body.fontSize,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  title: { color: colors.ink, fontSize: typeScale.sectionTitle.fontSize, fontWeight: '700', marginTop: spacing.md },
  wrap: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.lineWarm,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.xl,
  },
});
