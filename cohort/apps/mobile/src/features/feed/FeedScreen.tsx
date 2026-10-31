import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import { postImageUrl, timeAgo, useMyLikes, useMyProfile, usePosts, useToggleLike } from '@/lib/data';
import { itemShareUrl, shareItemLink } from '@/lib/share';
import { useAuth } from '@/store/session';
import { FEED_FILTERS } from '@/lib/demo-data';
import { colors, radius, spacing, type as typeScale } from '@/theme';

function TopReads() {
  const posts = usePosts();
  const router = useRouter();
  const reads = (posts.data ?? []).filter(p => p.kind === 'post').slice(0, 10);
  if (!reads.length) return null;
  return <Card style={{ backgroundColor: colors.brandSoft, borderColor: colors.brandSoft, gap: spacing.sm }}>
    <Text style={[styles.strong, { color: colors.brandDeep }]}>Recent community reads</Text>
    {reads.map(p => <Pressable accessibilityRole="button" key={p.id} onPress={() => router.push({ pathname: '/post', params: { id: p.id } })}>
      <Text style={styles.strong}>{p.author_name}</Text>
      <Text numberOfLines={2} style={styles.body}>{p.body}</Text>
      <Text style={styles.meta}>{timeAgo(p.created_at)} · Open post</Text>
    </Pressable>)}
  </Card>;
}

export function FeedScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  // The greeting and date are time-of-day dependent, so they must not render
  // during the static export pass: the served HTML would carry build-time
  // text and hydration would mismatch (React error #418) for anyone loading
  // in a different part of the day. Render them only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Deferred past the effect body (react-hooks/set-state-in-effect).
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);
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
      <Text style={styles.greet}>{mounted ? <><Text style={styles.strong}>{greeting}</Text> · {todayLabel}</> : ' '}</Text>
      <TopReads />
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.chips}>
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
        <View style={{ gap: spacing.sm }}>
          <EmptyState
            body={`Nothing under ${filter} yet. Posts will show up here as your cohort shares them.`}
            icon="newspaper-outline"
            title="Nothing here yet"
          />
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.strong}>New here? Three quick starts</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/community')}>
              <Text style={styles.onboardLink}>Join a study circle in Community</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/search')}>
              <Text style={styles.onboardLink}>Find people and connect with them</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/create')}>
              <Text style={styles.onboardLink}>Share your first post</Text>
            </Pressable>
          </Card>
        </View>
      )}
      {items.map((f) => {
        const liked = myLikes.data?.has(f.id) ?? false;
        return (
        <Pressable key={f.id} onPress={() => router.push({ params: { id: f.id }, pathname: '/post' })}>
        <Card>
          {f.pinned ? <Text style={styles.pinned}>📌 Pinned announcement</Text> : null}
          <View style={styles.postHead}>
            <Pressable
              accessibilityLabel={`View ${f.author_name}'s profile`}
              accessibilityRole="button"
              disabled={!f.author_id}
              onPress={(e) => { e.stopPropagation?.(); if (f.author_id) router.push({ params: { id: f.author_id }, pathname: '/member' }); }}
              style={{ alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm }}
            >
              <Avatar name={f.author_name} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{f.author_name}</Text>
                <Text style={styles.meta}>{timeAgo(f.created_at)}</Text>
              </View>
            </Pressable>
            {f.author_role ? <Pill label={f.author_role} /> : null}
          </View>
          {f.image_path ? <Image accessibilityLabel={`Image attached to ${f.author_name}'s post`} source={{ uri: postImageUrl(f.image_path)! }} style={styles.postImage} /> : null}
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
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const url = itemShareUrl('post', f.id);
                void shareItemLink(url, `Post on Cohort`).then((ok) =>
                  toast.show(ok ? (Platform.OS === 'web' ? 'Link copied' : 'Shared') : url, ok ? 'success' : 'info'),
                );
              }}
            >
              <Text style={[styles.meta, styles.shareAction]}>Share</Text>
            </Pressable>
          </View>
        </Card>
        </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  onboardLink: { color: colors.brandDeep, fontSize: 13, fontWeight: '600', paddingVertical: 2 },
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  greet: { ...typeScale.caption, color: colors.ink2 },
  chips: { gap: spacing.sm },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  body: { ...typeScale.body, color: colors.ink2 },
  postImage: { backgroundColor: colors.brandSoft, borderRadius: radius.tile, height: 220, width: '100%' },
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
  shareAction: { color: colors.brand },
});
