/** Landing page for the password-reset email link. */
import { SeoHead } from '@/components/SeoHead';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, type as typeScale } from '@/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes('session')
          ? 'This reset link has expired. Request a new one from the sign-in screen.'
          : err.message,
      );
      return;
    }
    setDone(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <SeoHead noindex description="Reset your Cohort password." path="/reset-password" title="Reset password" />
      <Card style={{ gap: spacing.md, maxWidth: 420, width: '100%' }}>
        <Text style={styles.title}>Set a new password</Text>
        {done ? (
          <>
            <Text style={styles.info}>Password updated. You are signed in.</Text>
            <Pressable onPress={() => router.replace('/')} style={styles.cta}>
              <Text style={styles.ctaText}>Continue to Cohort</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              onChangeText={setPassword}
              placeholder="New password (8+ characters)"
              placeholderTextColor={colors.ink3}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <TextInput
              onChangeText={setConfirm}
              onSubmitEditing={submit}
              placeholder="Repeat the new password"
              placeholderTextColor={colors.ink3}
              secureTextEntry
              style={styles.input}
              value={confirm}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable disabled={busy} onPress={submit} style={[styles.cta, busy && { opacity: 0.6 }]}>
              <Text style={styles.ctaText}>{busy ? 'Saving…' : 'Save new password'}</Text>
            </Pressable>
          </>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center', backgroundColor: colors.cream, flexGrow: 1,
    justifyContent: 'center', padding: spacing.lg,
  },
  title: { ...typeScale.screenTitle, color: colors.ink },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  cta: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill,
    paddingVertical: 12,
  },
  ctaText: { ...typeScale.body, color: colors.brandDeep, fontWeight: '600' },
  error: { ...typeScale.caption, color: colors.brandDeep },
  info: { ...typeScale.body, color: '#3f6440' },
});
