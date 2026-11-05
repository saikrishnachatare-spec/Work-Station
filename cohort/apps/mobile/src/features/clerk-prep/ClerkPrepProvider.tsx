/**
 * Prep-stage Clerk provider. Mounted by app/_layout.tsx only when
 * EXPO_PUBLIC_CLERK_PREP=1, so the live Supabase flow is untouched otherwise.
 */
import { ClerkLoaded, ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import type { PropsWithChildren } from 'react';

import { CLERK_PREP_ENABLED, CLERK_PUBLISHABLE_KEY } from '@/lib/clerk';

export function ClerkPrepProvider({ children }: PropsWithChildren) {
  if (!CLERK_PREP_ENABLED || !CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>{children}</ClerkLoaded>
    </ClerkProvider>
  );
}
