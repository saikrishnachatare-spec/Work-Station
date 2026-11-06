# Steps4/5 local checkpoint

6November2026. Prep branch only; no production changes.

## Storage: partial, live R2 blocked by user's no-billing choice
R2 account UI confirmed subscription is not activated. User explicitly chose to continue without billing activation. No subscription, payment authorization, R2 bucket or credential expansion performed.

Local R2 byte API and D1 ledger implemented. Resources authenticated-read/admin-upload with own-avatar exception; student-note/public-image public reads; resumes applicant/admin/actual job-poster reads, owner-only delete. Upload paths owner-bound, actual bytes bounded, MIME and file signature checked, overwrite refused,10/day resume limit atomic. Signature checks are file-format sniffing, not antivirus or full parser validation.

Ready-only reads; pending/deleting/deleted ledger states support failure visibility and idempotent cleanup. R2 and D1 are not one distributed transaction. Do not delete uploaded bytes automatically after an unknown metadata response; a successful row may already reference them. Tombstones make byte deletion retry-safe if row deletion or response delivery fails. A crash can leave ledger entries needing explicit reconciliation. No cleanup scheduler is claimed.

Web app wiring: posts, notes/resources, resume upload/download/withdrawal and avatar upload/read. Authenticated byte fetches use headers, never tokens in URLs. Native private-file download intentionally says unverified/use web preview. Physical phone behavior untested. No live uploaded-file success claimed without R2.

Local storage36/36 covers actual hash, source read/delete access matrix, MIME/signature rejection, byte-size bound, unsafe paths, duplicate path, suspension, resume cap, withdrawal cleanup, pending unreadability and repeat deletion. D1 trigger rejects attaching a deleted ledger object; upload completion is compare-and-set pending, so cleanup cannot resurrect a ready entry. Outage injection and a timed concurrent R2-write/cleanup stress test remain unverified; no complete storage claim.

## Notifications
Source0050/53/55/56/59 mapped: comments, DM/group messages, connection request/accept, application status, verification decision, daily admin error digest, keyword job matches. D1 triggers keep notifications atomic with originating writes; job-match statements share job insert batch. Dedupe keys preserved. Active recipients only; blocked-message recipients suppressed. No client insert endpoint.

In-app fetch/read/read-all already wired,60-second foreground polling. No push/email/SMS/background/native delivery promised. Local26/26 covers creation, dedupe, self/block/inactive suppression, keyword match/nonmatch, recipient-only read, cross-user denial and unread transitions. Live deployment/browser verification still pending at this checkpoint.

## Stage3
CSEET resolved. Live lost-response browser proof still unverified after the prior bounded signup challenge failure. No fresh signup retry, existing fixture reset or session export.
