#!/usr/bin/env bash
# Item-2 endpoint-addition local tests: synthetic allowlist identity binding,
# profiles/groups/posts/comments/student-notes/notifications/search routes.
# Same isolation model as slice-2: throwaway RSA keypair, swapped .dev.vars,
# local D1, no network beyond localhost. Restores .dev.vars on exit.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8797
PASS=0; FAIL=0
cleanup() {
  [ -n "${WPID:-}" ] && kill "$WPID" 2>/dev/null
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

(npx wrangler dev --local --port $PORT >"$TMP/wrangler.log" 2>&1) & WPID=$!
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL  $1 expected=$2 got=$3"; fi }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
J='Content-Type: application/json'
BASE="http://localhost:$PORT"

echo '--- allowlist identity binding (item 2 preview-only)'
check 'allowlisted sub + profile row binds'      "$ALA" "$(curl -s -H "Authorization: Bearer $TALLOW" "$BASE/api/me" | node -pe 'JSON.parse(require("fs").readFileSync(0)).cohortUserId')"
check 'valid token not on allowlist stays null'  'null' "$(curl -s -H "Authorization: Bearer $TNOTIN" "$BASE/api/me" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).cohortUserId)')"
check 'allowlisted sub without profile row null' 'null' "$(curl -s -H "Authorization: Bearer $TALLOWNR" "$BASE/api/me" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).cohortUserId)')"
check 'allowlisted member route allowed'         201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TALLOW" -d '{"body":"ana post"}' "$BASE/api/posts")"
check 'unmapped user member route denied'        403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TNOTIN" -d '{"body":"stranger"}' "$BASE/api/posts")"
check 'allowlist-no-row member route denied'     403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TALLOWNR" -d '{"body":"norow"}' "$BASE/api/posts")"

echo '--- profiles routes (0009/0015/0017/0048)'
check 'profiles list, no token'                  401 "$(code "$BASE/api/profiles")"
check 'profiles list, valid token unmapped ok'   200 "$(code -H "Authorization: Bearer $TNOTIN" "$BASE/api/profiles")"
check 'profile get, no token'                    401 "$(code "$BASE/api/profiles/$A")"
check 'profile get ok'                           200 "$(code -H "Authorization: Bearer $TA" "$BASE/api/profiles/$A")"
check 'profile get missing'                      404 "$(code -H "Authorization: Bearer $TA" "$BASE/api/profiles/nope")"
check 'profile patch own ok'                     200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"headline":"CA Inter student","skills":["audit","tax"]}' "$BASE/api/profiles/$A")"
HL=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/profiles/$A" | node -pe 'const p=JSON.parse(require("fs").readFileSync(0)).profile; p.headline+"|"+p.skills.join(",")')
check 'profile patch persisted + JSON parsed'    'CA Inter student|audit,tax' "$HL"
check 'profile patch other denied (non-admin)'   403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"headline":"x"}' "$BASE/api/profiles/$B")"
check 'profile patch other as admin ok'          200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"headline":"by admin"}' "$BASE/api/profiles/$B")"
check 'profile patch role field rejected'        403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"role":"admin"}' "$BASE/api/profiles/$A")"
check 'profile patch role as admin rejected'     403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"user"}' "$BASE/api/profiles/$B")"
check 'profile patch bad course'                 400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"course":"MBA"}' "$BASE/api/profiles/$A")"
check 'profile patch long headline'              400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d "{\"headline\":\"$(printf 'h%.0s' $(seq 1 121))\"}" "$BASE/api/profiles/$A")"
check 'profile patch bad link url'               400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"links":[{"label":"x","url":"notaurl"}]}' "$BASE/api/profiles/$A")"
check 'profile patch no token'                   401 "$(code -X PATCH -H "$J" -d '{"headline":"x"}' "$BASE/api/profiles/$A")"

echo '--- groups additions'
check 'group get, public'                        200 "$(code "$BASE/api/groups/g1")"
check 'group get missing'                        404 "$(code "$BASE/api/groups/nope")"
check 'group members, public'                    200 "$(code "$BASE/api/groups/g1/members")"
check 'group thread, no token'                   401 "$(code "$BASE/api/groups/g1/thread")"
check 'group thread, non-member denied'          403 "$(code -H "Authorization: Bearer $TB" "$BASE/api/groups/g1/thread")"
TID1=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/groups/g1/thread" | node -pe 'JSON.parse(require("fs").readFileSync(0)).threadId')
check 'group thread created for member'          36 "${#TID1}"
TID2=$(curl -s -H "Authorization: Bearer $TALLOW" "$BASE/api/groups/g1/thread" | node -pe 'JSON.parse(require("fs").readFileSync(0)).threadId')
check 'group thread get-or-create stable'        "$TID1" "$TID2"

