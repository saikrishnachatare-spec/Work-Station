/** Account screen: profile, verification status, sign out, delete account. */
import { SeoHead } from '@/components/SeoHead';
import { createElement, useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useMyProfile } from '@/lib/data';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { signOut, useAuth } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { guest, session } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const profile = useMyProfile(session?.user.id);
  const [courseDraft, setCourseDraft] = useState('');
  const [levelDraft, setLevelDraft] = useState('');
  const [photo, setPhoto] = useState<{uri:string;name:string;mimeType?:string;size?:number}|null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  useEffect(()=>{if(profile.data?.avatar_path) supabase.storage.from('resources').createSignedUrl(profile.data.avatar_path,3600).then(({data})=>{if(data)setPhotoPreview(data.signedUrl);});},[profile.data?.avatar_path]);
  const toast = useToast();
  const qc = useQueryClient();

  if (guest || !session) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>You are browsing the demo as a guest.</Text>
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
      const { data: saved, error: pErr } = await supabase.from('profiles').update({ full_name: next, course: courseDraft, level: levelDraft, avatar_path: avatarPath }).eq('id', user.id).select('id').single();
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
    toast.show('Account deletion is not available yet. Your account has not been deleted.', 'info');
    setConfirming(false);
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
        <Pressable onPress={() => {setNameDraft(name);setCourseDraft(profile.data?.course||'');setLevelDraft(profile.data?.level||'');setPhoto(null);setEditingName(true);}}  style={styles.cta}>
          <Text style={styles.ctaText}>Edit profile</Text>
        </Pressable>
      )}

      <Pressable onPress={doSignOut} style={styles.cta}>
        <Text style={styles.ctaText}>Sign out</Text>
      </Pressable>

      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)}>
          <Text style={styles.danger}>Account deletion unavailable</Text>
        </Pressable>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.body}>
            Self-service account deletion is not ready. This action will not delete your account or personal data.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable onPress={() => setConfirming(false)} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Keep my account</Text>
            </Pressable>
            <Pressable onPress={doDelete} style={styles.dangerBtn}>
              <Text style={styles.ctaText}>Understood</Text>
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
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 12,
  },
  ctaText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
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
