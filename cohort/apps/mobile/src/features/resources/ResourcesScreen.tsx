import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { createElement, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Linking } from 'react-native';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenBits';
import { COURSES, LEVELS, RESOURCE_FILTERS, SUBJECTS } from '@/lib/demo-data';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useDeleteStudentNote, useMyProfile, useResources, useStudentNotes, useUploadStudentNote } from '@/lib/data';
import { useAuth } from '@/store/session';
import { itemShareUrl, shareItemLink } from '@/lib/share';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export function ResourcesScreen() {
  const toast = useToast();
  const [course, setCourse] = useState('CA');
  const [lvl, setLvl] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState('All');
  const [query, setQuery] = useState('');
  const resources = useResources();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const profile = useMyProfile(userId);
  const notes = useStudentNotes();
  const uploadNote = useUploadStudentNote();
  const deleteNote = useDeleteStudentNote();
  const [noteQuery, setNoteQuery] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteSubject, setNoteSubject] = useState('');
  const [noteFile, setNoteFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const q = query.trim().toLowerCase();
  const matches = (r: { title: string; course: string; subject?: string }) =>
    !q || r.title.toLowerCase().includes(q) || r.course.toLowerCase().includes(q) || (r.subject ?? '').toLowerCase().includes(q);
  const shared = (resources.data ?? []).filter(matches);
  const openResource = async (filePath: string) => {
    const { data, error } = await supabase.storage.from('resources').createSignedUrl(filePath, 300);
    if (error || !data) { toast.show('Sign in to open this file, or try again.', 'error'); return; }
    if (Platform.OS === 'web') window.location.assign(data.signedUrl);
    else await Linking.openURL(data.signedUrl);
  };
  const openNote = async (filePath: string) => {
    const { data, error } = await supabase.storage.from('student-notes').createSignedUrl(filePath, 300);
    if (error || !data) { toast.show('Could not open this file. Try again.', 'error'); return; }
    if (Platform.OS === 'web') window.location.assign(data.signedUrl);
    else await Linking.openURL(data.signedUrl);
  };
  const nq = noteQuery.trim().toLowerCase();
  const visibleNotes = (notes.data ?? []).filter((n) =>
    !nq || n.title.toLowerCase().includes(nq) || n.subject.toLowerCase().includes(nq) || n.uploader_name.toLowerCase().includes(nq));
  const submitNote = () => {
    const t = noteTitle.trim();
    if (!t || !userId) { toast.show('Name your notes first', 'info'); return; }
    uploadNote.mutate(
      { file: noteFile, subject: noteSubject.trim(), title: t, uploaderName: profile.data?.full_name || 'A member', userId },
      {
        onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not share the notes. Try again.', 'error'),
        onSuccess: () => { toast.show('Notes shared', 'success'); setAddingNote(false); setNoteTitle(''); setNoteSubject(''); setNoteFile(null); },
      },
    );
  };
  const ResourceRow = ({ r }: { r: (typeof shared)[number] }) => (
    <Card style={styles.resCard}>
      <View style={styles.resIcon}><Ionicons color={colors.brand} name="book-outline" size={17} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.strong}>{r.title}</Text>
        <Text style={styles.meta}>{[r.meta, r.subject, r.course].filter(Boolean).join(' \u00b7 ')} · by {r.uploaded_by}</Text>
      </View>
      <Pressable
        accessibilityLabel={`Share ${r.title}`}
        accessibilityRole="button"
        onPress={() => {
          const url = itemShareUrl('resource', r.id);
          void shareItemLink(url, `${r.title} - study resource on Cohort`).then((ok) =>
            toast.show(ok ? (Platform.OS === 'web' ? 'Link copied' : 'Shared') : url, ok ? 'success' : 'info'),
          );
        }}
      >
        <Ionicons color={colors.brand} name="share-social-outline" size={20} />
      </Pressable>
      {r.file_path && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.title}`} onPress={() => openResource(r.file_path!)}><Ionicons color={colors.brand} name="download-outline" size={22} /></Pressable>}
    </Card>
  );
  const groups = SUBJECTS[course][lvl];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Pick a course, a level, then a subject." title="Resources" />
      <View style={styles.searchbar}>
        <Ionicons color={colors.ink3} name="search" size={16} />
        <TextInput
          onChangeText={setQuery}
          placeholder="Search FR, Audit, Company Law…"
          placeholderTextColor={colors.ink3}
          style={[styles.searchText, { flex: 1 }]}
          value={query}
        />
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

      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={styles.chips}>
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
          {shared.filter((r) => kind === 'All' || r.cat === kind).map((r) => <ResourceRow key={r.id} r={r} />)}
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
                    {shared.filter((r) => (r.subject ?? '').trim().toLowerCase() === sub.trim().toLowerCase()).length === 0 && (
                      <Text style={styles.meta}>No files have been tagged to this subject yet. Share one from the + button.</Text>
                    )}
                    {shared.filter((r) => (r.subject ?? '').trim().toLowerCase() === sub.trim().toLowerCase()).map((r) => <ResourceRow key={r.id} r={r} />)}
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ))}
      <Text style={styles.crumbs}>Student notes</Text>
      <Text style={styles.meta}>Notes and files shared by members. Anyone signed in can add theirs.</Text>
      <View style={styles.searchbar}>
        <Ionicons color={colors.ink3} name="search" size={16} />
        <TextInput
          onChangeText={setNoteQuery}
          placeholder="Search notes, subjects or uploaders…"
          placeholderTextColor={colors.ink3}
          style={[styles.searchText, { flex: 1 }]}
          value={noteQuery}
        />
      </View>
      {userId && !addingNote && (
        <Pressable accessibilityRole="button" onPress={() => setAddingNote(true)} style={styles.addNoteBtn}>
          <Ionicons color={colors.brand} name="add" size={16} />
          <Text style={styles.addNoteText}>Share your notes</Text>
        </Pressable>
      )}
      {addingNote && (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>Share notes</Text>
          <TextInput
            onChangeText={setNoteTitle}
            placeholder="Title, e.g. FR revision notes"
            placeholderTextColor={colors.ink3}
            style={styles.input}
            value={noteTitle}
          />
          <TextInput
            onChangeText={setNoteSubject}
            placeholder="Subject (optional)"
            placeholderTextColor={colors.ink3}
            style={styles.input}
            value={noteSubject}
          />
          <Text style={styles.meta}>PDF, PNG, JPEG or WebP, up to 10 MB.</Text>
          {Platform.OS === 'web' ? createElement('input', {
            type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp',
            'aria-label': 'Choose PDF or image',
            onChange: (event: { target: { files: FileList | null } }) => {
              const file = event.target.files?.[0];
              if (file) setNoteFile({ uri: URL.createObjectURL(file), name: file.name, lastModified: file.lastModified, size: file.size, mimeType: file.type } as DocumentPicker.DocumentPickerAsset);
            }, style: { padding: 12, backgroundColor: '#fff', borderRadius: 12 },
          }) : (
            <Pressable accessibilityRole="button" onPress={async () => {
              const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
              if (!result.canceled) setNoteFile(result.assets[0]);
            }} style={styles.pickBtn}><Text style={styles.pickBtnText}>{noteFile ? noteFile.name : 'Choose PDF or image'}</Text></Pressable>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable accessibilityRole="button" disabled={uploadNote.isPending} onPress={submitNote} style={styles.btn}>
              <Text style={styles.btnText}>{uploadNote.isPending ? 'Sharing…' : 'Share'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setAddingNote(false)} style={styles.ghostBtn}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </Card>
      )}
      {notes.isLoading && <ListSkeleton count={2} />}
      {!notes.isLoading && visibleNotes.length === 0 && (
        <EmptyState
          body={nq ? 'No notes match that search.' : 'No notes yet. Be the first to share yours.'}
          icon="document-text-outline"
          title={nq ? 'Nothing found' : 'No notes yet'}
        />
      )}
      {visibleNotes.map((n) => (
        <Card key={n.id} style={styles.resCard}>
          <View style={styles.resIcon}><Ionicons color={colors.brand} name="document-text-outline" size={17} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>{n.title}</Text>
            <Text style={styles.meta}>{[n.subject, n.meta, `by ${n.uploader_name}`].filter(Boolean).join(' · ')}</Text>
          </View>
          {n.file_path && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${n.title}`} onPress={() => openNote(n.file_path!)}>
              <Ionicons color={colors.brand} name="download-outline" size={22} />
            </Pressable>
          )}
          {n.owner_id === userId && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${n.title}`}
              onPress={() => deleteNote.mutate(n, { onError: () => toast.show('Could not remove the notes. Try again.', 'error'), onSuccess: () => toast.show('Notes removed', 'success') })}
            >
              <Ionicons color={colors.ink3} name="trash-outline" size={19} />
            </Pressable>
          )}
        </Card>
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
  addNoteBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  addNoteText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  btn: {
    backgroundColor: colors.brand, borderColor: colors.brand, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7,
  },
  btnText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  ghostBtn: { borderColor: colors.brand, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  ghostBtnText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  pickBtn: { backgroundColor: colors.cream, borderRadius: radius.input, padding: 12 },
  pickBtnText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  input: {
    ...typeScale.body, backgroundColor: colors.cream, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, padding: 10,
  },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
