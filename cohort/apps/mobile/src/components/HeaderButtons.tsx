import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNotifications } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

/** Shared top-right header actions for the tab screens: search, messages and
 * notifications. Profile lives in the bottom tab bar; its own settings menu
 * sits next to these on the Profile tab. */
export function HeaderButtons() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const notifications = useNotifications(userId);
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;

  return (
    <View style={styles.headerButtons}>
      <Pressable
        accessibilityLabel="Search"
        onPress={() => router.push('/search')}
        style={styles.headerButton}
      >
        <Ionicons color={colors.ink} name="search" size={21} />
      </Pressable>
      <Pressable
        accessibilityLabel="Messages"
        onPress={() => router.push('/messages')}
        style={styles.headerButton}
      >
        <Ionicons color={colors.ink} name="chatbubble-ellipses-outline" size={21} />
      </Pressable>
      <Pressable
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={() => router.push('/notifications')}
        style={styles.headerButton}
      >
        <View>
          <Ionicons color={colors.ink} name="notifications-outline" size={21} />
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    height: 15,
    justifyContent: 'center',
    minWidth: 15,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -6,
    top: -4,
  },
  badgeText: {
    ...typeScale.pill,
    color: '#ffffff',
  },
  headerButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  headerButtons: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingRight: spacing.xs,
  },
});
