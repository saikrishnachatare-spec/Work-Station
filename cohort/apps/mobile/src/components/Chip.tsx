import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, type as typeScale } from '@/theme';

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export function Chip({ label, active = false, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active && styles.active]}
    >
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.card,
    borderColor: '#e7d9cf',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  active: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  label: {
    ...typeScale.caption,
    color: colors.ink2,
    fontWeight: '500',
  },
  activeLabel: {
    color: colors.brandDeep,
    fontWeight: '600',
  },
});
