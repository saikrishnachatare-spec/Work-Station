# Setup and shell

Goal: one command boots the app on Android, iOS simulator and web, with CI green and the Supabase project connected.

## Tasks
1. [ ] **YOU** Create Supabase and Expo accounts; share access (see requirements).
2. [ ] **YOU** Enrol in the Apple Developer Program for iOS distribution.
3. [ ] Create `cohort/` monorepo with pnpm workspaces and shared config.
4. [ ] Scaffold Expo app with Expo Router, TypeScript strict, React Native Web.
5. [ ] Port design tokens (colours, type, spacing, radii) from the prototype into `theme/`.
6. [ ] Build the five-tab shell and header Messages icon with placeholder screens.
7. [ ] Build first shared components: Card, Chip, Avatar, RolePill, BottomSheet.
8. [ ] Set up Supabase CLI, local stack, first migration (profiles table with RLS).
9. [ ] Connect app to Supabase; env handling for dev, staging, prod.
10. [ ] GitHub Actions: lint, typecheck, test on every pull request.
11. [ ] EAS project and first internal Android build (APK).
12. [ ] Web build deployed to a preview URL.
13. [ ] Write `cohort/README.md` with run instructions.

## Definition of done
- App starts on Android build, iOS simulator and browser.
- Tabs navigate; theme matches the prototype.
- CI passes on a pull request.
- Founder can open the Android build and the web preview and click through the shell.
