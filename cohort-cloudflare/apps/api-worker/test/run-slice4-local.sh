#!/usr/bin/env bash
# Slice-4 local synthetic tests: jobs/applications/verification/reports/
# job alerts/blocked terms/error logs/admin surfaces. Same pattern as 2/3/5.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8796
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

cp .dev.vars "$TMP/dev.vars.bak" 2>/dev/null || touch "$TMP/dev.vars.bak"
node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const pub = readFileSync(process.argv[1] + "/pub.pem", "utf8").trim().replace(/\n/g, "\\n");
writeFileSync(".dev.vars",
`# SYNTHETIC LOCAL TEST VALUES - written by test/run-slice4-local.sh, restored on exit
CLERK_JWT_KEY="${pub}"
CLERK_ISSUER="https://synthetic.test"
CLERK_AUTHORIZED_PARTIES="https://synthetic.test"
`);
' "$TMP"

A='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
B='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
S='cccccccc-3333-4333-8333-cccccccccccc'
ADM='dddddddd-4444-4444-8444-dddddddddddd'
C='66666666-6666-4666-8666-666666666666'
DEL='77777777-7777-4777-8777-777777777777'
V='88888888-8888-4888-8888-888888888888'
ADM2='99999999-9999-4999-8999-999999999999'

rm -rf .wrangler/state
npx wrangler d1 migrations apply cohort-app-prep-2 --local >/dev/null 2>&1
npx wrangler d1 execute cohort-app-prep-2 --local --command "
INSERT INTO profiles (id, full_name, role, status, account_type, verified_at) VALUES
 ('$A','Alice Active','user','active','individual',NULL),
 ('$B','Bob Active','user','active','individual',NULL),
 ('$S','Sue Suspended','user','suspended','individual',NULL),
 ('$ADM','Ada Admin','admin','active','individual',NULL),
 ('$C','Cara Active','user','active','individual',NULL),
 ('$DEL','Del Deleted','user','deleted','individual',NULL),
 ('$V','Vera Verified','user','active','individual','2026-01-01 00:00:00'),
 ('$ADM2','Second Admin','admin','active','individual',NULL);
INSERT INTO jobs (id, cat, firm, role, posted_by, status) VALUES
 ('jOpen','Jobs','Firm A','Accountant','$A','open'),
 ('jClosed','Jobs','Firm A','Closed Role','$A','closed'),
 ('jGig','Gig work','Gig Co','Gig Role','$B','open');
INSERT INTO applications (id, job_id, user_id, status) VALUES ('app1','jOpen','$C','new');
INSERT INTO posts (id, author_id, author_name, body) VALUES
 ('post1','$A','Alice Active','hello world'),
 ('postDel','$DEL','Del Deleted','gone author post');
INSERT INTO comments (id, post_id, author_id, body) VALUES ('cmt1','post1','$B','nice post');
INSERT INTO post_likes (post_id, user_id) VALUES ('post1','$B');
UPDATE posts SET comment_count=1, like_count=1 WHERE id='post1';
INSERT INTO resources (id, title, uploaded_by, owner_id) VALUES
 ('res1','Plain Note','Alice Active','$A'),
 ('resFile','File Note','Alice Active','$A');
UPDATE resources SET file_path='resources/a.pdf' WHERE id='resFile';
" >/dev/null

mint() { node test/mint-token.mjs "$TMP/key.pem" "$1" "$2" "${3:-300}"; }
TA=$(mint user_synth_A "$A"); TB=$(mint user_synth_B "$B"); TS=$(mint user_synth_S "$S")
TADM=$(mint user_synth_ADM "$ADM"); TC=$(mint user_synth_C "$C"); TDEL=$(mint user_synth_DEL "$DEL")
TV=$(mint user_synth_V "$V"); TADM2=$(mint user_synth_ADM2 "$ADM2"); TNOEXT=$(mint user_synth_X -)

