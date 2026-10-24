import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/Card';
import { ChannelsPanel } from '@/features/channels/ChannelsScreen';
import { Chip } from '@/components/Chip';
import { Pill, ScreenHeader } from '@/components/ScreenBits';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  useAddGroupToCommunity, useCommunities, useCommunityGroups, useCreateCommunity,
  useGroups, useMyGroups, useToggleGroup,
} from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function CommunityScreen() {
  const router = useRouter();
  const [view, setView] = useState('My groups');
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const groups = useGroups();
  const myGroups = useMyGroups(userId);
  const toggleGroup = useToggleGroup(userId);

  const mine = (id: string) => myGroups.data?.has(id) ?? false;
  const groupsView = view === 'My groups' || view === 'Discover';
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
        {['My groups', 'Discover', 'Communities', 'Channels'].map((v) => <Chip key={v} label={v} active={v === view} onPress={() => setView(v)} />)}
      </View>
      {view === 'Communities' && <CommunitiesPanel userId={userId} />}
      {view === 'Channels' && <ChannelsPanel />}
      {groupsView && groups.isLoading && <ListSkeleton count={3} />}
      {groupsView && groups.isError && (
        <EmptyState
          actionLabel="Try again"
          body="Circles could not load. Check your connection and try again."
          icon="cloud-offline-outline"
          onAction={() => groups.refetch()}
          title="Could not load circles"
        />
      )}
      {groupsView && !groups.isLoading && !groups.isError && list.length === 0 && (
        <EmptyState
          body={view === 'My groups' ? 'You have not joined any circles yet. Find one under Discover.' : 'No circles to discover right now.'}
          icon="people-outline"
          title={view === 'My groups' ? 'No circles yet' : 'Nothing to discover'}
        />
      )}
      {groupsView && list.map((g) => (
        <Card key={g.id} style={styles.card}>
          <Pressable
            disabled={!mine(g.id)}
            onPress={() => router.push({ params: { group: g.id, name: g.name }, pathname: '/group-chat' })}
            style={styles.cardTap}
          >
            <View style={styles.icon}><Ionicons color={colors.brand} name="people-outline" size={18} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.strong}>{g.name}</Text>
              <Text style={styles.meta}>{g.description}</Text>
              <View style={styles.tags}>
                <Pill label={g.purpose} />
                <Text style={styles.meta}>{g.member_count.toLocaleString('en-IN')} members</Text>
              </View>
            </View>
          </Pressable>
          {!mine(g.id) && (
            <Pressable onPress={() => toggle(g.id)} style={styles.btn}>
              <Text style={styles.btnText}>Join</Text>
            </Pressable>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}


function CommunitiesPanel({ userId }: { userId: string | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const communities = useCommunities();
  const groups = useGroups();
  const createCommunity = useCreateCommunity(userId);
  const addGroup = useAddGroupToCommunity(userId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const openGroups = useCommunityGroups(openId ?? undefined);

  const create = () => {
    const n = name.trim();
    if (!n) {
      toast.show('Name the community first', 'info');
      return;
    }
    createCommunity.mutate(
      { about: about.trim(), name: n },
      {
        onError: () => toast.show('Could not create the community. Try again.', 'error'),
        onSuccess: () => {
          toast.show('Community created', 'success');
          setCreating(false);
          setName('');
          setAbout('');
        },
      },
    );
  };

  const myCreatedGroups = (groups.data ?? []).filter((g) => g.created_by === userId);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.meta}>Communities bundle related groups in one place. Open one to see its groups.</Text>
      {userId && !creating && (
        <Pressable onPress={() => setCreating(true)} style={styles.chatBtn}>
          <Ionicons color={colors.brand} name="add" size={16} />
          <Text style={styles.chatBtnText}>Create a community</Text>
        </Pressable>
      )}
      {creating && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>New community</Text>
          <TextInput
            onChangeText={setName}
            placeholder="Community name"
            placeholderTextColor={colors.ink3}
            style={styles.input}
            value={name}
          />
          <TextInput
            multiline
            onChangeText={setAbout}
            placeholder="What is this community for? (optional)"
            placeholderTextColor={colors.ink3}
            style={styles.input}
            value={about}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable disabled={createCommunity.isPending} onPress={create} style={styles.btn}>
              <Text style={styles.btnText}>{createCommunity.isPending ? 'Creating…' : 'Create'}</Text>
            </Pressable>
            <Pressable onPress={() => setCreating(false)} style={styles.btnDone}>
              <Text style={styles.btnTextDone}>Cancel</Text>
            </Pressable>
          </View>
        </Card>
      )}
      {communities.isLoading && <ListSkeleton count={2} />}
      {!communities.isLoading && (communities.data ?? []).length === 0 && (
        <EmptyState
          body="No communities yet. Create one and bundle your groups inside it."
          icon="people-circle-outline"
          title="No communities yet"
        />
      )}
      {(communities.data ?? []).map((c) => {
        const isOpen = openId === c.id;
        const bundled = openGroups.data ?? [];
        const addable = myCreatedGroups.filter((g) => !bundled.some((b) => b.id === g.id));
        return (
          <Card key={c.id} style={{ gap: spacing.sm }}>
            <Pressable onPress={() => setOpenId(isOpen ? null : c.id)} style={styles.card}>
              <View style={styles.icon}><Ionicons color={colors.brand} name="people-circle-outline" size={18} /></View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.strong}>{c.name}</Text>
                {!!c.about && <Text style={styles.meta}>{c.about}</Text>}
              </View>
              <Ionicons color={colors.ink3} name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
            </Pressable>
            {isOpen && (
              <View style={{ gap: spacing.sm }}>
                {openGroups.isLoading && <ListSkeleton count={1} />}
                {!openGroups.isLoading && bundled.length === 0 && (
                  <Text style={styles.meta}>No groups in this community yet.</Text>
                )}
                {bundled.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => router.push({ params: { group: g.id, name: g.name }, pathname: '/group-chat' })}
                    style={styles.chatBtn}
                  >
                    <Ionicons color={colors.brand} name="chatbubbles-outline" size={13} />
                    <Text style={styles.chatBtnText}>{g.name} - open group chat</Text>
                  </Pressable>
                ))}
                {userId === c.created_by && addable.length > 0 && (
                  <View style={{ gap: 4 }}>
                    <Text style={styles.meta}>Add one of your groups:</Text>
                    {addable.map((g) => (
                      <Pressable
                        key={g.id}
                        disabled={addGroup.isPending}
                        onPress={() =>
                          addGroup.mutate(
                            { communityId: c.id, groupId: g.id },
                            { onError: () => toast.show('Could not add that group. Try again.', 'error') },
                          )
                        }
                        style={styles.chatBtn}
                      >
                        <Ionicons color={colors.brand} name="add-circle-outline" size={14} />
                        <Text style={styles.chatBtnText}>{g.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  chips: { flexDirection: 'row', gap: spacing.sm },
  card: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  cardTap: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
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
  chatBtn: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingVertical: 3 },
  chatBtnText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  input: {
    ...typeScale.body, backgroundColor: colors.cream, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, padding: 10,
  },
});
