/**
 * PREP ROUTE (cloudflare-stack-prep branch only, flag-gated).
 *
 * Exercises the real Clerk dev instance end to end from the app:
 * email+password sign-in via the Clerk Expo SDK, session token via
 * getToken(), and one authenticated call to the prep API worker's /api/me.
 * Synthetic test identities only. Not linked from anywhere in the app;
 * reachable directly at /clerk-prep when EXPO_PUBLIC_CLERK_PREP=1.
 */
import { useAuth, useSignIn, useClerk } from '@clerk/expo';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/Card';
import { CLERK_PREP_API_URL, CLERK_PREP_ENABLED } from '@/lib/clerk';
import { colors, radius, spacing } from '@/theme';

type Stage = 'credentials' | 'emailCode';

export default function ClerkPrepScreen() {
  // Flag check first: under flag-off no ClerkProvider is mounted, so any
  // Clerk hook would throw here (static export renders this route too).
  if (!CLERK_PREP_ENABLED) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Clerk prep disabled</Text>
        <Text style={styles.muted}>Set EXPO_PUBLIC_CLERK_PREP=1 to use this route.</Text>
      </View>
    );
  }
  return <ClerkPrepInner />;
}

function ClerkPrepInner() {
  const { isSignedIn } = useAuth();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Clerk prep (dev instance)</Text>
      <Text style={styles.muted}>Synthetic test users only. Branch preparation, not production.</Text>
      {isSignedIn ? <SignedInCard /> : <SignInCard />}
    </ScrollView>
  );
}

function SignInCard() {
  // Clerk SDK v4 "future" sign-in resource: password() / mfa.* / finalize().
  const { signIn } = useSignIn();
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const afterStep = async (error: { message?: string } | null) => {
    if (error) {
      setError(error.message ?? 'Sign-in failed');
      return;
    }
    if (signIn.status === 'complete') {
      const fin = await signIn.finalize();
      if (fin.error) setError(fin.error.message ?? 'Could not activate session');
    } else if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      // needs_client_trust = new device; Clerk proves it via an emailed code
      // (Device Trust), same mfa email-code path as a second factor.
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) {
        setError(sent.error.message ?? 'Could not send email code');
      } else {
        setStage('emailCode');
      }
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
          <PrepButton busy={busy} label="Sign in" onPress={() => void submitPassword()} />
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
          <PrepButton busy={busy} label="Verify" onPress={() => void submitCode()} />
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function SignedInCard() {
  const { getToken, userId } = useAuth();
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  const [apiResult, setApiResult] = useState('');

  const callWorker = async () => {
    setBusy(true);
    setApiResult('');
    try {
      const token = await getToken();
      if (!token) throw new Error('no session token');
      const res = await fetch(`${CLERK_PREP_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.text();
      setApiResult(`HTTP ${res.status}\n${body}`);
    } catch (e) {
      setApiResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={styles.label}>Signed in (Clerk user id)</Text>
      <Text selectable style={styles.mono}>{userId ?? 'unknown'}</Text>
      <PrepButton busy={busy} label="Call prep API worker /api/me" onPress={() => void callWorker()} />
      <PrepButton busy={false} label="Sign out" onPress={() => void clerk.signOut()} />
      {apiResult ? <Text selectable style={styles.mono}>{apiResult}</Text> : null}
    </Card>
  );
}

function PrepButton({ busy, label, onPress }: { busy: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
      <Text style={styles.buttonText}>{busy ? 'Working...' : label}</Text>
    </Pressable>
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
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  container: { gap: spacing.md, padding: spacing.lg },
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
  mono: { fontFamily: 'monospace', fontSize: 12, marginTop: spacing.sm },
  muted: { color: '#666', fontSize: 12 },
  title: { color: colors.brand, fontSize: 20, fontWeight: '800' },
});
