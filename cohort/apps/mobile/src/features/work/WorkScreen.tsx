import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenBits';
import { JOB_FILTERS } from '@/lib/demo-data';
import { useDemo } from '@/store/demo';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function WorkScreen() {
  const [filter, setFilter] = useState('All');
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const jobs = useDemo((s) => s.jobs);
  const items = jobs.filter((j) => filter === 'All' || j.cat === filter);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Articleship, jobs, gig work and industrial training." title="Work & hiring" />
      <Card style={styles.banner}>
        <Ionicons color={colors.brandDeep} name="notifications-outline" size={18} />
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>Vacancy scan</Text>
          <Text style={styles.meta}>12 new openings this week match your CA Inter profile.</Text>
        </View>
      </Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {JOB_FILTERS.map((f) => <Chip key={f} label={f} active={f === filter} onPress={() => setFilter(f)} />)}
      </ScrollView>
      {items.map((j) => (
        <Card key={j.id}>
          <View style={styles.jobTop}>
            <Avatar name={j.firm} size={42} />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{j.role}</Text>
              <Text style={styles.meta}>{j.firm} · {j.loc}</Text>
            </View>
          </View>
          <View style={styles.tagsRow}>
            <Text style={styles.pay}>{j.pay}</Text>
            {j.tags.map((t) => <Text key={t} style={styles.tag}>{t}</Text>)}
          </View>
          <View style={styles.foot}>
            <Text style={styles.meta}>{j.cat}</Text>
            <Pressable onPress={() => setApplied((a) => ({ ...a, [j.id]: !a[j.id] }))} style={[styles.btn, applied[j.id] && styles.btnDone]}>
              <Text style={[styles.btnText, applied[j.id] && styles.btnTextDone]}>
                {applied[j.id] ? '✓ Applied' : 'Apply'}
              </Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  banner: {
    alignItems: 'center', backgroundColor: colors.brandSoft,
    borderColor: '#eed5c4', flexDirection: 'row', gap: spacing.sm,
  },
  chips: { gap: spacing.sm },
  jobTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  tagsRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pay: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '700' },
  tag: {
    ...typeScale.caption, backgroundColor: colors.raised, borderRadius: 8,
    color: colors.ink2, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3,
  },
  foot: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  btn: {
    backgroundColor: colors.brand, borderColor: colors.brand, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8,
  },
  btnDone: { backgroundColor: colors.card },
  btnText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  btnTextDone: { color: colors.brand },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