(npx wrangler dev --local --port $PORT >"$TMP/wrangler.log" 2>&1) & WPID=$!
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL  $1 expected=$2 got=$3"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
J='Content-Type: application/json'
BASE="http://localhost:$PORT"
jget() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(eval("("+d+")"+process.argv[1]))}catch(e){console.log("ERR")}})' "$1"; }

# ---- jobs read visibility
JOBS_ANON=$(curl -s "$BASE/api/jobs")
check 'anon sees jobs list'                    200 "$(code "$BASE/api/jobs")"
check 'anon sees open job'                     'true' "$(echo "$JOBS_ANON" | jget '.jobs.some(j=>j.id==="jOpen").toString()')"
check 'anon cannot see closed job'             'false' "$(echo "$JOBS_ANON" | jget '.jobs.some(j=>j.id==="jClosed").toString()')"
check 'poster sees own closed job'             'true' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/jobs" | jget '.jobs.some(j=>j.id==="jClosed").toString()')"
check 'other member cannot see closed job'     'false' "$(curl -s -H "Authorization: Bearer $TC" "$BASE/api/jobs" | jget '.jobs.some(j=>j.id==="jClosed").toString()')"
check 'admin sees closed job'                  'true' "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/jobs" | jget '.jobs.some(j=>j.id==="jClosed").toString()')"

# ---- job create gates
JV=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"firm":"VFirm","role":"Articles","cat":"Jobs"}' "$BASE/api/jobs" | jget '.id')
check 'verified posts cat Jobs'                'true' "$([ "$JV" != "ERR" ] && [ -n "$JV" ] && echo true || echo false)"
check 'unverified posts cat Jobs (denied)'     403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"firm":"X","role":"Y","cat":"Jobs"}' "$BASE/api/jobs")"
JGIGA=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"firm":"GigA","role":"Gig Role","cat":"Gig work","openings":3}' "$BASE/api/jobs" | jget '.id')
check 'unverified posts Gig work'              'true' "$([ "$JGIGA" != "ERR" ] && [ -n "$JGIGA" ] && echo true || echo false)"
check 'job create, no token'                   401 "$(code -X POST -H "$J" -d '{"firm":"X","role":"Y"}' "$BASE/api/jobs")"
check 'job create unmapped token'              403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TNOEXT" -d '{"firm":"X","role":"Y","cat":"Gig work"}' "$BASE/api/jobs")"
check 'job create suspended'                   403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"firm":"X","role":"Y","cat":"Gig work"}' "$BASE/api/jobs")"
check 'job create deleted profile'             403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TDEL" -d '{"firm":"X","role":"Y","cat":"Gig work"}' "$BASE/api/jobs")"
check 'job create forged posted_by'            403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d "{\"firm\":\"X\",\"role\":\"Y\",\"posted_by\":\"$B\"}" "$BASE/api/jobs")"
check 'job create missing firm'                400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"role":"Y"}' "$BASE/api/jobs")"
check 'job create role too long'               400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d "{\"firm\":\"X\",\"role\":\"$(printf 'r%.0s' $(seq 1 201))\"}" "$BASE/api/jobs")"
check 'job create description too long'        400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d "{\"firm\":\"X\",\"role\":\"Y\",\"description\":\"$(printf 'd%.0s' $(seq 1 5001))\"}" "$BASE/api/jobs")"
check 'job create openings zero'               400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"firm":"X","role":"Y","openings":0}' "$BASE/api/jobs")"
check 'job create bad status'                  400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"firm":"X","role":"Y","status":"paused"}' "$BASE/api/jobs")"

