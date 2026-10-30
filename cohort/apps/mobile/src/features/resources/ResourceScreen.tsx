import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useResource } from '@/lib/data';
import { itemShareUrl, shareItemLink } from '@/lib/share';
import { colors, spacing, type as typeScale } from '@/theme';

/** Public read-only page for one shared resource (opened from a share link). */
export function ResourceScreen({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const resource = useResource(id);

  if (resource.isLoading) {
    return <View style={styles.page}><ListSkeleton count={1} /></View>;
  }
  if (!resource.data) {
    return (
      <View style={styles.page}>
        <EmptyState body="This resource was removed or the link is wrong." icon="book-outline" title="Resource not found" />
      </View>
    );
  }

  const r = resource.data;

  const download = async () => {
    if (!r.file_path) return;
    const { data, error } = await supabase.storage.from('resources').createSignedUrl(r.file_path, 300);
    if (error || !data) {
      toast.show('Could not open this file. Try again.', 'error');
      return;
    }
    if (Platform.OS === 'web') window.location.assign(data.signedUrl);
    else await Linking.openURL(data.signedUrl);
  };

  const share = () => {
    const url = itemShareUrl('resource', r.id);
    void shareItemLink(url, `${r.title} - study resource on Cohort`).then((ok) =>
      toast.show(ok ? (Platform.OS === 'web' ? 'Link copied' : 'Shared') : url, ok ? 'success' : 'info'),
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/resources'))} style={styles.backBtn}>
        <Ionicons color={colors.brand} name="chevron-back" size={16} />
        <Text style={styles.backText}>Back to resources</Text>
      </Pressable>
      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.cat}>{r.cat}</Text>
        <Text style={styles.title}>{r.title}</Text>
        <Text style={styles.meta}>{[r.course, r.subject, r.meta].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.meta}>Shared by {r.uploaded_by}</Text>
        <View style={styles.actions}>
          {r.file_path && (
            <Pressable accessibilityRole="button" onPress={download} style={styles.primaryBtn}>
              <Ionicons color={colors.card} name="download-outline" size={16} />
              <Text style={styles.primaryBtnText}>Open file</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={share} style={styles.ghostBtn}>
            <Ionicons color={colors.brand} name="share-social-outline" size={16} />
            <Text style={styles.ghostBtnText}>Share</Text>
          </Pressable>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  backBtn: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  cat: { ...typeScale.caption, color: colors.brand, fontWeight: '600', textTransform: 'uppercase' },
  ghostBtn: { alignItems: 'center', borderColor: colors.brandSoft, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ghostBtnText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  page: { gap: spacing.md, padding: spacing.lg },
  primaryBtn: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: 8, flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryBtnText: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600' },
  title: { ...typeScale.sectionTitle, color: colors.ink },
});
