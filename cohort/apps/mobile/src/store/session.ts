/**
 * Auth session state backed by Supabase, plus a guest flag so the demo
 * content stays browsable without an account.
 */
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

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
};

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuestNow, setIsGuestNow] = useState(guest);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) leaveGuest();
    });
    const guestListener = () => setIsGuestNow(guest);
    guestListeners.add(guestListener);
    return () => {
      sub.subscription.unsubscribe();
      guestListeners.delete(guestListener);
    };
  }, []);

  return { guest: isGuestNow, loading, session };
}

export async function signOut() {
  leaveGuest();
  await supabase.auth.signOut();
}
