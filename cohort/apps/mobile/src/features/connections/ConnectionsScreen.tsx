/** Connections: incoming requests to answer, outgoing requests, and the member's network. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  timeAgo,
  useConnectionRequests,
  useMyConnections,
  useProfiles,
  useRemoveConnection,
  useRespondToConnection,
  useStartThread,
  type Connection,
} from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

export function ConnectionsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user?.id;
  const requests = useConnectionRequests(userId);
  const connections = useMyConnections(userId);
  const profiles = useProfiles();
  const respond = useRespondToConnection(userId);
  const remove = useRemoveConnection(userId);
  const startThread = useStartThread(userId);

  const nameOf = useMemo(() => {
    const map = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || 'Member']));
    return (otherId: string) => map.get(otherId) ?? 'Member';
  }, [profiles.data]);

  const otherId = (c: Connection) => (c.requester_id === userId ? c.addressee_id : c.requester_id);

  if (authLoading || (userId && requests.isLoading)) {
    return (
      <View style={styles.page}>
        <ListSkeleton count={2} />
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.page}>
        <EmptyState
          body="Sign in to connect with other members."
          icon="people-outline"
          title="Connections need an account"
        />
      </View>
    );
  }

  const fail = () => toast.show('Could not update. Try again.', 'error');

  const openChat = (targetId: string) =>
    startThread.mutate(
      { firstMessage: '', otherUserId: targetId },
      {
        onError: () => fail(),
        onSuccess: () => router.push('/messages'),
      },
    );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="People you can message and add to groups" title="Connections" />

      {requests.data?.incoming.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requests</Text>
          {requests.data.incoming.map((c) => (
            <Card key={c.id} style={styles.rowCard}>
              <Pressable onPress={() => router.push(`/member?id=${c.requester_id}`)} style={styles.rowMain}>
                <Avatar name={nameOf(c.requester_id)} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{nameOf(c.requester_id)}</Text>
                  <Text style={styles.meta}>wants to connect · {timeAgo(c.created_at)}</Text>
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ accept: true, connectionId: c.id }, { onError: fail })}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>Accept</Text>
                </Pressable>
                <Pressable
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ accept: false, connectionId: c.id }, { onError: fail })}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Decline</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {requests.data?.outgoing.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sent</Text>
          {requests.data.outgoing.map((c) => (
            <Card key={c.id} style={styles.rowCard}>
              <Pressable onPress={() => router.push(`/member?id=${c.addressee_id}`)} style={styles.rowMain}>
                <Avatar name={nameOf(c.addressee_id)} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{nameOf(c.addressee_id)}</Text>
                  <Text style={styles.meta}>request sent {timeAgo(c.created_at)}</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel="Withdraw connection request"
                disabled={remove.isPending}
                onPress={() => remove.mutate(c.id, { onError: fail })}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Withdraw</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your connections</Text>
        {!connections.data?.length ? (
          <EmptyState
            body="Visit a member's profile and tap Connect. Once they accept, you can message each other and add one another to groups."
            icon="people-outline"
            title="No connections yet"
          />
        ) : (
          connections.data.map((c) => {
            const oid = otherId(c);
            const name = nameOf(oid);
            return (
              <Card key={c.id} style={styles.rowCard}>
                <Pressable onPress={() => router.push(`/member?id=${oid}`)} style={styles.rowMain}>
                  <Avatar name={name} size={40} />
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{name}</Text>
                    <Text style={styles.meta}>connected {timeAgo(c.created_at)}</Text>
                  </View>
                </Pressable>
                <Pressable disabled={startThread.isPending} onPress={() => openChat(oid)} style={styles.cta}>
                  <Text style={styles.ctaText}>Message</Text>
                </Pressable>
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  cta: { backgroundColor: colors.brand, borderRadius: radius.input, paddingHorizontal: spacing.md, paddingVertical: 8 },
  ctaText: { color: colors.card, fontSize: 13, fontWeight: '700' },
  meta: { color: colors.ink3, fontSize: 12 },
  name: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  page: { gap: spacing.md, padding: spacing.lg },
  rowCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  rowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  secondary: { borderColor: colors.lineWarm, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 8 },
  secondaryText: { color: colors.ink2, fontSize: 13, fontWeight: '600' },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.ink2, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
});
