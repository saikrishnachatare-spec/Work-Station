import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type as typeScale } from '@/theme';

export function ScreenHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

export function SectionTitle({ title, first = false }: { title: string; first?: boolean }) {
  return <Text style={[styles.section, !first && styles.sectionGap]}>{title}</Text>;
}

export function Pill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2, marginBottom: spacing.sm },
  title: { ...typeScale.screenTitle, color: colors.ink },
  sub: { ...typeScale.caption, color: colors.ink2 },
  section: { ...typeScale.sectionTitle, color: colors.ink },
  sectionGap: { marginTop: spacing.lg },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: { ...typeScale.pill, color: colors.brandDeep, textTransform: 'uppercase' },
});
