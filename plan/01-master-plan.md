# Master implementation plan

## Phase 0 - Setup
- Founder creates the Supabase and Expo accounts listed in `02-requirements.md`.
- Create monorepo, CI, environments (dev, staging, prod), secrets handling.
- Lock design tokens from the prototype.
- **Milestone M0:** empty app boots on Android, iOS simulator and web from one command; CI green.

## Phase 1 - Foundation
- Supabase project, schema v1 (users, profiles, posts, comments, reactions, resources, jobs, applications, conversations, messages, notifications), row-level security.
- Phone OTP auth, onboarding (course CA/CMA/CS, level, attempt, city, role).
- Navigation shell with the five tabs and Messages stack screen. Shared UI kit.
- **Milestone M1:** a user signs up with phone OTP, completes a profile, sees the tab shell.

## Phase 2 - Core community
- Feed: posts, announcements, comments, reactions, create sheet, image upload.
- Resources tab: upload, browse, filter by course and level, download.
- Messaging: one-to-one chat, realtime, unread counts.
- Profiles, connections (students, mentors, firms).
- Moderation basics: report, hide, block.
- **Milestone M2:** two real users can post, share resources and chat on a staging build.

## Phase 3 - Work and hiring
- Job, articleship and industrial-training listings; firm accounts; apply flow; saved jobs.
- Vacancy alerts (assumed meaning of "scans"; confirm in open questions).
- **Milestone M3:** a firm posts an opening, a student applies, both get notified.

## Phase 4 - ICAI module and AI
- ICAI module: links to ICAI/ICMAI/ICSI sources, connections directory, daily reads.
- AI assistant: topic summaries via backend proxy, rate limits, guardrails, caching.
- MCQ practice: question bank, attempts, scoring, history.
- **Milestone M4:** AI summary and MCQ practice work end to end with usage limits.

## Phase 5 - Notifications, polish, safety
- Push (Expo Push, FCM, APNs) and web push; notification preferences.
- Performance, offline snapshots, accessibility, empty and error states.
- Privacy policy, terms, data deletion flow, content rules, analytics (PostHog), crash reports (Sentry).
- **Milestone M5:** release candidate passes the QA checklist.

## Phase 6 - Beta and launch
- Closed beta: Play internal and closed testing, TestFlight, web staging. 20-50 students.
- Fix feedback; store listings, screenshots, data safety forms.
- Submit to Google Play and App Store; deploy web to production domain.
- **Milestone M6:** live in stores and on the web.

## Phase 7 - Continued development
Regular releases, metrics review, moderation tooling, growth features, cost review.

## Phase summary
| Phase | Milestone |
| --- | --- |
| 0 Setup | M0 |
| 1 Foundation | M1 |
| 2 Core community | M2 |
| 3 Work and hiring | M3 |
| 4 ICAI and AI | M4 |
| 5 Polish and safety | M5 |
| 6 Beta and launch | M6 |

App store review outcomes are outside the project's control. Apple Developer enrolment is required for iOS distribution.

## Risks
- Store review rejection (user-generated content needs report and block features, a privacy policy and account deletion). Built into Phase 2 and 5.
- AI cost and abuse: per-user usage limits and caching throughout development.
- Wrong or outdated exam content from the AI: label as study aid, link sources, add disclaimer.
- Copyright on uploaded resources: upload terms and a takedown path.
- Spam and fake firms: firm verification step before posting jobs.
- Founder inputs: requirements file lists what blocks each phase.
- Phone OTP cost: SMS in India has DLT registration requirements with some providers; see requirements.

## Working agreement
- Each phase ends with a demo build and a short written summary.
- Founder approves anything that costs money or is published publicly.
- All work in this repo, via pull requests into `main`.
