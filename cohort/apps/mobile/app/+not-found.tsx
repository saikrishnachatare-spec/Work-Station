/** Shown for any unmatched route (the web 404). */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type as typeScale } from '@/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons color={colors.brand} name="compass-outline" size={30} />
      </View>
      <Text style={styles.title}>This page wandered off</Text>
      <Text style={styles.body}>
        The link may be old, or the page may have moved. Head back home and pick up where you left off.
      </Text>
      <Link href="/" style={styles.link}>Back to your feed</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.ink2,
    fontSize: typeScale.body.fontSize,
    lineHeight: 20,
    marginTop: spacing.sm,
    maxWidth: 320,
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
  link: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    color: '#fff',
    fontWeight: '600',
    marginTop: spacing.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  title: { color: colors.ink, fontFamily: 'Georgia', fontSize: 24, marginTop: spacing.md },
  wrap: { alignItems: 'center', backgroundColor: colors.cream, flex: 1, justifyContent: 'center', padding: spacing.xl },
});
