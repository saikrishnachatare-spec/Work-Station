# Remaining isolated development checkpoints, November6 22:49

Existing no-billing restriction, no production/main cutover, no real-user export/import/deletion, no digest sends remain. New disposable dev identities approved22:38; AdminSix created and positively verified. Existing identities unchanged. Original latest request22:30 asks completion with approval checkpoints, not unlimited effect authority.

##3 Recovery instrumentation proposed, not built
Separate temporary test deployment only, same real dev auth/owner allowlist. A new disposable identity gets a visible test onboarding form bound to its actual signed-in sub. Normal gate/bootstrap; client test switch discards first201 response AFTER actual server acceptance, triggers network-error state. Retry expects409 then normal /me identity confirmation, same one account, cleared payload. No forged token, existing reset or hidden server override. Remove temporary deployment after evidence. Does not prove original signup/OTP handoff; Dashboard creation is not signup E2E. Pending user answer to main's exact proposal.

##4 Storage
Live R2 activation cannot close under no-billing restriction. Local byte36/36 plus actual-module deterministic doubles9/9. No vendor outage/timed stress/native proof. Keep unconfigured503 explicit, no paid workaround.

##7 Auth events
Positive admin browser proof now available; audit route parity660/660 backend. Need real signed Clerk lifecycle source. Proposed receiver local only before activation: pinned dev instance, verify signature with installed @clerk/backend/webhooks verifyWebhook, reject absent/bad secret, strict event allowlist, event-ID atomic dedupe, no raw payload/email/IP/token logs. A real session-created event is session creation, not each /me visit and not refresh. User deletion is identity lifecycle observation, never itself authorizes deleting app content. Asynchronous events can be missing, duplicated, out of order; no synchronous signup/deletion success reliance. Verify current live event catalog and sample semantics, journal incoming events even before profile mapping for reconciliation; terminal deletion marker must prevent late-session replay restoring activity. Activation requires scoped new dev webhook endpoint+signing secret configuration approval; no endpoint/key created yet.

##8 Deletion
Distributed D1/Clerk/R2 orchestration and retention decision remain. Local structured scrub17/17 not full erasure. Retained shared bodies and diagnostics can contain personal data. No enabled delete endpoint. Need approve actual retention policy and disposable end-to-end deletion before any real-user action; R2 prerequisite still unavailable. Never equate soft status deleted with Clerk deletion/full erasure.

##9 Email
Offline aggregate5/5 only. Sender,recipient,fields,frequency/timezone,zero behavior and free quota/live provider verification remain. Example decision for review, not action: one daily aggregate, counts/categories only, no raw diagnostics/attachments, skip zero days. Sending identity/recipient/time must come from user; no default address inferred. No provider chosen/enrolled or email sent.

##10 Existing-user mapping
Read-only existing dev Sessions already has external_id={{user.external_id}}. No claim change needed or made. Dashboard new-user/profile/settings UI lacks externalId editor. Next proposed scope: dev Backend API credential used only to set externalId on SECOND NEW synthetic identity to fresh synthetic UUID with new controlled D1 row; verify real token claim+/me+cross-user denial. No old identity edits, real export/import, shared config, key logs or fabricated tokens. User may alternatively set property themselves. Exact key-use approval required before vault request. Immediate JWT revocation remains expiry-bounded unless separate revocation design approved. Phone/native behavior not tested.

Sources:
https://clerk.com/docs/guides/users/managing
https://clerk.com/docs/reference/backend/user/create-user
https://clerk.com/docs/guides/development/migrating/overview
https://clerk.com/docs/guides/development/webhooks/overview
https://clerk.com/docs/reference/backend/verify-webhook

## Offline verifier preparation
clerkLifecycle.ts is NOT registered/imported into Worker runtime, no endpoint/config created. Actual installed verifyWebhook helper with ephemeral synthetic signature key13/13: valid signature, wrong/missing secret, tamper, old signature, wrong/missing instance, unsupported type, nonallowed subject, inactive session, nested subject mismatch, invalid mapping type, deletion without external mapping, seconds/ms/future time. Output strips raw payload/private fields. No event journal, dedupe/order reconciliation or vendor-delivery proof yet. Live Event Catalog confirmed0endpoints and session.created(data.status active,user_id,nested user.external_id), separate session.pending, user.deleted(id/deleted/object only). Catalog session timestamp sample seconds vs deletion milliseconds accounted for. Lifecycle event is not consent/authority for account/content deletion. Source dev catalog URL https://app.svix.com/app_3Lk69TRygckgCaczvwI4dvWCFmR/event-types observed embedded in dev Webhooks page.
