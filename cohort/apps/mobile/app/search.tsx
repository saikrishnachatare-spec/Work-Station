/** Global search across the app's content: posts, resources, groups, jobs, people. */
import { SeoHead } from '@/components/SeoHead';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { Card } from '@/components/Card';
import { Pill, SectionTitle } from '@/components/ScreenBits';
import { useSearch } from '@/lib/data';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export default function SearchScreen() {
  const [q, setQ] = useState('');
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = q.trim();
  const search = useSearch(query);
  const results = query.length >= 2 && search.data ? search.data : null;

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
      {(searching || search.isFetching) && <ListSkeleton count={2} />}
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
            <Pressable accessibilityRole="button" key={f.id} onPress={() => router.push({ params: { id: f.id }, pathname: '/post' })}>
              <Card style={styles.row}>
                <Avatar name={f.author_name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{f.author_name}</Text>
                  <Text numberOfLines={2} style={styles.meta}>{f.body}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {!searching && results && results.resources.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`Resources (${results.resources.length})`} />
          {results.resources.map((r) => (
            <Pressable accessibilityRole="button" key={r.id} onPress={() => router.push({ params: { id: r.id }, pathname: '/resource' })}>
              <Card style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{r.title}</Text>
                  <Text style={styles.meta}>{r.cat} · {r.course} · by {r.uploaded_by}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {!searching && results && results.groups.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`Groups (${results.groups.length})`} />
          {results.groups.map((g) => (
            <Pressable accessibilityRole="button" key={g.id} onPress={() => router.push({ params: { group: g.id, name: g.name }, pathname: '/group-chat' })}>
              <Card style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{g.name}</Text>
                  <Text style={styles.meta}>{g.purpose} · {g.member_count.toLocaleString('en-IN')} members</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {!searching && results && results.jobs.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`Work (${results.jobs.length})`} />
          {results.jobs.map((j) => (
            <Pressable accessibilityRole="button" key={j.id} onPress={() => router.push({ params: { id: j.id }, pathname: '/job' })}>
              <Card style={styles.row}>
                <Avatar name={j.firm} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{j.role}</Text>
                  <Text style={styles.meta}>{j.firm} · {j.loc} · {j.pay}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {!searching && results && results.people.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle first title={`People (${results.people.length})`} />
          {results.people.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ params: { id: p.id }, pathname: '/member' })}>
              <Card style={styles.row}>
                <Avatar name={p.full_name || '?'} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{p.full_name || 'Unnamed member'}</Text>
                  <Text style={styles.meta}>{p.headline || 'Member'}</Text>
                </View>
                {p.role === 'admin' ? <Pill label="Admin" /> : null}
              </Card>
            </Pressable>
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