# ---- job update gate
check 'poster edits own Gig job'               200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"loc":"Hyd"}' "$BASE/api/jobs/$JGIGA")"
check 'unverified poster cannot move Gig->Jobs' 403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"cat":"Jobs"}' "$BASE/api/jobs/$JGIGA")"
check 'poster cannot reassign posted_by'       403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d "{\"posted_by\":\"$B\"}" "$BASE/api/jobs/$JGIGA")"
check 'verified poster edits own job'          200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TV" -d '{"loc":"BLR"}' "$BASE/api/jobs/$JV")"
check 'non-poster cannot edit'                 403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TC" -d '{"loc":"X"}' "$BASE/api/jobs/jOpen")"
check 'admin edits others job'                 200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"loc":"AdminLoc"}' "$BASE/api/jobs/jGig")"
check 'job patch bad status'                   400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"status":"paused"}' "$BASE/api/jobs/$JGIGA")"
check 'job patch missing'                      404 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"loc":"X"}' "$BASE/api/jobs/nope")"
JDEL=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"firm":"Doom","role":"Doomed"}' "$BASE/api/jobs" | jget '.id')
check 'non-poster cannot delete'               403 "$(code -X DELETE -H "Authorization: Bearer $TC" "$BASE/api/jobs/$JDEL")"
check 'poster deletes own job'                 200 "$(code -X DELETE -H "Authorization: Bearer $TV" "$BASE/api/jobs/$JDEL")"
JDEL2=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"firm":"Doom2","role":"Doomed2"}' "$BASE/api/jobs" | jget '.id')
check 'admin deletes others job (direct)'      200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/jobs/$JDEL2")"

# ---- applications
APPC=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"resume_name":"cv.pdf","resume_path":"resumes/c/cv.pdf"}' "$BASE/api/jobs/jGig/apply" | jget '.id')
check 'apply to open job'                      'true' "$([ "$APPC" != "ERR" ] && [ -n "$APPC" ] && echo true || echo false)"
check 'double apply'                           409 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{}' "$BASE/api/jobs/jGig/apply")"
check 'apply to closed job'                    403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{}' "$BASE/api/jobs/jClosed/apply")"
check 'apply to missing job'                   403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{}' "$BASE/api/jobs/nope/apply")"
check 'apply suspended'                        403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{}' "$BASE/api/jobs/jGig/apply")"
check 'apply forged user_id'                   403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"user_id\":\"$A\"}" "$BASE/api/jobs/jGig/apply")"
check 'apply with client-chosen shortlisted rejected (fix)' 400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"status":"shortlisted"}' "$BASE/api/jobs/jGig/apply")"
APPB=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"status":"new"}' "$BASE/api/jobs/jGig/apply" | jget '.id')
check 'apply with explicit new accepted'       'true' "$([ "$APPB" != "ERR" ] && [ -n "$APPB" ] && echo true || echo false)"
check 'stored status is new'                   'new' "$(curl -s -H "Authorization: Bearer $TB" "$BASE/api/jobs/jGig/applications" | jget '.applications.find(a=>a.id==="'$APPB'").status')"
check 'apply bad status also rejected'         400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"status":"hired"}' "$BASE/api/jobs/jGig/apply")"
check 'mine lists own application'             'true' "$(curl -s -H "Authorization: Bearer $TC" "$BASE/api/applications/mine" | jget '.applications.some(a=>a.id==="'$APPC'").toString()')"
check 'mine, no token'                         401 "$(code "$BASE/api/applications/mine")"
check 'mine excludes others'                   'false' "$(curl -s -H "Authorization: Bearer $TC" "$BASE/api/applications/mine" | jget '.applications.some(a=>a.id==="'$APPB'").toString()')" 
JAPPS=$(curl -s -H "Authorization: Bearer $TB" "$BASE/api/jobs/jGig/applications")
check 'poster reads applicants'                200 "$(code -H "Authorization: Bearer $TB" "$BASE/api/jobs/jGig/applications")"
check 'poster sees both applicants'            '2' "$(echo "$JAPPS" | jget '.applications.length.toString()')"
check 'poster sees resume metadata (mirrored)' 'cv.pdf' "$(echo "$JAPPS" | jget '.applications.find(a=>a.id==="'$APPC'").resume_name')"
check 'non-poster cannot read applicants'      403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/jobs/jGig/applications")"
check 'admin reads applicants'                 200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/jobs/jGig/applications")"
check 'poster updates status'                  200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d '{"status":"reviewed"}' "$BASE/api/applications/$APPC/status")"
check 'applicant cannot update own status'     403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TC" -d '{"status":"rejected"}' "$BASE/api/applications/$APPC/status")"
check 'admin (not poster) cannot update status' 403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"status":"rejected"}' "$BASE/api/applications/$APPC/status")"
check 'identity guard blocks user_id change'   403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d "{\"status\":\"reviewed\",\"user_id\":\"$A\"}" "$BASE/api/applications/$APPC/status")"
check 'status bad enum'                        400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d '{"status":"hired"}' "$BASE/api/applications/$APPC/status")"
check 'admin cannot withdraw others application' 404 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/applications/$APPB")"
check 'applicant withdraws own'                200 "$(code -X DELETE -H "Authorization: Bearer $TC" "$BASE/api/applications/$APPC")"
check 'withdraw, no token'                     401 "$(code -X DELETE "$BASE/api/applications/$APPB")"

