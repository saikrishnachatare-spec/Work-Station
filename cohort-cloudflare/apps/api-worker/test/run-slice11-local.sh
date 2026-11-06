#!/usr/bin/env bash
# Item-2 endpoint-addition local tests: synthetic allowlist identity binding,
# profiles/groups/posts/comments/student-notes/notifications/search routes.
# Same isolation model as slice-2: throwaway RSA keypair, swapped .dev.vars,
# local D1, no network beyond localhost. Restores .dev.vars on exit.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8802
PASS=0; FAIL=0
cleanup() {
  [ -n "${WPID:-}" ] && kill -- "-$WPID" 2>/dev/null
  [ -n "${WPID:-}" ] && wait "$WPID" 2>/dev/null || true
  [ -f "$TMP/dev.vars.bak" ] && cp "$TMP/dev.vars.bak" .dev.vars
  rm -rf "$TMP"
}
trap cleanup EXIT

node -e '
const { generateKeyPairSync } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(process.argv[1] + "/key.pem", privateKey.export({ type: "pkcs1", format: "pem" }));
writeFileSync(process.argv[1] + "/pub.pem", publicKey.export({ type: "spki", format: "pem" }));
' "$TMP"

cp .dev.vars "$TMP/dev.vars.bak"
node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const pub = readFileSync(process.argv[1] + "/pub.pem", "utf8").trim().replace(/\n/g, "\\n");
writeFileSync(".dev.vars",
`# SYNTHETIC LOCAL TEST VALUES - written by test/run-slice6-local.sh, restored on exit
CLERK_JWT_KEY="${pub}"
CLERK_ISSUER="https://synthetic.clerk.accounts.dev"
CLERK_AUTHORIZED_PARTIES="https://synthetic.test"
TEST_SUB_ALLOWLIST="user_allowA,user_allowNoRow"
PREVIEW_IDENTITY_BINDING="enabled"
PREVIEW_DEV_ISSUER="https://synthetic.clerk.accounts.dev"
`);
' "$TMP"

A='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
B='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
ADM='dddddddd-4444-4444-8444-dddddddddddd'
ALA='user_allowA'
ALNR='user_allowNoRow'

rm -rf .wrangler/state
npx wrangler d1 migrations apply cohort-app-prep-3 --local >/dev/null 2>&1
npx wrangler d1 execute cohort-app-prep-3 --local --command "
INSERT OR REPLACE INTO profiles (id, full_name, role, status) VALUES
 ('$A','Alice Active','user','active'),
 ('$B','Bob Active','user','active'),
 ('$ADM','Ada Admin','admin','active'),
 ('$ALA','Allowlisted Ana','user','active');
INSERT OR REPLACE INTO groups (id, name, purpose, description, kind, member_count, created_by) VALUES
 ('g1','Test Group','p','d','group',2,'$A');
INSERT OR REPLACE INTO group_members (group_id, user_id, role) VALUES ('g1','$A','admin'),('g1','$ALA','member');
INSERT OR REPLACE INTO posts (id, author_id, author_name, body, image_path) VALUES
 ('p_img','$A','Alice Active','alice post with image','post-images/a.png'),
 ('p_plain','$B','Bob Active','bob plain post',NULL);
INSERT OR REPLACE INTO comments (id, post_id, author_id, body) VALUES
 ('c1','p_img','$A','alice comment');
INSERT OR REPLACE INTO student_notes (id, title, owner_id, file_path, uploader_name) VALUES
 ('n_file','note with file','$A','student-notes/a.pdf','Alice Active'),
 ('n_nofile','note no file','$B',NULL,'Bob Active');
INSERT OR REPLACE INTO jobs (id, firm, role, status, posted_by) VALUES
 ('j_open','Firm A','Audit Trainee','open','$ADM'),
 ('j_closed','Firm B','Intern','closed','$B');
INSERT OR REPLACE INTO resources (id, title, owner_id) VALUES ('r1','synthetic resource','$A');
INSERT OR REPLACE INTO post_likes (post_id, user_id) VALUES ('p_img','$A');
INSERT OR REPLACE INTO notifications (id, user_id, kind, title) VALUES
 ('n1','$A','system','for alice'),
 ('n2','$A','system','also alice'),
 ('n3','$B','system','for bob');
