#!/usr/bin/env bash
# Slice-3 local synthetic authorization tests: messaging/connections/blocks.
# Same pattern as slice 2: throwaway RSA keypair, .dev.vars swapped to the
# synthetic issuer and restored on exit, local D1 reset + seeded, wrangler dev
# --local only. No real Clerk instance, no network beyond localhost.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8794
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
`# SYNTHETIC LOCAL TEST VALUES - written by test/run-slice3-local.sh, restored on exit
CLERK_JWT_KEY="${pub}"
CLERK_ISSUER="https://synthetic.test"
CLERK_AUTHORIZED_PARTIES="https://synthetic.test"
`);
' "$TMP"

A='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
B='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
S='cccccccc-3333-4333-8333-cccccccccccc'
ADM='dddddddd-4444-4444-8444-dddddddddddd'
F='eeeeeeee-5555-4555-8555-eeeeeeeeeeee'
C='66666666-6666-4666-8666-666666666666'
DEL='77777777-7777-4777-8777-777777777777'

rm -rf .wrangler/state
npx wrangler d1 migrations apply cohort-app-prep --local >/dev/null 2>&1
npx wrangler d1 execute cohort-app-prep --local --command "
INSERT INTO profiles (id, full_name, role, status, account_type) VALUES
 ('$A','Alice Active','user','active','individual'),
 ('$B','Bob Active','user','active','individual'),
 ('$S','Sue Suspended','user','suspended','individual'),
 ('$ADM','Ada Admin','admin','active','individual'),
 ('$F','Frank Firm','user','active','firm'),
 ('$C','Cara Active','user','active','individual'),
 ('$DEL','Del Deleted','user','deleted','individual');
INSERT INTO groups (id, name, kind, created_by) VALUES
 ('g1','Study Group','group','$A'),
 ('g2','Announcements','channel','$ADM');
INSERT INTO group_members (group_id, user_id, role) VALUES
 ('g1','$A','admin'),('g1','$B','member'),
 ('g2','$A','admin'),('g2','$B','member');
INSERT INTO threads (id, group_id) VALUES ('t1',NULL),('t2',NULL),('tg1','g1'),('tg2','g2');
INSERT INTO thread_participants (thread_id, user_id, last_read_at) VALUES
 ('t1','$A','2020-01-01T00:00:00'),('t1','$B','2020-01-01T00:00:00'),
 ('t2','$S','2020-01-01T00:00:00'),('t2','$B','2020-01-01T00:00:00');
INSERT INTO connections (id, requester_id, addressee_id, status) VALUES
 ('conn-ab','$A','$B','accepted'),
 ('conn-bs','$B','$S','pending'),
 ('conn-sadm','$S','$ADM','accepted');
" >/dev/null

mint() { node test/mint-token.mjs "$TMP/key.pem" "$1" "$2" "${3:-300}"; }
TA=$(mint user_synth_A "$A"); TB=$(mint user_synth_B "$B"); TS=$(mint user_synth_S "$S")
TADM=$(mint user_synth_ADM "$ADM"); TF=$(mint user_synth_F "$F"); TC=$(mint user_synth_C "$C")
TDEL=$(mint user_synth_DEL "$DEL"); TNOEXT=$(mint user_synth_X -); TMISS=$(mint user_synth_M '99999999-9999-4999-8999-999999999999')
TEXP=$(mint user_synth_A "$A" -30)

(npx wrangler dev --local --port $PORT >"$TMP/wrangler.log" 2>&1) & WPID=$!
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL  $1 expected=$2 got=$3"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
J='Content-Type: application/json'
BASE="http://localhost:$PORT"
jget() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(eval("("+d+")"+process.argv[1]))}catch(e){console.log("ERR")}})' "$1"; }

