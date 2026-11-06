# Step6: periodic updates in the isolated preview

Original scope recovered from owner conversation November6 10:29:45: replace Supabase Realtime for messages and other live changes with a free-goal approach. Only two source channels exist: thread messages and admin activity/error inserts. No feed-wide socket existed to replace.

## Choice
Bounded foreground polling: open DM/group messages15s, inbox30s, admin refresh60s. No socket-connected claim. Durable Objects SQLite is available on Free, but adds durable state, auth/fan-out/reconnect machinery; not selected for this limited preview. SSE without a notification broker still requires DB polling, so not selected.

New inbox endpoint consolidates1+2N app requests into one own-DM summary request. It has no admin private-body override. Message endpoint selects newest200 with deterministic timestamp/id order and explicit has_older boundary; previously oldest200 hid new arrivals. This is a bounded window, not complete-history pagination. Mark-read depends on last message ID rather than window length. Message query keys include owner identity. Denied refresh hides cached messages; no new unauthorized payload returned.

Hidden/background preview pauses; return refreshes. Network/server errors back off to5min.401/403 stops periodic fetch; reopen/focus/user action is needed. No background-phone delivery or physical-device claim. Supabase flag-off subscription preserved. Admin status says Periodic updates60s while visible; activity creation/analytics coverage belongs step7.

## Cost checks
Official sources checked November6:
- https://developers.cloudflare.com/workers/platform/limits/ Workers Free100000requests/day, midnightUTC reset; exceeded limit errors.
- https://developers.cloudflare.com/d1/platform/pricing/ D1 Free5million rows read/day,100000written/day,5GB storage. Exceeded read/write limit errors, not unlimited operation.
- https://developers.cloudflare.com/durable-objects/platform/pricing/ Free SQLite-backed Durable Objects exist, with request/duration/storage quotas.

One hour with open messages+inbox mounted:240+120=360requests, excluding notifications60, mutations, startup and other reads.100such concurrent-hour users consume36000requests before other traffic. One hour admin view can refresh up to10active query families60times, up to600requests before subqueries. D1 scans depend on table size; no scale guarantee. Free preview scope avoids enrollment/spend, not capacity planning for production.

## Verification
Backend616/616 (600prior+16new) clean exits. New tests own/unmapped/guest inbox, names/latest/unread205->0, stable newest200 window, admin no private override, removed participant denial. App17/17 including foreground lifecycle/listener cleanup,401/403 stop, failure backoff/ceiling/reset. Both typechecks clean.

Deployed worker09e2695e-f4d5-403e-820b-fd1d4e66b251 and frontend https://f1a6fd35.cohort-test-preview.pages.dev, stable https://cohort-test-preview.pages.dev . Existing synthetic3b session: new synthetic SQL-created DM appeared on open inbox without reload; second SQL message appeared in open thread via15s refresh; D1 last_read_at updated16:31:43UTC. Screenshots inspected/delivered. Creation was synthetic SQL fixture, not UI send E2E. Hidden browser/network outage not injected live; tested policy/lifecycle locally. Existing fixture accounts not reset.
