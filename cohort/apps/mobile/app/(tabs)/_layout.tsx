import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'newspaper-outline',
  resources: 'library-outline',
  community: 'people-outline',
  work: 'briefcase-outline',
  icai: 'school-outline',
};

const TITLES: Record<string, string> = {
  index: 'Feed',
  resources: 'Resources',
  community: 'Community',
  work: 'Work',
  icai: 'ICAI',
};

export default function TabsLayout() {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Tabs
        screenOptions={({ route }) => ({
          headerRight: () => (
            <Pressable
              accessibilityLabel="Messages"
              onPress={() => router.push('/messages')}
              style={styles.messagesButton}
            >
              <Ionicons color={colors.ink} name="chatbubble-ellipses-outline" size={22} />
            </Pressable>
          ),
          headerStyle: { backgroundColor: colors.cream },
          headerTitleStyle: { color: colors.brand, fontFamily: 'Georgia', fontSize: 22 },
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
        <Tabs.Screen name="icai" />
      </Tabs>

      <Pressable
        accessibilityLabel="Create"
        onPress={() => router.push('/create')}
        style={styles.fab}
      >
        <Ionicons color="#ffffff" name="add" size={28} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  messagesButton: {
    paddingHorizontal: spacing.lg,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    bottom: spacing.xl,
    elevation: 4,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    width: 56,
  },
});
