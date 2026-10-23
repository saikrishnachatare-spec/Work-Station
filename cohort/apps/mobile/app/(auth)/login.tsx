/**
 * Sign in, create account (email verification) and password reset.
 * Validation, loading and error states are handled inline.
 */
import { SeoHead } from '@/components/SeoHead';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { continueAsGuest } from '@/store/session';
import { colors, radius, spacing, type as typeScale } from '@/theme';

type Mode = 'signin' | 'signup' | 'reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const validate = (): string => {
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (mode !== 'reset') {
      if (password.length < 8) return 'Password must be at least 8 characters.';
      if (mode === 'signup' && !name.trim()) return 'Tell us your name so people know you.';
    }
    return '';
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        router.replace('/');
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: 'https://cohort-pi-eight.vercel.app',
          },
          password,
        });
        if (err) throw err;
        if (data.session) {
          router.replace('/');
        } else {
          setInfo('Account created. Check your email for the verification link, then sign in.');
          switchMode('signin');
          setInfo('Account created. Check your email for the verification link, then sign in.');
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: 'https://cohort-pi-eight.vercel.app/reset-password',
        });
        if (err) throw err;
        setInfo('Password reset link sent. Check your email.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Try again.';
      setError(
        message.includes('Invalid login credentials')
          ? 'Wrong email or password. Try again, or reset your password below.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <SeoHead description="Log in or create your Cohort account - the community for CA students and professionals." path="/login" title="Log in" />
      <Text style={styles.brand}>Cohort</Text>
      <Text style={styles.tagline}>The CA · CMA · CS student community</Text>

      <Card style={{ gap: spacing.md }}>
        <View style={styles.modeRow}>
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <Pressable key={m} onPress={() => switchMode(m)} style={[styles.modeBtn, mode === m && styles.modeOn]}>
              <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'signup' && (
          <TextInput
            autoComplete="name"
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.ink3}
            style={styles.input}
            value={name}
          />
        )}
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.ink3}
          style={styles.input}
          value={email}
        />
        {mode !== 'reset' && (
          <TextInput
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
            placeholderTextColor={colors.ink3}
            secureTextEntry
            style={styles.input}
            value={password}
          />
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!info && <Text style={styles.infoText}>{info}</Text>}

        <Pressable disabled={busy} onPress={submit} style={[styles.cta, busy && styles.ctaBusy]}>
          <Text style={styles.ctaText}>
            {busy
              ? 'One moment…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </Text>
        </Pressable>

        <Pressable onPress={() => switchMode(mode === 'reset' ? 'signin' : 'reset')}>
          <Text style={styles.link}>
            {mode === 'reset' ? 'Back to sign in' : 'Forgot your password?'}
          </Text>
        </Pressable>
      </Card>

      <Pressable
        onPress={() => {
          continueAsGuest();
          router.replace('/');
        }}
      >
        <Text style={styles.link}>Browse the demo without an account</Text>
      </Pressable>

      <Text style={styles.legal}>
        By continuing you agree to our <Text style={styles.legalLink} onPress={() => router.push('/terms')}>Terms</Text> and{' '}
        <Text style={styles.legalLink} onPress={() => router.push('/privacy')}>Privacy policy</Text>.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center', backgroundColor: colors.cream, flexGrow: 1,
    gap: spacing.md, justifyContent: 'center', padding: spacing.lg,
  },
  brand: { color: colors.brand, fontFamily: 'Georgia', fontSize: 34, letterSpacing: -0.5 },
  tagline: { ...typeScale.caption, color: colors.ink2, marginBottom: spacing.sm },
  modeRow: { backgroundColor: colors.raised, borderRadius: radius.input, flexDirection: 'row', padding: 3 },
  modeBtn: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 8 },
  modeOn: { backgroundColor: colors.card },
  modeText: { ...typeScale.caption, color: colors.ink2, fontWeight: '600' },
  modeTextOn: { color: colors.brand },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  cta: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingVertical: 12,
  },
  ctaBusy: { opacity: 0.6 },
  ctaText: { ...typeScale.body, color: '#fff', fontWeight: '600' },
  link: { ...typeScale.caption, color: colors.brand, fontWeight: '600', textAlign: 'center' },
  error: { ...typeScale.caption, color: colors.brandDeep },
  infoText: { ...typeScale.caption, color: '#3f6440' },
  legal: { ...typeScale.caption, color: colors.ink3, marginTop: spacing.lg, textAlign: 'center' },
  legalLink: { color: colors.brand },
});
