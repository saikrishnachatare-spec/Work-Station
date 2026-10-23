import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type as typeScale } from '@/theme';

const ACTIONS = [
  { icon: 'create-outline', label: 'Post' },
  { icon: 'people-circle-outline', label: 'Group' },
  { icon: 'briefcase-outline', label: 'Job opening' },
  { icon: 'chatbubble-outline', label: 'Message' },
  { icon: 'cloud-upload-outline', label: 'Resource' },
] as const;

/** The one + button: a sheet with all five create actions, over any screen. */
export default function CreateModal() {
  const router = useRouter();

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.backdrop} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {ACTIONS.map((action) => (
          <Pressable
            accessibilityRole="button"
            key={action.label}
            onPress={() => router.back()}
            style={styles.action}
          >
            <View style={styles.iconWrap}>
              <Ionicons color={colors.brandDeep} name={action.icon} size={20} />
            </View>
            <Text style={styles.label}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(37, 31, 33, 0.35)',
  },
  sheet: {
    backgroundColor: colors.cream,
    borderTopColor: colors.lineWarm,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.ink4,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.sm,
    width: 36,
  },
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.input,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  label: {
    ...typeScale.body,
    color: colors.ink,
    fontWeight: '500',
  },
});
