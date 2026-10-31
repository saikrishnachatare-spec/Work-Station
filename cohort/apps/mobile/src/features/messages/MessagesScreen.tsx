import { Link, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  timeAgo, useMarkThreadRead, useMyConnections, useProfiles, useSendMessage, useStartThread, useThreadMessages, useThreads,
} from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function MessagesScreen() {
  const toast = useToast();
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user?.id;
  const [openId, setOpenId] = useState<string | null>(null);
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  const [seenThread, setSeenThread] = useState<string | null>(null);
  // Deep link from a notification: adopt the thread param when it changes
  // (render-time state adjustment; avoids a setState-in-effect cascade).
  if (typeof thread === 'string' && thread && thread !== seenThread) {
    setSeenThread(thread);
    setOpenId(thread);
  }
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('');

  const threads = useThreads(userId);
  const profiles = useProfiles();
  const connections = useMyConnections(userId);
  const messages = useThreadMessages(openId);
  const openMsgCount = (messages.data ?? []).length;
  const markRead = useMarkThreadRead(userId);
  useEffect(() => {
    if (openId && openMsgCount > 0) markRead.mutate(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, openMsgCount]);
  const startThread = useStartThread(userId);
  const sendMessage = useSendMessage(userId);

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
          body="Sign in to message students, mentors and firms directly."
          icon="chatbubbles-outline"
          title="Messages need an account"
        />
      </View>
    );
  }

  const open = threads.data?.find((t) => t.id === openId);
  const counterpart = open?.otherUserId;

  const send = () => {
    const body = draft.trim();
    if (!body || !openId) return;
    setDraft('');
    sendMessage.mutate(
      { body, threadId: openId },
      { onError: () => toast.show('Message could not be sent. Try again.', 'error') },
    );
  };

  const startWith = (otherId: string, name: string) => {
    const body = draft.trim();
    setDraft('');
    startThread.mutate(
      { firstMessage: body, otherUserId: otherId },
      {
        onError: () => toast.show('Could not start the conversation. Try again.', 'error'),
        onSuccess: (threadId) => {
          setPicking(false);
          setOpenId(threadId);
          toast.show(`Conversation with ${name} started`, 'success');
        },
      },
    );
  };

  // Conversation view
  if (openId) {
    const title = open?.otherName ?? 'Conversation';
    return (
      <View style={styles.threadPage}>
        <Pressable onPress={() => setOpenId(null)} style={styles.backBtn}>
          <Ionicons color={colors.brand} name="chevron-back" size={16} />
          <Text style={styles.backText}>All messages</Text>
        </Pressable>
        <Card style={styles.threadHead}>
          <Avatar name={title} />
          <View>
            <Text style={styles.strong}>{title}</Text>
            <Text style={styles.meta}>Member</Text>
            {counterpart && <Link href={{pathname:'/safety',params:{type:'user',id:counterpart}}}>Report or block</Link>}
          </View>
        </Card>
        <ScrollView contentContainerStyle={styles.threadBody}>
          {messages.isLoading && <ListSkeleton count={1} />}
          {(messages.data ?? []).map((m) => (
            <Text key={m.id} style={[styles.bubble, m.sender_id === userId ? styles.you : styles.them]}>{m.body}</Text>
          ))}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Type a message…"
            placeholderTextColor={colors.ink3}
            returnKeyType="send"
            style={styles.input}
            value={draft}
          />
          <Pressable accessibilityLabel="Send" onPress={send} style={styles.sendBtn}>
            <Ionicons color={colors.brandDeep} name="send" size={15} />
          </Pressable>
        </View>
      </View>
    );
  }

  // Connection picker for a new conversation: only connected members can be messaged.
  if (picking) {
    const connectedIds = new Set(
      (connections.data ?? []).map((c) => (c.requester_id === userId ? c.addressee_id : c.requester_id)),
    );
    const others = (profiles.data ?? []).filter((p) => p.id !== userId && connectedIds.has(p.id));
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={() => setPicking(false)} style={styles.backBtn}>
          <Ionicons color={colors.brand} name="chevron-back" size={16} />
          <Text style={styles.backText}>Back to messages</Text>
        </Pressable>
        <ScreenHeader sub="Pick a connection to write to. Connect with members from their profiles first." title="New message" />
        <TextInput
          onChangeText={setDraft}
          placeholder="First message (optional)…"
          placeholderTextColor={colors.ink3}
          style={styles.input}
          value={draft}
        />
        {others.length === 0 && (
          <EmptyState
            body="Only connected members can be messaged. Visit a member's profile and tap Connect, or check your requests."
            icon="people-outline"
            title="No connections to message yet"
          />
        )}
        {others.map((p) => (
          <Pressable key={p.id} onPress={() => startWith(p.id, p.full_name || 'Member')}>
            <Card style={styles.convo}>
              <Avatar name={p.full_name || '?'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{p.full_name || 'Unnamed member'}</Text>
                <Text style={styles.meta}>{p.role === 'admin' ? 'Admin' : 'Member'}</Text>
              </View>
              <Ionicons color={colors.ink3} name="chatbubble-outline" size={16} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  // Thread list
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Students, mentors and firms, one tap away." title="Messages" />
      <Pressable onPress={() => setPicking(true)} style={styles.newBtn}>
        <Ionicons color={colors.brandDeep} name="add" size={15} />
        <Text style={styles.newBtnText}>New message</Text>
      </Pressable>
      {threads.isLoading && <ListSkeleton count={2} />}
      {threads.isError && (
        <EmptyState
          actionLabel="Try again"
          body="Conversations could not load. Check your connection and try again."
          icon="cloud-offline-outline"
          onAction={() => threads.refetch()}
          title="Could not load messages"
        />
      )}
      {!threads.isLoading && !threads.isError && (threads.data ?? []).length === 0 && (
        <EmptyState
          actionLabel="Start a conversation"
          body="When you message a student, mentor or firm, the conversation appears here."
          icon="chatbubbles-outline"
          onAction={() => setPicking(true)}
          title="No conversations yet"
        />
      )}
      {(threads.data ?? []).map((t) => (
        <Pressable key={t.id} onPress={() => setOpenId(t.id)}>
          <Card style={styles.convo}>
            <Avatar name={t.otherName} />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{t.otherName}</Text>
              <Text numberOfLines={1} style={styles.meta}>{t.lastMessage}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {t.lastAt ? <Text style={styles.meta}>{timeAgo(t.lastAt)}</Text> : null}
              {t.unread > 0 && (
                <View style={styles.unread}><Text style={styles.unreadText}>{t.unread > 99 ? '99+' : t.unread}</Text></View>
              )}
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  pageCenter: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  newBtn: {
    alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.brandSoft,
    borderRadius: radius.pill, flexDirection: 'row', gap: 6,
    paddingHorizontal: spacing.lg, paddingVertical: 9,
  },
  newBtnText: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600' },
  unread: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill,
    justifyContent: 'center', minWidth: 20, paddingHorizontal: 5, paddingVertical: 2,
  },
  unreadText: { color: colors.brandDeep, fontSize: 11, fontWeight: '700' },
  convo: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  threadPage: { flex: 1, gap: spacing.sm, padding: spacing.lg },
  backBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  threadHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  threadBody: { flexGrow: 1, gap: 6, paddingVertical: spacing.sm },
  bubble: {
    ...typeScale.body, borderRadius: radius.tile, maxWidth: '80%',
    overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8,
  },
  you: { alignSelf: 'flex-end', backgroundColor: colors.brandDeep, color: '#fff' },
  them: { alignSelf: 'flex-start', backgroundColor: colors.card, color: colors.ink },
  composer: { flexDirection: 'row', gap: spacing.sm },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, flex: 1, padding: 10,
  },
  sendBtn: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.input,
    justifyContent: 'center', paddingHorizontal: 14,
  },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
