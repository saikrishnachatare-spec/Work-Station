#!/usr/bin/env bash
# Item-2 endpoint-addition local tests: synthetic allowlist identity binding,
# profiles/groups/posts/comments/student-notes/notifications/search routes.
# Same isolation model as slice-2: throwaway RSA keypair, swapped .dev.vars,
# local D1, no network beyond localhost. Restores .dev.vars on exit.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8799
PASS=0; FAIL=0
cleanup() {
  [ -n "${WPID:-}" ] && kill -- "-$WPID" 2>/dev/null
  [ -n "${WPID:-}" ] && wait "$WPID" 2>/dev/null || true
  wait 2>/dev/null || true
  [ -f "$TMP/dev.vars.bak" ] && cp "$TMP/dev.vars.bak" .dev.vars
  [ -f "$TMP/wrangler.toml.bak" ] && cp "$TMP/wrangler.toml.bak" wrangler.toml
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

cp wrangler.toml "$TMP/wrangler.toml.bak"
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

printf '\n[[r2_buckets]]\nbinding = "FILES"\nbucket_name = "synthetic-local-files"\n' >> wrangler.toml
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


echo '--- R2 local bytes and source permission matrix'
printf '%%PDF-1.4\nsynthetic-only-bytes\n' > "$TMP/test.pdf"
printf '\211PNG\r\n\032\nsynthetic' > "$TMP/test.png"
P="$A/note.pdf"
F="$BASE/api/files"
check 'upload requires token' 401 "$(code -X PUT -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/student-notes?path=$P")"
check 'cross owner upload refused' 403 "$(code -X PUT -H "Authorization: Bearer $TB" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/student-notes?path=$P")"
check 'active own note upload' 201 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/student-notes?path=$P")"
curl -s "$F/student-notes?path=$P" > "$TMP/down.pdf"
check 'public note bytes exact hash' "$(sha256sum "$TMP/test.pdf" | cut -d' ' -f1)" "$(sha256sum "$TMP/down.pdf" | cut -d' ' -f1)"
check 'no overwrite' 409 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/student-notes?path=$P")"
check 'member cannot main-resource upload' 403 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/resources?path=$A/res.pdf")"
check 'admin main-resource upload' 201 "$(code -X PUT -H "Authorization: Bearer $TADM" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/resources?path=$ADM/res.pdf")"
check 'resource bytes require auth' 401 "$(code "$F/resources?path=$ADM/res.pdf")"
check 'authenticated resource bytes' 200 "$(code -H "Authorization: Bearer $TB" "$F/resources?path=$ADM/res.pdf")"
check 'active member avatar exception' 201 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: image/png' --data-binary @"$TMP/test.png" "$F/resources?path=$A/avatar-one.png")"
check 'forged image MIME refused' 415 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: image/png' --data-binary @"$TMP/test.pdf" "$F/post-images?path=$A/fake.png")"
check 'invalid MIME rejected' 415 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: text/html' --data-binary @"$TMP/test.pdf" "$F/post-images?path=$A/unsafe.html")"
check 'unsafe path rejected' 400 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/student-notes?path=$A/../escape.pdf")"
check 'cross-user delete refused' 403 "$(code -X DELETE -H "Authorization: Bearer $TB" "$F/student-notes?path=$P")"
check 'admin note delete permitted' 200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$F/student-notes?path=$P")"
check 'repeat delete safe after lost response' 200 "$(code -X DELETE -H "Authorization: Bearer $TA" "$F/student-notes?path=$P")"
check 'deleted bytes absent' 404 "$(code "$F/student-notes?path=$P")"
check 'resume upload own' 201 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/resumes?path=$A/cv.pdf")"
check 'resume guest refused' 401 "$(code "$F/resumes?path=$A/cv.pdf")"
check 'resume unrelated refused' 403 "$(code -H "Authorization: Bearer $TB" "$F/resumes?path=$A/cv.pdf")"
check 'resume owner reads' 200 "$(code -H "Authorization: Bearer $TA" "$F/resumes?path=$A/cv.pdf")"
check 'resume admin reads' 200 "$(code -H "Authorization: Bearer $TADM" "$F/resumes?path=$A/cv.pdf")"
check 'resume admin cannot delete' 403 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$F/resumes?path=$A/cv.pdf")"
npx wrangler d1 execute cohort-app-prep-3 --local --command "INSERT INTO applications(id,job_id,user_id,resume_path) VALUES('app_cv','j_closed','$A','$A/cv.pdf');" >/dev/null
check 'actual job poster reads resume' 200 "$(code -H "Authorization: Bearer $TB" "$F/resumes?path=$A/cv.pdf")"
check 'delete application cleans resume bytes' 200 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/applications/app_cv")"
check 'resume bytes gone after withdrawal' 404 "$(code -H "Authorization: Bearer $TA" "$F/resumes?path=$A/cv.pdf")"
# deleted resume no longer counts, matching current storage.objects source cap.
for i in $(seq 1 10); do code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/resumes?path=$A/cv-$i.pdf" >/dev/null; done
check 'resume daily cap blocks11th' 429 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/resumes?path=$A/cv-11.pdf")"
# Actual byte size, not just claimed client size.
head -c 5242881 /dev/zero > "$TMP/too-big.pdf"
check 'resume5MB actual-byte bound' 413 "$(code -X PUT -H "Authorization: Bearer $TB" -H 'Content-Type: application/pdf' --data-binary @"$TMP/too-big.pdf" "$F/resumes?path=$B/big.pdf")"
check 'legacy unknown cleanup fails closed' 409 "$(code -X DELETE -H "Authorization: Bearer $TA" "$F/student-notes?path=$A/legacy.pdf")"
# Pending/deleting objects never read as ready, even when a stale key exists.
npx wrangler d1 execute cohort-app-prep-3 --local --command "INSERT INTO file_objects(bucket,path,owner_id,mime_type,byte_size,state) VALUES('student-notes','$A/pending.pdf','$A','application/pdf',1,'pending');" >/dev/null
check 'pending upload unreadable' 404 "$(code "$F/student-notes?path=$A/pending.pdf")"
check 'pending cleanup idempotent R2 absent object' 200 "$(code -X DELETE -H "Authorization: Bearer $TA" "$F/student-notes?path=$A/pending.pdf")"
check 'post-image byte upload' 201 "$(code -X PUT -H "Authorization: Bearer $TA" -H 'Content-Type: image/png' --data-binary @"$TMP/test.png" "$F/post-images?path=$A/post.png")"
check 'public post-image bytes' 200 "$(code "$F/post-images?path=$A/post.png")"
check 'suspended upload refused' 403 "$(npx wrangler d1 execute cohort-app-prep-3 --local --command "UPDATE profiles SET status='suspended' WHERE id='$B';" >/dev/null; code -X PUT -H "Authorization: Bearer $TB" -H 'Content-Type: application/pdf' --data-binary @"$TMP/test.pdf" "$F/student-notes?path=$B/suspended.pdf")"
check 'deleted ledger cannot attach note' 400 "$(code -X POST -H "Authorization: Bearer $TA" -H "$J" -d '{"title":"deleted","file_path":"'$P'"}' "$BASE/api/student-notes")"
check 'D1 guard refuses deleted ledger reference' 1 "$(npx wrangler d1 execute cohort-app-prep-3 --local --command "INSERT INTO student_notes(id,title,owner_id,file_path) VALUES('bad_ref','x','$A','$P');" >/dev/null 2>&1; echo $?)"
echo "slice8: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
