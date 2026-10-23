import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ScreenHeader } from '@/components/ScreenBits';
import { THREADS, type ThreadMsg } from '@/lib/demo-data';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function MessagesScreen() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, ThreadMsg[]>>({});
  const [draft, setDraft] = useState('');
  const open = THREADS.find((t) => t.id === openId);

  if (open) {
    const msgs = [...open.thread, ...(extra[open.id] || [])];
    const send = () => {
      const t = draft.trim();
      if (!t) return;
      setExtra((e) => ({ ...e, [open.id]: [...(e[open.id] || []), { from: 'you', text: t }] }));
      setDraft('');
    };
    return (
      <View style={styles.threadPage}>
        <Pressable onPress={() => setOpenId(null)} style={styles.backBtn}>
          <Ionicons color={colors.brand} name="chevron-back" size={16} />
          <Text style={styles.backText}>All messages</Text>
        </Pressable>
        <Card style={styles.threadHead}>
          <Avatar name={open.name} />
          <View>
            <Text style={styles.strong}>{open.name}</Text>
            <Text style={styles.meta}>{open.role}</Text>
          </View>
        </Card>
        <ScrollView contentContainerStyle={styles.threadBody}>
          {msgs.map((m, i) => (
            <Text key={i} style={[styles.bubble, m.from === 'you' ? styles.you : styles.them]}>{m.text}</Text>
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
            <Ionicons color="#fff" name="send" size={15} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Students, mentors and firms, one tap away." title="Messages" />
      {THREADS.map((t) => (
        <Pressable key={t.id} onPress={() => setOpenId(t.id)}>
          <Card style={styles.convo}>
            <Avatar name={t.name} />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{t.name}</Text>
              <Text numberOfLines={1} style={styles.meta}>{t.preview}</Text>
            </View>
            {t.unread > 0 && (
              <View style={styles.unread}><Text style={styles.unreadText}>{t.unread}</Text></View>
            )}
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 40 },
  convo: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  unread: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: 10,
    height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 5,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  threadPage: { flex: 1, gap: spacing.md, padding: spacing.lg },
  backBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 2 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  threadHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  threadBody: { flexGrow: 1, gap: spacing.sm, justifyContent: 'flex-end' },
  bubble: { ...typeScale.body, borderRadius: 14, maxWidth: '85%', overflow: 'hidden', padding: 10 },
  you: { alignSelf: 'flex-end', backgroundColor: colors.brand, color: '#fff' },
  them: { alignSelf: 'flex-start', backgroundColor: colors.raised, color: colors.ink },
  composer: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, flex: 1,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  sendBtn: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill,
    height: 36, justifyContent: 'center', width: 36,
  },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
