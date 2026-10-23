import { StyleSheet, Text } from 'react-native';

import { colors, radius, type as typeScale } from '@/theme';

export type Role = 'student' | 'mentor' | 'firm' | 'moderator';

const LABELS: Record<Role, string> = {
  student: 'Student',
  mentor: 'Mentor',
  firm: 'Firm',
  moderator: 'Moderator',
};

export function RolePill({ role }: { role: Role }) {
  return <Text style={styles.pill}>{LABELS[role]}</Text>;
}

const styles = StyleSheet.create({
  pill: {
    ...typeScale.pill,
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    color: colors.brandDeep,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
});
