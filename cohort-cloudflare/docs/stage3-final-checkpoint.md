# Stage 3 checkpoint, 6 November 2026

Scope: isolated Cloudflare test preview and Clerk development instance only.
Stage remains OPEN. Production and main branch were not changed.

## Latest verification
- Worker regression: 476/476 (slice2 39, slice3 84, slice4 158, slice5 90, slice6 69, slice7 36).
- Mobile typecheck clean. Jest: 10/10, including five rendered onboarding-gate cases and three consent cases.
- Deployed mobile 390x844: signup submit reaches validation with consent visible; Decline persists and dismisses; all five tab labels readable after spacing fix.
- Independent public browser: Accept persists across reload; keyboard Tab from password then Enter submits at 390x500 and returns validation. This is reduced-viewport emulation, not a physical phone/software-keyboard test. No Clerk signup submitted by this check.
- Greeting uses the first word of the name; the synthetic marker is the fixture's first word, not clipped text.
- Earlier deployed signup/OTP/bootstrap/reload persistence, allowlist retry, signout cleanup, mapped re-entry and password reset passed using synthetic aliases. Firm routes to company panel in browser. Enterprise bootstrap passes local worker tests; enterprise browser routing is NOT separately exercised.
- Concurrent deployed bootstraps returned one 201 and one 409, one stored identity. Direct deployed 409 followed by /api/me 200 confirmed user4's mapping. This is NOT a browser gate-path success.
- Gate now verifies /api/me.clerkUserId equals signed-in sub before clearing pending onboarding on 409. Tests reject wrong identity and missing mapping.

## Still unresolved
- Deployed browser gate lost-response proof. Existing mapped fixtures skip the gate; no existing state reset. Fresh +clerktest5 signup was stopped after two protect_check_execution_failed / Turnstile errors, solver attempt and 30-second wait. No verification email, completed signup or inserted DB fixture observed. Do not retry without a new external signal.
- CSEET policy decision remains with user; upstream CHECK behavior unchanged.
- Physical phone installation and native device behavior are untested and outside this preview run.

Latest deployed frontend is https://7a968696.cohort-test-preview.pages.dev and stable alias https://cohort-test-preview.pages.dev .
Items 4 and 5 have not started. R2 billing remains separately gated by approval.