# ---- verification requests
VRA=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"note":"please verify"}' "$BASE/api/verification-requests" | jget '.id')
check 'verification request as unverified'     'true' "$([ "$VRA" != "ERR" ] && [ -n "$VRA" ] && echo true || echo false)"
check 'second pending request'                 409 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{}' "$BASE/api/verification-requests")"
check 'verified member cannot request'         403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{}' "$BASE/api/verification-requests")"
check 'suspended cannot request'               403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{}' "$BASE/api/verification-requests")"
check 'verification forged user_id'            403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"user_id\":\"$A\"}" "$BASE/api/verification-requests")"
check 'verification status must be pending'    400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"status":"approved"}' "$BASE/api/verification-requests")"
check 'verification mine'                      'true' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/verification-requests/mine" | jget '.verification_requests.some(v=>v.id==="'$VRA'").toString()')"
check 'verification list as member'            403 "$(code -H "Authorization: Bearer $TB" "$BASE/api/admin/verification-requests")"
check 'verification list as admin'             200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/verification-requests")"
check 'review as non-admin'                    403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"approve":true}' "$BASE/api/admin/verification-requests/$VRA/review")"
check 'review approve as admin'                200 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"approve":true}' "$BASE/api/admin/verification-requests/$VRA/review")"
check 'approved member now passes jobs gate'   'true' "$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"firm":"NowOK","role":"CA Jobs"}' "$BASE/api/jobs" | jget '.id!==undefined')" 
check 're-review consumed request'             404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"approve":true}' "$BASE/api/admin/verification-requests/$VRA/review")"
check 'review missing request'                 404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"approve":false}' "$BASE/api/admin/verification-requests/nope/review")"
VRB=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{}' "$BASE/api/verification-requests" | jget '.id')
check 'review reject as admin'                 200 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"approve":false}' "$BASE/api/admin/verification-requests/$VRB/review")"
check 'rejected member still blocked from Jobs' 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"firm":"X","role":"Y","cat":"Jobs"}' "$BASE/api/jobs")"

# ---- reports
RP=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"target_type":"post","target_id":"post1","reason":"spam content here"}' "$BASE/api/reports" | jget '.id')
check 'report create'                          'true' "$([ "$RP" != "ERR" ] && [ -n "$RP" ] && echo true || echo false)"
check 'report reason too short'                400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"target_type":"post","target_id":"x","reason":"bad"}' "$BASE/api/reports")"
check 'report bad target_type'                 400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"target_type":"comment","target_id":"x","reason":"valid reason"}' "$BASE/api/reports")"
check 'report forged reporter'                 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"target_type\":\"post\",\"target_id\":\"x\",\"reason\":\"valid reason\",\"reporter_id\":\"$B\"}" "$BASE/api/reports")"
check 'report status must be open'             400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"target_type":"post","target_id":"x","reason":"valid reason","status":"reviewed"}' "$BASE/api/reports")"
check 'report as suspended'                    403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"target_type":"post","target_id":"x","reason":"valid reason"}' "$BASE/api/reports")"
check 'reports mine own'                       'true' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/reports/mine" | jget '.reports.some(r=>r.id==="'$RP'").toString()')"
check 'reports mine excludes others'           'false' "$(curl -s -H "Authorization: Bearer $TB" "$BASE/api/reports/mine" | jget '.reports.some(r=>r.id==="'$RP'").toString()')"
check 'admin reports list as member'           403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/reports")"
check 'admin reports list'                     200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/reports")"
check 'admin reviews report'                   200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"status":"reviewed"}' "$BASE/api/admin/reports/$RP")"
check 'member cannot review report'            403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"status":"reviewed"}' "$BASE/api/admin/reports/$RP")"

