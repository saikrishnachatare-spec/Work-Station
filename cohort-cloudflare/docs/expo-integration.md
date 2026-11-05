# Expo app integration sketch (stage 6 - not started)

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
