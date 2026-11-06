#!/usr/bin/env bash
# Item-2 endpoint-addition local tests: synthetic allowlist identity binding,
# profiles/groups/posts/comments/student-notes/notifications/search routes.
# Same isolation model as slice-2: throwaway RSA keypair, swapped .dev.vars,
# local D1, no network beyond localhost. Restores .dev.vars on exit.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8801
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
check 'inbox anonymous refused' 401 "$(code "$BASE/api/inbox")"
json() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const x=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }
check 'unmapped inbox empty' 0 "$(curl -s -H "Authorization: Bearer $TNOTIN" "$BASE/api/inbox" | json 'x.threads.length')"
npx wrangler d1 execute cohort-app-prep-3 --local --command "
INSERT INTO threads(id) VALUES('live_dm');
INSERT INTO thread_participants(thread_id,user_id,last_read_at) VALUES('live_dm','$A','2026-01-01'),('live_dm','$B','2026-01-01');
WITH RECURSIVE nums(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM nums WHERE n<205)
INSERT INTO messages(id,thread_id,sender_id,body,created_at) SELECT printf('live-%03d',n),'live_dm','$B',printf('message-%03d',n),'2026-01-02 12:00:00' FROM nums;
" >/dev/null
curl -s -H "Authorization: Bearer $TA" "$BASE/api/threads/live_dm/messages" > "$TMP/messages.json"
check 'window200 rows' 200 "$(json 'x.messages.length' < "$TMP/messages.json")"
check 'latest message beyond200 visible' live-205 "$(json 'x.messages.at(-1).id' < "$TMP/messages.json")"
check 'oldest window stable tie break' live-006 "$(json 'x.messages[0].id' < "$TMP/messages.json")"
check 'older boundary explicit' true "$(json 'x.has_older' < "$TMP/messages.json")"
curl -s -H "Authorization: Bearer $TA" "$BASE/api/inbox" > "$TMP/inbox.json"
check 'own inbox only' 1 "$(json 'x.threads.length' < "$TMP/inbox.json")"
check 'counterpart name' 'Bob Active' "$(json 'x.threads[0].otherName' < "$TMP/inbox.json")"
check 'inbox latest message' message-205 "$(json 'x.threads[0].lastMessage' < "$TMP/inbox.json")"
check 'inbox unread includes beyond200' 205 "$(json 'x.threads[0].unread' < "$TMP/inbox.json")"
check 'admin no private inbox override' 0 "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/inbox" | json 'x.threads.length')"
check 'admin no message override' 403 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/threads/live_dm/messages")"
check 'own mark read' 200 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/threads/live_dm/read")"
check 'read reflects inbox' 0 "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/inbox" | json 'x.threads[0].unread')"
npx wrangler d1 execute cohort-app-prep-3 --local --command "DELETE FROM thread_participants WHERE thread_id='live_dm' AND user_id='$A';" >/dev/null
check 'removed member inbox disappears' 0 "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/inbox" | json 'x.threads.length')"
check 'removed member body denied' 403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/threads/live_dm/messages")"
echo "slice10: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
