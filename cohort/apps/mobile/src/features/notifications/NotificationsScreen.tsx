import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import {
  timeAgo,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const KIND_ICONS: Record<Notification['kind'], keyof typeof Ionicons.glyphMap> = {
  message: 'chatbubble-ellipses-outline',
  comment: 'chatbox-outline',
  application_status: 'briefcase-outline',
  connection_request: 'person-add-outline',
  connection_accepted: 'people-outline',
  job_match: 'briefcase-outline',
  system: 'warning-outline',
};

export function NotificationsScreen() {
  const router = useRouter();
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user?.id;
  const notifications = useNotifications(userId);
  const markRead = useMarkNotificationRead(userId);
  const markAllRead = useMarkAllNotificationsRead(userId);

  if (authLoading) {
    return (
      <View style={styles.pageCenter}>
        <ListSkeleton count={2} />
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.pageCenter}>
        <EmptyState
          body="Sign in to see messages, replies and application updates."
          icon="notifications-outline"
          title="Notifications need an account"
        />
      </View>
    );
  }

  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const open = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.link) router.push(n.link as never);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader
        sub="Messages, replies and application updates."
        title="Notifications"
      />
      {unread > 0 ? (
        <Pressable
          accessibilityLabel="Mark all as read"
          accessibilityRole="button"
          disabled={markAllRead.isPending}
          onPress={() => markAllRead.mutate()}
          style={styles.markAll}
        >
          <Text style={styles.markAllText}>Mark all as read ({unread})</Text>
        </Pressable>
      ) : null}
      {notifications.isLoading ? <ListSkeleton count={3} /> : null}
      {!notifications.isLoading && items.length === 0 ? (
        <EmptyState
          body="When someone messages you, replies to your post, or updates your application, it shows up here."
          icon="notifications-outline"
          title="Nothing yet"
        />
      ) : null}
      {items.map((n) => (
        <Pressable
          accessibilityLabel={n.title}
          accessibilityRole="button"
          key={n.id}
          onPress={() => open(n)}
        >
          <Card style={[styles.item, !n.read_at ? styles.itemUnread : null]}>
            <View style={styles.iconWrap}>
              <Ionicons color={colors.brand} name={KIND_ICONS[n.kind] ?? 'notifications-outline'} size={20} />
            </View>
            <View style={styles.itemBody}>
              <Text numberOfLines={1} style={styles.itemTitle}>{n.title}</Text>
              <Text numberOfLines={2} style={styles.itemText}>{n.body}</Text>
              <Text style={styles.itemTime}>{timeAgo(n.created_at)}</Text>
            </View>
            {!n.read_at ? <View style={styles.unreadDot} /> : null}
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  pageCenter: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  markAll: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  markAllText: {
    color: colors.brand,
    ...typeScale.caption,
    fontWeight: '600',
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  itemUnread: {
    borderColor: colors.brand,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: colors.ink,
    ...typeScale.body,
    fontWeight: '700',
  },
  itemText: {
    color: colors.ink2,
    ...typeScale.caption,
  },
  itemTime: {
    color: colors.ink3,
    ...typeScale.pill,
  },
  unreadDot: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
});
