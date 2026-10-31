/** Member profile page: the professional face of a member, for signed-in members. */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ConnectionCta } from '@/features/members/ConnectionCta';
import { EmptyState } from '@/components/EmptyState';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import { ListSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import {
  timeAgo,
  useConnectionWith,
  useMyProfile,
  usePosts,
  useProfile,
  useRemoveConnection,
  useRespondToConnection,
  useSendConnectionRequest,
  useStartThread,
} from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function MemberScreen({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { guest, loading: authLoading, session } = useAuth();
  const userId = session?.user?.id;
  const profile = useProfile(id);
  const posts = usePosts();
  const startThread = useStartThread(userId);
  const connection = useConnectionWith(userId, id);
  const sendRequest = useSendConnectionRequest(userId);
  const respond = useRespondToConnection(userId);
  const removeConnection = useRemoveConnection(userId);
  const myProfile = useMyProfile(userId);
  // Admins and firm/enterprise accounts may message without a connection.
  const canBypassGate =
    myProfile.data?.role === 'admin' ||
    (myProfile.data?.account_type !== undefined && myProfile.data.account_type !== 'individual');
  const [signedAvatar, setSignedAvatar] = useState<{ path: string; url: string } | null>(null);

  const avatarPath = profile.data?.avatar_path;
  useEffect(() => {
    if (!avatarPath) return;
    let alive = true;
    supabase.storage.from('resources').createSignedUrl(avatarPath, 3600).then(({ data }) => {
      if (alive && data) setSignedAvatar({ path: avatarPath, url: data.signedUrl });
    });
    return () => { alive = false; };
  }, [avatarPath]);
  const avatarUrl = avatarPath && signedAvatar?.path === avatarPath ? signedAvatar.url : '';

  if (authLoading) {
    return <View style={styles.page}><ListSkeleton count={2} /></View>;
  }

  if (guest || !session) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Member profiles are visible to the community. Sign in to view this profile.</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.cta}>
          <Text style={styles.ctaText}>Sign in or create an account</Text>
        </Pressable>
      </View>
    );
  }

  if (profile.isLoading) {
    return <View style={styles.page}><ListSkeleton count={2} /></View>;
  }

  const p = profile.data;
  if (!p) {
    return (
      <View style={styles.page}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons color={colors.brand} name="chevron-back" size={16} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <EmptyState body="This member could not be found. They may have deleted their account." icon="person-outline" title="Member not found" />
      </View>
    );
  }

  const isSelf = p.id === userId;
  const name = p.full_name || 'Unnamed member';
  const courseLine = [p.course, p.level].filter(Boolean).join(' · ');
  const skills = (p.skills ?? []).filter(Boolean);
  const links = (p.links ?? []).filter((l) => l && l.url);
  const experience = (p.experience ?? []).filter((e) => e && (e.role || e.org));
  const education = (p.education ?? []).filter((e) => e && (e.qualification || e.institute));
  const memberPosts = (posts.data ?? []).filter((post) => post.author_id === p.id && post.kind === 'post').slice(0, 5);

  const openLink = (url: string) => {
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(href).catch(() => toast.show('Could not open that link.', 'error'));
  };

  const message = () => {
    startThread.mutate(
      { firstMessage: '', otherUserId: p.id },
      {
        onError: () => toast.show('Could not start the conversation. Try again.', 'error'),
        onSuccess: () => {
          toast.show(`Conversation with ${name} started`, 'success');
          router.push('/messages');
        },
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons color={colors.brand} name="chevron-back" size={16} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ borderRadius: 32, height: 64, width: 64 }} /> : <Avatar name={name} size={64} />}
        <Text style={styles.name}>{name}</Text>
        {p.headline ? <Text style={styles.headline}>{p.headline}</Text> : null}
        <Text style={styles.meta}>
          {[courseLine, p.city].filter(Boolean).join(' · ') || 'Cohort member'}
        </Text>
        <View style={styles.badgeRow}>
          {p.role === 'admin' ? <Pill label="Admin" /> : null}
          {p.verified_at ? <Pill label="Verified professional" /> : null}
          {p.account_type && p.account_type !== 'individual' ? <Pill label={p.org_name || p.account_type} /> : null}
        </View>
        {isSelf ? (
          <Pressable onPress={() => router.push('/account')} style={styles.cta}>
            <Text style={styles.ctaText}>Edit your profile</Text>
          </Pressable>
        ) : (
          <ConnectionCta
            canBypassGate={canBypassGate || p.role === 'admin'}
            connection={connection.data ?? null}
            onAccept={() => {
              if (!connection.data) return;
              respond.mutate(
                { accept: true, connectionId: connection.data.id },
                { onError: () => toast.show('Could not accept. Try again.', 'error') },
              );
            }}
            onConnect={() =>
              sendRequest.mutate(p.id, {
                onError: (err) => toast.show(err instanceof Error ? err.message : 'Could not send the request. Try again.', 'error'),
              })
            }
            onDecline={() => {
              if (!connection.data) return;
              respond.mutate(
                { accept: false, connectionId: connection.data.id },
                { onError: () => toast.show('Could not decline. Try again.', 'error') },
              );
            }}
            onMessage={message}
            onWithdraw={() => {
              if (!connection.data) return;
              removeConnection.mutate(connection.data.id, {
                onError: () => toast.show('Could not update. Try again.', 'error'),
              });
            }}
            pending={startThread.isPending || sendRequest.isPending || respond.isPending || removeConnection.isPending}
            userId={userId}
          />
        )}
      </Card>

      {p.bio ? (
        <>
          <SectionTitle first title="About" />
          <Card><Text style={styles.body}>{p.bio}</Text></Card>
        </>
      ) : null}

      {skills.length ? (
        <>
          <SectionTitle first={!p.bio} title="Skills" />
          <View style={styles.chips}>{skills.map((s) => <Pill key={s} label={s} />)}</View>
        </>
      ) : null}

      {links.length ? (
        <>
          <SectionTitle title="Links" />
          <Card>
            {links.map((l) => (
              <Pressable key={`${l.label}-${l.url}`} onPress={() => openLink(l.url)} style={styles.linkRow}>
                <Ionicons color={colors.brandDeep} name="link-outline" size={15} />
                <Text style={styles.linkText}>{l.label || l.url}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {experience.length ? (
        <>
          <SectionTitle title="Experience" />
          <Card>
            {experience.map((e, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.strong}>{[e.role, e.org].filter(Boolean).join(' · ')}</Text>
                {e.period ? <Text style={styles.meta}>{e.period}</Text> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {education.length ? (
        <>
          <SectionTitle title="Education" />
          <Card>
            {education.map((e, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.strong}>{[e.qualification, e.institute].filter(Boolean).join(' · ')}</Text>
                {e.period ? <Text style={styles.meta}>{e.period}</Text> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {memberPosts.length ? (
        <>
          <SectionTitle title="Recent posts" />
          {memberPosts.map((post) => (
            <Pressable key={post.id} onPress={() => router.push({ params: { id: post.id }, pathname: '/post' })}>
              <Card>
                <Text numberOfLines={3} style={styles.body}>{post.body}</Text>
                <Text style={styles.meta}>{timeAgo(post.created_at)} · Open post</Text>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      {!isSelf && (
        <Link href={{ params: { id: p.id, type: 'user' }, pathname: '/safety' }} style={styles.report}>
          Report or block
        </Link>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  backBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  name: { ...typeScale.screenTitle, color: colors.ink, textAlign: 'center' },
  headline: { ...typeScale.body, color: colors.ink2, textAlign: 'center' },
  meta: { ...typeScale.caption, color: colors.ink3, textAlign: 'center' },
  body: { ...typeScale.body, color: colors.ink2 },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cta: {
    alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingVertical: 12,
  },
  ctaText: { ...typeScale.body, color: colors.brandDeep, fontWeight: '600' },
  linkRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  linkText: { ...typeScale.body, color: colors.brandDeep, fontWeight: '600' },
  entry: { gap: 2 },
  report: { ...typeScale.caption, color: colors.brandDeep, padding: 12, textAlign: 'center' },
});
