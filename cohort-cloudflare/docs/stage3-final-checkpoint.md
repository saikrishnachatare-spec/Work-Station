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
- CSEET decision resolved at 19:36: user approved support in isolated preview. Applied as migration0008 and aligned profile-edit validation; production untouched.
- Physical phone installation and native device behavior are untested and outside this preview run.

Latest deployed frontend is https://7a968696.cohort-test-preview.pages.dev and stable alias https://cohort-test-preview.pages.dev .
Items 4 and 5 have not started. R2 billing remains separately gated by approval.

## CSEET follow-up, 19:44 IST

- Approved preview deviation: CSEET is allowed alongside the effective upstream level union. Profile-edit validation now also permits Executive, Professional and Member, correcting its older hardcoded allowlist. No new cross-course restrictions were invented.
- Full final worker regression: 538/538 (39+84+158+90+69+98), including signup + stored course/level + profile edit + persisted course/level + phone exclusion for every displayed CA/CMA/CS level and Member, unknown-level rejection and legacy empty level. App remains typecheck clean, Jest10/10. Browser public UI shows all CS choices at390x844; no Clerk signup retry.
- Migration0008 has an empty-profiles guard: a populated table is refused before any parent rebuild. Guard tested with a sentinel row preserved. Never apply this rebuild to a populated D1 database.
- Existing populated databases cohort-app-prep and cohort-app-prep-2 retained untouched. New free replacement cohort-app-prep-3 (026fb5e5-3772-4083-8ae8-792553aa9d6f) copied31 tables/54 rows, including7 profiles/3 contacts/3 bound subs. Exact row contents, old migration metadata, all12 indexes and0 triggers compared; only profiles CHECK+CSEET and metadata entry0008 differ. FK check empty and quick_check ok. Source re-read after copy was unchanged.
- Preview writes frozen during snapshot, then resumed after verified binding switch. Final deployed worker version c2da34e9-3957-4006-871d-9921ceaada8d. No persistent maintenance code remains. Frontend unchanged, stable preview https://cohort-test-preview.pages.dev .
- Rollback: restore prior DB name/id in wrangler.toml and redeploy worker; prior populated DB retained. This does not reconcile any writes created after the switch, so snapshot/reconcile before rollback. No rollback-duration guarantee.
- Free capacity checked:3 databases before create,4 after, under free10-database/5GB limits; no paid enrollment. Limits source: https://developers.cloudflare.com/d1/platform/limits/ . D1 cascade warning source: https://developers.cloudflare.com/d1/sql-api/sql-statements/ .
- Stage3 still OPEN for the prior live-browser lost-response gate proof; CSEET no longer pending. Enterprise browser routing remains separately untested (local bootstrap + shared predicate only). Steps4/5 remain unstarted.
