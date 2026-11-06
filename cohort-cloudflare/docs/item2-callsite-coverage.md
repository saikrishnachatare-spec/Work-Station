# Item 2 callsite/coverage plan - Expo app rewire from Supabase-direct behind EXPO_PUBLIC_CLERK_PREP

Scope: rewire app data calls to the prep API worker behind the existing flag.
Preserves guest mode and all screens. NOT in scope: storage bytes (item 4),
notification creation (5), realtime (6), admin analytics (7), account deletion (8),
error digest (9), Backend-API identity mapping (10), real data (11), device (12),
auth screens/signup onboarding (3). Live app/main untouched.

## A. Direct rewire - worker endpoint exists today
data.ts hooks -> worker routes:
- usePosts -> GET /api/feed; usePost -> GET /api/feed (filter client-side or GET /api/posts/:id? see B6)
- useToggleLike -> POST/DELETE /api/posts/:id/like
- useCreatePost -> POST /api/posts (image upload deferred to item 4; image_path stays null)
- useComments/useAddComment -> GET/POST /api/posts/:id/comments; useDeleteOwnContent(comments) -> DELETE /api/comments/:id
- useThreads/useThreadMessages/useSendMessage/useMarkThreadRead -> /api/threads*, start_dm -> POST /api/dm
- useMyConnections/useConnectionRequests/useSendConnectionRequest/useRespondToConnection/useRemoveConnection/useConnectionWith -> /api/connections*
- safety.tsx blocks -> /api/blocks*
- useGroups/useMyGroups/useToggleGroup/useCreateGroup/useAddGroupMembers/useLeaveGroup/useSetGroupMemberRole/useRemoveGroupMember -> /api/groups*
- getGroupInviteLink/useInvitePreview/useJoinByToken -> /api/groups/:id/invites, /api/invites/:token(/join)
- useChannels/useCommunities/useCommunityGroups/useCreateCommunity/useAddGroupToCommunity/useCreateChannel -> /api/communities*
- useJobs/useJob/useCreateJob/useMyPostedJobs -> /api/jobs*; useApplyToJob -> POST /api/jobs/:id/apply (resume upload deferred item 4)
- useMyApplications/useToggleApplication/useUpdateApplicationStatus/useApplicationsForJobs -> /api/applications*
- useResources/useResource/useCreateResource -> /api/resources* (file upload deferred item 4)
- useStudentNotes/useUploadStudentNote -> /api/student-notes* (file deferred item 4)
- useNotifications/useMarkNotificationRead -> /api/notifications*
- useJobAlertPref/useSaveJobAlert -> GET/PUT /api/job-alert-prefs
- useRequestVerification/useMyVerificationRequest -> /api/verification-requests*
- admin.tsx: verification review -> /api/admin/verification-requests*; reports -> /api/admin/reports*; members patch -> /api/admin/members/:id; trash -> /api/admin/trash*; blocked terms -> /api/admin/blocked-terms*; error logs -> /api/admin/error-logs*; activity -> /api/admin/activity-log
- src/lib/errors.ts -> POST /api/error-logs

## B. Worker endpoints ADDED in item 2 (IMPLEMENTED - worker version 78185749, 12 new routes)
1. GET /api/profiles + GET /api/profiles/:id - 0009 authenticated-only; 0048 JSON columns parsed (migration 0005).
2. PATCH /api/profiles/:id - owner (or admin) for ordinary fields; role/status/id/account_type rejected for everyone here (privilege changes stay on the admin route, 0015/0017); shape/length limits enforced (0048).
3. GET /api/groups/:id + GET /api/groups/:id/members - public per groups_read/members_read.
4. GET /api/groups/:id/thread - get-or-create; group member required (0043), active member to create.
5. GET /api/posts/:id - public.
6. PATCH /api/posts/:id - owner or admin (0001), blocked-terms recheck (0052).
7. PATCH /api/comments/:id - owner ONLY (0013, no admin override), blocked-terms recheck.
8. DELETE /api/posts/:id - owner or admin; FAILS CLOSED 409 byte_cleanup_deferred_item4 when image_path set.
9. DELETE /api/student-notes/:id - pre-existing route hardened: FAILS CLOSED 409 when file_path set.
10. POST /api/notifications/read-all - own rows only (0050).
11. GET /api/search?q= - per-entity guards mirror standalone routes; people authenticated-only (anon gets zero people rows, same as RLS).
12. CORS allowMethods now includes PATCH/PUT (preflight fix for existing routes too).

Identity binding: getCaller keeps external_id (item-10 real path); otherwise PREVIEW-ONLY
server-controlled TEST_SUB_ALLOWLIST binding (wrangler [vars]) requiring a same-id D1 profile
row. No client-supplied ids, no auto-provision, no other fallback. Synthetic mapping:
user_3LfjRoTDNbKKoIokRRE50PtERCb -> [SYNTHETIC] Preview Tester A profile row (seeded).

## C. Explicitly deferred (wired to a clear "unavailable in preview" state, never faked)
- ALL supabase.storage.* (post-images, resumes, resources, student-notes, avatars): item 4, R2 billing gate. File pickers/uploads show unavailable; image renders fall back to placeholders.
- Notification CREATION triggers (comment/like/message/connection/application/job-match fan-out): item 5.
- supabase.channel realtime (useLiveAdminFeed live socket, thread live updates): item 6 (cost-checked choice).
- useAdminAnalytics (rpc admin_analytics aggregate): item 7.
- delete_my_account rpc (profile.tsx): item 8.
- Auth screens (login/signup/reset-password), session store: item 3. Item 2 uses the Clerk dev session (already proven on /clerk-prep) as the token source under the flag; flag-off keeps Supabase auth byte-identical.
- useLiveAdminFeed polling fallback: keep interval-based refetch against /api/admin/activity-log if cheap, else defer with item 6 note.

## D. Identity for the test session (no Backend API, no real export)
Insert ONE synthetic D1 profile row whose id = the synthetic Clerk dev user
(user_3LfjRoTDNbKKoIokRRE50PtERCb), clearly [SYNTHETIC], so /api/me returns a
cohortUserId and member-only routes are exercisable in preview. No real user
rows, no CLERK_SECRET_KEY, no client-writable privilege path. A second
synthetic mapped user (B) for cross-user denial checks.

## E. Flag mechanics
- api client module (new src/lib/api.ts): fetch wrapper, base = CLERK_PREP_API_URL,
  Authorization: Bearer <getToken()> from ClerkPrepProvider; typed per-route helpers.
- data.ts hooks switch on CLERK_PREP_ENABLED: flag ON -> worker; flag OFF -> byte-identical Supabase path (no behavior change, proven by flag-off build+regression).
- Screens with direct supabase calls (profile/admin/safety/login/hiring/company/resources/member) route through the same switch.
- Guest mode: guest sessions have no Clerk token; public routes work unauthenticated, member actions keep current guest UX.

## F. Verification plan (before stage-2 completion)
- tsc + jest + flag-off expo export (proves untouched Supabase path builds) + flag-on export.
- Local worker regression (371 checks) after endpoint additions + new local checks per added endpoint (allow/deny matrix).
- Live preview: app flow order with the synthetic mapped user (feed->post->comment->like, groups->members->invite, messages, connections, jobs->apply, resources, notifications, admin), negative auth (no token 401, cross-user denial), screenshots per flow.
- Mobile visual checks on web viewport sizes (Android runtime unavailable here).
