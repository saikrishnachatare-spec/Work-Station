# Master implementation plan

Timelines assume one builder (Instinct) working with the founder reviewing. They are rough, in working weeks, and slip if founder inputs (marked YOU) arrive late.

## Phase 0 - Setup (week 1)
- Founder creates the accounts in `02-requirements.md` marked "needed now" (Supabase, Expo, LLM key, domain).
- Create monorepo, CI, environments (dev, staging, prod), secrets handling.
- Lock design tokens from the prototype.
- **Milestone M0:** empty app boots on Android, iOS simulator and web from one command; CI green.

## Phase 1 - Foundation (weeks 2-3)
- Supabase project, schema v1 (users, profiles, posts, comments, reactions, resources, jobs, applications, conversations, messages, notifications), row-level security.
- Phone OTP auth, onboarding (course CA/CMA/CS, level, attempt, city, role).
- Navigation shell with the five tabs and Messages stack screen. Shared UI kit.
- **Milestone M1:** a user signs up with phone OTP, completes a profile, sees the tab shell.

## Phase 2 - Core community (weeks 4-6)
- Feed: posts, announcements, comments, reactions, create sheet, image upload.
- Resources tab: upload, browse, filter by course and level, download.
- Messaging: one-to-one chat, realtime, unread counts.
- Profiles, connections (students, mentors, firms).
- Moderation basics: report, hide, block.
- **Milestone M2:** two real users can post, share resources and chat on a staging build.

## Phase 3 - Work and hiring (weeks 7-8)
- Job, articleship and industrial-training listings; firm accounts; apply flow; saved jobs.
- Vacancy alerts (assumed meaning of "scans"; confirm in open questions).
- **Milestone M3:** a firm posts an opening, a student applies, both get notified.

## Phase 4 - ICAI module and AI (weeks 9-11)
- ICAI module: links to ICAI/ICMAI/ICSI sources, connections directory, daily reads.
- AI assistant: topic summaries via backend proxy, rate limits, guardrails, caching.
- MCQ practice: question bank, attempts, scoring, history.
- **Milestone M4:** AI summary and MCQ practice work end to end with usage limits.

## Phase 5 - Notifications, polish, safety (weeks 12-13)
- Push (Expo Push, FCM, APNs) and web push; notification preferences.
- Performance, offline snapshots, accessibility, empty and error states.
- Privacy policy, terms, data deletion flow, content rules, analytics (PostHog), crash reports (Sentry).
- **Milestone M5:** release candidate passes the QA checklist.

## Phase 6 - Beta and launch (weeks 14-16)
- Closed beta: Play internal and closed testing, TestFlight, web staging. 20-50 students.
- Fix feedback; store listings, screenshots, data safety forms.
- Submit to Google Play and App Store; deploy web to production domain.
- **Milestone M6:** live in stores and on the web.

## Phase 7 - After launch (ongoing)
Weekly releases, metrics review, moderation tooling, growth features, cost review.

## Timeline summary
| Phase | Weeks | Milestone |
| --- | --- | --- |
| 0 Setup | 1 | M0 |
| 1 Foundation | 2-3 | M1 |
| 2 Core community | 4-6 | M2 |
| 3 Work and hiring | 7-8 | M3 |
| 4 ICAI and AI | 9-11 | M4 |
| 5 Polish and safety | 12-13 | M5 |
| 6 Beta and launch | 14-16 | M6 |

App store review adds 1-7 days per submission. Apple developer enrolment can take days, so start it in week 1.

## Risks
- Store review rejection (user-generated content needs report and block features, a privacy policy and account deletion). Built into Phase 2 and 5.
- AI cost and abuse: per-user daily limits and caching from day one.
- Wrong or outdated exam content from the AI: label as study aid, link sources, add disclaimer.
- Copyright on uploaded resources: upload terms and a takedown path.
- Spam and fake firms: firm verification step before posting jobs.
- Founder-input delays: requirements file lists what blocks each phase.
- Phone OTP cost: SMS in India needs DLT registration with some providers; see requirements.

## Working agreement
- Each phase ends with a demo build and a short written summary.
- Founder approves anything that costs money or is published publicly.
- All work in this repo, via pull requests into `main`.