" >/dev/null

mint() { MINT_ISSUER="https://synthetic.clerk.accounts.dev" node test/mint-token.mjs "$TMP/key.pem" "$1" "$2" "${3:-300}"; }
TA=$(mint sub_synth_A "$A"); TB=$(mint sub_synth_B "$B"); TADM=$(mint sub_synth_ADM "$ADM")
TALLOW=$(mint "$ALA" -)        # allowlisted sub, profile row exists, no external_id
TALLOWNR=$(mint "$ALNR" -)     # allowlisted sub, NO profile row
TNOTIN=$(mint user_stranger -) # valid token, not on allowlist, no external_id

(setsid npx wrangler dev --local --port $PORT >"$TMP/wrangler.log" 2>&1) & WPID=$!
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL  $1 expected=$2 got=$3"; fi }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
J='Content-Type: application/json'
BASE="http://localhost:$PORT"
json() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const x=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }
check 'analytics guest denied' 403 "$(code "$BASE/api/admin/analytics")"
check 'analytics nonadmin denied' 403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/analytics")"
check 'db overview nonadmin denied' 403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/db-overview")"
check 'recent nonadmin denied' 403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/db-recent/profiles")"
check 'screen guest refused' 401 "$(code -X POST -H "$J" -d '{"screen":"home"}' "$BASE/api/screen-views")"
check 'screen query data refused' 400 "$(code -X POST -H "Authorization: Bearer $TA" -H "$J" -d '{"screen":"home?token=private"}' "$BASE/api/screen-views")"
check 'screen valid' 200 "$(code -X POST -H "Authorization: Bearer $TA" -H "$J" -d '{"screen":"home"}' "$BASE/api/screen-views")"
check 'screen repeat success' 200 "$(code -X POST -H "Authorization: Bearer $TA" -H "$J" -d '{"screen":"home"}' "$BASE/api/screen-views")"
npx wrangler d1 execute cohort-app-prep-3 --local --command "INSERT INTO controlled_test_accounts(user_id,note) VALUES('$A','synthetic exclusion');" >/dev/null
curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/analytics" > "$TMP/analytics.json"
check 'controlled excluded member count' 3 "$(json 'x.totals.members' < "$TMP/analytics.json")"
check 'controlled count explicit' 1 "$(json 'x.totals.controlled_test_accounts' < "$TMP/analytics.json")"
check 'controlled screen excluded' 0 "$(json 'x.screens.length' < "$TMP/analytics.json")"
check '14day zero-filled series' 14 "$(json 'x.by_day.length' < "$TMP/analytics.json")"
check 'new funnel bucket exists' 0 "$(json 'x.funnel.new' < "$TMP/analytics.json")"
check 'rejected bucket exists' 0 "$(json 'x.funnel.rejected' < "$TMP/analytics.json")"
check 'honest sign-in caveat' true "$(json 'x.basis.includes("not connected")' < "$TMP/analytics.json")"
check 'admin recent profiles' 200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/db-recent/profiles")"
check 'private table blocked' 400 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/db-recent/profile_contacts")"
check 'private messages table blocked' 400 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/db-recent/messages")"
check 'whitelist injection blocked' 400 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/db-recent/profiles%3BSELECT")"
curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/db-recent/applications" > "$TMP/recent.json"
check 'applications no resume path' false "$(json 'JSON.stringify(x).includes("resume_path")' < "$TMP/recent.json")"
curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" > "$TMP/activity.json"
check 'screen dedupe exactly1' 1 "$(json 'x.activity.filter(r=>r.action==="screen_view"&&r.actor_id==="'$A'").length' < "$TMP/activity.json")"
npx wrangler d1 execute cohort-app-prep-3 --local --command "DELETE FROM controlled_test_accounts WHERE user_id='$A';" >/dev/null
check 'non-test screen counts' 1 "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/analytics" | json 'x.screens[0].views')"
check 'overview admin works' 200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/db-overview")"
# Simultaneous same-screen requests must create one event.
code -X POST -H "Authorization: Bearer $TA" -H "$J" -d '{"screen":"concurrent"}' "$BASE/api/screen-views" > "$TMP/c1" & P1=$!
code -X POST -H "Authorization: Bearer $TA" -H "$J" -d '{"screen":"concurrent"}' "$BASE/api/screen-views" > "$TMP/c2" & P2=$!
wait "$P1" "$P2"
check 'atomic concurrent dedupe' 1 "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.filter(r=>r.action==="screen_view"&&r.entity_id==="concurrent").length')"
check 'post insert creates real activity' 201 "$(code -X POST -H "Authorization: Bearer $TA" -H "$J" -d '{"body":"synthetic activity post"}' "$BASE/api/posts")"
check 'post activity exact detail' true "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.some(r=>r.action==="post_created"&&r.detail.excerpt==="synthetic activity post")')"
# Source0032/0061 audit actor parity. No-op and denied writes leave no events.
check 'member self leave' 200 "$(code -X POST -H "Authorization: Bearer $TALLOW" "$BASE/api/groups/g1/leave")"
check 'self leave actor and target detail' true "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.some(r=>r.action==="member_left"&&r.actor_id==="user_allowA"&&r.entity_id==="g1"&&r.detail.member==="Allowlisted Ana"&&r.detail.group==="Test Group")')"
check 'repeat leave absent' 404 "$(code -X POST -H "Authorization: Bearer $TALLOW" "$BASE/api/groups/g1/leave")"
check 'repeat leave no extra event' 1 "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.filter(r=>r.action==="member_left"&&r.actor_id==="user_allowA").length')"
check 'nonadmin removal denied' 403 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/groups/g1/members/$A")"
check 'appadmin removal allowed' 200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/groups/g1/members/$A")"
check 'removal actor is caller not target' true "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.some(r=>r.action==="member_removed"&&r.actor_id==="'$ADM'"&&r.detail.member==="Alice Active")')"
check 'moderation denied nonadmin' 403 "$(code -X PATCH -H "Authorization: Bearer $TA" -H "$J" -d '{"status":"suspended"}' "$BASE/api/admin/members/$B")"
check 'suspend member' 200 "$(code -X PATCH -H "Authorization: Bearer $TADM" -H "$J" -d '{"status":"suspended"}' "$BASE/api/admin/members/$B")"
check 'suspend audit caller detail' true "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.some(r=>r.action==="account_suspended"&&r.actor_id==="'$ADM'"&&r.entity_id==="'$B'"&&r.detail.member==="Bob Active")')"
check 'same suspension no-op succeeds' 200 "$(code -X PATCH -H "Authorization: Bearer $TADM" -H "$J" -d '{"status":"suspended"}' "$BASE/api/admin/members/$B")"
check 'same suspension no duplicate audit' 1 "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.filter(r=>r.action==="account_suspended"&&r.entity_id==="'$B'").length')"
check 'promote synthetic user' 200 "$(code -X PATCH -H "Authorization: Bearer $TADM" -H "$J" -d '{"role":"admin"}' "$BASE/api/admin/members/$A")"
check 'role audit actor' true "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.some(r=>r.action==="admin_role_admin"&&r.actor_id==="'$ADM'"&&r.entity_id==="'$A'")')"
check 'soft deleted status only' 200 "$(code -X PATCH -H "Authorization: Bearer $TADM" -H "$J" -d '{"status":"deleted"}' "$BASE/api/admin/members/$A")"
check 'deleted member audit blank detail' true "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.some(r=>r.action==="account_deleted"&&r.entity_type==="profile"&&r.entity_id==="'$A'"&&r.detail.member==="")')"
check 'lastadmin safeguard' 409 "$(code -X PATCH -H "Authorization: Bearer $TADM" -H "$J" -d '{"role":"user"}' "$BASE/api/admin/members/$ADM")"
check 'refused lastadmin creates no audit' 0 "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | json 'x.activity.filter(r=>r.entity_id==="'$ADM'"&&r.action.startsWith("admin_role_")).length')"
echo "slice11: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
