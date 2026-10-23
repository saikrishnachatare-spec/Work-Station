import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import { FEED_FILTERS, GREETING_NAME, READS, TODAY_LABEL } from '@/lib/demo-data';
import { useDemo } from '@/store/demo';
import { colors, spacing, type as typeScale } from '@/theme';

function TopReads() {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const item = READS[idx];
  const go = (d: number) => setIdx((i) => (i + d + READS.length) % READS.length);

  if (open) {
    return (
      <Card>
        <View style={styles.readsHead}>
          <View style={styles.pdfBadge}><Text style={styles.pdfText}>PDF</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>Top 10 reads for today</Text>
            <Text style={styles.meta}>{TODAY_LABEL} · Cohort Daily</Text>
          </View>
        </View>
        {READS.map((r, i) => (
          <View key={i} style={styles.readRow}>
            <Text style={styles.readNum}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.strong}>{r.title}</Text>
              <Text style={styles.meta}>{r.kind} · {r.mins} min read</Text>
              <Text style={styles.body}>{r.sum}</Text>
            </View>
          </View>
        ))}
        <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.readsHead}>
        <View style={styles.pdfBadge}><Text style={styles.pdfText}>PDF</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>Top 10 reads for today</Text>
          <Text style={styles.meta}>{TODAY_LABEL} · Cohort Daily</Text>
        </View>
        <Text style={styles.meta}>{idx + 1} / {READS.length}</Text>
      </View>
      <Pressable onPress={() => setOpen(true)} style={{ gap: 4 }}>
        <Pill label={item.kind} />
        <Text style={styles.strong}>{item.title}</Text>
        <Text style={styles.body}>{item.sum}</Text>
        <Text style={styles.meta}>{item.mins} min read · tap to open the full document</Text>
      </Pressable>
      <View style={styles.readsNav}>
        <Pressable accessibilityLabel="Previous read" onPress={() => go(-1)} style={styles.navBtn}><Text style={styles.navText}>‹</Text></Pressable>
        <View style={styles.dots}>
          {READS.map((_, i) => (
            <Pressable key={i} accessibilityLabel={`Read ${i + 1}`} onPress={() => setIdx(i)} style={[styles.dot, i === idx && styles.dotOn]} />
          ))}
        </View>
        <Pressable accessibilityLabel="Next read" onPress={() => go(1)} style={styles.navBtn}><Text style={styles.navText}>›</Text></Pressable>
      </View>
    </Card>
  );
}

export function FeedScreen() {
  const [filter, setFilter] = useState('All');
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const feed = useDemo((s) => s.feed);
  const items = feed.filter((f) =>
    filter === 'All' ||
    (filter === 'Posts' && f.type === 'post') ||
    (filter === 'Announcements' && f.type === 'announcement') ||
    (filter === 'Messages' && f.type === 'message'));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.greet}><Text style={styles.strong}>Good morning, {GREETING_NAME}</Text> · {TODAY_LABEL}</Text>
      <TopReads />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FEED_FILTERS.map((f) => <Chip key={f} label={f} active={f === filter} onPress={() => setFilter(f)} />)}
      </ScrollView>
      <SectionTitle first title={filter === 'All' ? 'Latest' : filter} />
      {items.length === 0 && (
        <EmptyState
          body={`Nothing under ${filter} yet. Posts will show up here as your cohort shares them.`}
          icon="newspaper-outline"
          title="Nothing here yet"
        />
      )}
      {items.map((f) => (
        <Card key={f.id}>
          {f.pinned ? <Text style={styles.pinned}>📌 Pinned announcement</Text> : null}
          <View style={styles.postHead}>
            <Avatar name={f.author} />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{f.author}</Text>
              <Text style={styles.meta}>{f.time}</Text>
            </View>
            <Pill label={f.role} />
          </View>
          <Text style={styles.body}>{f.text}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                const next = !liked[f.id];
                setLiked((l) => ({ ...l, [f.id]: next }));
                toast.show(next ? 'Added to your likes' : 'Removed from your likes', 'success');
              }}
            >
              <Text style={[styles.meta, liked[f.id] && styles.liked]}>
                {liked[f.id] ? '♥' : '♡'} {f.likes + (liked[f.id] ? 1 : 0)}
              </Text>
            </Pressable>
            <Text style={styles.meta}>💬 {f.comments}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  greet: { ...typeScale.caption, color: colors.ink2 },
  chips: { gap: spacing.sm },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  body: { ...typeScale.body, color: colors.ink2 },
  meta: { ...typeScale.caption, color: colors.ink3 },
  readsHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  pdfBadge: { backgroundColor: colors.brandSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pdfText: { ...typeScale.pill, color: colors.brandDeep, fontWeight: '700' },
  readRow: { flexDirection: 'row', gap: spacing.sm },
  readNum: { ...typeScale.caption, color: colors.brand, fontWeight: '700', width: 16 },
  readsNav: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  navBtn: { padding: 4 },
  navText: { color: colors.brand, fontSize: 20 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { backgroundColor: colors.ink4, borderRadius: 4, height: 6, width: 6 },
  dotOn: { backgroundColor: colors.brand },
  closeBtn: { alignSelf: 'flex-end' },
  closeText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  pinned: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600' },
  postHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.lg },
  liked: { color: colors.brand },
});
