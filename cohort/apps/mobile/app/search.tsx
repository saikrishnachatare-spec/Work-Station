/** Global search across the app's content: posts, resources, groups, jobs, people. */
import { SeoHead } from '@/components/SeoHead';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { Card } from '@/components/Card';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import { PEOPLE } from '@/lib/demo-data';
import { useDemo } from '@/store/demo';
import { colors, radius, spacing, type as typeScale } from '@/theme';

const match = (hay: string, q: string) => hay.toLowerCase().includes(q);

export default function SearchScreen() {
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demo = useDemo((s) => s);
  const query = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (query.length < 2) return null;
    return {
      posts: demo.feed.filter((f) => match(`${f.text} ${f.author}`, query)),
      resources: demo.resources.filter((r) => match(`${r.title} ${r.by} ${r.course} ${r.cat}`, query)),
      groups: demo.groups.filter((g) => match(`${g.name} ${g.desc} ${g.purpose}`, query)),
      jobs: demo.jobs.filter((j) => match(`${j.role} ${j.firm} ${j.loc} ${j.tags.join(' ')}`, query)),
      people: PEOPLE.filter((p) => match(`${p.name} ${p.role} ${p.kind}`, query)),
    };
  }, [demo, query]);

  useEffect(() => {
    if (!searching) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setSearching(false), 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, searching]);

  const handleQueryChange = (text: string) => {
    setQ(text);
    setSearching(text.trim().length >= 2);
  };

  const total = results
    ? results.posts.length + results.resources.length + results.groups.length + results.jobs.length + results.people.length
    : 0;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <SeoHead description="Search posts, resources, groups, jobs and people across Cohort." path="/search" title="Search" />
      <View style={styles.searchbar}>
        <Ionicons color={colors.ink3} name="search" size={16} />
        <TextInput
          autoFocus
          onChangeText={handleQueryChange}
          placeholder="Search posts, resources, groups, jobs, people…"
          placeholderTextColor={colors.ink3}
          style={styles.input}
          value={q}
        />
      </View>

      {!results && (
        <Text style={styles.meta}>Type at least 2 characters to search everything in Cohort.</Text>
      )}
      {searching && <ListSkeleton count={2} />}
      {!searching && results && total === 0 && (
        <EmptyState
          body={`Nothing in Cohort matches "${q.trim()}". Try a subject, a course code, a name or a firm.`}
          icon="search-outline"
          title="No results"
        />
      )}

      {!searching && results && results.posts.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`Posts (${results.posts.length})`} />
          {results.posts.map((f) => (
            <Card key={f.id} style={styles.row}>
              <Avatar name={f.author} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{f.author}</Text>
                <Text numberOfLines={2} style={styles.meta}>{f.text}</Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {!searching && results && results.resources.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`Resources (${results.resources.length})`} />
          {results.resources.map((r) => (
            <Card key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{r.title}</Text>
                <Text style={styles.meta}>{r.cat} · {r.course} · by {r.by}</Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {!searching && results && results.groups.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`Groups (${results.groups.length})`} />
          {results.groups.map((g) => (
            <Card key={g.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{g.name}</Text>
                <Text style={styles.meta}>{g.purpose} · {g.members.toLocaleString('en-IN')} members</Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {!searching && results && results.jobs.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`Work (${results.jobs.length})`} />
          {results.jobs.map((j) => (
            <Card key={j.id} style={styles.row}>
              <Avatar name={j.firm} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{j.role}</Text>
                <Text style={styles.meta}>{j.firm} · {j.loc} · {j.pay}</Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      {!searching && results && results.people.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`People (${results.people.length})`} />
          {results.people.map((p) => (
            <Card key={p.name} style={styles.row}>
              <Avatar name={p.name} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{p.name}</Text>
                <Text style={styles.meta}>{p.role}</Text>
              </View>
              <Pill label={p.kind} />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 60 },
  searchbar: {
    alignItems: 'center', backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: 12,
  },
  input: { ...typeScale.body, color: colors.ink, flex: 1, padding: 0 },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
