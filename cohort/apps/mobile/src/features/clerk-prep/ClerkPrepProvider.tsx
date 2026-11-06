/**
 * Prep-stage Clerk provider. Mounted by app/_layout.tsx only when
 * EXPO_PUBLIC_CLERK_PREP=1, so the live Supabase flow is untouched otherwise.
 * The bridge inside registers Clerk's getToken/signOut with the prep API
 * client (src/lib/api.ts) so non-React code (data hooks) can authenticate.
 */
import { ClerkLoaded, ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';

import { registerClerkRuntime } from '@/lib/api';
import { CLERK_PREP_ENABLED, CLERK_PUBLISHABLE_KEY } from '@/lib/clerk';

function ClerkRuntimeBridge() {
  const { getToken } = useAuth();
  const clerk = useClerk();
  useEffect(() => {
    registerClerkRuntime(() => getToken(), () => clerk.signOut());
  }, [clerk, getToken]);
  return null;
}

export function ClerkPrepProvider({ children }: PropsWithChildren) {
  if (!CLERK_PREP_ENABLED || !CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        <ClerkRuntimeBridge />
        {children}
      </ClerkLoaded>
    </ClerkProvider>
  );
}
