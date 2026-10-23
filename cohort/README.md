# Cohort

The community app for CA, CMA and CS students. One TypeScript codebase for
Android, iOS and web: React Native + Expo + React Native Web, Supabase backend.

Product and design docs: [`../docs/cohort`](../docs/cohort). Build plan: [`../plan`](../plan).

## Layout

```
apps/mobile          Expo app (Android, iOS, web via React Native Web)
  app/               Expo Router screens: (tabs), messages, create modal
  src/
    components/      shared UI kit (Card, Chip, Avatar, RolePill, BottomSheet)
    features/        feed, resources, community, work, icai, messages
    lib/             supabase client, query client, env
    theme/           terracotta design tokens from the prototype
    store/           Zustand stores
packages/shared      types, zod validation, constants (courses, levels)
packages/config      tsconfig and prettier presets
supabase/            migrations (profiles + RLS), seed, edge functions
```

## Run it

Prereqs: Node 20+, pnpm 12+.

```sh
cd cohort
pnpm install

# one command per platform (from apps/mobile):
cd apps/mobile
cp .env.example .env        # staging values are prefilled and safe (publishable key)
pnpm start                  # then press a (Android), i (iOS), w (web)
pnpm web                    # straight to the web version
```

## Checks

```sh
pnpm typecheck   # all workspaces
pnpm lint
pnpm test
```

CI (`.github/workflows/cohort-ci.yml` at the repo root) runs all three on
every pull request that touches `cohort/`.

## Backend

Staging Supabase project `cohort-staging` (org **Cohort**, region ap-south-1 /
Mumbai) is already created; its URL and publishable key are prefilled in
`apps/mobile/.env.example`. The publishable key is public by design; every
table has row-level security.

Local database work uses the Supabase CLI (needs Docker):

```sh
cd cohort
supabase start                 # local stack
supabase db reset              # apply migrations + seed
supabase link --project-ref ghjerdyubgjtfihumzhb   # connect to staging
```

Migrations so far: `20261023000100_profiles.sql` (profiles table, RLS
policies, `updated_at` trigger, auto-create profile on sign-up).

## Builds

EAS project: `@cohort-community-sk/cohort`
(https://expo.dev/accounts/cohort-community-sk/projects/cohort).

```sh
cd apps/mobile
pnpm eas build --platform android --profile preview   # internal APK
```

## Conventions

- TypeScript strict everywhere; no `any` without a comment.
- Route files in `app/` are thin re-exports; each feature folder owns its
  screens, hooks, queries and tests.
- Secrets only in env vars and the Instinct vault, never committed.
- Branches `feat/...` into `main` by pull request; CI must pass.

## Notes

- Jest is pinned to 29: Jest 30's "outside the scope of the test code" guard
  conflicts with expo's lazy winter runtime in this pnpm monorepo.
- Web output is a static build (`expo export --platform web`), ready for a
  static host (Vercel/Netlify/Cloudflare Pages) once the account exists.
