# Expo app integration sketch (stage 6 - not started)

Server side is already prepared: the auth worker loads the `@better-auth/expo`
plugin and trusts the `cohort://` scheme plus `https://ca.chatare.space`
(source: https://better-auth.com/docs/integrations/expo).

Client side, in `cohort/apps/mobile` (behind a config flag so the live app
is untouched until cutover):

```ts
// src/lib/auth-client.ts (new file, future)
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

export const authClient = createAuthClient({
  baseURL: 'https://<auth-worker-url>', // set at deploy time
  plugins: [
    expoClient({
      scheme: 'cohort',          // matches app.json
      storagePrefix: 'cohort',
      storage: SecureStore,      // same store the app already uses
    }),
  ],
});
```

Call mapping (from the official Supabase migration guide):

- `supabase.auth.signUp` -> `authClient.signUp.email`
- `supabase.auth.signInWithPassword` -> `authClient.signIn.email`
- `supabase.auth.signOut` -> `authClient.signOut`
- session state (`src/store/session.ts`) -> `authClient.useSession()`

Open items for that stage: the app also calls Supabase for data (posts,
profiles, storage, realtime) - those move to the API worker in stages 3-5
of `docs/migration-plan.md`, so the auth swap and the data swap land
together behind the same flag. Web needs no plugin; the browser sends
Origin automatically and cookies carry the session.