echo '--- posts/comments additions'
check 'post get, public'                         200 "$(code "$BASE/api/posts/p_plain")"
check 'post get missing'                         404 "$(code "$BASE/api/posts/nope")"
check 'post patch own ok'                        200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"alice edited"}' "$BASE/api/posts/p_img")"
check 'post patch other denied'                  403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"evil"}' "$BASE/api/posts/p_plain")"
check 'post patch as admin ok'                   200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"body":"admin edited"}' "$BASE/api/posts/p_plain")"
check 'post patch blocked term'                  422 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"check this exam leak"}' "$BASE/api/posts/p_img")"
check 'post patch empty body'                    400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"  "}' "$BASE/api/posts/p_img")"
check 'post delete with image fails closed'      409 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/posts/p_img")"
check 'post delete other denied'                 403 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/posts/p_plain")"
check 'post delete no-image by owner ok'         200 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/posts/p_plain")"
check 'comment patch own ok'                     200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"edited comment"}' "$BASE/api/comments/c1")"
check 'comment patch by ADMIN denied (0013)'     403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"body":"admin edit"}' "$BASE/api/comments/c1")"
check 'comment patch blocked term'               422 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"you harami"}' "$BASE/api/comments/c1")"

echo '--- student notes delete (0046 + fail-closed bytes)'
check 'note delete with file fails closed'       409 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/student-notes/n_file")"
check 'note delete by non-owner denied'          403 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/student-notes/n_nofile")"
check 'note delete no-file by owner ok'          200 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/student-notes/n_nofile")"

echo '--- notifications read-all (0050)'
check 'read-all no token'                        401 "$(code -X POST "$BASE/api/notifications/read-all")"
check 'read-all marks own two'                   2 "$(curl -s -X POST -H "Authorization: Bearer $TA" "$BASE/api/notifications/read-all" | node -pe 'JSON.parse(require("fs").readFileSync(0)).updated')"
check 'read-all again marks zero'                0 "$(curl -s -X POST -H "Authorization: Bearer $TA" "$BASE/api/notifications/read-all" | node -pe 'JSON.parse(require("fs").readFileSync(0)).updated')"
check 'bob row untouched'                        'null' "$(curl -s -H "Authorization: Bearer $TB" "$BASE/api/notifications" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).notifications[0].read_at)')"

echo '--- search (per-entity guards)'
ANON=$(curl -s "$BASE/api/search?q=alice")
check 'search anon: no people'                   0 "$(echo "$ANON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).people.length')"
check 'search anon: posts found'                 1 "$(echo "$ANON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).posts.length')"
AUTH=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/search?q=alice")
check 'search authed: people found'              1 "$(echo "$AUTH" | node -pe 'JSON.parse(require("fs").readFileSync(0)).people.length')"
check 'search short query empty'                 0 "$(curl -s "$BASE/api/search?q=a" | node -pe 'JSON.parse(require("fs").readFileSync(0)).posts.length')"

echo '--- likes/jobs/resources additions'
check 'me/likes no token'                        401 "$(code "$BASE/api/me/likes")"
check 'me/likes returns own'                     '["p_img"]' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/me/likes" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0)).postIds)')"
check 'me/likes unmapped empty'                  '[]' "$(curl -s -H "Authorization: Bearer $TNOTIN" "$BASE/api/me/likes" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0)).postIds)')"
check 'job get open, anon'                       200 "$(code "$BASE/api/jobs/j_open")"
check 'job get closed, anon 404'                 404 "$(code "$BASE/api/jobs/j_closed")"
check 'job get closed, owner ok'                 200 "$(code -H "Authorization: Bearer $TB" "$BASE/api/jobs/j_closed")"
check 'job get closed, other member 404'         404 "$(code -H "Authorization: Bearer $TA" "$BASE/api/jobs/j_closed")"
check 'job get closed, admin ok'                 200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/jobs/j_closed")"
check 'resource get, public'                     200 "$(code "$BASE/api/resources/r1")"
check 'resource get missing'                     404 "$(code "$BASE/api/resources/nope")"
check 'search admin sees closed job'             1 "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/search?q=Intern" | node -pe 'JSON.parse(require("fs").readFileSync(0)).jobs.length')"
check 'search anon no closed job'                0 "$(curl -s "$BASE/api/search?q=Intern" | node -pe 'JSON.parse(require("fs").readFileSync(0)).jobs.length')"

