import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  getGroupInviteLink, useAddGroupMembers, useGroup, useGroupMemberRows, useGroupMembers, useGroupThread,
  useLeaveGroup, useMarkThreadRead, useProfiles, useRemoveGroupMember, useSendMessage, useSetGroupMemberRole,
  useThreadMessages,
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
  const [managing, setManaging] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const thread = useGroupThread(groupId, userId);
  const threadId = thread.data ?? null;
  const messages = useThreadMessages(threadId);
  const sendMessage = useSendMessage(userId);
  const profiles = useProfiles();
  const members = useGroupMembers(groupId);
  const memberRows = useGroupMemberRows(groupId);
  const group = useGroup(groupId);
  const setMemberRole = useSetGroupMemberRole(groupId);
  const removeMember = useRemoveGroupMember(groupId);
  const isCreator = !!userId && group.data?.created_by === userId;
  const isChannel = group.data?.kind === 'channel';
  const myRole = (memberRows.data ?? []).find((r) => r.user_id === userId)?.role;
  const canManage = isCreator || myRole === 'admin';
  const canPost = !isChannel || canManage;
  const addMembers = useAddGroupMembers(userId);
  const leaveGroup = useLeaveGroup(userId);
  const markRead = useMarkThreadRead(userId);
  const msgCount = (messages.data ?? []).length;
  useEffect(() => {
    if (threadId && msgCount > 0) markRead.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, msgCount]);

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
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/community');
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

  if (adding && canManage) {
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

  if (managing && canManage) {
    const creatorId = group.data?.created_by;
    const rows = [...(memberRows.data ?? [])].sort((a, b) =>
      (a.user_id === creatorId ? -1 : b.user_id === creatorId ? 1 : a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1));
    const changeRole = (memberId: string, role: 'admin' | 'member') => {
      setMemberRole.mutate({ memberId, role }, {
        onError: () => toast.show('Could not change that role. Only group admins can manage members.', 'error'),
      });
    };
    const remove = (memberId: string) => {
      const doRemove = () => removeMember.mutate(memberId, {
        onError: () => toast.show('Could not remove that member. Try again.', 'error'),
      });
      if (Platform.OS === 'web') {
        if (window.confirm(`Remove ${nameOf(memberId)} from the group?`)) doRemove();
      } else {
        Alert.alert('Remove member', `Remove ${nameOf(memberId)} from the group?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ]);
      }
    };
    return (
      <View style={styles.threadPage}>
        <Pressable onPress={() => setManaging(false)} style={styles.backBtn}>
          <Ionicons color={colors.brand} name="chevron-back" size={16} />
          <Text style={styles.backText}>Back to chat</Text>
        </Pressable>
        <Text style={styles.meta}>
          The group creator is always an admin. Admins can make other members admins or remove them.
        </Text>
        <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
          {rows.map((r) => {
            const isCreatorRow = r.user_id === creatorId;
            const isSelf = r.user_id === userId;
            return (
              <Card key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Avatar name={nameOf(r.user_id)} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{nameOf(r.user_id)}{isSelf ? ' (you)' : ''}</Text>
                  <Text style={styles.meta}>{isCreatorRow ? 'Creator' : r.role === 'admin' ? 'Admin' : 'Member'}</Text>
                </View>
                {!isCreatorRow && !isSelf && (
                  <>
                    <Pressable
                      disabled={setMemberRole.isPending}
                      onPress={() => changeRole(r.user_id, r.role === 'admin' ? 'member' : 'admin')}
                      style={styles.primaryBtn}
                    >
                      <Text style={styles.primaryBtnText}>{r.role === 'admin' ? 'Remove admin' : 'Make admin'}</Text>
                    </Pressable>
                    <Pressable disabled={removeMember.isPending} onPress={() => remove(r.user_id)} style={styles.iconBtn}>
                      <Ionicons color={colors.danger} name="person-remove-outline" size={18} />
                    </Pressable>
                  </>
                )}
              </Card>
            );
          })}
        </ScrollView>
      </View>
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
        {canManage && (
          <Pressable accessibilityLabel="Manage members" onPress={() => setManaging(true)} style={styles.iconBtn}>
            <Ionicons color={colors.brand} name="people-outline" size={18} />
          </Pressable>
        )}
        {canManage && (
          <Pressable accessibilityLabel="Add people" onPress={() => setAdding(true)} style={styles.iconBtn}>
            <Ionicons color={colors.brand} name="person-add-outline" size={18} />
          </Pressable>
        )}
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
        {(messages.data ?? []).map((m, i, arr) => {
          const day = new Date(m.created_at).toDateString();
          const showDay = i === 0 || new Date(arr[i - 1].created_at).toDateString() !== day;
          const mine = m.sender_id === userId;
          const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <View key={m.id} style={{ gap: 6 }}>
              {showDay && (
                <View style={styles.dayPillWrap}>
                  <Text style={styles.dayPill}>
                    {new Date(m.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              )}
              <View style={mine ? styles.youWrap : styles.themWrap}>
                {!mine && <Text style={styles.senderName}>{nameOf(m.sender_id)}</Text>}
                <View style={[styles.bubble, mine ? styles.you : styles.them]}>
                  <Text style={mine ? styles.youText : styles.themText}>{m.body}</Text>
                  <Text style={[styles.msgTime, mine ? styles.msgTimeYou : styles.msgTimeThem]}>{time}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {isChannel && !canPost && (
        <Text style={styles.meta}>This is a channel - only channel admins can post. You can read every update here.</Text>
      )}
      {canPost && (
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
          <Ionicons color={colors.brandDeep} name="send" size={15} />
        </Pressable>
      </View>
      )}
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
    borderBottomRightRadius: 4, borderRadius: radius.tile, maxWidth: '80%',
    overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8,
  },
  you: { alignSelf: 'flex-end', backgroundColor: colors.brandDeep, borderBottomRightRadius: 4, borderBottomLeftRadius: radius.tile },
  them: { alignSelf: 'flex-start', backgroundColor: colors.card, borderBottomLeftRadius: 4, borderBottomRightRadius: radius.tile },
  youText: { ...typeScale.body, color: '#fff' },
  themText: { ...typeScale.body, color: colors.ink },
  msgTime: { ...typeScale.caption, alignSelf: 'flex-end', fontSize: 10, marginTop: 2 },
  msgTimeYou: { color: 'rgba(255,255,255,0.75)' },
  msgTimeThem: { color: colors.ink3 },
  dayPillWrap: { alignItems: 'center', marginVertical: 4 },
  dayPill: { ...typeScale.caption, backgroundColor: colors.card, borderRadius: radius.pill, color: colors.ink3, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
  composer: { flexDirection: 'row', gap: spacing.sm },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, flex: 1, padding: 10,
  },
  sendBtn: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.input,
    justifyContent: 'center', paddingHorizontal: 14,
  },
  convo: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  primaryBtn: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill,
    paddingVertical: 12,
  },
  primaryBtnText: { ...typeScale.body, color: colors.brandDeep, fontWeight: '600' },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  title: { ...typeScale.screenTitle, color: colors.ink },
});
