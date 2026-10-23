import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  getGroupInviteLink, useAddGroupMembers, useGroupMembers, useGroupThread, useLeaveGroup,
  useProfiles, useSendMessage, useThreadMessages,
} from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

type Props = { groupId: string; groupName: string };

export function GroupChatScreen({ groupId, groupName }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const thread = useGroupThread(groupId, userId);
  const threadId = thread.data ?? null;
  const messages = useThreadMessages(threadId);
  const sendMessage = useSendMessage(userId);
  const profiles = useProfiles();
  const members = useGroupMembers(groupId);
  const addMembers = useAddGroupMembers(userId);
  const leaveGroup = useLeaveGroup(userId);

  const nameOf = (id: string | null) =>
    (profiles.data ?? []).find((p) => p.id === id)?.full_name || 'Member';

  const send = () => {
    const body = draft.trim();
    if (!body || !threadId) return;
    setDraft('');
    sendMessage.mutate(
      { body, threadId },
      { onError: () => toast.show('Message could not be sent. Try again.', 'error') },
    );
  };

  const shareLink = async () => {
    if (!userId) return;
    try {
      const link = await getGroupInviteLink(groupId, userId);
      if (Platform.OS === 'web') {
        try {
          await navigator.clipboard.writeText(link);
          toast.show('Invite link copied - share it anywhere', 'success');
        } catch {
          toast.show(link, 'info');
        }
      } else {
        await Share.share({ message: `Join my Cohort group "${groupName}": ${link}` });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      toast.show(`Could not create the invite link.${detail ? ` ${detail}` : ''}`, 'error');
    }
  };


  const confirmLeave = () => {
    const doLeave = () =>
      leaveGroup.mutate(groupId, {
        onError: (err) => toast.show(err instanceof Error ? err.message : 'Could not leave the group. Try again.', 'error'),
        onSuccess: () => {
          toast.show(`You left ${groupName}`, 'success');
          router.back();
        },
      });
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Leave ${groupName}? You will stop receiving its messages.`)) doLeave();
    } else {
      Alert.alert('Leave group', `Leave ${groupName}? You will stop receiving its messages.`, [
        { style: 'cancel', text: 'Cancel' },
        { onPress: doLeave, style: 'destructive', text: 'Leave' },
      ]);
    }
  };

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addPicked = () => {
    addMembers.mutate(
      { groupId, memberIds: [...picked] },
      {
        onError: () => toast.show('Could not add people. Try again.', 'error'),
        onSuccess: () => {
          toast.show(picked.size === 1 ? 'Person added to the group' : `${picked.size} people added to the group`, 'success');
          setPicked(new Set());
          setAdding(false);
          members.refetch();
        },
      },
    );
  };

  if (adding) {
    const existing = new Set(members.data ?? []);
    const candidates = (profiles.data ?? []).filter((p) => !existing.has(p.id));
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={() => setAdding(false)} style={styles.backBtn}>
          <Ionicons color={colors.brand} name="chevron-back" size={16} />
          <Text style={styles.backText}>Back to group chat</Text>
        </Pressable>
        <Text style={styles.title}>Add people to {groupName}</Text>
        <Text style={styles.meta}>Pick members to add. They can leave anytime.</Text>
        {candidates.length === 0 && (
          <EmptyState
            body="Everyone on Cohort is already in this group. Share the invite link to bring new people in."
            icon="people-outline"
            title="Nobody left to add"
          />
        )}
        {candidates.map((p) => (
          <Pressable key={p.id} onPress={() => togglePick(p.id)}>
            <Card style={styles.convo}>
              <Avatar name={p.full_name || '?'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{p.full_name || 'Unnamed member'}</Text>
                <Text style={styles.meta}>{p.role === 'admin' ? 'Admin' : 'Member'}</Text>
              </View>
              <Ionicons
                color={picked.has(p.id) ? colors.brand : colors.ink3}
                name={picked.has(p.id) ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
              />
            </Card>
          </Pressable>
        ))}
        {picked.size > 0 && (
          <Pressable disabled={addMembers.isPending} onPress={addPicked} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>
              {addMembers.isPending ? 'Adding…' : `Add ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.threadPage}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons color={colors.brand} name="chevron-back" size={16} />
        <Text style={styles.backText}>Community</Text>
      </Pressable>
      <Card style={styles.threadHead}>
        <Avatar name={groupName} />
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>{groupName}</Text>
          <Text style={styles.meta}>Group chat - {(members.data ?? []).length} members</Text>
        </View>
        <Pressable accessibilityLabel="Add people" onPress={() => setAdding(true)} style={styles.iconBtn}>
          <Ionicons color={colors.brand} name="person-add-outline" size={18} />
        </Pressable>
        <Pressable accessibilityLabel="Share invite link" onPress={shareLink} style={styles.iconBtn}>
          <Ionicons color={colors.brand} name="link-outline" size={18} />
        </Pressable>
        <Pressable accessibilityLabel="Leave group" disabled={leaveGroup.isPending} onPress={confirmLeave} style={styles.iconBtn}>
          <Ionicons color={colors.danger} name="log-out-outline" size={18} />
        </Pressable>
      </Card>
      {thread.isLoading && <ListSkeleton count={1} />}
      <ScrollView contentContainerStyle={styles.threadBody}>
        {messages.isLoading && <ListSkeleton count={1} />}
        {!messages.isLoading && (messages.data ?? []).length === 0 && (
          <EmptyState
            body="Say hello to get the conversation going. Everyone in the group can read and reply."
            icon="chatbubbles-outline"
            title="No messages yet"
          />
        )}
        {(messages.data ?? []).map((m) => (
          <View key={m.id} style={m.sender_id === userId ? styles.youWrap : styles.themWrap}>
            {m.sender_id !== userId && <Text style={styles.senderName}>{nameOf(m.sender_id)}</Text>}
            <Text style={[styles.bubble, m.sender_id === userId ? styles.you : styles.them]}>{m.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          onChangeText={setDraft}
          onSubmitEditing={send}
          placeholder={`Message ${groupName}…`}
          placeholderTextColor={colors.ink3}
          returnKeyType="send"
          style={styles.input}
          value={draft}
        />
        <Pressable accessibilityLabel="Send" onPress={send} style={styles.sendBtn}>
          <Ionicons color="#fff" name="send" size={15} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  threadPage: { flex: 1, gap: spacing.sm, padding: spacing.lg },
  backBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  threadHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  iconBtn: { padding: 6 },
  threadBody: { flexGrow: 1, gap: 6, paddingVertical: spacing.sm },
  youWrap: { alignItems: 'flex-end', gap: 1 },
  themWrap: { alignItems: 'flex-start', gap: 1 },
  senderName: { ...typeScale.caption, color: colors.ink3, marginLeft: 4 },
  bubble: {
    ...typeScale.body, borderRadius: radius.tile, maxWidth: '80%',
    overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8,
  },
  you: { alignSelf: 'flex-end', backgroundColor: colors.brand, color: '#fff' },
  them: { alignSelf: 'flex-start', backgroundColor: colors.card, color: colors.ink },
  composer: { flexDirection: 'row', gap: spacing.sm },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, flex: 1, padding: 10,
  },
  sendBtn: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.input,
    justifyContent: 'center', paddingHorizontal: 14,
  },
  convo: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  primaryBtn: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingVertical: 12,
  },
  primaryBtnText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  title: { ...typeScale.screenTitle, color: colors.ink },
});
