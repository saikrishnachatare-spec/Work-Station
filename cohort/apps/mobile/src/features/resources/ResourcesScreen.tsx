import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Linking } from 'react-native';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenBits';
import { COURSES, LEVELS, RESOURCE_FILTERS, SUBJECTS } from '@/lib/demo-data';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useResources } from '@/lib/data';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function ResourcesScreen() {
  const toast = useToast();
  const [course, setCourse] = useState('CA');
  const [lvl, setLvl] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState('All');
  const resources = useResources();
  const shared = resources.data ?? [];
  const groups = SUBJECTS[course][lvl];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Pick a course, a level, then a subject." title="Resources" />
      <View style={styles.searchbar}>
        <Ionicons color={colors.ink3} name="search" size={16} />
        <Text style={styles.searchText}>Search FR, Audit, Company Law…</Text>
      </View>

      <View style={styles.seg}>
        {COURSES.map((c) => (
          <Pressable key={c} onPress={() => { setCourse(c); setLvl(0); setOpen(null); }} style={[styles.segBtn, c === course && styles.segOn]}>
            <Text style={[styles.segText, c === course && styles.segTextOn]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.levels}>
        {LEVELS[course].map((l, i) => (
          <Pressable key={l} onPress={() => { setLvl(i); setOpen(null); }} style={[styles.level, i === lvl && styles.levelOn]}>
            <Text style={[styles.levelText, i === lvl && styles.segTextOn]}>{l}</Text>
            <Text style={styles.levelSub}>level {i + 1}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {RESOURCE_FILTERS.map((f) => <Chip key={f} label={f} active={f === kind} onPress={() => setKind(f)} />)}
      </ScrollView>

      {resources.isLoading && <ListSkeleton count={2} />}
      {resources.isError && (
        <EmptyState
          actionLabel="Try again"
          body="Resources could not load. Check your connection and try again."
          icon="cloud-offline-outline"
          onAction={() => resources.refetch()}
          title="Could not load resources"
        />
      )}
      {!resources.isLoading && !resources.isError && shared.filter((r) => kind === 'All' || r.cat === kind).length === 0 && (
        <EmptyState
          body={`No ${kind === 'All' ? '' : kind.toLowerCase()} shared yet. Community uploads appear here.`}
          icon="book-outline"
          title="Nothing shared yet"
        />
      )}
      {shared.filter((r) => kind === 'All' || r.cat === kind).length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.crumbs}>Shared by the community</Text>
          {shared.filter((r) => kind === 'All' || r.cat === kind).map((r) => (
            <Card key={r.id} style={styles.resCard}>
              <View style={styles.resIcon}><Ionicons color={colors.brand} name="book-outline" size={17} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{r.title}</Text>
                <Text style={styles.meta}>{r.meta} · by {r.uploaded_by} · {r.course}</Text>
              </View>
              {r.file_path && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.title}`} onPress={async () => {
                const { data, error } = await supabase.storage.from('resources').createSignedUrl(r.file_path!, 300);
                if (error || !data) { toast.show('Sign in to open this file, or try again.', 'error'); return; }
                await Linking.openURL(data.signedUrl);
              }}><Ionicons color={colors.brand} name="download-outline" size={22} /></Pressable>}
            </Card>
          ))}
        </View>
      )}

      <Text style={styles.crumbs}>{course} › {LEVELS[course][lvl]} › Subject-wise</Text>
      {groups.map((g) => (
        <View key={g.group} style={{ gap: spacing.sm }}>
          <Text style={styles.groupLabel}>{g.group}</Text>
          {g.subjects.map((sub) => {
            const key = course + lvl + sub;
            const isOpen = open === key;
            return (
              <Card key={key} style={{ gap: 0, paddingVertical: 10 }}>
                <Pressable accessibilityRole="button" onPress={() => setOpen(isOpen ? null : key)} style={styles.subjHead}>
                  <View style={styles.resIcon}><Ionicons color={colors.brand} name="book-outline" size={17} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong}>{sub}</Text>
                    <Text style={styles.meta}>Browse subject</Text>
                  </View>
                  <Ionicons color={colors.ink3} name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} />
                </Pressable>
                {isOpen && (
                  <View style={styles.subjBody}>
                    <Text style={styles.meta}>No files have been tagged to this subject yet. Community files are listed above.</Text>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  searchbar: {
    alignItems: 'center', backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: 12,
  },
  searchText: { ...typeScale.caption, color: colors.ink3 },
  seg: { backgroundColor: colors.raised, borderRadius: radius.input, flexDirection: 'row', padding: 3 },
  segBtn: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 8 },
  segOn: { backgroundColor: colors.card },
  segText: { ...typeScale.body, color: colors.ink2, fontWeight: '600' },
  segTextOn: { color: colors.brand },
  levels: { flexDirection: 'row', gap: spacing.sm },
  level: {
    alignItems: 'center', backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.tile, borderWidth: 1, flex: 1, gap: 2, paddingVertical: 10,
  },
  levelOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  levelText: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  levelSub: { ...typeScale.caption, color: colors.ink3 },
  chips: { gap: spacing.sm },
  crumbs: { ...typeScale.caption, color: colors.ink3, fontWeight: '600', textTransform: 'uppercase' },
  groupLabel: { ...typeScale.caption, color: colors.ink2, fontWeight: '700' },
  resCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  resIcon: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: 10,
    height: 34, justifyContent: 'center', width: 34,
  },
  subjHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  subjBody: { borderTopColor: colors.hairline, borderTopWidth: 1, gap: spacing.sm, marginTop: 10, paddingTop: 10 },
  subRes: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
