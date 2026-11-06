/**
 * Prep-stage Clerk sign-in form (flag-gated). Email+password via the Clerk
 * Expo SDK v4, including the new-device email-code step (Device Trust).
 * Signup and password reset are item-3 scope and intentionally absent here.
 */
import { useSignIn } from '@clerk/expo';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { Card } from '@/components/Card';
import { colors, radius, spacing } from '@/theme';

type Stage = 'credentials' | 'emailCode';

export function ClerkSignInForm() {
  // Clerk SDK v4 "future" sign-in resource: password() / mfa.* / finalize().
  const { signIn } = useSignIn();
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const afterStep = async (err: { message?: string } | null) => {
    if (err) {
      setError(err.message ?? 'Sign-in failed');
      return;
    }
    if (signIn.status === 'complete') {
      const fin = await signIn.finalize();
      if (fin.error) setError(fin.error.message ?? 'Could not activate session');
    } else if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      // needs_client_trust = new device; Clerk proves it via an emailed code
      // (Device Trust), same mfa email-code path as a second factor.
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) setError(sent.error.message ?? 'Could not send email code');
      else setStage('emailCode');
    } else {
      setError(`Unexpected status: ${String(signIn.status)}`);
    }
  };

  const submitPassword = async () => {
    setBusy(true);
    setError('');
    try {
      const { error } = await signIn.password({ identifier: email.trim(), password });
      await afterStep(error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError('');
    try {
      const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      await afterStep(error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      {stage === 'credentials' ? (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="test user email"
            style={styles.input}
            value={email}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable disabled={busy} onPress={() => void submitPassword()} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Sign in'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.muted}>New-device check: Clerk emailed a 6-digit code.</Text>
          <Text style={styles.label}>Email code</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="number-pad"
            onChangeText={setCode}
            placeholder="123456"
            style={styles.input}
            value={code}
          />
          <Pressable disabled={busy} onPress={() => void submitCode()} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Verify'}</Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.card,
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  buttonText: { color: colors.cream, fontWeight: '700' },
  error: { color: '#b00020', marginTop: spacing.sm },
  input: {
    backgroundColor: colors.cream,
    borderColor: colors.brand,
    borderRadius: radius.input,
    borderWidth: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: { fontWeight: '600', marginBottom: 4 },
  muted: { color: '#666', fontSize: 12 },
});
