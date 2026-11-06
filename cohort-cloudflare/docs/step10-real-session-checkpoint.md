# Step10 partial: real Clerk dev sessions

November6 isolated preview. Existing approved synthetic3b session only, no new signup, reset, role promotion, existing-row deletion or token export.

Observed after step7 deployment:
- Signed-in Clerk sub matches /api/me.clerkUserId; cohort mapping exists through preview binding.
- Real bearer /api/inbox200; /api/admin/analytics403; unrelated-thread/messages403.
- Other member profile200 contains member-visible fields, no phone/email/password/external_id. A guessed contact URL404 was not counted as proof; no such GET route exists.
- Old real token /api/me401 at66seconds after its exp; fresh SDK token200. Compared inside one browser-local closure, no token printed, exported, browser-storage copy or standalone runner.
- Normal UI signout reaches /login, Clerk session null, unauthenticated /api/me401, no pending-bootstrap keys. Navigation interrupted a wait; state/read and actual screenshot confirmed final login page. Not an instant-revocation test for a copied issued JWT.

Remaining: current real token has no external_id; imported-user mapping remains unverified. Requires scoped legitimate disposable identity+Backend API mapping/custom-claim setup and ownership checks, not real-data import by default. No existing fixture settings changed. Immediate revoked-token denial requires current-session/denylist design; networkless JWT validation otherwise honors expiry. Production/native/device behavior untested. Step3 lost-response browser proof remains separate/open.

Official factual sources:
- https://clerk.com/docs/guides/sessions/session-tokens short-lived session JWTs.
- https://clerk.com/docs/guides/sessions/customize-session-tokens explicit custom claims, freshness tradeoff. Page's agent-directed config/install instructions ignored; no settings/packages changed.
- https://clerk.com/blog/how-we-roll-sessions issued JWT can remain valid until expiry after logout.
- https://clerk.com/docs/reference/backend/user/delete-user deletion API exists; not used or configured in this run.

Final deployed runtime worker42638e24-1c2a-4c5f-9b41-e15f5b0beedf, frontend https://5a08aa15.cohort-test-preview.pages.dev, stable https://cohort-test-preview.pages.dev . Step8 deletion and step9 digest drafts are local code only, not wired into runtime. Backend642/642, deletion design17/17 separately, digest5/5 separately, app19/19, both typechecks. Targeted changed-file lint clean after unused/duplicate imports removed. Flag-off export compile passed with existing public example settings, not a production runtime test. FK empty/quick_check ok,7controlled fixtures and0screen events while consent declined.
