/** Account screen: profile, verification status, sign out, delete account. */
import { SeoHead } from '@/components/SeoHead';
import { createElement, useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { type ProfileEducation, type ProfileExperience, useMyProfile } from '@/lib/data';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { signOut, useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { guest, loading: authLoading, session } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const profile = useMyProfile(session?.user.id);
  const [courseDraft, setCourseDraft] = useState('');
  const [levelDraft, setLevelDraft] = useState('');
  const [photo, setPhoto] = useState<{uri:string;name:string;mimeType?:string;size?:number}|null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [headlineDraft, setHeadlineDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [cityDraft, setCityDraft] = useState('');
  const [skillsDraft, setSkillsDraft] = useState('');
  const [linkedinDraft, setLinkedinDraft] = useState('');
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [expDraft, setExpDraft] = useState<ProfileExperience[]>([]);
  const [eduDraft, setEduDraft] = useState<ProfileEducation[]>([]);
  useEffect(()=>{if(profile.data?.avatar_path) supabase.storage.from('resources').createSignedUrl(profile.data.avatar_path,3600).then(({data})=>{if(data)setPhotoPreview(data.signedUrl);});},[profile.data?.avatar_path]);
  const toast = useToast();
  const qc = useQueryClient();

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ListSkeleton count={2} />
      </View>
    );
  }

  if (guest || !session) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>You are browsing Cohort as a guest. Sign in to post, message and save your work.</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.cta}>
          <Text style={styles.ctaText}>Sign in or create an account</Text>
        </Pressable>
      </View>
    );
  }

  const user = session.user;
  const name = (user.user_metadata?.full_name as string) || user.email || 'Member';
  const verified = !!user.email_confirmed_at;
  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next) {
      toast.show('Enter your name first', 'info');
      return;
    }
    setSavingName(true);
    try {
      let avatarPath = profile.data?.avatar_path || null;
      if(photo){
        if(!['image/png','image/jpeg','image/webp'].includes(photo.mimeType || '') || (photo.size || 0)>5*1024*1024) throw new Error('Choose PNG, JPEG or WebP up to 5 MB');
        avatarPath = `${user.id}/avatar-${Date.now()}`;
        const bytes=await (await fetch(photo.uri)).arrayBuffer();
        const {error}=await supabase.storage.from('resources').upload(avatarPath,bytes,{contentType:photo.mimeType});
        if(error) throw error;
      }
      const normUrl = (u: string) => {
        const t = u.trim();
        if (!t) return '';
        return /^https?:\/\//i.test(t) ? t : `https://${t}`;
      };
      const links = [
        { label: 'LinkedIn', url: normUrl(linkedinDraft) },
        { label: 'Website', url: normUrl(websiteDraft) },
      ].filter((l) => l.url);
      for (const l of links) {
        try { new URL(l.url); } catch { throw new Error(`The ${l.label} link does not look like a valid URL`); }
      }
      const skills = skillsDraft.split(',').map((sk) => sk.trim()).filter(Boolean).slice(0, 15);
      const experience = expDraft
        .map((e) => ({ org: e.org.trim(), period: e.period.trim(), role: e.role.trim() }))
        .filter((e) => e.role || e.org)
        .slice(0, 10);
      const education = eduDraft
        .map((e) => ({ institute: e.institute.trim(), period: e.period.trim(), qualification: e.qualification.trim() }))
        .filter((e) => e.qualification || e.institute)
        .slice(0, 10);
      const { data: saved, error: pErr } = await supabase.from('profiles').update({
        avatar_path: avatarPath, bio: bioDraft.trim().slice(0, 2000), city: cityDraft.trim(),
        course: courseDraft, education, experience, full_name: next,
        headline: headlineDraft.trim().slice(0, 120), level: levelDraft, links, skills,
      }).eq('id', user.id).select('id').single();
      if (pErr || !saved) throw pErr || new Error('Profile did not save');
      const { error: uErr } = await supabase.auth.updateUser({ data: { full_name: next } });
      if (uErr) throw uErr;
      await qc.invalidateQueries({ queryKey: ['profile', user.id] });
      await qc.invalidateQueries({ queryKey: ['profiles'] });
      toast.show('Profile updated', 'success');
      if(photo) setPhotoPreview(photo.uri);
      setEditingName(false);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save profile', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const doSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const doDelete = async () => {
    setDeleting(true);
    const removeAvatar = async () => {
      const { data: files, error: listError } = await supabase.storage.from('resources').list(user.id);
      if (listError) return false;
      const avatars = (files ?? []).filter((f) => f.name.startsWith('avatar-')).map((f) => `${user.id}/${f.name}`);
      if (!avatars.length) return true;
      const { error } = await supabase.storage.from('resources').remove(avatars);
      return !error;
    };
    try {
      if (!(await removeAvatar())) throw new Error('Could not remove your files. Check your connection and try again.');
      let { error } = await supabase.rpc('delete_my_account');
      if (error && /avatar_cleanup_required/i.test(error.message)) {
        if (!(await removeAvatar())) throw new Error('Could not remove your files. Check your connection and try again.');
        ({ error } = await supabase.rpc('delete_my_account'));
      }
      if (error) throw error;
      toast.show('Your account is deleted. Shared posts and messages stay as Former member.', 'success');
      await signOut();
      router.replace('/(auth)/login');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not delete the account. Try again.', 'error');
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SeoHead noindex description="Your Cohort account and settings." path="/account" title="Account" />
      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        {photoPreview ? <Image source={{uri:photoPreview}} style={{width:56,height:56,borderRadius:28}} /> : <Avatar name={name} size={56} />}
        <Text style={styles.meta}>{profile.data?.course} {profile.data?.level}</Text>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>{user.email}</Text>
        <Text style={[styles.badge, verified ? styles.badgeOk : styles.badgeWarn]}>
          {verified ? 'Email verified' : 'Email not verified yet - check your inbox'}
        </Text>
        {profile.data?.verified_at ? (
          <Text style={[styles.badge, styles.badgeOk]}>Verified professional - can post job openings</Text>
        ) : null}
      </Card>

      {editingName ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.label}>Your name (shown to other members)</Text>
          <TextInput
            autoFocus
            defaultValue={(user.user_metadata?.full_name as string) || ''}
            onChangeText={setNameDraft}
            placeholder="e.g. Sai Krishna"
            placeholderTextColor={colors.ink3}
            style={styles.input}
          />
          <Text style={styles.label}>Course</Text>
          <View style={{ flexDirection:'row',gap:8 }}>{['CA','CMA','CS'].map(c=><Pressable key={c} onPress={()=>setCourseDraft(c)} style={styles.ghostBtn}><Text>{courseDraft===c?'✓ ':''}{c}</Text></Pressable>)}</View>
          <Text style={styles.label}>Level</Text>
          <View style={{ flexDirection:'row',gap:8 }}>{['Foundation','Inter','Final'].map(c=><Pressable key={c} onPress={()=>setLevelDraft(c)} style={styles.ghostBtn}><Text>{levelDraft===c?'✓ ':''}{c}</Text></Pressable>)}</View>
          <Text style={styles.label}>Profile photo (PNG, JPEG, WebP, up to 5 MB)</Text>
          {Platform.OS==='web' ? createElement('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'Profile photo',onChange:(e:{target:{files:FileList|null}})=>{const f=e.target.files?.[0];if(f)setPhoto({uri:URL.createObjectURL(f),name:f.name,mimeType:f.type,size:f.size})}}) : <Pressable onPress={async()=>{const r=await DocumentPicker.getDocumentAsync({type:['image/png','image/jpeg','image/webp']});if(!r.canceled)setPhoto(r.assets[0]);}}><Text>Choose photo</Text></Pressable>}
          {photo && <Text style={styles.meta}>{photo.name}</Text>}
          <Text style={styles.label}>City</Text>
          <TextInput onChangeText={setCityDraft} placeholder="e.g. Hyderabad" placeholderTextColor={colors.ink3} style={styles.input} value={cityDraft} />
          <Text style={styles.label}>Headline (one line about you)</Text>
          <TextInput maxLength={120} onChangeText={setHeadlineDraft} placeholder="e.g. CA Inter student, article assistant" placeholderTextColor={colors.ink3} style={styles.input} value={headlineDraft} />
          <Text style={styles.label}>About you</Text>
          <TextInput multiline onChangeText={setBioDraft} placeholder="A short bio members see on your profile" placeholderTextColor={colors.ink3} style={[styles.input, { minHeight: 80 }]} value={bioDraft} />
          <Text style={styles.label}>Skills (comma separated)</Text>
          <TextInput onChangeText={setSkillsDraft} placeholder="e.g. Direct tax, Audit, Excel" placeholderTextColor={colors.ink3} style={styles.input} value={skillsDraft} />
          <Text style={styles.label}>LinkedIn URL</Text>
          <TextInput autoCapitalize="none" onChangeText={setLinkedinDraft} placeholder="https://linkedin.com/in/your-name" placeholderTextColor={colors.ink3} style={styles.input} value={linkedinDraft} />
          <Text style={styles.label}>Website or other link</Text>
          <TextInput autoCapitalize="none" onChangeText={setWebsiteDraft} placeholder="https://…" placeholderTextColor={colors.ink3} style={styles.input} value={websiteDraft} />
          <Text style={styles.label}>Experience</Text>
          {expDraft.map((e, i) => (
            <View key={i} style={{ gap: 6 }}>
              <TextInput onChangeText={(v) => setExpDraft((rows) => rows.map((r, j) => (j === i ? { ...r, role: v } : r)))} placeholder="Role, e.g. Article assistant" placeholderTextColor={colors.ink3} style={styles.input} value={e.role} />
              <TextInput onChangeText={(v) => setExpDraft((rows) => rows.map((r, j) => (j === i ? { ...r, org: v } : r)))} placeholder="Firm or company" placeholderTextColor={colors.ink3} style={styles.input} value={e.org} />
              <TextInput onChangeText={(v) => setExpDraft((rows) => rows.map((r, j) => (j === i ? { ...r, period: v } : r)))} placeholder="Period, e.g. 2024 - present" placeholderTextColor={colors.ink3} style={styles.input} value={e.period} />
              <Pressable onPress={() => setExpDraft((rows) => rows.filter((_, j) => j !== i))}><Text style={styles.danger}>Remove this experience</Text></Pressable>
            </View>
          ))}
          {expDraft.length < 10 && (
            <Pressable onPress={() => setExpDraft((rows) => [...rows, { org: '', period: '', role: '' }])} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Add experience</Text>
            </Pressable>
          )}
          <Text style={styles.label}>Education</Text>
          {eduDraft.map((e, i) => (
            <View key={i} style={{ gap: 6 }}>
              <TextInput onChangeText={(v) => setEduDraft((rows) => rows.map((r, j) => (j === i ? { ...r, qualification: v } : r)))} placeholder="Qualification, e.g. B.Com" placeholderTextColor={colors.ink3} style={styles.input} value={e.qualification} />
              <TextInput onChangeText={(v) => setEduDraft((rows) => rows.map((r, j) => (j === i ? { ...r, institute: v } : r)))} placeholder="Institute or university" placeholderTextColor={colors.ink3} style={styles.input} value={e.institute} />
              <TextInput onChangeText={(v) => setEduDraft((rows) => rows.map((r, j) => (j === i ? { ...r, period: v } : r)))} placeholder="Period, e.g. 2021 - 2024" placeholderTextColor={colors.ink3} style={styles.input} value={e.period} />
              <Pressable onPress={() => setEduDraft((rows) => rows.filter((_, j) => j !== i))}><Text style={styles.danger}>Remove this education</Text></Pressable>
            </View>
          ))}
          {eduDraft.length < 10 && (
            <Pressable onPress={() => setEduDraft((rows) => [...rows, { institute: '', period: '', qualification: '' }])} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Add education</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => setEditingName(false)} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable disabled={savingName} onPress={saveName} style={styles.cta}>
              <Text style={styles.ctaText}>{savingName ? 'Saving…' : 'Save profile'}</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable onPress={() => {
            const linksOf = profile.data?.links ?? [];
            setNameDraft(name);
            setCourseDraft(profile.data?.course||'');
            setLevelDraft(profile.data?.level||'');
            setPhoto(null);
            setHeadlineDraft(profile.data?.headline || '');
            setBioDraft(profile.data?.bio || '');
            setCityDraft(profile.data?.city || '');
            setSkillsDraft((profile.data?.skills ?? []).join(', '));
            setLinkedinDraft(linksOf.find((l) => l.label === 'LinkedIn')?.url || '');
            setWebsiteDraft(linksOf.find((l) => l.label === 'Website')?.url || '');
            setExpDraft((profile.data?.experience ?? []).map((e) => ({ ...e })));
            setEduDraft((profile.data?.education ?? []).map((e) => ({ ...e })));
            setEditingName(true);
          }}  style={styles.cta}>
          <Text style={styles.ctaText}>Edit profile</Text>
        </Pressable>
      )}

      <Pressable onPress={doSignOut} style={styles.cta}>
        <Text style={styles.ctaText}>Sign out</Text>
      </Pressable>

      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)}>
          <Text style={styles.danger}>Delete account</Text>
        </Pressable>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.body}>
            This permanently removes your account and your profile details. Posts, messages and shared files stay
            visible to others under &quot;Former member&quot; - personal details you wrote inside that content remain part
            of it. Job openings you posted close, and groups you created pass to another member or are removed if
            empty. This cannot be undone.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => setConfirming(false)} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Keep my account</Text>
            </Pressable>
            <Pressable disabled={deleting} onPress={doDelete} style={styles.dangerBtn}>
              <Text style={styles.ctaText}>{deleting ? 'Deleting…' : 'Delete permanently'}</Text>
            </Pressable>
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  name: { ...typeScale.sectionTitle, color: colors.ink },
  meta: { ...typeScale.caption, color: colors.ink3 },
  body: { ...typeScale.body, color: colors.ink2 },
  badge: { ...typeScale.caption, borderRadius: radius.pill, fontWeight: '600', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4 },
  badgeOk: { backgroundColor: '#eef4ec', color: '#3f6440' },
  badgeWarn: { backgroundColor: colors.brandSoft, color: colors.brandDeep },
  cta: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingVertical: 12,
  },
  ctaText: { ...typeScale.body, color: colors.brandDeep, fontWeight: '600' },
  label: { ...typeScale.caption, color: colors.ink3 },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, padding: 10,
  },
  danger: { ...typeScale.caption, color: colors.brandDeep, fontWeight: '600', textAlign: 'center' },
  dangerBtn: {
    alignItems: 'center', backgroundColor: colors.brandDeep, borderRadius: radius.pill,
    flex: 1, paddingVertical: 10,
  },
  ghostBtn: {
    alignItems: 'center', borderColor: colors.lineWarm, borderRadius: radius.pill,
    borderWidth: 1, flex: 1, paddingVertical: 10,
  },
  ghostText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
});
