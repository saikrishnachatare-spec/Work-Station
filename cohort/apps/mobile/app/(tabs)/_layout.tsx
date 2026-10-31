import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNotifications } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'newspaper-outline',
  resources: 'library-outline',
  community: 'people-outline',
  work: 'briefcase-outline',
};

const TITLES: Record<string, string> = {
  index: 'Feed',
  resources: 'Resources',
  community: 'Community',
  work: 'Work',
};

export default function TabsLayout() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const notifications = useNotifications(userId);
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;

  return (
    <View style={styles.wrap}>
      <Tabs
        screenOptions={({ route }) => ({
          headerRight: () => (
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
              <Pressable
                accessibilityLabel="Account"
                onPress={() => router.push('/account')}
                style={styles.headerButton}
              >
                <Ionicons color={colors.ink} name="person-circle-outline" size={23} />
              </Pressable>
            </View>
          ),
          headerStyle: { backgroundColor: colors.cream },
          headerTitleStyle: { color: colors.brand, fontSize: 22, fontWeight: '800' },
          // See app/_layout.tsx: constant maxWidth keeps SSR HTML and client
          // hydration identical (fixes React error #418 on every route).
          headerTitleContainerStyle: { maxWidth: '100%' },
          sceneStyle: { backgroundColor: colors.cream },
          tabBarActiveTintColor: colors.brand,
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color as string} name={ICONS[route.name] ?? "ellipse-outline"} size={size} />
          ),
          tabBarInactiveTintColor: colors.ink3,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.lineWarm },
          title: TITLES[route.name] ?? route.name,
        })}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="resources" />
        <Tabs.Screen name="community" />
        <Tabs.Screen name="work" />
      </Tabs>

      <Link href="/create" asChild><Pressable
        accessibilityLabel="Create"
        accessibilityRole="button"
        hitSlop={10}
        style={styles.fab}
      >
        <Ionicons color="#ffffff" name="add" size={18} />
      </Pressable></Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  headerButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
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
  headerButtons: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingRight: spacing.sm,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.brandDeep,
    borderRadius: radius.pill,
    bottom: 68,
    elevation: 6,
    zIndex: 100,
    height: 38,
    justifyContent: 'center',
    opacity: 0.9,
    position: 'absolute',
    right: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    width: 38,
  },
});
