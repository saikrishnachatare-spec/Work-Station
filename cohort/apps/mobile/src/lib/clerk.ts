/**
 * Clerk preparation config (cloudflare-stack-prep branch ONLY).
 *
 * Everything here is flag-gated: with EXPO_PUBLIC_CLERK_PREP unset the app
 * behaves exactly as before (Supabase auth). The publishable key is public
 * by design; the secret key never enters the app. Points at the free-Hobby
 * DEVELOPMENT instance (test app "Cohort", fond-escargot-8888).
 */
export const CLERK_PREP_ENABLED = process.env.EXPO_PUBLIC_CLERK_PREP === '1';

export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

/** Prep-stage API worker base URL (local wrangler dev or a prep deployment). */
export const CLERK_PREP_API_URL = process.env.EXPO_PUBLIC_CLERK_PREP_API_URL ?? '';
