import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { Pill } from '@/components/ScreenBits';
import { timeAgo, usePost } from '@/lib/data';
import { colors, spacing, type as typeScale } from '@/theme';

/** Full reading view for a single post. */
export function PostScreen({ id }: { id: string }) {
  const router = useRouter();
  const post = usePost(id);

  if (post.isLoading) {
    return <View style={styles.page}><ListSkeleton count={1} /></View>;
  }
  if (!post.data) {
    return (
      <View style={styles.page}>
        <EmptyState body="This post was removed or the link is wrong." icon="document-outline" title="Post not found" />
      </View>
    );
  }

  const p = post.data;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons color={colors.brand} name="chevron-back" size={16} />
        <Text style={styles.backText}>Back to feed</Text>
      </Pressable>
      <Card style={styles.card}>
        <View style={styles.headRow}>
          <Avatar name={p.author_name} />
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>{p.author_name}</Text>
            <Text style={styles.meta}>{timeAgo(p.created_at)}</Text>
          </View>
          {p.author_role ? <Pill label={p.author_role} /> : null}
        </View>
        {p.kind === 'announcement' && <Text style={styles.announcement}>Official announcement</Text>}
        <Text style={styles.body}>{p.body}</Text>
        <View style={styles.footRow}>
          <Ionicons color={colors.ink3} name="heart-outline" size={14} />
          <Text style={styles.meta}>{p.like_count}</Text>
          <Ionicons color={colors.ink3} name="chatbubble-outline" size={13} />
          <Text style={styles.meta}>{p.comment_count}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  backBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  card: { gap: spacing.md, padding: spacing.lg },
  headRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  announcement: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  body: { ...typeScale.body, color: colors.ink, lineHeight: 22 },
  footRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
