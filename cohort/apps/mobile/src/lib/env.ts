/**
 * Environment config. Values come from EXPO_PUBLIC_* vars (see .env.example).
 * The publishable key is public by design; row-level security protects the data.
 * Secrets never live here.
 */
const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
};

// Prep-preview isolation (cloudflare-stack-prep branch only): with
// EXPO_PUBLIC_CLERK_PREP=1 the build must NOT bake production Supabase values.
// When the flag is on and Supabase vars are absent, fall back to a deliberately
// non-routable placeholder so nothing in the bundle can reach the production
// backend; the preview CSP also blocks *.supabase.co at the network layer.
const CLERK_PREP = process.env.EXPO_PUBLIC_CLERK_PREP === '1';
const ISOLATED_URL = 'https://preview-isolated.invalid';
const ISOLATED_KEY = 'preview-isolated-no-key';

export const env = {
  supabaseUrl:
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    (CLERK_PREP ? ISOLATED_URL : required('EXPO_PUBLIC_SUPABASE_URL', undefined)),
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    (CLERK_PREP ? ISOLATED_KEY : required('EXPO_PUBLIC_SUPABASE_ANON_KEY', undefined)),
  /** Optional: Cloudflare Turnstile site key. When set (and CAPTCHA is enabled
   * in Supabase auth settings), auth screens show the bot check. */
  turnstileSiteKey: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '',
};
