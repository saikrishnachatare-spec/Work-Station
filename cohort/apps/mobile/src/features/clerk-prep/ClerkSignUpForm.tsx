/**
 * Prep-stage Clerk sign-up + onboarding (flag-gated, stage 3). Mirrors the
 * product signup fields and client validation from app/(auth)/login.tsx
 * (name, account type, org, course, level, REQUIRED phone, email, password
 * min 8) but authenticates through the Clerk dev instance (email OTP) and
 * onboards through the preview-only POST /api/me/bootstrap fixture.
 * Preview fixture notice: new accounts stay blocked until the owner
 * allowlists the sub server-side (wrangler) - that gate does NOT exist in
 * the production signup design.
 */
import { useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/Card';
import { api } from '@/lib/api';
import { COURSES, LEVELS } from '@/lib/demo-data';
import { colors, radius, spacing } from '@/theme';

type Stage = 'form' | 'emailCode' | 'pendingAllowlist';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{8,15}$/;
const normalizePhone = (raw: string) => raw.replace(/[\s().-]/g, '');

export function ClerkSignUpForm() {
  const { signUp } = useSignUp();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('form');
  const [acctType, setAcctType] = useState<'individual' | 'firm' | 'enterprise'>('individual');
  const [orgName, setOrgName] = useState('');
  const [course, setCourse] = useState<'CA' | 'CMA' | 'CS'>('CA');
  const [level, setLevel] = useState('Inter');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const validate = (): string => {
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!name.trim()) return 'Tell us your name so people know you.';
    if (acctType !== 'individual' && !orgName.trim()) return 'Tell us your firm or company name.';
    if (acctType === 'individual' && !level) return 'Pick your level, or Member if you are qualified.';
    if (!phone.trim()) return 'Add your phone number with country code, like +91 98765 43210.';
    if (!PHONE_RE.test(normalizePhone(phone))) return 'That phone number does not look right. Use your country code, like +91 98765 43210.';
    return '';
  };

  const submitForm = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      const { error: err } = await signUp.password({ emailAddress: email.trim(), password });
      if (err) { setError(err.message ?? 'Sign-up failed'); return; }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) { setError(sent.error.message ?? 'Could not send email code'); return; }
      setStage('emailCode');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const bootstrap = async (): Promise<'ok' | 'pending' | 'failed'> => {
    try {
      await api('/api/me/bootstrap', {
        auth: 'required',
        body: {
          full_name: name.trim(),
          account_type: acctType,
          org_name: acctType === 'individual' ? '' : orgName.trim(),
          course,
          level: acctType === 'individual' ? level : '',
          phone: normalizePhone(phone),
        },
      });
      return 'ok';
    } catch (e) {
      const reason = (e as { reason?: string })?.reason;
      if (reason === 'not_on_bootstrap_allowlist') return 'pending';
      setError(e instanceof Error ? e.message : 'Onboarding failed');
      return 'failed';
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError('');
    try {
      const { error: err } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (err) { setError(err.message ?? 'Wrong code'); return; }
      if (signUp.status !== 'complete') { setError(`Unexpected status: ${String(signUp.status)}`); return; }
      const fin = await signUp.finalize();
      if (fin.error) { setError(fin.error.message ?? 'Could not activate session'); return; }
      const outcome = await bootstrap();
      if (outcome === 'pending') { setStage('pendingAllowlist'); return; }
      if (outcome === 'failed') return;
      // The session store fetches /api/me once per sign-in; the simplest
      // reliable refresh on web is a reload (session persists via tokenCache).
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = acctType === 'individual' ? '/' : '/company';
        return;
      }
      router.replace(acctType === 'individual' ? '/' : '/company');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'pendingAllowlist') {
    return (
      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.title}>Preview allowlisting pending</Text>
        <Text style={styles.muted}>
          Your account was created and your email is verified. This test preview keeps new accounts blocked until the
          test owner allowlists the sign-in server-side (a preview-only gate; the production app has no such step).
          Once allowlisted, sign in again to finish onboarding.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      {stage === 'form' ? (
        <>
          <Text style={styles.label}>Full name</Text>
          <TextInput onChangeText={setName} placeholder="Your name" style={styles.input} value={name} />
          <View style={styles.typeRow}>
            {(['individual', 'firm', 'enterprise'] as const).map((t) => (
              <Pressable key={t} onPress={() => setAcctType(t)} style={[styles.typeChip, acctType === t && styles.typeChipOn]}>
                <Text style={[styles.typeChipText, acctType === t && styles.typeChipTextOn]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {acctType !== 'individual' && (
            <TextInput onChangeText={setOrgName} placeholder={acctType === 'firm' ? 'Firm name' : 'Company name'} style={styles.input} value={orgName} />
          )}
          <View style={styles.typeRow}>
            {(acctType === 'enterprise' ? [] : COURSES).map((c) => (
              <Pressable key={c} onPress={() => { setCourse(c as 'CA' | 'CMA' | 'CS'); setLevel(c === 'CS' ? 'Executive' : 'Inter'); }} style={[styles.typeChip, course === c && styles.typeChipOn]}>
                <Text style={[styles.typeChipText, course === c && styles.typeChipTextOn]}>{acctType === 'firm' ? `${c} firm` : c}</Text>
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
          <Text style={styles.label}>Phone (contact only, never shown publicly)</Text>
          <TextInput autoCapitalize="none" keyboardType="phone-pad" onChangeText={setPhone} placeholder="+91 98765 43210" style={styles.input} value={phone} />
          <Text style={styles.label}>Email</Text>
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="test user email" style={styles.input} value={email} />
          <Text style={styles.label}>Password</Text>
          <TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="min 8 characters" secureTextEntry style={styles.input} value={password} />
          <Pressable disabled={busy} onPress={() => void submitForm()} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Create account'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.muted}>Clerk emailed a 6-digit verification code to {email.trim()}.</Text>
          <Text style={styles.label}>Email code</Text>
          <TextInput autoCapitalize="none" keyboardType="number-pad" onChangeText={setCode} placeholder="123456" style={styles.input} value={code} />
          <Pressable disabled={busy} onPress={() => void submitCode()} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Verify and finish'}</Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.card, marginTop: spacing.md, paddingVertical: spacing.sm + 4 },
  buttonText: { color: colors.cream, fontWeight: '700' },
  error: { color: '#b00020', marginTop: spacing.sm },
  input: { backgroundColor: colors.cream, borderColor: colors.brand, borderRadius: radius.input, borderWidth: 1, marginBottom: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  label: { fontWeight: '600', marginBottom: 4 },
  muted: { color: '#666', fontSize: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  typeChip: { borderColor: colors.brand, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  typeChipOn: { backgroundColor: colors.brand },
  typeChipText: { color: colors.brand, fontSize: 13 },
  typeChipTextOn: { color: colors.cream },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
});
