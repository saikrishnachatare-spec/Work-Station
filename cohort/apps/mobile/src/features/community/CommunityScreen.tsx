import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Pill, ScreenHeader } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useGroups, useMyGroups, useToggleGroup } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function CommunityScreen() {
  const [view, setView] = useState('My groups');
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const groups = useGroups();
  const myGroups = useMyGroups(userId);
  const toggleGroup = useToggleGroup(userId);

  const mine = (id: string) => myGroups.data?.has(id) ?? false;
  const list = (groups.data ?? []).filter((g) => (view === 'My groups' ? mine(g.id) : !mine(g.id)));

  const toggle = (id: string) => {
    if (!userId) {
      toast.show('Sign in to join circles', 'info');
      return;
    }
    toggleGroup.mutate(
      { groupId: id, member: mine(id) },
      {
        onError: () => toast.show('Could not update membership. Try again.', 'error'),
        onSuccess: () => toast.show(mine(id) ? 'Left the circle' : 'Joined the circle', 'success'),
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Groups with fellow students, mentors or anyone. Start a new one from the + button." title="Community" />
      <View style={styles.chips}>
        {['My groups', 'Discover'].map((v) => <Chip key={v} label={v} active={v === view} onPress={() => setView(v)} />)}
      </View>
      {groups.isLoading && <ListSkeleton count={3} />}
      {groups.isError && (
        <EmptyState
          actionLabel="Try again"
          body="Circles could not load. Check your connection and try again."
          icon="cloud-offline-outline"
          onAction={() => groups.refetch()}
          title="Could not load circles"
        />
      )}
      {!groups.isLoading && !groups.isError && list.length === 0 && (
        <EmptyState
          body={view === 'My groups' ? 'You have not joined any circles yet. Find one under Discover.' : 'No circles to discover right now.'}
          icon="people-outline"
          title={view === 'My groups' ? 'No circles yet' : 'Nothing to discover'}
        />
      )}
      {list.map((g) => (
        <Card key={g.id} style={styles.card}>
          <View style={styles.icon}><Ionicons color={colors.brand} name="people-outline" size={18} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.strong}>{g.name}</Text>
            <Text style={styles.meta}>{g.description}</Text>
            <View style={styles.tags}>
              <Pill label={g.purpose} />
              <Text style={styles.meta}>{g.member_count.toLocaleString('en-IN')} members</Text>
            </View>
          </View>
          <Pressable onPress={() => toggle(g.id)} style={[styles.btn, mine(g.id) && styles.btnDone]}>
            <Text style={[styles.btnText, mine(g.id) && styles.btnTextDone]}>{mine(g.id) ? 'Joined' : 'Join'}</Text>
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
