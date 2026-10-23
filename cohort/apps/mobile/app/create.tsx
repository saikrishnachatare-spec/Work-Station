import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/Toast';
import { useCreateGroup, useCreateJob, useCreatePost, useCreateResource, useMyProfile } from '@/lib/data';
import { useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

type ActionId = 'post' | 'group' | 'job' | 'message' | 'resource';

const ACTIONS: { id: ActionId; icon: string; label: string; desc: string }[] = [
  { id: 'post', icon: 'document-text-outline', label: 'Create a post', desc: 'Share an update with the community' },
  { id: 'group', icon: 'people-outline', label: 'Create a group', desc: 'Study circle, exam form or professional' },
  { id: 'job', icon: 'briefcase-outline', label: 'Post a job opening', desc: 'Articleship, job, gig or industrial training' },
  { id: 'message', icon: 'chatbubble-outline', label: 'New message', desc: 'Message a student, mentor or firm' },
  { id: 'resource', icon: 'book-outline', label: 'Share a resource', desc: 'Notes, question papers, videos or RTP / MTP' },
];

const FORMS: Record<string, { title: string; ph1: string; ph2?: string; cta: string }> = {
  post: { title: 'Create a post', ph1: 'What do you want to share?', cta: 'Post' },
  group: { title: 'Create a group', ph1: 'Group name', ph2: 'What is it for?', cta: 'Create group' },
  job: { title: 'Post a job opening', ph1: 'Role, e.g. Articleship, statutory audit', ph2: 'Firm or company', cta: 'Post opening' },
  resource: { title: 'Share a resource', ph1: 'Title, e.g. FR revision notes', ph2: 'Subject or course', cta: 'Share' },
};

export default function CreateModal() {
  const router = useRouter();
  const [action, setAction] = useState<ActionId | null>(null);
  const [done, setDone] = useState('');
  const [text, setText] = useState('');
  const [text2, setText2] = useState('');
  const [resourceFile, setResourceFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [jobDesc, setJobDesc] = useState('');
  const [jobDeadline, setJobDeadline] = useState('');
  const [jobLoc, setJobLoc] = useState('');
  const [jobPay, setJobPay] = useState('');
  const form = action ? FORMS[action] : null;
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const profile = useMyProfile(userId);
  const createPost = useCreatePost();
  const createGroup = useCreateGroup();
  const createJob = useCreateJob();
  const createResource = useCreateResource();

  const pick = (id: ActionId) => {
    if (id === 'message') {
      router.back();
      router.push('/messages');
      return;
    }
    setAction(id);
  };

  const submit = () => {
    const a = text.trim();
    const b = text2.trim();
    if (!a || !action) return;
    if (!userId) {
      toast.show('Sign in to create content', 'info');
      return;
    }
    const authorName = profile.data?.full_name || session?.user?.email?.split('@')[0] || 'You';
    const onError = () => toast.show('Could not save. Try again.', 'error');
    if (action === 'post') {
      createPost.mutate(
        { authorId: userId, authorName, body: a },
        { onError, onSuccess: () => setDone('Posted to the feed. Everyone can see it now.') },
      );
    } else if (action === 'group') {
      createGroup.mutate(
        { description: b || 'Created by you.', name: a, purpose: b || 'Study group', userId },
        { onError, onSuccess: () => setDone(`Circle "${a}" created. Find it under My groups.`) },
      );
    } else if (action === 'job') {
      if (jobDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(jobDeadline.trim())) {
        toast.show('Deadline must be YYYY-MM-DD (or leave it empty)', 'error');
        return;
      }
      createJob.mutate(
        {
          deadline: jobDeadline.trim(), description: jobDesc.trim(), firm: b || 'Your firm',
          loc: jobLoc.trim(), pay: jobPay.trim(), role: a, userId,
        },
        { onError, onSuccess: () => setDone(`"${a}"${b ? ' at ' + b : ''} is live under Work & hiring.`) },
      );
    } else if (action === 'resource') {
      createResource.mutate(
        { course: b || 'General', title: a, uploadedBy: authorName, userId, file: resourceFile },
        { onError, onSuccess: () => setDone(`"${a}" shared under Resources.`) },
      );
    }
  };

  const busy = createPost.isPending || createGroup.isPending || createJob.isPending || createResource.isPending;

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.backdrop} />
      <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <View style={styles.handle} />
        {!action && !done && (
          <>
            <Text style={styles.title}>Create</Text>
            {ACTIONS.map((a) => (
              <Pressable accessibilityRole="button" key={a.id} onPress={() => pick(a.id)} style={styles.action}>
                <View style={styles.tile}><Ionicons color={colors.brand} name={a.icon as never} size={17} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{a.label}</Text>
                  <Text style={styles.meta}>{a.desc}</Text>
                </View>
                <Ionicons color={colors.ink3} name="chevron-forward" size={15} />
              </Pressable>
            ))}
          </>
        )}
        {form && !done && (
          <View style={{ gap: spacing.md }}>
            <Pressable onPress={() => setAction(null)} style={styles.backBtn}>
              <Ionicons color={colors.brand} name="chevron-back" size={14} />
              <Text style={styles.backText}>All actions</Text>
            </Pressable>
            <Text style={styles.title}>{form.title}</Text>
            <TextInput
              autoFocus
              onChangeText={setText}
              onSubmitEditing={submit}
              placeholder={form.ph1}
              placeholderTextColor={colors.ink3}
              style={styles.input}
              value={text}
            />
            {form.ph2 && (
              <TextInput
                onChangeText={setText2}
                onSubmitEditing={submit}
                placeholder={form.ph2}
                placeholderTextColor={colors.ink3}
                style={styles.input}
                value={text2}
              />
            )}
            {action === 'resource' && <>
              <Text style={styles.meta}>PDF, PNG, JPEG or WebP, up to 10 MB. Shared with signed-in members.</Text>
              <Pressable accessibilityRole="button" onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
                if (!result.canceled) setResourceFile(result.assets[0]);
              }} style={styles.cta}><Text style={styles.ctaText}>{resourceFile ? resourceFile.name : 'Choose PDF or image'}</Text></Pressable>
            </>}
            {action === 'job' && (
              <>
                <TextInput
                  multiline
                  numberOfLines={3}
                  onChangeText={setJobDesc}
                  placeholder="About this opening (what the person will do)"
                  placeholderTextColor={colors.ink3}
                  style={[styles.input, { minHeight: 72 }]}
                  value={jobDesc}
                />
                <TextInput
                  onChangeText={setJobDeadline}
                  placeholder="Apply by (YYYY-MM-DD, optional)"
                  placeholderTextColor={colors.ink3}
                  style={styles.input}
                  value={jobDeadline}
                />
                <TextInput
                  onChangeText={setJobLoc}
                  placeholder="Location (optional)"
                  placeholderTextColor={colors.ink3}
                  style={styles.input}
                  value={jobLoc}
                />
                <TextInput
                  onChangeText={setJobPay}
                  placeholder="Pay (optional)"
                  placeholderTextColor={colors.ink3}
                  style={styles.input}
                  value={jobPay}
                />
              </>
            )}
            <Pressable disabled={busy} onPress={submit} style={[styles.cta, busy && { opacity: 0.6 }]}><Text style={styles.ctaText}>{busy ? 'Saving…' : form.cta}</Text></Pressable>
          </View>
        )}
        {!!done && (
          <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
            <View style={styles.tick}><Ionicons color="#fff" name="checkmark" size={20} /></View>
            <Text style={styles.doneText}>{done}</Text>
            <Pressable onPress={() => router.back()} style={styles.cta}><Text style={styles.ctaText}>Done</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(37,31,33,0.4)' },
  sheet: {
    backgroundColor: colors.cream, borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet, gap: spacing.sm, padding: spacing.lg, paddingBottom: 34,
  },
  handle: {
    alignSelf: 'center', backgroundColor: colors.ink4, borderRadius: 2,
    height: 4, marginBottom: spacing.sm, width: 40,
  },
  title: { ...typeScale.sectionTitle, color: colors.ink, marginBottom: 4 },
  action: {
    alignItems: 'center', backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.tile, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: 12,
  },
  tile: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: 10,
    height: 34, justifyContent: 'center', width: 34,
  },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
  backBtn: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 2 },
  backText: { ...typeScale.caption, color: colors.brand, fontWeight: '600' },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  cta: {
    alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.brand,
    borderRadius: radius.pill, paddingVertical: 12,
  },
  ctaText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
  tick: {
    alignItems: 'center', backgroundColor: '#5a8a5a', borderRadius: 24,
    height: 44, justifyContent: 'center', width: 44,
  },
  doneText: { ...typeScale.body, color: colors.ink, textAlign: 'center' },
});