# --- auth basics
check 'threads list, no token'            401 "$(code "$BASE/api/threads")"
check 'dm, no token'                      401 "$(code -X POST -H "$J" -d "{\"other\":\"$B\"}" "$BASE/api/dm")"
check 'messages read, no token'           401 "$(code "$BASE/api/threads/t1/messages")"
check 'connections, no token'             401 "$(code "$BASE/api/connections")"
check 'blocks, no token'                  401 "$(code "$BASE/api/blocks")"
check 'dm, expired token'                 401 "$(code -X POST -H "$J" -H "Authorization: Bearer $TEXP" -d "{\"other\":\"$B\"}" "$BASE/api/dm")"
check 'dm, no external_id claim'          403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TNOEXT" -d "{\"other\":\"$B\"}" "$BASE/api/dm")"
check 'threads list, unmapped token -> 200 empty' 200 "$(code -H "Authorization: Bearer $TNOEXT" "$BASE/api/threads")"
check 'dm, missing profile (unmapped id)' 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TMISS" -d "{\"other\":\"$B\"}" "$BASE/api/dm")"

# --- start_dm gate
check 'dm to non-connected member'        403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$C\",\"first\":\"hi\"}" "$BASE/api/dm")"
CODE_R=$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$ADM\",\"first\":\"hello admin\"}" "$BASE/api/dm")
check 'dm to admin (exemption)'           201 "$CODE_R"
ADM_THREAD=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/threads" | jget '.threads.find(t=>t.participants.includes("'$ADM'")&&t.group_id===null).id')
R2=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$ADM\"}" "$BASE/api/dm")
check 'dm reuse same thread'              "$ADM_THREAD" "$(echo "$R2" | jget '.thread_id')"
check 'dm first message stored'           1 "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/threads/$ADM_THREAD/messages" | jget '.messages.length')"
check 'dm as firm account (exemption)'    201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TF" -d "{\"other\":\"$C\",\"first\":\"firm hello\"}" "$BASE/api/dm")"
check 'dm to self'                        400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$A\"}" "$BASE/api/dm")"
check 'dm to suspended recipient'         403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$S\"}" "$BASE/api/dm")"
check 'dm as suspended caller'            403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d "{\"other\":\"$B\"}" "$BASE/api/dm")"
check 'dm as deleted-profile caller'      403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TDEL" -d "{\"other\":\"$B\"}" "$BASE/api/dm")"
check 'dm blank first opens empty thread' 200 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$B\",\"first\":\"   \"}" "$BASE/api/dm")"
check 'dm first message blocked term'     422 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$B\",\"first\":\"you harami\"}" "$BASE/api/dm")"
check 'dm first message 4001 chars'       400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$B\",\"first\":\"$(printf 'x%.0s' $(seq 1 4001))\"}" "$BASE/api/dm")"

# --- message read rules
check 'messages read as member'           200 "$(code -H "Authorization: Bearer $TA" "$BASE/api/threads/t1/messages")"
check 'messages read as outsider'         403 "$(code -H "Authorization: Bearer $TC" "$BASE/api/threads/t1/messages")"
check 'messages read as ADMIN (no override)' 403 "$(code -H "Authorization: Bearer $TADM" "$BASE/api/threads/t1/messages")"
check 'group messages read as group member' 200 "$(code -H "Authorization: Bearer $TB" "$BASE/api/threads/tg1/messages")"
check 'group messages read as non-member' 403 "$(code -H "Authorization: Bearer $TC" "$BASE/api/threads/tg1/messages")"
check 'missing thread messages'           403 "$(code -H "Authorization: Bearer $TA" "$BASE/api/threads/nope/messages")"

# --- thread listing
L_ADM=$(curl -s -H "Authorization: Bearer $TADM" "$BASE/api/threads")
check 'admin thread list includes DM t1'  'true' "$(echo "$L_ADM" | jget '.threads.some(t=>t.id==="t1").toString()')"
L_A=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/threads")
check 'A list has t1,tg1,tg2'             'true' "$(echo "$L_A" | jget '.threads.filter(t=>["t1","tg1","tg2"].includes(t.id)).length===3')"
check 'A list excludes t2 (not a party)'  'false' "$(echo "$L_A" | jget '.threads.some(t=>t.id==="t2").toString()')"
check 'suspended can read thread list'    200 "$(code -H "Authorization: Bearer $TS" "$BASE/api/threads")"

