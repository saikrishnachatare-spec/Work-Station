import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { Pill } from '@/components/ScreenBits';
import { timeAgo, useAddComment, useComments, usePost, useProfiles, useEditOwnContent, useDeleteOwnContent } from '@/lib/data';
import { itemShareUrl, shareItemLink } from '@/lib/share';
import { useAuth } from '@/store/session';
import { useToast } from '@/components/Toast';
import { colors, radius, spacing, type as typeScale } from '@/theme';

/** Full reading view for a single post. */
export function PostScreen({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const post = usePost(id);
  const comments = useComments(id);
  const addComment = useAddComment(userId);
  const profiles = useProfiles();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ table: 'posts' | 'comments'; id: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [deleting, setDeleting] = useState<{ table: 'posts' | 'comments'; id: string } | null>(null);
  const editPost = useEditOwnContent('posts', userId);
  const editComment = useEditOwnContent('comments', userId);
  const deletePost = useDeleteOwnContent('posts', userId);
  const deleteComment = useDeleteOwnContent('comments', userId);
  const startEdit = (table: 'posts' | 'comments', id: string, body: string) => { setEditing({ table, id }); setEditText(body); };
  const saveEdit = () => {
    if (!editing || !editText.trim()) return;
    (editing.table === 'posts' ? editPost : editComment).mutate({ id: editing.id, body: editText }, {
      onSuccess: () => { setEditing(null); toast.show('Saved', 'success'); },
      onError: () => toast.show('Could not save. Try again.', 'error'),
    });
  };
  const confirmDelete = () => {
    if (!deleting) return;
    const table = deleting.table;
    (table === 'posts' ? deletePost : deleteComment).mutate(deleting.id, {
      onSuccess: () => { setDeleting(null); toast.show('Deleted', 'success'); if (table === 'posts') router.back(); },
      onError: () => toast.show('Could not delete. Try again.', 'error'),
    });
  };

  const nameOf = (authorId: string) =>
    (profiles.data ?? []).find((pr) => pr.id === authorId)?.full_name || 'Member';

  const sendComment = () => {
    const body = draft.trim();
    if (!body) return;
    if (!userId) {
      toast.show('Sign in to comment', 'info');
      return;
    }
    setDraft('');
    addComment.mutate(
      { body, postId: id },
      { onError: () => toast.show('Comment could not be posted. Try again.', 'error') },
    );
  };

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
        {p.author_id === userId && <View style={styles.footRow}>
          <Pressable accessibilityRole="button" onPress={() => startEdit('posts', p.id, p.body)}><Text style={styles.backText}>Edit post</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDeleting({ table: 'posts', id: p.id })}><Text style={styles.backText}>Delete post</Text></Pressable>
        </View>}
        <View style={styles.footRow}>
          <Ionicons color={colors.ink3} name="heart-outline" size={14} />
          <Text style={styles.meta}>{p.like_count}</Text>
          <Ionicons color={colors.ink3} name="chatbubble-outline" size={13} />
          <Text style={styles.meta}>{p.comment_count}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const url = itemShareUrl('post', p.id);
              void shareItemLink(url, 'Post on Cohort').then((ok) =>
                toast.show(ok ? (Platform.OS === 'web' ? 'Link copied' : 'Shared') : url, ok ? 'success' : 'info'),
              );
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons color={colors.brand} name="share-social-outline" size={14} />
            <Text style={styles.shareText}>Share</Text>
          </Pressable>
        </View>
      </Card>
      {editing && <Card style={{ gap: spacing.sm }}>
        <Text style={styles.strong}>Edit {editing.table === 'posts' ? 'post' : 'comment'}</Text>
        <TextInput accessibilityLabel="Edit text" multiline style={styles.input} value={editText} onChangeText={setEditText} />
        <View style={styles.footRow}>
          <Pressable accessibilityRole="button" onPress={saveEdit}><Text style={styles.backText}>Save changes</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setEditing(null)}><Text style={styles.backText}>Cancel edit</Text></Pressable>
        </View>
      </Card>}
      {deleting && <Card style={{ gap: spacing.sm }}>
        <Text style={styles.body}>Delete this {deleting.table === 'posts' ? 'post and its comments' : 'comment'}? This cannot be undone.</Text>
        <View style={styles.footRow}>
          <Pressable accessibilityRole="button" onPress={confirmDelete}><Text style={styles.backText}>Confirm delete</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDeleting(null)}><Text style={styles.backText}>Keep it</Text></Pressable>
        </View>
      </Card>}
      <Text style={styles.sectionHead}>Comments</Text>
      {comments.isLoading && <ListSkeleton count={1} />}
      {!comments.isLoading && (comments.data ?? []).length === 0 && (
        <Text style={styles.meta}>No comments yet. Start the discussion.</Text>
      )}
      {(comments.data ?? []).map((c) => (
        <Card key={c.id} style={styles.commentCard}>
          <Avatar name={nameOf(c.author_id)} />
          <View style={{ flex: 1 }}>
            <View style={styles.commentHead}>
              <Text style={styles.strong}>{nameOf(c.author_id)}</Text>
              <Text style={styles.meta}>{timeAgo(c.created_at)}</Text>
            </View>
            <Text style={styles.body}>{c.body}</Text>
            {c.author_id === userId && <View style={styles.footRow}>
              <Pressable accessibilityRole="button" onPress={() => startEdit('comments', c.id, c.body)}><Text style={styles.backText}>Edit comment</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setDeleting({ table: 'comments', id: c.id })}><Text style={styles.backText}>Delete comment</Text></Pressable>
            </View>}
          </View>
        </Card>
      ))}
      <View style={styles.composer}>
        <TextInput
          onChangeText={setDraft}
          onSubmitEditing={sendComment}
          placeholder={userId ? 'Write a comment…' : 'Sign in to comment'}
          placeholderTextColor={colors.ink3}
          returnKeyType="send"
          style={styles.input}
          value={draft}
        />
        <Pressable accessibilityLabel="Post comment" onPress={sendComment} style={styles.sendBtn}>
          <Ionicons color={colors.brandDeep} name="send" size={15} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  shareText: { ...typeScale.caption, color: colors.brand },
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
  sectionHead: { ...typeScale.sectionTitle, color: colors.ink },
  commentCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  commentHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  composer: { flexDirection: 'row', gap: spacing.sm },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, flex: 1, padding: 10,
  },
  sendBtn: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.input,
    justifyContent: 'center', paddingHorizontal: 14,
  },
});
