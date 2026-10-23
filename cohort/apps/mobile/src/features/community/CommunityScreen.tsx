import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Pill, ScreenHeader } from '@/components/ScreenBits';
import { updateDemo, useDemo } from '@/store/demo';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function CommunityScreen() {
  const [view, setView] = useState('My groups');
  const groups = useDemo((s) => s.groups);
  const list = groups.filter((g) => (view === 'My groups' ? g.mine : !g.mine));

  const toggle = (id: string) =>
    updateDemo({
      groups: groups.map((g) =>
        g.id === id ? { ...g, mine: !g.mine, members: g.members + (g.mine ? -1 : 1) } : g),
    });

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Groups with fellow students, mentors or anyone. Start a new one from the + button." title="Community" />
      <View style={styles.chips}>
        {['My groups', 'Discover'].map((v) => <Chip key={v} label={v} active={v === view} onPress={() => setView(v)} />)}
      </View>
      {list.length === 0 && (
        <Card><Text style={styles.meta}>No groups here yet. Tap + to create one, or join from Discover.</Text></Card>
      )}
      {list.map((g) => (
        <Card key={g.id} style={styles.card}>
          <View style={styles.icon}><Ionicons color={colors.brand} name="people-outline" size={18} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.strong}>{g.name}</Text>
            <Text style={styles.meta}>{g.desc}</Text>
            <View style={styles.tags}>
              <Pill label={g.purpose} />
              <Text style={styles.meta}>{g.members.toLocaleString('en-IN')} members</Text>
            </View>
          </View>
          <Pressable onPress={() => toggle(g.id)} style={[styles.btn, g.mine && styles.btnDone]}>
            <Text style={[styles.btnText, g.mine && styles.btnTextDone]}>{g.mine ? 'Joined' : 'Join'}</Text>
          </Pressable>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  chips: { flexDirection: 'row', gap: spacing.sm },
  card: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  icon: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: 10,
    height: 38, justifyContent: 'center', width: 38,
  },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  tags: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  btn: {
    backgroundColor: colors.brand, borderColor: colors.brand, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7,
  },
  btnDone: { backgroundColor: colors.card },
  btnText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  btnTextDone: { color: colors.brand },
});