# --- message insert rules
check 'message as member'                 201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"hi bob"}' "$BASE/api/threads/t1/messages")"
check 'message as outsider'               403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"body":"intrude"}' "$BASE/api/threads/t1/messages")"
check 'message as suspended member'       403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"body":"sue says"}' "$BASE/api/threads/t2/messages")"
check 'message as deleted profile'        403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TDEL" -d '{"body":"ghost"}' "$BASE/api/threads/t1/messages")"
check 'message empty body'                400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":""}' "$BASE/api/threads/t1/messages")"
check 'message 4001 chars'                400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"body\":\"$(printf 'x%.0s' $(seq 1 4001))\"}" "$BASE/api/threads/t1/messages")"
check 'message blocked term'              422 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"check this exam leak"}' "$BASE/api/threads/t1/messages")"
check 'message forged sender_id'          403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"body\":\"forged\",\"sender_id\":\"$B\"}" "$BASE/api/threads/t1/messages")"
check 'group thread message as member'    201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"group hi"}' "$BASE/api/threads/tg1/messages")"
check 'channel post as plain member'      403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"channel hi"}' "$BASE/api/threads/tg2/messages")"
check 'channel post as group admin'       201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"channel admin hi"}' "$BASE/api/threads/tg2/messages")"
check 'group message as non-member'       403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"body":"outsider"}' "$BASE/api/threads/tg1/messages")"

# --- blocks (block-unblock authorization)
check 'blocks list empty for C'           0 "$(curl -s -H "Authorization: Bearer $TC" "$BASE/api/blocks" | jget '.blocks.length')"
check 'B blocks A'                        201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"blocked_id\":\"$A\"}" "$BASE/api/blocks")"
check 'double block'                      409 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"blocked_id\":\"$A\"}" "$BASE/api/blocks")"
check 'self block'                        400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"blocked_id\":\"$B\"}" "$BASE/api/blocks")"
check 'forged blocker_id'                 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"blocker_id\":\"$A\",\"blocked_id\":\"$C\"}" "$BASE/api/blocks")"
check 'block missing profile'             404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"blocked_id":"99999999-9999-4999-8999-999999999999"}' "$BASE/api/blocks")"
check 'A message blocked (B blocked A)'   403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"still there?"}' "$BASE/api/threads/t1/messages")"
check 'B message blocked (either direction)' 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"you there?"}' "$BASE/api/threads/t1/messages")"
check 'dm across a block'                 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$B\",\"first\":\"hi\"}" "$BASE/api/dm")"
check 'C cannot remove Bs block'          404 "$(code -X DELETE -H "Authorization: Bearer $TC" "$BASE/api/blocks/$A")"
check 'C blocks list still empty (isolation)' 0 "$(curl -s -H "Authorization: Bearer $TC" "$BASE/api/blocks" | jget '.blocks.length')"
check 'B unblocks A'                      200 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/blocks/$A")"
check 'A message after unblock'           201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"back"}' "$BASE/api/threads/t1/messages")"

# --- read state
check 'mark read as participant'          200 "$(code -X POST -H "Authorization: Bearer $TB" "$BASE/api/threads/t1/read")"
LR=$(curl -s -H "Authorization: Bearer $TB" "$BASE/api/threads" | jget '.threads.find(t=>t.id==="t1").my_last_read_at.slice(0,4)')
check 'last_read_at updated'              '2026' "$LR"
check 'mark read as non-participant'      403 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/threads/t1/read")"
check 'mark read as SUSPENDED participant (mirrored)' 200 "$(code -X POST -H "Authorization: Bearer $TS" "$BASE/api/threads/t2/read")"

