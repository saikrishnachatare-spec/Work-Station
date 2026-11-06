#!/usr/bin/env bash
# Item-2 endpoint-addition local tests: synthetic allowlist identity binding,
# profiles/groups/posts/comments/student-notes/notifications/search routes.
# Same isolation model as slice-2: throwaway RSA keypair, swapped .dev.vars,
# local D1, no network beyond localhost. Restores .dev.vars on exit.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8800
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


q() { npx wrangler d1 execute cohort-app-prep-3 --local --json --command "$1" 2>/dev/null | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0))[0].results)'; }
count() { q "$1" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].n'; }
# Clear seeded notification rows; test DB only.
q "DELETE FROM notifications;" >/dev/null
check 'comment creates recipient notification' 201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"synthetic reply"}' "$BASE/api/posts/p_img/comments")"
check 'author gets comment alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND kind='comment'")"
code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"synthetic second"}' "$BASE/api/posts/p_img/comments" >/dev/null
check 'same-hour comment dedupe' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND kind='comment'")"
code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"own reply"}' "$BASE/api/posts/p_img/comments" >/dev/null
check 'self comment no new alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE kind='comment'")"
q "INSERT INTO threads(id) VALUES('notifdm'); INSERT INTO thread_participants(thread_id,user_id) VALUES('notifdm','$A'),('notifdm','$B'); INSERT INTO messages(id,thread_id,sender_id,body) VALUES('notifm1','notifdm','$A','synthetic hello');" >/dev/null
check 'DM recipient alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$B' AND kind='message'")"
check 'DM no self notification' 0 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND kind='message'")"
q "INSERT INTO user_blocks(blocker_id,blocked_id) VALUES('$B','$A'); DELETE FROM notifications WHERE kind='message'; INSERT INTO messages(id,thread_id,sender_id,body) VALUES('notifm2','notifdm','$A','blocked hello');" >/dev/null
check 'block suppresses DM notification' 0 "$(count "SELECT count(*) n FROM notifications WHERE kind='message'")"
q "DELETE FROM user_blocks; INSERT INTO threads(id,group_id) VALUES('notifgroup','g1'); INSERT INTO messages(id,thread_id,sender_id,body) VALUES('notifgm','notifgroup','$A','group hello');" >/dev/null
check 'group member alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$ALA' AND kind='message'")"
q "INSERT INTO connections(id,requester_id,addressee_id,status) VALUES('notifconn','$A','$B','pending');" >/dev/null
check 'connection request alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$B' AND kind='connection_request'")"
q "UPDATE connections SET status='accepted' WHERE id='notifconn';" >/dev/null
check 'connection accept alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND kind='connection_accepted'")"
q "INSERT INTO applications(id,job_id,user_id) VALUES('notifapp','j_closed','$A'); UPDATE applications SET status='shortlisted' WHERE id='notifapp';" >/dev/null
check 'application status alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND kind='application_status'")"
q "UPDATE applications SET status='shortlisted' WHERE id='notifapp';" >/dev/null
check 'no-op status no duplicate' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND kind='application_status'")"
q "INSERT INTO verification_requests(id,user_id) VALUES('notifverify','$B'); UPDATE verification_requests SET status='approved' WHERE id='notifverify';" >/dev/null
check 'verification notification' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$B' AND dedupe_key='verify:notifverify'")"
q "INSERT INTO error_logs(id,message) VALUES('notiferr1','synthetic test error'),('notiferr2','second');" >/dev/null
check 'daily admin error digest dedupe' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$ADM' AND kind='system'")"
q "INSERT INTO job_alert_prefs(user_id,keywords) VALUES('$A','audit, tax'),('$B','unmatched');" >/dev/null
check 'job create with matching alerts' 201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"cat":"Gig work","firm":"Synthetic LLP","role":"Audit support","loc":"Hyd"}' "$BASE/api/jobs")"
check 'matching keyword alert' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND kind='job_match'")"
check 'nonmatching keyword no alert' 0 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$B' AND kind='job_match'")"
check 'notification API own-only' 0 "$(curl -s -H "Authorization: Bearer $TB" "$BASE/api/notifications" | node -pe 'const r=JSON.parse(require("fs").readFileSync(0));r.notifications.filter(n=>n.user_id!==process.argv[1]).length' "$B")"
NID=$(q "SELECT id FROM notifications WHERE user_id='$A' LIMIT 1" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].id')
check 'cross-user mark-read denied' 403 "$(code -X POST -H "Authorization: Bearer $TB" "$BASE/api/notifications/$NID/read")"
check 'own mark-read' 200 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/notifications/$NID/read")"
check 'own read-all' 200 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/notifications/read-all")"
check 'own unread now zero' 0 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$A' AND read_at IS NULL")"
check 'other user unread retained' 1 "$(count "SELECT CASE WHEN count(*)>0 THEN 1 ELSE 0 END n FROM notifications WHERE user_id='$B' AND read_at IS NULL")"
check 'client cannot create alerts' 404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"title":"forged"}' "$BASE/api/notifications")"
q "UPDATE profiles SET status='suspended' WHERE id='$B'; INSERT INTO verification_requests(id,user_id) VALUES('inactiveverify','$B'); UPDATE verification_requests SET status='rejected' WHERE id='inactiveverify';" >/dev/null
check 'inactive recipient suppressed' 0 "$(count "SELECT count(*) n FROM notifications WHERE dedupe_key='verify:inactiveverify'")"
q "INSERT INTO messages(id,thread_id,sender_id,body) VALUES('notifgroup2','notifgroup','$A','second group hello');" >/dev/null
check 'same hour group dedupe' 1 "$(count "SELECT count(*) n FROM notifications WHERE user_id='$ALA' AND kind='message'")"
echo "slice9: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
