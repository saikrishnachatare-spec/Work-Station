import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useInvitePreview, useJoinByToken } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function JoinGroupScreen({ token }: { token: string }) {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const preview = useInvitePreview(token);
  const join = useJoinByToken(userId);

  const doJoin = () => {
    if (!userId) {
      toast.show('Sign in to join this group', 'info');
      router.push('/(auth)/login');
      return;
    }
    join.mutate(token, {
      onError: () => toast.show('This invite link is invalid or has expired.', 'error'),
      onSuccess: (groupId) => {
        toast.show('You joined the group', 'success');
        router.replace({ params: { group: groupId, name: preview.data?.name ?? 'Group' }, pathname: '/group-chat' });
      },
    });
  };

  if (preview.isLoading) {
    return <View style={styles.page}><ListSkeleton count={1} /></View>;
  }

  if (!preview.data) {
    return (
      <View style={styles.page}>
        <EmptyState
          body="This invite link is invalid or has been replaced by a newer one. Ask for a fresh link."
          icon="link-outline"
          title="Invite link does not work"
        />
      </View>
    );
  }

  const g = preview.data;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Card style={styles.card}>
        <Avatar name={g.name} />
        <Text style={styles.title}>{g.name}</Text>
        {g.purpose ? <Text style={styles.meta}>{g.purpose}</Text> : null}
        <Text style={styles.meta}>{g.member_count} members</Text>
        <Pressable disabled={join.isPending} onPress={doJoin} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{join.isPending ? 'Joining…' : userId ? 'Join group' : 'Sign in to join'}</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingTop: 60 },
  card: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  title: { ...typeScale.screenTitle, color: colors.ink },
  meta: { ...typeScale.caption, color: colors.ink3, textAlign: 'center' },
  primaryBtn: {
    alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.brand,
    borderRadius: radius.pill, marginTop: spacing.md, paddingVertical: 12,
  },
  primaryBtnText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
});
