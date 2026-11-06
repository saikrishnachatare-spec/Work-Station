#!/usr/bin/env bash
# Slice-2 local synthetic authorization tests. Generates a throwaway RSA
# keypair, temporarily swaps .dev.vars to point the worker at it, seeds a
# local D1 with synthetic profiles (active x2, suspended, admin), runs wrangler
# dev locally, and asserts the allow/deny/forgery matrix. No real Clerk
# instance, no network beyond localhost, no real user data. Restores .dev.vars
# on exit.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8793
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
`# SYNTHETIC LOCAL TEST VALUES - written by test/run-slice2-local.sh, restored on exit
CLERK_JWT_KEY="${pub}"
CLERK_ISSUER="https://synthetic.test"
CLERK_AUTHORIZED_PARTIES="https://synthetic.test"
`);
' "$TMP"

A='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
B='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
S='cccccccc-3333-4333-8333-cccccccccccc'
ADM='dddddddd-4444-4444-8444-dddddddddddd'

rm -rf .wrangler/state
npx wrangler d1 migrations apply cohort-app-prep --local >/dev/null 2>&1
npx wrangler d1 execute cohort-app-prep --local --command "
INSERT OR REPLACE INTO profiles (id, full_name, role, status) VALUES
 ('$A','Alice Active','user','active'),
 ('$B','Bob Active','user','active'),
 ('$S','Sue Suspended','user','suspended'),
 ('$ADM','Ada Admin','admin','active');
DELETE FROM posts; DELETE FROM post_likes; DELETE FROM comments;" >/dev/null

mint() { node test/mint-token.mjs "$TMP/key.pem" "$1" "$2" "${3:-300}"; }
TA=$(mint user_synth_A "$A"); TB=$(mint user_synth_B "$B"); TS=$(mint user_synth_S "$S")
TADM=$(mint user_synth_ADM "$ADM"); TNOEXT=$(mint user_synth_X -); TEXP=$(mint user_synth_A "$A" -30)

(npx wrangler dev --local --port $PORT >"$TMP/wrangler.log" 2>&1) & WPID=$!
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done

check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 ($3)";
  else FAIL=$((FAIL+1)); echo "FAIL  $1 expected=$2 got=$3"; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
J='Content-Type: application/json'
BASE="http://localhost:$PORT"

