# Planned codebase structure

Monorepo (pnpm workspaces) in this repo under `cohort/`. Docs and plans stay in `docs/` and `plan/`.

```
Work-Station/
  docs/cohort/              product and design PDFs
  plan/                     this folder
  cohort/
    apps/
      mobile/               Expo app (Android, iOS, web via React Native Web)
        app/                Expo Router screens
          (tabs)/           feed, resources, community, work, icai
          messages/         conversation list and chat
          create/           create-post modal
          onboarding/
        src/
          components/       shared UI kit (cards, chips, sheets, avatars)
          features/         feed, resources, work, icai, messages, profile, ai
          lib/              supabase client, query client, push, analytics
          theme/            terracotta design tokens from the prototype
          store/            Zustand stores
    packages/
      shared/               types, validation (zod), constants shared by app and functions
      config/               eslint, tsconfig, prettier presets
    supabase/
      migrations/           SQL schema and row-level security
      functions/            edge functions: ai-proxy, vacancy-scan, daily-reads, push-worker
      seed.sql              test data
    .github/workflows/      lint, test, build, deploy
    README.md
```

## Conventions
- TypeScript strict mode. No `any` without a comment.
- One feature folder owns its screens, hooks, queries and tests.
- All database access goes through typed queries; types generated from the schema.
- Row-level security on every table, tested.
- Secrets only in environment variables and vault; never committed.
- Branches: `feat/...`, pull request into `main`, CI must pass.
- Commits: short imperative messages.

## Environments
| Env | Supabase project | Use |
| --- | --- | --- |
| dev | local Supabase via CLI | daily work |
| staging | hosted project | beta testers |
| prod | hosted project | public |
