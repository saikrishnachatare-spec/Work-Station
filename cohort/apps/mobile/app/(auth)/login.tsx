/**
 * Sign in, create account (email verification) and password reset.
 * Validation, loading and error states are handled inline.
 */
import { COURSES, LEVELS } from '@/lib/demo-data';
import { SeoHead } from '@/components/SeoHead';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, type as typeScale } from '@/theme';
import { Turnstile } from '@/components/Turnstile';
import { env } from '@/lib/env';

type Mode = 'signin' | 'signup' | 'reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Collected at signup for contact data only - never verified by SMS.
// Kept private (owner and admins only), never shown on public profiles.
const PHONE_REQUIRED = true;
const PHONE_RE = /^\+?\d{8,15}$/;
const normalizePhone = (raw: string) => raw.replace(/[\s().-]/g, '');

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [acctType, setAcctType] = useState<'individual' | 'firm' | 'enterprise'>('individual');
  const [orgName, setOrgName] = useState('');
  const [course, setCourse] = useState<'CA' | 'CMA' | 'CS'>('CA');
  const [level, setLevel] = useState('Inter');
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);
  };

  const validate = (): string => {
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (mode !== 'reset') {
      if (mode === 'signup' && password.length < 8) return 'Password must be at least 8 characters.';
      if (mode === 'signup' && !name.trim()) return 'Tell us your name so people know you.';
      if (mode === 'signup' && acctType !== 'individual' && !orgName.trim()) return 'Tell us your firm or company name.';
      if (mode === 'signup' && acctType === 'individual' && !level) return 'Pick your level, or Member if you are qualified.';
      if (mode === 'signup' && PHONE_REQUIRED && !phone.trim()) return 'Add your phone number with country code, like +91 98765 43210.';
      if (mode === 'signup' && phone.trim() && !PHONE_RE.test(normalizePhone(phone)))
        return 'That phone number does not look right. Use your country code, like +91 98765 43210.';
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
    if (env.turnstileSiteKey && !captchaToken) {
      setBusy(false);
      setError('Please complete the bot check first.');
      return;
    }
    try {
      if (mode === 'signin') {
        const { data: signInData, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        if (err) throw err;
        // Firm and company accounts get the company panel as their home,
        // not the individual member feed.
        const { data: prof } = signInData.user
          ? await supabase.from('profiles').select('account_type').eq('id', signInData.user.id).maybeSingle()
          : { data: null };
        router.replace(prof && prof.account_type && prof.account_type !== 'individual' ? '/company' : '/');
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          options: {
            captchaToken: captchaToken ?? undefined,
            data: {
              full_name: name.trim(),
              account_type: acctType,
              org_name: acctType === 'individual' ? '' : orgName.trim(),
              course,
              level: acctType === 'individual' ? level : '',
              phone: phone.trim() ? normalizePhone(phone) : '',
            },
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
          captchaToken: captchaToken ?? undefined,
        });
        if (err) throw err;
        setInfo('Password reset link sent. Check your email.');
      }
    } catch (err) {
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
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
          <>
            <TextInput
              autoComplete="name"
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={colors.ink3}
              style={styles.input}
              value={name}
            />
            <View style={styles.typeRow}>
              {([['individual', 'Individual'], ['firm', 'Firm'], ['enterprise', 'Company']] as const).map(([v, label]) => (
                <Pressable key={v} onPress={() => setAcctType(v)} style={[styles.typeChip, acctType === v && styles.typeChipOn]}>
                  <Text style={[styles.typeChipText, acctType === v && styles.typeChipTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.typeRow}>
              {((acctType === 'enterprise' ? [] : COURSES) as ('CA' | 'CMA' | 'CS')[]).map((c) => (
                <Pressable key={c} onPress={() => { setCourse(c); setLevel(c === 'CS' ? 'Executive' : 'Inter'); }} style={[styles.typeChip, course === c && styles.typeChipOn]}>
                  <Text style={[styles.typeChipText, course === c && styles.typeChipTextOn]}>
                    {acctType === 'firm' ? `${c} firm` : c}
                  </Text>
                </Pressable>
              ))}
            </View>
            {acctType === 'individual' && (
              <View style={[styles.typeRow, { flexWrap: 'wrap' }]}>
                {[...(LEVELS[course] ?? []), 'Member'].map((l) => (
                  <Pressable key={l} onPress={() => setLevel(l)} style={[styles.typeChip, level === l && styles.typeChipOn]}>
                    <Text style={[styles.typeChipText, level === l && styles.typeChipTextOn]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {acctType !== 'individual' && (
              <TextInput
                onChangeText={setOrgName}
                placeholder={acctType === 'firm' ? 'Firm name' : 'Company name'}
                placeholderTextColor={colors.ink3}
                style={styles.input}
                value={orgName}
              />
            )}
          </>
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
        {mode === 'signup' && (
          <>
            <TextInput
              autoComplete="tel"
              keyboardType="phone-pad"
              onChangeText={setPhone}
              placeholder="Phone number (with country code)"
              placeholderTextColor={colors.ink3}
              style={styles.input}
              value={phone}
            />
            <Text style={styles.phoneNote}>
              We do not verify this number by SMS. It stays private - only you and the admins can see it.
            </Text>
          </>
        )}
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

        {env.turnstileSiteKey ? (
          <Turnstile siteKey={env.turnstileSiteKey} onToken={setCaptchaToken} resetSignal={captchaReset} />
        ) : null}
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

      <Text style={styles.legal}>
        By continuing you agree to our <Text style={styles.legalLink} onPress={() => router.push('/terms')}>Terms</Text> and{' '}
        <Text style={styles.legalLink} onPress={() => router.push('/privacy')}>Privacy policy</Text>.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: { backgroundColor: colors.card, borderColor: colors.hairline, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  typeChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  typeChipText: { color: colors.ink2, fontSize: 12, fontWeight: '600' as const },
  typeChipTextOn: { color: colors.brandDeep },
  page: {
    alignItems: 'center', backgroundColor: colors.cream, flexGrow: 1,
    gap: spacing.md, justifyContent: 'center', padding: spacing.lg,
  },
  brand: { color: colors.brand, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
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
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill,
    paddingVertical: 12,
  },
  ctaBusy: { opacity: 0.6 },
  ctaText: { ...typeScale.body, color: colors.brandDeep, fontWeight: '600' },
  link: { ...typeScale.caption, color: colors.brand, fontWeight: '600', textAlign: 'center' },
  phoneNote: { ...typeScale.caption, color: colors.ink3, marginTop: -spacing.sm },
  error: { ...typeScale.caption, color: colors.brandDeep },
  infoText: { ...typeScale.caption, color: '#3f6440' },
  legal: { ...typeScale.caption, color: colors.ink3, marginTop: spacing.lg, textAlign: 'center' },
  legalLink: { color: colors.brand },
});