# ---- job alert prefs
check 'prefs initially null'                   'true' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/job-alert-prefs" | jget '.prefs===null')" 
check 'prefs upsert'                           200 "$(code -X PUT -H "$J" -H "Authorization: Bearer $TA" -d '{"keywords":"audit, tax"}' "$BASE/api/job-alert-prefs")"
check 'prefs read back'                        'audit, tax' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/job-alert-prefs" | jget '.prefs.keywords')"
check 'prefs forged user_id'                   403 "$(code -X PUT -H "$J" -H "Authorization: Bearer $TA" -d "{\"keywords\":\"x\",\"user_id\":\"$B\"}" "$BASE/api/job-alert-prefs")"
check 'prefs cross-user isolation'             'true' "$(curl -s -H "Authorization: Bearer $TB" "$BASE/api/job-alert-prefs" | jget '.prefs===null')" 
check 'prefs, no token'                        401 "$(code "$BASE/api/job-alert-prefs")"

# ---- blocked terms admin + live behavior
check 'blocked terms list as member'           403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/blocked-terms")"
check 'blocked terms seeded (13)'              '13' "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/blocked-terms" | jget '.blocked_terms.length.toString()')"
check 'blocked term add as admin'              201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"term":"scamword"}' "$BASE/api/admin/blocked-terms")"
check 'new term blocks content immediately'    422 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"this is a scamword offer"}' "$BASE/api/posts")"
check 'blocked term add as member'             403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"term":"xxx"}' "$BASE/api/admin/blocked-terms")"
check 'blocked term delete as admin'           200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/admin/blocked-terms/scamword")"
check 'content allowed after term removed'     201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"this is a scamword offer"}' "$BASE/api/posts")"
check 'blocked term delete missing'            404 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/admin/blocked-terms/nope")"
check 'blocked term delete as member'          403 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/admin/blocked-terms/harami")"

# ---- error logs
check 'error log anon insert'                  201 "$(code -X POST -H "$J" -d '{"message":"anon crash"}' "$BASE/api/error-logs")"
check 'error log authed insert'                201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"message":"crash 1"}' "$BASE/api/error-logs")"
for i in 2 3 4 5 6 7 8 9; do curl -s -o /dev/null -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"message\":\"crash $i\"}" "$BASE/api/error-logs"; done
check 'error log 10th authed ok'               201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"message":"crash 10"}' "$BASE/api/error-logs")"
check 'error log 11th authed rate limited'     403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"message":"crash 11"}' "$BASE/api/error-logs")"
check 'anon bucket unaffected by authed limit' 201 "$(code -X POST -H "$J" -d '{"message":"anon still ok"}' "$BASE/api/error-logs")"
check 'other user unaffected'                  201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"message":"bob crash"}' "$BASE/api/error-logs")"
for i in $(seq 1 10); do curl -s -o /dev/null -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"message":"forged","user_id":"someone-else"}' "$BASE/api/error-logs"; done
LAST=$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"message":"forged","user_id":"someone-else"}' "$BASE/api/error-logs")
check 'forged user_id no longer evades limit (fix)' 403 "$LAST"
check 'stored identity is the real caller (fix)' "$C" "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/error-logs" | jget '.error_logs.find(e=>e.message==="forged").user_id')"
LONG=$(printf 'm%.0s' $(seq 1 2500))
curl -s -o /dev/null -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"message\":\"$LONG\"}" "$BASE/api/error-logs"
check 'message sanitized to 2000'              '2000' "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/error-logs" | jget '.error_logs.find(e=>e.message.length>1500).message.length.toString()')"
check 'error logs list as member'              403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/error-logs")"
EID=$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/error-logs" | jget '.error_logs[0].id')
check 'error log delete as admin'              200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/admin/error-logs/$EID")"
check 'error log delete as member'             403 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/admin/error-logs/$EID")"
check 'error log delete missing'               404 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/admin/error-logs/nope")"

