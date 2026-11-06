# Steps8/9 partial preparation, November6

##8 Account deletion: local design only
Source0057 is a single PostgreSQL transaction including auth.users deletion. D1 and Clerk cannot share that transaction. R2 avatar/resume cleanup is also prerequisite. Current preview has no R2 binding or verified Clerk Backend API delete/revoke route. No destructive endpoint exposed or profile UI enabled. Never report D1-only deletion as account deletion.

Local in-memory SQLite rehearsal17/17 demonstrates missing-prerequisite no-op, last-admin guard, midtransaction rollback, group succession, dependent cleanup, shared content retention/FK integrity. It uses throwaway local rows, not existing fixtures. Broader structured-field scrub is a proposed deviation: clears rich profile fields/note uploader/error identity absent from0057. Requires retention-policy review before deployment. Shared posts/messages/notes/diagnostic/trash bodies can themselves contain personal data. This is not full erasure. No claim that account deletion removes all identifying content.

Outstanding distributed design: authenticated current-owner consent; stop writes while deletion pending; durable operation/retry state; verified bytes cleanup; Clerk delete/revocation confirmation and unknown-outcome recovery; atomic D1 scrub/dependent transaction; denial of old tokens; confirmation/reconciliation. No success until final state verified. No new secret/export requested for this local rehearsal.

##9 Error digest: no sends
Existing0059 is first-error-of-UTC-day in-app admin notification, already ported. No existing digest-email sender/function in repo; SECURITY.md says no notification emails. Email digest is a new workflow.

Prepared offline aggregate builder/test5/5: fixed half-open UTC window, count rows/category heuristics, exclude raw message/stack/URL/user data, empty window honest, invalid window refused. Counts aren't unique incidents/affected users. No recipient, sending identity, provider, schedule, queue, retry/send endpoint or scheduler created. No email sent. No delivery claim.

Provider research, official sources checked November6:
- https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans Free300daily sends, transactional included, no card. Existing account status/sender/quota NOT verified. Shared quota must reserve headroom for auth email; do not consume paid/prepaid credits or auto-upgrade.
- https://www.brevo.com/pricing/ public plan page.
- https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/ current email binding API, sender verification/rate-limit errors. Account availability, plan/price/domain requirements NOT established, so not selected as free substitute.

Recommended next decision: whether to add aggregate email at all beyond in-app alerts. If yes, approved sending identity+recipient(s), permitted error fields/attachments, frequency/timezone and zero-error behavior. Then verify live provider account/quota/domain, prepare reviewed sample, costcheck and bounded delivery/retry/dedupe. New service/sends require source-grounded authority; checklist prep doesn't approve arbitrary addresses or words.
