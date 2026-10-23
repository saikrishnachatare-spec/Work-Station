import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type as typeScale } from '@/theme';

type ScreenPlaceholderProps = {
  title: string;
  subtitle: string;
};

/** Placeholder body for shell screens until each feature lands. */
export function ScreenPlaceholder({ title, subtitle }: ScreenPlaceholderProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typeScale.screenTitle,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    ...typeScale.body,
    color: colors.ink2,
    textAlign: 'center',
  },
});
