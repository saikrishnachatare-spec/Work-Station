/**
 * Prep-stage Clerk password reset (flag-gated, stage 3): email -> emailed
 * code -> new password, via the Clerk dev instance's reset_password_email_code
 * strategy.
 */
import { useSignIn } from '@clerk/expo';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { Card } from '@/components/Card';
import { colors, radius, spacing } from '@/theme';

type Stage = 'email' | 'code' | 'done';

export function ClerkResetForm() {
  const { signIn } = useSignIn();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) { setError(created.error.message ?? 'No account found for that email'); return; }
      const { error: err } = await signIn.resetPasswordEmailCode.sendCode();
      if (err) { setError(err.message ?? 'Could not send reset code'); return; }
      setStage('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    setError('');
    try {
      const v = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (v.error) { setError(v.error.message ?? 'Wrong code'); return; }
      const s = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (s.error) { setError(s.error.message ?? 'Could not set new password'); return; }
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      {stage === 'email' && (
        <>
          <Text style={styles.label}>Account email</Text>
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="test user email" style={styles.input} value={email} />
          <Pressable disabled={busy} onPress={() => void sendCode()} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Send reset code'}</Text>
          </Pressable>
        </>
      )}
      {stage === 'code' && (
        <>
          <Text style={styles.muted}>Clerk emailed a 6-digit reset code to {email.trim()}.</Text>
          <Text style={styles.label}>Email code</Text>
          <TextInput autoCapitalize="none" keyboardType="number-pad" onChangeText={setCode} placeholder="123456" style={styles.input} value={code} />
          <Text style={styles.label}>New password</Text>
          <TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="min 8 characters" secureTextEntry style={styles.input} value={password} />
          <Pressable disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Set new password'}</Text>
          </Pressable>
        </>
      )}
      {stage === 'done' && (
        <Text style={styles.muted}>Password changed. Sign in with the new password.</Text>
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
});