# ---- admin member privilege management
check 'member cannot change roles'             403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"role":"admin"}' "$BASE/api/admin/members/$C")"
check 'admin promotes member'                  200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"admin"}' "$BASE/api/admin/members/$C")"
AUDIT=$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/privilege-audit")
check 'privilege audit row written'            'true' "$(echo "$AUDIT" | jget '.privilege_audit.some(a=>a.target_id==="'$C'"&&a.new_role==="admin"&&a.old_role==="user").toString()')"
check 'new admin self-demotes (no guard upstream)' 200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TC" -d '{"role":"user"}' "$BASE/api/admin/members/$C")"
check 'second admin self-demotes (no last-admin guard)' 200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM2" -d '{"role":"user"}' "$BASE/api/admin/members/$ADM2")"
check 'last active admin cannot self-demote (fix)' 409 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"user"}' "$BASE/api/admin/members/$ADM")"
check 'last active admin cannot self-suspend (fix)' 409 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"status":"suspended"}' "$BASE/api/admin/members/$ADM")"
check 'last admin still admin after refused changes' 200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/reports")"
check 'demoted admin loses admin access'       403 "$(code -H "Authorization: Bearer $TADM2" "$BASE/api/admin/reports")"
check 'verified_at not settable via members'   400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"verified_at":"now"}' "$BASE/api/admin/members/$C")"
check 'member patch bad role'                  400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"superadmin"}' "$BASE/api/admin/members/$C")"
check 'member patch bad status'                400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"status":"banned"}' "$BASE/api/admin/members/$C")"
check 'member patch missing target'            404 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"user"}' "$BASE/api/admin/members/nope")"
check 'privilege audit as member'              403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/privilege-audit")"
check 'activity log as member'                 403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/activity-log")"
check 'activity log as admin'                  200 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log")"
check 'no client insert route for activity log' 404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"action":"x"}' "$BASE/api/admin/activity-log")"

