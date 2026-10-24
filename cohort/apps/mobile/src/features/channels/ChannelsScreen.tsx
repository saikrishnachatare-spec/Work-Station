import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/Card';
import { Pill, ScreenHeader } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useChannels, useCreateChannel, useMyGroups, useToggleGroup } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function ChannelsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const channels = useChannels();
  const myGroups = useMyGroups(userId);
  const toggleGroup = useToggleGroup(userId);
  const createChannel = useCreateChannel(userId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');

  const mine = (id: string) => myGroups.data?.has(id) ?? false;

  const toggle = (id: string) => {
    if (!userId) {
      toast.show('Sign in to follow channels', 'info');
      return;
    }
    toggleGroup.mutate(
      { groupId: id, member: mine(id) },
      {
        onError: () => toast.show('Could not update. Try again.', 'error'),
        onSuccess: () => toast.show(mine(id) ? 'Unfollowed the channel' : 'Following the channel', 'success'),
      },
    );
  };

  const create = () => {
    const n = name.trim();
    if (!n) {
      toast.show('Name the channel first', 'info');
      return;
    }
    createChannel.mutate(
      { name: n, purpose: purpose.trim() },
      {
        onError: () => toast.show('Could not create the channel. Try again.', 'error'),
        onSuccess: (g) => {
          toast.show('Channel created', 'success');
          setCreating(false);
          setName('');
          setPurpose('');
          router.push({ params: { group: g.id, name: g.name }, pathname: '/group-chat' });
        },
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="One-way updates from admins and creators. Follow a channel to read every post." title="Channels" />
      {userId && !creating && (
        <Pressable onPress={() => setCreating(true)} style={styles.newBtn}>
          <Ionicons color={colors.brand} name="add" size={16} />
          <Text style={styles.newBtnText}>Start a channel</Text>
        </Pressable>
      )}
      {creating && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>New channel</Text>
          <TextInput
            onChangeText={setName}
            placeholder="Channel name"
            placeholderTextColor={colors.ink3}
            style={styles.input}
            value={name}
          />
          <TextInput
            onChangeText={setPurpose}
            placeholder="What will you post here? (optional)"
            placeholderTextColor={colors.ink3}
            style={styles.input}
            value={purpose}
          />
          <View style={styles.row}>
            <Pressable disabled={createChannel.isPending} onPress={create} style={styles.btn}>
              <Text style={styles.btnText}>{createChannel.isPending ? 'Creating…' : 'Create channel'}</Text>
            </Pressable>
            <Pressable onPress={() => setCreating(false)} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </Card>
      )}
      {channels.isLoading && <ListSkeleton count={2} />}
      {channels.isError && (
        <EmptyState
          actionLabel="Try again"
          body="Channels could not load. Check your connection and try again."
          icon="cloud-offline-outline"
          onAction={() => channels.refetch()}
          title="Could not load channels"
        />
      )}
      {!channels.isLoading && !channels.isError && (channels.data ?? []).length === 0 && (
        <EmptyState
          body="No channels yet. Start one to broadcast updates to everyone who follows."
          icon="megaphone-outline"
          title="No channels yet"
        />
      )}
      {(channels.data ?? []).map((c) => (
        <Card key={c.id} style={styles.card}>
          <View style={styles.icon}><Ionicons color={colors.brand} name="megaphone-outline" size={18} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.strong}>{c.name}</Text>
            {!!c.purpose && <Text style={styles.meta}>{c.purpose}</Text>}
            <View style={styles.tags}>
              <Pill label="Channel" />
              <Text style={styles.meta}>{c.member_count.toLocaleString('en-IN')} followers</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Pressable onPress={() => toggle(c.id)} style={[styles.btn, mine(c.id) && styles.btnDone]}>
              <Text style={[styles.btnText, mine(c.id) && styles.btnTextDone]}>{mine(c.id) ? 'Following' : 'Follow'}</Text>
            </Pressable>
            {mine(c.id) && (
              <Pressable
                onPress={() => router.push({ params: { group: c.id, name: c.name }, pathname: '/group-chat' })}
                style={styles.chatBtn}
              >
                <Ionicons color={colors.brand} name="megaphone-outline" size={13} />
                <Text style={styles.chatBtnText}>Open channel</Text>
              </Pressable>
            )}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
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
  ghostBtn: { borderColor: colors.brand, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  ghostBtnText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  chatBtn: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingVertical: 3 },
  chatBtnText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  input: {
    ...typeScale.body, backgroundColor: colors.cream, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, padding: 10,
  },
  newBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  newBtnText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm },
});
