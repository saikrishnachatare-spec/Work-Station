/**
 * Better Auth instance for Cohort - preparation stage.
 *
 * Design decisions (see ../../docs/migration-plan.md):
 * - Hosted on Cloudflare Workers, data in Cloudflare D1 (SQLite).
 * - Password hashing delegates to bcrypt so existing Supabase Auth users
 *   (Supabase stores bcrypt digests) keep their passwords after migration.
 *   bcryptjs is the pure-JS implementation: the native `bcrypt` package in
 *   the official migration guide cannot run in the Workers runtime.
 * - Email verification + password reset are required by Cohort's launch
 *   checklist. Delivery still needs an SMTP provider (Brevo is already
 *   connected); the send hooks are stubs in this prep stage.
 */
import { betterAuth } from 'better-auth';
import { expo } from '@better-auth/expo';
import bcrypt from 'bcryptjs';

export type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  REQUIRE_EMAIL_VERIFICATION?: string;
};

export function createAuth(env: AuthEnv) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    appName: 'Cohort',
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8, // matches Cohort's current password rule
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === 'true',
      password: {
        hash: async (password: string) => bcrypt.hash(password, 10),
        verify: async ({ hash, password }: { hash: string; password: string }) =>
          bcrypt.compare(password, hash),
      },
      sendResetPassword: async ({ user, url }) => {
        // Prep stub: wire to Brevo SMTP (or Worker MailChannels alternative) at deploy time.
        console.log(`[cohort-auth prep] password reset link for ${user.email}: ${url}`);
      },
    },
    emailVerification: {
      sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION === 'true',
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        // Prep stub: wire to Brevo SMTP at deploy time.
        console.log(`[cohort-auth prep] verification link for ${user.email}: ${url}`);
      },
    },
    // The Expo web build at ca.chatare.space calls this worker cross-origin;
    // native builds send no Origin header, which Better Auth allows by default.
    trustedOrigins: ['https://ca.chatare.space', 'cohort://'],
    plugins: [expo()],
  });
}