# --- reads: public
check 'feed read, no token (public)'            200 "$(code "$BASE/api/feed")"
check 'comments read, no token (public)'        200 "$(code "$BASE/api/posts/nope/comments")"
# --- /api/me still protected
check 'me, no token'                            401 "$(code "$BASE/api/me")"
check 'me, expired token'                       401 "$(code -H "Authorization: Bearer $TEXP" "$BASE/api/me")"
check 'me, garbage token'                       401 "$(code -H 'Authorization: Bearer garbage' "$BASE/api/me")"
# --- post create
check 'post create, no token'                   401 "$(code -X POST -H "$J" -d '{"body":"hi"}' "$BASE/api/posts")"
check 'post create, expired token'              401 "$(code -X POST -H "$J" -H "Authorization: Bearer $TEXP" -d '{"body":"hi"}' "$BASE/api/posts")"
check 'post create, active user'                201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"first post from alice"}' "$BASE/api/posts")"
check 'post create, suspended user'             403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"body":"sue tries"}' "$BASE/api/posts")"
check 'post create, forged author_id'           403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"body\":\"forged\",\"author_id\":\"$B\"}" "$BASE/api/posts")"
check 'post create, announcement as non-admin'  403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"ann","kind":"announcement"}' "$BASE/api/posts")"
check 'post create, announcement as admin'      201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"body":"official","kind":"announcement"}' "$BASE/api/posts")"
check 'post create, blocked term'               422 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"check this exam leak guys"}' "$BASE/api/posts")"
check 'post create, no external_id claim'       403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TNOEXT" -d '{"body":"unmapped"}' "$BASE/api/posts")"
check 'post create, empty body'                 400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"  "}' "$BASE/api/posts")"
# --- ownership proof: created post belongs to caller even when body tried forgery path
POST_ID=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"bob post"}' "$BASE/api/posts" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).post.id))')
OWNER=$(curl -s "$BASE/api/feed" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const p=JSON.parse(d).posts.find(p=>p.body==="bob post");console.log(p.author_id)})')
check 'post owned by token external_id' "$B" "$OWNER"
# --- likes
check 'like, active user'                       200 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/posts/$POST_ID/like")"
check 'like again (double)'                     409 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/posts/$POST_ID/like")"
check 'like, suspended user'                    403 "$(code -X POST -H "Authorization: Bearer $TS" "$BASE/api/posts/$POST_ID/like")"
check 'like, no token'                          401 "$(code -X POST "$BASE/api/posts/$POST_ID/like")"
check 'like, missing post'                      404 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/posts/missing/like")"
check 'unlike own'                              200 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/posts/$POST_ID/like")"
check 'unlike not-liked'                        404 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/posts/$POST_ID/like")"
check 'admin unlike someone elses like'         404 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/posts/$POST_ID/like")"
# --- comments
check 'comment, active user'                    201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"nice post"}' "$BASE/api/posts/$POST_ID/comments")"
check 'comment, suspended user'                 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"body":"sue comments"}' "$BASE/api/posts/$POST_ID/comments")"
check 'comment, no token'                       401 "$(code -X POST -H "$J" -d '{"body":"anon"}' "$BASE/api/posts/$POST_ID/comments")"
check 'comment, blocked term'                   422 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"you harami"}' "$BASE/api/posts/$POST_ID/comments")"
check 'comment >2000 chars'                     400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"body\":\"$(printf 'x%.0s' $(seq 1 2001))\"}" "$BASE/api/posts/$POST_ID/comments")"
check 'comment, missing post'                   404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"where"}' "$BASE/api/posts/missing/comments")"
CMT_ID=$(curl -s "$BASE/api/posts/$POST_ID/comments" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).comments[0].id))')
check 'comment delete by non-owner non-admin'   403 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/comments/$CMT_ID")"
check 'comment delete by owner'                 200 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/comments/$CMT_ID")"
CMT2_ID=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"bob comment"}' "$BASE/api/posts/$POST_ID/comments" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).comment.id))')
check 'comment delete by admin (not owner)'     200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/comments/$CMT2_ID")"
check 'comment delete missing'                  404 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/comments/missing")"
# --- count upkeep (trigger replacement): like then unlike keeps like_count at 0, comment counts back to 0
LC=$(curl -s "$BASE/api/feed" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const p=JSON.parse(d).posts.find(p=>p.id===process.argv[1]);console.log(p.like_count+"/"+p.comment_count)})' "$POST_ID")
check 'like/comment counts net to 0/0' '0/0' "$LC"


# --- rate-limit boundaries (0044: <10 own posts/hour, <20 own comments/10min)
# A already has 1 post this hour from the matrix above; seed 9 more directly.
SEED_POST=$(node -e 'console.log(crypto.randomUUID())')
npx wrangler d1 execute cohort-app-prep --local --command "
INSERT INTO posts (id, author_id, author_name, author_role, body) VALUES ('$SEED_POST','$B','Bob Active','user','seed post');
INSERT INTO posts (id, author_id, author_name, author_role, body)
 WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<9)
 SELECT lower(hex(randomblob(16))), '$A','Alice Active','user','seed' FROM c;" | tail -1
check 'post create at 10/hour boundary -> 403' 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"eleventh"}' "$BASE/api/posts")"
check 'post create under limit (other user)'  201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"bob still fine"}' "$BASE/api/posts")"
# 20 comments by A within 10 minutes on the dedicated seed post.
npx wrangler d1 execute cohort-app-prep --local --command "
INSERT INTO comments (id, post_id, author_id, body)
 WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<20)
 SELECT lower(hex(randomblob(16))), '$SEED_POST', '$A', 'seed comment' FROM c;" | tail -1
check 'comment create at 20/10min boundary -> 403' 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"twenty first"}' "$BASE/api/posts/$SEED_POST/comments")"
check 'comment create under limit (other user)' 201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"bob comments fine"}' "$BASE/api/posts/$SEED_POST/comments")"

echo "---- $PASS passed, $FAIL failed ----"
[ "$FAIL" = 0 ]
