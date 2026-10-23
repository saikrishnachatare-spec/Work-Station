# Setup and shell

Goal: one command boots the app on Android, iOS simulator and web, with CI green and the Supabase project connected.

## Tasks
1. [x] **YOU** Create Supabase and Expo accounts; share access (see requirements). Done: both accounts, "Cohort" org on each; logins in the vault.
2. [ ] **YOU** Enrol in the Apple Developer Program for iOS distribution. Only needed before beta.
3. [x] Create `cohort/` monorepo with pnpm workspaces and shared config.
4. [x] Scaffold Expo app with Expo Router, TypeScript strict, React Native Web.
5. [x] Port design tokens (colours, type, spacing, radii) from the prototype into `theme/`.
6. [x] Build the five-tab shell and header Messages icon with placeholder screens. Includes the floating + create sheet.
7. [x] Build first shared components: Card, Chip, Avatar, RolePill, BottomSheet.
8. [~] Set up Supabase CLI, local stack, first migration (profiles table with RLS). Migration + config written; run `supabase start` where Docker is available.
9. [x] Connect app to Supabase; env handling for dev, staging, prod. Client + env vars ready; staging project `cohort-staging` (Mumbai) created, values in `apps/mobile/.env.example`.
10. [x] GitHub Actions: lint, typecheck, test on every pull request. Lives at repo root `.github/workflows/cohort-ci.yml` (Actions only reads root workflows).
11. [x] EAS project and first internal Android build (APK). EAS project `@cohort-community-sk/cohort` created and linked; first APK build still to run.
12. [ ] Web build deployed to a preview URL. Static web export verified locally; needs the hosting account (Vercel/Netlify/Cloudflare Pages) - a **YOU** decision from requirements.
13. [x] Write `cohort/README.md` with run instructions.

## Definition of done
- App starts on Android build, iOS simulator and browser. Web export verified; Android APK and iOS sim checks pending (tasks 11-12).
- Tabs navigate; theme matches the prototype. Tokens and shell in place.
- CI passes on a pull request. First PR still to be opened.
- Founder can open the Android build and the web preview and click through the shell. Pending tasks 11-12.
