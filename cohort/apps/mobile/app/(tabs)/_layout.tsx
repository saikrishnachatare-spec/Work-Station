import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { HeaderButtons } from '@/components/HeaderButtons';
import { colors, radius, spacing } from '@/theme';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'newspaper-outline',
  resources: 'library-outline',
  community: 'people-outline',
  work: 'briefcase-outline',
  profile: 'person-outline',
};

const TITLES: Record<string, string> = {
  index: 'Feed',
  resources: 'Resources',
  community: 'Community',
  work: 'Work',
  profile: 'Profile',
};

export default function TabsLayout() {
  return (
    <View style={styles.wrap}>
      <Tabs
        screenOptions={({ route }) => ({
          headerRight: () => <HeaderButtons />,
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
        <Tabs.Screen name="index" options={{ title: 'Cohort', tabBarLabel: 'Feed' }} />
        <Tabs.Screen name="resources" />
        <Tabs.Screen name="community" />
        <Tabs.Screen name="work" />
        <Tabs.Screen name="profile" />
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
