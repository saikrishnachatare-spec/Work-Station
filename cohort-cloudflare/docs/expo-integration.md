# Expo app integration (stage 6 - IN PROGRESS on this branch)

## Where the code lives, and why (folder-scope note)

He asked for the migration work to stay in `cohort-cloudflare/`. Backend
preparation (worker, scripts, docs) does. The CLIENT integration is the one
deliberate exception: wiring Clerk into the Expo app is only possible by
editing the app itself (`cohort/apps/mobile`). Those edits are:

- additive and flag-gated behind `EXPO_PUBLIC_CLERK_PREP=1`: with the flag
  unset the provider is a passthrough and the Supabase flow is the only one
  wired into the app's behavior. (Note: the branch bundle now also CONTAINS
  the Clerk SDK and the prep route's code; "flag off" means the prep code
  does not run, not that the bundle is byte-identical to main.)
- on the `cloudflare-stack-prep` branch only. DEPLOY GUARD: production
  deploys (Cloudflare Pages, ca.chatare.space) build from `main`; this
  branch must never be merged with the flag enabled in any default env, and
  no EAS/production build should be produced from it. Merging at all is a
  later, separately-approved step after app-flow testing.

## What exists now (branch, flag-gated)

- `apps/mobile/src/lib/clerk.ts` - prep config (publishable key + API URL
  from env; publishable key is public by design, secret key never enters).
- `apps/mobile/src/features/clerk-prep/ClerkPrepProvider.tsx` - ClerkProvider
  + tokenCache (expo-secure-store, the store the app already uses); passthrough
  unless the flag is on.
- `apps/mobile/app/clerk-prep.tsx` - public prep route: email+password
  sign-in via the Clerk Expo SDK v4 (`signIn.password` -> new-device email
  code via `signIn.mfa.*` -> `finalize`), then a button that calls the prep
  api-worker `/api/me` with `getToken()` and shows the response.
- `apps/mobile/app/_layout.tsx` - provider mounted unconditionally but
  inert unless flag on; `/clerk-prep` added to public routes only when the
  flag is on.

## Verified so far

- typecheck clean; existing jest suites pass (2/2). One pre-existing eslint
  error in `app/(auth)/login.tsx` predates this work.
- Web static export builds with the flag on; the signed-out prep screen
  renders correctly (screenshot-verified locally).
- Interactive web end-to-end (2026-11-06, screenshot-verified): served the
  flag-on web build through a temporary tunnel to a clean browser profile
  and signed in as the synthetic CohortTest user through the app's own
  /clerk-prep screen. Flow: email+password (`signIn.password`) -> Clerk
  returned `needs_client_trust` (new device; Device Trust) -> emailed
  6-digit code to the test alias (`signIn.mfa.sendEmailCode` /
  `verifyEmailCode`) -> `finalize()` -> signed in. "Call prep API worker"
  then sent `getToken()` to the local api-worker: HTTP 200 with the correct
  `clerkUserId`/`sessionId`, `cohortUserId: null` (no import yet). Tunnels
  and servers torn down after; nothing left running.
- Operational learnings from that run:
  - The worker's `authorizedParties` pinning works as designed: the app's
    own origin (here the temporary test origin) must be listed or
    verification 401s. For real stages, the app origin(s) - web domain and
    any native redirect origins - go in CLERK_AUTHORIZED_PARTIES.
  - New-device sign-ins get the Device Trust email-code step; this will be
    ordinary for users on new devices and must stay in the UX plan.
  - `@clerk/expo` v4 uses the "future" sign-in resource API
    (`signIn.password` / `signIn.mfa.*` / `finalize`), not the v3
    `signIn.create` + `attemptSecondFactor` shape.

## Not verified

- Android (or iOS): no emulator/device run happened; the SDK is installed
  and typechecks, but native behavior - SecureStore tokenCache, deep links
  back into the app after email verification - is untested and needs a real
  device run with his permission on his phone or an emulator.

## The older sketch below remains the full-app target

Direction: Clerk. The app swaps `supabase.auth` for the official Clerk Expo
SDK (source: https://docs.expo.dev/guides/using-clerk/):

```ts
// App root (future, behind a config flag so the live app is untouched)
import { ClerkProvider, ClerkLoaded } from '@clerk/expo';
import * as SecureStore from 'expo-secure-store'; // token cache, same store the app already uses

<ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
  <ClerkLoaded>{/* existing app */}</ClerkLoaded>
</ClerkProvider>
```

- Sign-in/up screens: Clerk's prebuilt components or a custom flow with
  `useSignIn` / `useSignUp` (custom keeps our minimal UI).
- Web build (ca.chatare.space): same SDK; browser cookies/redirects handled
  by Clerk.
- API calls from the app send `Authorization: Bearer <session token>` from
  `useAuth().getToken()`; the worker verifies it (see clerk-integration.md).

Call mapping from today:
- `supabase.auth.signUp` -> `useSignUp().create({ emailAddress, password })`
- `supabase.auth.signInWithPassword` -> `useSignIn().create({ identifier, password })`
- `supabase.auth.signOut` -> `useClerk().signOut()`
- `src/store/session.ts` session state -> `useAuth()` / `useUser()`

Open items for that stage: deep links back into the Android app after email
verification, guest browsing mode (today's `continueAsGuest`) stays
client-side and untouched, and the data calls still move to the API worker
per migration-plan.md stages 3-5.
