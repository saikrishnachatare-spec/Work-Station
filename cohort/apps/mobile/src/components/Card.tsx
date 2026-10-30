import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.lineWarm,
    borderRadius: radius.card,
    borderWidth: 1,
    boxShadow: '0 10px 26px rgba(80,130,190,0.08)',
    gap: spacing.sm,
    padding: 14,
  },
});