# ---- trash / restore / purge
check 'trash as member'                        403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"table":"posts","id":"post1"}' "$BASE/api/admin/trash")"
check 'trash unsupported table'                400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"table":"profiles","id":"x"}' "$BASE/api/admin/trash")"
check 'trash missing entity'                   404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"table":"posts","id":"nope"}' "$BASE/api/admin/trash")"
TID1=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"table":"posts","id":"post1"}' "$BASE/api/admin/trash" | jget '.id')
check 'trash post with dependents'             'true' "$([ "$TID1" != "ERR" ] && [ -n "$TID1" ] && echo true || echo false)"
check 'trashed post gone from feed'            'false' "$(curl -s "$BASE/api/feed" | jget '.posts.some(p=>p.id==="post1").toString()')"
check 'trash logged in activity'               'true' "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/activity-log" | jget '.activity.some(a=>a.action==="posts_trashed").toString()')"
check 'restore post'                           200 "$(code -X POST -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash/$TID1/restore")"
check 'restored post back in feed'             'true' "$(curl -s "$BASE/api/feed" | jget '.posts.some(p=>p.id==="post1").toString()')"
check 'restored comments back'                 '1' "$(curl -s "$BASE/api/posts/post1/comments" | jget '.comments.length.toString()')"
check 'restored like count'                    '1' "$(curl -s "$BASE/api/feed" | jget '.posts.find(p=>p.id==="post1").like_count.toString()')"
check 'double restore'                         404 "$(code -X POST -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash/$TID1/restore")"
TIDJ=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"table":"jobs","id":"jOpen"}' "$BASE/api/admin/trash" | jget '.id')
check 'trash job with applications'            'true' "$([ "$TIDJ" != "ERR" ] && [ -n "$TIDJ" ] && echo true || echo false)"
check 'restore job'                            200 "$(code -X POST -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash/$TIDJ/restore")"
check 'restored job keeps applications'        'true' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/jobs/jOpen/applications" | jget '.applications.some(a=>a.id==="app1").toString()')"
TIDD=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"table":"posts","id":"postDel"}' "$BASE/api/admin/trash" | jget '.id')
check 'restore reassigns gone owner to admin'  200 "$(code -X POST -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash/$TIDD/restore")"
check 'restored post owned by restoring admin' "$ADM" "$(curl -s "$BASE/api/feed" | jget '.posts.find(p=>p.id==="postDel").author_id')"
TIDR=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"table":"resources","id":"res1"}' "$BASE/api/admin/trash" | jget '.id')
check 'purge plain resource'                   200 "$(code -X POST -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash/$TIDR/purge")"
check 'purged row gone'                        'false' "$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash" | jget '.trash.some(t=>t.id==="'$TIDR'").toString()')"
TIDF=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"table":"resources","id":"resFile"}' "$BASE/api/admin/trash" | jget '.id')
check 'purge resource with file refused (fail-closed)' 409 "$(code -X POST -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash/$TIDF/purge")"
check 'purge missing'                          404 "$(code -X POST -H "Authorization: Bearer $TADM" "$BASE/api/admin/trash/nope/purge")"
check 'trash list as member'                   403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/admin/trash")"

# ---- anon error-log bucket boundary (fresh window; end of script)
for i in $(seq 1 30); do curl -s -o /dev/null -X POST -H "$J" -d "{\"message\":\"anon $i\"}" "$BASE/api/error-logs"; done
check 'anon bucket full at 30/min'             403 "$(code -X POST -H "$J" -d '{"message":"anon 31"}' "$BASE/api/error-logs")"
check 'fresh authed user unaffected by full anon bucket' 201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TV" -d '{"message":"vera crash"}' "$BASE/api/error-logs")"

# ---- concurrent last-two-admins demotion (atomic guard test)
check 'setup: promote V to admin'              200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"admin"}' "$BASE/api/admin/members/$V")"
check 'setup: promote C to admin'              200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"admin"}' "$BASE/api/admin/members/$C")"
check 'setup: original admin steps down (2 remain)' 200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"role":"user"}' "$BASE/api/admin/members/$ADM")"
(code -X PATCH -H "$J" -H "Authorization: Bearer $TC" -d '{"role":"user"}' "$BASE/api/admin/members/$C" > "$TMP/rC") & JC=$!
(code -X PATCH -H "$J" -H "Authorization: Bearer $TV" -d '{"role":"user"}' "$BASE/api/admin/members/$V" > "$TMP/rV") & JV=$!
wait $JC $JV
check 'concurrent last-two demotions: exactly one wins' '200,409,' "$(sort "$TMP/rC" "$TMP/rV" | tr '\n' ',')"
SURVIVOR_T=$TC; SURVIVOR_I=$C
[ "$(cat "$TMP/rC")" = "409" ] || { SURVIVOR_T=$TV; SURVIVOR_I=$V; }
check 'surviving admin retains admin access'   200 "$(code -H "Authorization: Bearer $SURVIVOR_T" "$BASE/api/admin/reports")"
check 'losing admin lost admin access'         403 "$(if [ "$SURVIVOR_I" = "$C" ]; then code -H "Authorization: Bearer $TV" "$BASE/api/admin/reports"; else code -H "Authorization: Bearer $TC" "$BASE/api/admin/reports"; fi)"

echo
echo "slice4: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
