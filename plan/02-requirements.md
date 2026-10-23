# Requirements

Legend: **YOU** = needs the founder's input, action or money. **ME** = Instinct handles it. Costs are rough estimates in INR/USD and must be checked on each vendor's current pricing page before paying.

## 1. Accounts (founder creates and owns)

| Item | Why | Who | Needed by | Cost |
| --- | --- | --- | --- | --- |
| Google Play Developer account | Publish Android app | **YOU** (identity verification in your name) | Phase 6 (start by week 10) | One-time fee, about USD 25 |
| Apple Developer Program | Publish iOS app, TestFlight, push | **YOU** (identity verification; can take days) | Start week 1, needed Phase 5-6 | About USD 99 per year |
| Supabase account | Database, auth, storage, realtime, functions | **YOU** create the account and invite me, or share an access token via the secure vault | Week 1 | Free tier to start; Pro about USD 25 per month before launch |
| Expo (EAS) account | Builds, OTA updates, push | **YOU** create, add me as collaborator | Week 1 | Free tier to start; paid plan later if build queue matters |
| LLM provider API key (Anthropic, OpenAI or similar) | AI assistant, MCQ help | **YOU** create the account, set a monthly spend cap, enter key via vault | Phase 4 (week 9) | Usage based; budget USD 20-50 per month in beta |
| Domain name | Web app, email, links | **YOU** buy (or approve a name) | Phase 5 | About INR 800-1,500 per year |
| Hosting for web build (Vercel, Netlify or Cloudflare Pages) | Serve the web app | **YOU** create, or approve me using GitHub sign-in | Phase 2 | Free tier |
| GitHub repo access | Code, CI | Already done (Work-Station). Token expires; renew when asked | Ongoing | Free |
| Apple/Google test devices | Real-device testing | **YOU** have an Android phone (Redmi). iPhone testing via TestFlight testers | Phase 5 | none |

## 2. Services (software)

| Service | Use | Plan |
| --- | --- | --- |
| Supabase | Postgres, phone auth, storage, realtime, edge functions | Core |
| Phone OTP SMS provider (Twilio, MSG91 or similar) | Sign-in by phone. India needs DLT sender and template registration with most providers | **YOU** pick provider and approve cost. Alternative for beta: email or Google sign-in to avoid SMS cost and DLT delay |
| Expo Push, FCM, APNs | Push notifications. FCM needs a Firebase project (free); APNs key comes from the Apple account | **YOU** create Firebase project or add me; Apple key after enrolment |
| PostHog | Product analytics | Free tier |
| Sentry | Crash reporting | Free tier |
| Transactional email (Resend or similar) | Verification, firm onboarding, support | Free tier |
| LLM API | Behind a Supabase edge function, never called from the app | Spend cap required |
| Content moderation (LLM or OpenAI moderation endpoint) | Basic automated screening of posts | Optional, Phase 5 |

## 3. Developer tools (ME)
Node 20+, pnpm, Expo CLI and EAS CLI, TypeScript, ESLint, Prettier, Jest and React Native Testing Library, Playwright for web end-to-end, Maestro for mobile flows, Supabase CLI, GitHub Actions for CI. All free.

## 4. Content and legal (mostly YOU)
- **YOU:** MCQ question bank source. Questions must be original, licensed or user-contributed. Do not copy ICAI/ICMAI/ICSI or publisher material without permission.
- **YOU:** Approve ICAI/ICMAI/ICSI usage: deep links to their public sites are fine; do not imply official affiliation. Add a disclaimer.
- **YOU:** Legal entity or individual publisher name for the stores, support email, and contact address (Apple and Google show these).
- ME: draft privacy policy, terms of use, community guidelines, data deletion page. **YOU** (or a lawyer) must review before launch.
- **YOU:** App name check ("Cohort" may be taken in the stores) and logo/icon approval.
- Compliance: India's DPDP Act applies to student personal data; keep data minimal, ask consent, support deletion.

## 5. Team and people
- **YOU:** 5-10 students and 1-2 CA firms for early testing and feedback.
- **YOU:** a moderator (can be you at first) to handle reports.
- Optional later: a designer for store assets, a CA mentor to review AI answers.

## 6. Budget view (rough)

| When | Item | Estimate |
| --- | --- | --- |
| Week 1 | Apple Developer | USD 99 per year |
| By week 10 | Google Play | USD 25 once |
| Phase 5 | Domain | about INR 1,000 per year |
| Beta | Supabase Pro | USD 25 per month |
| Beta | LLM usage | USD 20-50 per month, capped |
| Beta | SMS OTP | depends on volume; check provider rates |
| Total to launch | | roughly USD 150-300, then about USD 50-100 per month |

Nothing is purchased without your explicit yes. Check current prices before paying.

## 7. What blocks what
| Blocker | Blocks |
| --- | --- |
| Supabase and Expo accounts | Everything from Phase 1 |
| Apple Developer enrolment | iOS builds on real devices, push on iOS, App Store |
| SMS provider or auth choice | Phone sign-in |
| LLM key and spend cap | Phase 4 |
| Question bank source | MCQ practice content |
| Google Play account | Android store release |
| Legal review | Public launch |
