import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import { timeAgo, useMyLikes, useMyProfile, usePosts, useToggleLike } from '@/lib/data';
import { useAuth } from '@/store/session';
import { FEED_FILTERS, READS } from '@/lib/demo-data';
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
            <Text style={styles.meta}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · Cohort Daily</Text>
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
          <Text style={styles.meta}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · Cohort Daily</Text>
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
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const profile = useMyProfile(userId);
  const firstName = (profile.data?.full_name ?? '').trim().split(' ')[0];
  const hour = new Date().getHours();
  const dayPart = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const greeting = firstName ? `Good ${dayPart}, ${firstName}` : `Good ${dayPart}`;
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const posts = usePosts();
  const myLikes = useMyLikes(userId);
  const toggleLike = useToggleLike(userId);

  const items = (posts.data ?? []).filter((f) =>
    filter === 'All' ||
    (filter === 'Posts' && f.kind === 'post') ||
    (filter === 'Announcements' && f.kind === 'announcement') ||
    (filter === 'Messages' && f.kind === 'message'));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.greet}><Text style={styles.strong}>{greeting}</Text> · {todayLabel}</Text>
      <TopReads />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FEED_FILTERS.map((f) => <Chip key={f} label={f} active={f === filter} onPress={() => setFilter(f)} />)}
      </ScrollView>
      <SectionTitle first title={filter === 'All' ? 'Latest' : filter} />
      {posts.isLoading && <ListSkeleton count={3} />}
      {posts.isError && (
        <EmptyState
          actionLabel="Try again"
          body="The feed could not load. Check your connection and try again."
          icon="cloud-offline-outline"
          onAction={() => posts.refetch()}
          title="Could not load the feed"
        />
      )}
      {!posts.isLoading && !posts.isError && items.length === 0 && (
        <EmptyState
          body={`Nothing under ${filter} yet. Posts will show up here as your cohort shares them.`}
          icon="newspaper-outline"
          title="Nothing here yet"
        />
      )}
      {items.map((f) => {
        const liked = myLikes.data?.has(f.id) ?? false;
        return (
        <Pressable key={f.id} onPress={() => router.push({ params: { id: f.id }, pathname: '/post' })}>
        <Card>
          {f.pinned ? <Text style={styles.pinned}>📌 Pinned announcement</Text> : null}
          <View style={styles.postHead}>
            <Avatar name={f.author_name} />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{f.author_name}</Text>
              <Text style={styles.meta}>{timeAgo(f.created_at)}</Text>
            </View>
            {f.author_role ? <Pill label={f.author_role} /> : null}
          </View>
          <Text style={styles.body}>{f.body}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (!userId) {
                  toast.show('Sign in to like posts', 'info');
                  return;
                }
                toggleLike.mutate(
                  { liked, postId: f.id },
                  {
                    onError: () => toast.show('Could not update the like. Try again.', 'error'),
                    onSuccess: () => toast.show(liked ? 'Removed from your likes' : 'Added to your likes', 'success'),
                  },
                );
              }}
            >
              <Text style={[styles.meta, liked && styles.liked]}>
                {liked ? '♥' : '♡'} {f.like_count}
              </Text>
            </Pressable>
            <Text style={styles.meta}>💬 {f.comment_count}</Text>
          </View>
        </Card>
        </Pressable>
        );
      })}
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
