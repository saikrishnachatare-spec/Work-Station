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

export const env = {
  supabaseUrl: required(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
};