echo '--- external_id claim strictness (item 10 path)'
BADEXT1=$(MINT_ISSUER="https://synthetic.clerk.accounts.dev" node -e '
const { createSign } = require("node:crypto");
const { readFileSync } = require("node:fs");
const b64u = (b) => Buffer.from(b).toString("base64url");
const now = Math.floor(Date.now()/1000);
const h = b64u(JSON.stringify({alg:"RS256",typ:"JWT",kid:"synthetic-test-key"}));
const p = b64u(JSON.stringify({sub:"sub_badext",iss:process.env.MINT_ISSUER,azp:"https://synthetic.test",iat:now-10,nbf:now-10,exp:now+300,sid:"s",external_id:12345}));
const s = createSign("RSA-SHA256"); s.update(h+"."+p);
console.log(h+"."+p+"."+s.sign(readFileSync(process.argv[1],"utf8")).toString("base64url"));
' "$TMP/key.pem")
check 'external_id numeric claim treated as absent'   'null' "$(curl -s -H "Authorization: Bearer $(echo "$BADEXT1" | sed -n 1p)" "$BASE/api/me" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).cohortUserId)' 2>/dev/null || echo curlfail)"
BADEXT2=$(MINT_ISSUER="https://synthetic.clerk.accounts.dev" node -e '
const { createSign } = require("node:crypto");
const { readFileSync } = require("node:fs");
const b64u = (b) => Buffer.from(b).toString("base64url");
const now = Math.floor(Date.now()/1000);
const h = b64u(JSON.stringify({alg:"RS256",typ:"JWT",kid:"synthetic-test-key"}));
const p = b64u(JSON.stringify({sub:"sub_badext2",iss:process.env.MINT_ISSUER,azp:"https://synthetic.test",iat:now-10,nbf:now-10,exp:now+300,sid:"s",external_id:"../../etc/passwd $evil"}));
const s = createSign("RSA-SHA256"); s.update(h+"."+p);
console.log(h+"."+p+"."+s.sign(readFileSync(process.argv[1],"utf8")).toString("base64url"));
' "$TMP/key.pem")
check 'external_id malformed string treated as absent' 'null' "$(curl -s -H "Authorization: Bearer $BADEXT2" "$BASE/api/me" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).cohortUserId)')"

echo '--- allowlist gate fail-closed variants (server restarts)'
write_vars() {
node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const pub = readFileSync(process.argv[1] + "/pub.pem", "utf8").trim().replace(/\n/g, "\\n");
writeFileSync(".dev.vars",
`# SYNTHETIC LOCAL TEST VALUES - gate variant
CLERK_JWT_KEY="${pub}"
CLERK_ISSUER="${process.argv[2]}"
CLERK_AUTHORIZED_PARTIES="https://synthetic.test"
TEST_SUB_ALLOWLIST="user_allowA,user_allowNoRow"
${process.argv[3]}
`);
' "$TMP" "$1" "$2"
}
restart() {
  kill $WPID 2>/dev/null; wait $WPID 2>/dev/null
  pkill -f "wrangler dev --local --port $PORT" 2>/dev/null
  pkill -f "workerd" 2>/dev/null
  for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 || break; sleep 1; done
  (npx wrangler dev --local --port $PORT >>"$TMP/wrangler.log" 2>&1) & WPID=$!
  for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done
}

# variant 1: opt-in not 'enabled' -> inert even with issuer pin correct.
# (.dev.vars cannot UNSET a wrangler.toml [vars] key locally, so this writes an
# explicit non-'enabled' value; the code path - !== 'enabled' fails closed - is
# the same one an absent var takes.)
write_vars "https://synthetic.clerk.accounts.dev" 'PREVIEW_IDENTITY_BINDING="disabled"
PREVIEW_DEV_ISSUER="https://synthetic.clerk.accounts.dev"'
restart
check 'opt-in not enabled -> no binding'          'null' "$(curl -s -H "Authorization: Bearer $TALLOW" "$BASE/api/me" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).cohortUserId)')"

# variant 2: issuer pin mismatch (look-alike dev instance) -> inert
write_vars "https://synthetic.clerk.accounts.dev" 'PREVIEW_IDENTITY_BINDING="enabled"
PREVIEW_DEV_ISSUER="https://other-instance.clerk.accounts.dev"'
restart
check 'issuer pin mismatch -> no binding'         'null' "$(curl -s -H "Authorization: Bearer $TALLOW" "$BASE/api/me" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).cohortUserId)')"

# variant 3: pin matches but issuer is a production-style host -> inert
write_vars "https://clerk.production-example.com" 'PREVIEW_IDENTITY_BINDING="enabled"
PREVIEW_DEV_ISSUER="https://clerk.production-example.com"'
TPROD=$(MINT_ISSUER="https://clerk.production-example.com" node test/mint-token.mjs "$TMP/key.pem" "$ALA" - 300)
restart
check 'production-style issuer -> no binding'     'null' "$(curl -s -H "Authorization: Bearer $TPROD" "$BASE/api/me" | node -pe 'String(JSON.parse(require("fs").readFileSync(0)).cohortUserId)')"

echo
echo "slice6: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
