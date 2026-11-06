# Step7 partial checkpoint

Source0032/37/38/61/62. Isolated preview only. Consent-gated route-name tracking, atomic rolling30min dedupe, dynamic route identifier stripping; guest/declined/unknown/native consent sends nothing. Optional consent is a client choice, not a server security boundary. New activity only, no guessed history.

Admin-only aggregates: controlled-test/deleted exclusions for member/activity metrics,14day zero-filled series, current content inventory, current applications snapshot. Preview correction: effective statuses new/rejected replace stale analytics pending/declined queries. UI respects flag-off status labels. All seven existing preview profiles were individually checked and marked controlled synthetic, not real member engagement. Content inventory still includes synthetic content, explicit in basis note.

Fixed whitelist recent rows excludes private contacts, message bodies, resume paths, auth and secret tables. Overview is counts only. Activity detail JSON parsed, limit bounded1..1000. Source insert events for profiles/posts/jobs/resources/groups/applications/memberships; application status/verification/group deletion caller-correct logging. Existing moderation trash logs retained.

Still incomplete: Clerk sign-in/auth deletion events, full membership removal/profile moderation actor audit parity, positive admin-browser UI/visual proof. GET /me is never sign-in history. UI and basis explicitly say capture isn't connected and zero is not proof of no sign-ins. These gaps must not disappear into completion copy.

Verification642/642 backend,19/19 app, clean worker/app typechecks.26new checks cover nonadmin denial, controlled exclusions, concurrent dedupe, exact post event detail, whitelist injection/private-field refusal. Live preview nonadmin fixture3b sees Admins only; saved consent declined remains unchanged. No existing role promotion/reset. No safe legitimate new disposable-admin signup route established after prior bounded signup botwall; no retry or token fabrication. Positive admin route tested locally only.

Deployed migration0011, worker42638e24-1c2a-4c5f-9b41-e15f5b0beedf. Frontend https://5a08aa15.cohort-test-preview.pages.dev stable https://cohort-test-preview.pages.dev . R2 remains unbound, no billing.
