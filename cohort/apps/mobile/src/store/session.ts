/**
 * Auth session state, plus a guest flag so the demo content stays browsable
 * without an account.
 *
 * Two backends, selected by the EXPO_PUBLIC_CLERK_PREP build flag:
 * - flag OFF (default): Supabase auth, exactly as before.
 * - flag ON (prep preview): the Clerk dev instance drives sign-in. The
 *   session's user.id is the cohortUserId the prep worker reports for the
 *   Clerk session (allowlisted synthetic binding). A signed-in but UNMAPPED
 *   account (valid Clerk session, no test-profile binding) is surfaced via
 *   `unmapped` so the app can show an explicit blocked state instead of
 *   blank private UI.
 */
import type { Session } from '@supabase/supabase-js';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { useEffect, useState } from 'react';

import { api, clerkSignOutNow } from '@/lib/api';
import { CLERK_PREP_ENABLED } from '@/lib/clerk';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

let guest = false;
const guestListeners = new Set<() => void>();

export function isGuest() {
  return guest;
}

export function continueAsGuest() {
  guest = true;
  guestListeners.forEach((l) => l());
}

export function leaveGuest() {
  guest = false;
  guestListeners.forEach((l) => l());
}

export type AuthState = {
  loading: boolean;
  session: Session | null;
  guest: boolean;
  /** Flag-on only: signed in to Clerk but not bound to a test profile. */
  unmapped: boolean;
};

function useGuestFlag() {
  const [isGuestNow, setIsGuestNow] = useState(guest);
  useEffect(() => {
    const listener = () => setIsGuestNow(guest);
    guestListeners.add(listener);
    return () => {
      guestListeners.delete(listener);
    };
  }, []);
  return isGuestNow;
}

function useSupabaseAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isGuestNow = useGuestFlag();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) leaveGuest();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return { guest: isGuestNow, loading, session, unmapped: false };
}

type MeState = { cohortUserId: string | null } | 'pending' | 'error';

function useClerkPrepAuth(): AuthState {
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const { user } = useUser();
  const isGuestNow = useGuestFlag();
  const [me, setMe] = useState<MeState>('pending');

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setMe('pending');
      return;
    }
    let live = true;
    setMe('pending');
    api<{ cohortUserId: string | null }>('/api/me', { auth: 'required' })
      .then((r) => {
        if (live) setMe(r);
      })
      .catch(() => {
        if (live) setMe('error');
      });
    return () => {
      live = false;
    };
  }, [isLoaded, isSignedIn, userId]);

  const loading = !isLoaded || (!!isSignedIn && me === 'pending');
  const unmapped = !!isSignedIn && typeof me === 'object' && me !== null && !me.cohortUserId;
  const session =
    isSignedIn && typeof me === 'object' && me !== null
      ? ({
          user: {
            email: user?.primaryEmailAddress?.emailAddress ?? '',
            // The cohort id the worker bound this Clerk session to; empty
            // when unmapped (see `unmapped`) so member queries stay off.
            id: me.cohortUserId ?? '',
            user_metadata: { full_name: user?.fullName ?? '' },
            // Screens read this Supabase-shaped field; map Clerk's
            // verification status so the badge reflects the Clerk account.
            email_confirmed_at:
              user?.primaryEmailAddress?.verification?.status === 'verified' ? 'clerk-verified' : undefined,
          },
        } as unknown as Session)
      : null;
  return { guest: isGuestNow, loading, session, unmapped };
}

export function useAuth(): AuthState {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- build-time constant: exactly one branch is ever bundled per build.
  return CLERK_PREP_ENABLED ? useClerkPrepAuth() : useSupabaseAuth();
}

export async function signOut() {
  leaveGuest();
  // Clear cached server data on every sign-out so the next session on this
  // device (a different account, or a guest) never sees the previous
  // account's private query snapshots (stage-2 browser-verification fix).
  queryClient.clear();
  if (CLERK_PREP_ENABLED) {
    await clerkSignOutNow();
    return;
  }
  await supabase.auth.signOut();
}