# --- connections
check 'request A->C'                      201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"addressee_id\":\"$C\"}" "$BASE/api/connections")"
check 'duplicate request'                 409 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"addressee_id\":\"$C\"}" "$BASE/api/connections")"
check 'reverse duplicate while pending'   409 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d "{\"addressee_id\":\"$A\"}" "$BASE/api/connections")"
check 'forged requester_id'               403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"requester_id\":\"$B\",\"addressee_id\":\"$F\"}" "$BASE/api/connections")"
check 'request to self'                   400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"addressee_id\":\"$A\"}" "$BASE/api/connections")"
check 'request to suspended addressee'    403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TF" -d "{\"addressee_id\":\"$S\"}" "$BASE/api/connections")"
check 'request as suspended caller'       403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d "{\"addressee_id\":\"$A\"}" "$BASE/api/connections")"
CONN_ID=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/connections" | jget '.connections.find(x=>x.requester_id==="'$A'"&&x.addressee_id==="'$C'").id')
check 'respond as requester'              403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"action":"accept"}' "$BASE/api/connections/$CONN_ID/respond")"
check 'respond bad action'                400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"action":"maybe"}' "$BASE/api/connections/$CONN_ID/respond")"
check 'respond accept as addressee'       200 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"action":"accept"}' "$BASE/api/connections/$CONN_ID/respond")"
check 'dm allowed after connect (new thread -> 201)' 201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"other\":\"$C\",\"first\":\"connected now\"}" "$BASE/api/dm")"
check 'accepted visible to outsider (F)'  'true' "$(curl -s -H "Authorization: Bearer $TF" "$BASE/api/connections" | jget '.connections.some(x=>x.id==="'$CONN_ID'").toString()')"
check 'delete by non-party'               403 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/connections/$CONN_ID")"
check 'delete by party (C)'               200 "$(code -X DELETE -H "Authorization: Bearer $TC" "$BASE/api/connections/$CONN_ID")"
check 're-request after delete'           201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"addressee_id\":\"$C\"}" "$BASE/api/connections")"
CONN_ID2=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/connections" | jget '.connections.find(x=>x.requester_id==="'$A'"&&x.addressee_id==="'$C'"&&x.status==="pending").id')
check 'decline as addressee'              200 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{"action":"decline"}' "$BASE/api/connections/$CONN_ID2/respond")"
check 're-request after decline (0060)'   201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"addressee_id\":\"$C\"}" "$BASE/api/connections")"
check 'request across a block'            403 "$( { code -X POST -H "$J" -H "Authorization: Bearer $TC" -d "{\"blocked_id\":\"$B\"}" "$BASE/api/blocks" >/dev/null; code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"addressee_id\":\"$C\"}" "$BASE/api/connections"; } )"
check 'SUSPENDED addressee can respond (mirrored)' 200 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"action":"accept"}' "$BASE/api/connections/conn-bs/respond")"
check 'SUSPENDED cleanup delete (mirrored)' 200 "$(code -X DELETE -H "Authorization: Bearer $TS" "$BASE/api/connections/conn-sadm")"
check 'respond missing connection'        404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"action":"accept"}' "$BASE/api/connections/nope/respond")"

# --- rate limit boundary + start_dm bypass (mirrored upstream gap)
npx wrangler d1 execute cohort-app-prep --local --command "
INSERT INTO messages (id, thread_id, sender_id, body)
 WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<30)
 SELECT lower(hex(randomblob(16))), 't1', '$B', 'burst ' || x FROM c;" >/dev/null 2>&1
check '31st message in a minute -> 403'   403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"body":"burst 31"}' "$BASE/api/threads/t1/messages")"
check 'A (member) under limit still ok'   201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"body":"alice still fine"}' "$BASE/api/threads/t1/messages")"
check 'start_dm first message bypasses rate limit (mirrored gap)' 200 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"other\":\"$A\",\"first\":\"rate bypass check\"}" "$BASE/api/dm")"

echo
echo "slice3: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
