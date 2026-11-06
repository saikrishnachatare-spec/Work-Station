/**
 * Flag-on gate for a valid Clerk sign-in with no test-profile binding.
 *
 * Two situations land here:
 *  1. Fresh signup: a pending-onboarding payload exists for this sub (stashed
 *     by ClerkSignUpForm before finalize). Run POST /api/me/bootstrap once,
 *     automatically. 201 -> reload into the mapped app. 403 -> the test owner
 *     has not allowlisted this synthetic identity yet: say so and offer Retry
 *     (safe - the server route is atomic and sub-keyed; a retry after an
 *     unknown outcome comes back 409, which means the earlier attempt
 *     actually committed, so we clear and reload). Other errors show the
 *     server's reason and Retry.
 *  2. Plain sign-in of an unbound identity (no payload): the original
 *     blocked-state message, unchanged.
 */
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { ApiError, api } from '@/lib/api';
import { signOut } from '@/store/session';
import { colors } from '@/theme';

import { clearPendingBootstrap, peekPendingBootstrapFor } from './pending-bootstrap';

type GateState = 'no-payload' | 'idle' | 'working' | 'allowlist-pending' | 'error';

export function ClerkPrepUnmappedGate() {
  const { userId } = useClerkAuth();
  const pending = userId ? peekPendingBootstrapFor(userId) : null;
  const [state, setState] = useState<GateState>(pending ? 'idle' : 'no-payload');
  const [reason, setReason] = useState('');
  const inFlight = useRef(false);

  const attempt = useCallback(async () => {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setState('working');
    setReason('');
    try {
      await api('/api/me/bootstrap', {
        auth: 'required',
        body: {
          full_name: pending.full_name,
          account_type: pending.account_type,
          org_name: pending.org_name,
          course: pending.course,
          level: pending.level,
          phone: pending.phone,
        },
      });
      clearPendingBootstrap();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        // A previous attempt committed but its response never arrived; the
        // binding exists now. Not a duplicate - finish as success.
        clearPendingBootstrap();
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
        return;
      }
      if (err.status === 403) setState('allowlist-pending');
      else {
        setState('error');
        setReason(e instanceof Error ? e.message : String(e));
      }
    } finally {
      inFlight.current = false;
    }
  }, [pending]);

  useEffect(() => {
    if (state === 'idle') void attempt();
  }, [attempt, state]);

  return (
    <View style={{ alignItems: 'center', backgroundColor: colors.cream, flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: colors.brand, fontSize: 20, fontWeight: '800', marginBottom: 8 }}>Not a preview test account</Text>
      {state === 'no-payload' && (
        <Text style={{ color: '#555', textAlign: 'center' }}>
          This sign-in is not on the preview allowlist, so member features stay off. Only synthetic test identities can
          use the preview.
        </Text>
      )}
      {state === 'working' && <Text style={{ color: '#555' }}>Finishing onboarding...</Text>}
      {state === 'allowlist-pending' && (
        <Text style={{ color: '#555', textAlign: 'center' }}>
          Your account was created. It stays blocked until the test owner allowlists this synthetic identity (a
          preview-only step; the production app will not have it). Tap Retry after the owner confirms.
        </Text>
      )}
      {state === 'error' && (
        <Text style={{ color: '#b00020', textAlign: 'center' }}>Onboarding failed: {reason}</Text>
      )}
      {(state === 'allowlist-pending' || state === 'error') && (
        <Pressable
          onPress={() => void attempt()}
          style={{ backgroundColor: colors.brand, borderRadius: 8, marginTop: 16, paddingHorizontal: 20, paddingVertical: 10 }}
        >
          <Text style={{ color: colors.cream, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => {
          clearPendingBootstrap();
          void signOut();
        }}
        style={{ borderColor: colors.brand, borderRadius: 8, borderWidth: 1, marginTop: 12, paddingHorizontal: 20, paddingVertical: 10 }}
      >
        <Text style={{ color: colors.brand }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
