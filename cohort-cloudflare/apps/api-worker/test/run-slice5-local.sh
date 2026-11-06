#!/usr/bin/env bash
# Slice-5 local synthetic authorization tests: groups/communities/resources/
# student_notes/notifications. Same synthetic-issuer pattern as slices 2/3.
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=8795
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
`# SYNTHETIC LOCAL TEST VALUES - written by test/run-slice5-local.sh, restored on exit
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

rm -rf .wrangler/state
npx wrangler d1 migrations apply cohort-app-prep-2 --local >/dev/null 2>&1
npx wrangler d1 execute cohort-app-prep-2 --local --command "
INSERT INTO profiles (id, full_name, role, status, account_type) VALUES
 ('$A','Alice Active','user','active','individual'),
 ('$B','Bob Active','user','active','individual'),
 ('$S','Sue Suspended','user','suspended','individual'),
 ('$ADM','Ada Admin','admin','active','individual'),
 ('$C','Cara Active','user','active','individual'),
 ('$DEL','Del Deleted','user','deleted','individual');
INSERT INTO groups (id, name, kind, created_by) VALUES
 ('gA','Alice Group','group','$A'),
 ('gB','Bob Group','group','$B'),
 ('gFull','Full Group','group','$ADM'),
 ('gI','Invite Group','group','$A');
INSERT INTO group_members (group_id, user_id, role) VALUES
 ('gA','$A','admin'),('gA','$B','member'),
 ('gB','$B','admin'),('gB','$S','member'),
 ('gI','$A','admin');
UPDATE groups SET member_count=(SELECT COUNT(*) FROM group_members WHERE group_id='gA') WHERE id='gA';
UPDATE groups SET member_count=(SELECT COUNT(*) FROM group_members WHERE group_id='gB') WHERE id='gB';
UPDATE groups SET member_count=(SELECT COUNT(*) FROM group_members WHERE group_id='gI') WHERE id='gI';
INSERT INTO group_members (group_id, user_id, role)
 WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<1003)
 SELECT 'gFull', lower(hex(randomblob(16))), 'member' FROM c;
UPDATE groups SET member_count=1003 WHERE id='gFull';
INSERT INTO connections (id, requester_id, addressee_id, status) VALUES
 ('conn-ab','$A','$B','accepted'),('conn-ac','$A','$C','accepted');
INSERT INTO communities (id, name, created_by) VALUES ('comm1','Alice Community','$A'),('commFull','Full Community','$A');
INSERT INTO groups (id, name, kind, created_by)
 WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<23)
 SELECT 'gfill' || x, 'fill ' || x, 'group', '$A' FROM c;
INSERT INTO community_groups (community_id, group_id)
 WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<23)
 SELECT 'commFull', 'gfill' || x FROM c;
INSERT INTO notifications (id, user_id, kind, title, body) VALUES
 ('n1','$A','message','msg for alice','hello'),
 ('n2','$B','message','msg for bob','hi bob');
" >/dev/null

mint() { node test/mint-token.mjs "$TMP/key.pem" "$1" "$2" "${3:-300}"; }
TA=$(mint user_synth_A "$A"); TB=$(mint user_synth_B "$B"); TS=$(mint user_synth_S "$S")
TADM=$(mint user_synth_ADM "$ADM"); TC=$(mint user_synth_C "$C"); TDEL=$(mint user_synth_DEL "$DEL")
TNOEXT=$(mint user_synth_X -)

(npx wrangler dev --local --port $PORT >"$TMP/wrangler.log" 2>&1) & WPID=$!
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL  $1 expected=$2 got=$3"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
J='Content-Type: application/json'
BASE="http://localhost:$PORT"
jget() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(eval("("+d+")"+process.argv[1]))}catch(e){console.log("ERR")}})' "$1"; }

# --- public reads + auth
check 'groups list public (no token)'        200 "$(code "$BASE/api/groups")"
check 'communities list public'              200 "$(code "$BASE/api/communities")"
check 'resources list public'                200 "$(code "$BASE/api/resources")"
check 'student notes list public'            200 "$(code "$BASE/api/student-notes")"
check 'notifications, no token'              401 "$(code "$BASE/api/notifications")"
check 'group create, no token'               401 "$(code -X POST -H "$J" -d '{"name":"x"}' "$BASE/api/groups")"

# --- group create
GID=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"New Group","kind":"channel"}' "$BASE/api/groups" | jget '.id')
check 'group create as active member'        'true' "$([ "$GID" != "ERR" ] && [ -n "$GID" ] && echo true || echo false)"
GA_JSON=$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/groups")
check 'creator my_role is admin'               'admin' "$(echo "$GA_JSON" | jget '.groups.find(x=>x.id==="'$GID'").my_role')"
check 'creator member_count is 1'              '1' "$(echo "$GA_JSON" | jget '.groups.find(x=>x.id==="'$GID'").member_count.toString()')" 
check 'group create forged created_by'       403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"name\":\"x\",\"created_by\":\"$B\"}" "$BASE/api/groups")"
check 'group create bad kind'                400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"x","kind":"weird"}' "$BASE/api/groups")"
check 'group create suspended'               403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"name":"x"}' "$BASE/api/groups")"
check 'group create deleted profile'         403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TDEL" -d '{"name":"x"}' "$BASE/api/groups")"
check 'group create unmapped token'          403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TNOEXT" -d '{"name":"x"}' "$BASE/api/groups")"

# --- group update/delete role distinctions
check 'group patch as plain member'          403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d '{"purpose":"hijack"}' "$BASE/api/groups/gA")"
check 'group patch as creator'               200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"purpose":"study"}' "$BASE/api/groups/gA")"
check 'group patch as app admin'             200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"purpose":"admin edit"}' "$BASE/api/groups/gA")"
check 'promote B to group admin (creator)'   200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"role":"admin"}' "$BASE/api/groups/gA/members/$B")"
check 'group patch as group admin'           200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d '{"description":"by group admin"}' "$BASE/api/groups/gA")"
check 'group DELETE as group admin (denied)' 403 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/groups/gA")"
check 'group DELETE as non-creator member'   403 "$(code -X DELETE -H "Authorization: Bearer $TC" "$BASE/api/groups/gA")"
check 'promote creator (target=creator)'     403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d '{"role":"member"}' "$BASE/api/groups/gA/members/$A")"
check 'group patch bad kind'                 400 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"kind":"weird"}' "$BASE/api/groups/gA")"
DELG=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"Doomed"}' "$BASE/api/groups" | jget '.id')
check 'group DELETE as app admin'            200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/groups/$DELG")"
check 'group patch missing'                  404 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"x"}' "$BASE/api/groups/nope")"

# --- membership
check 'join as active non-member'            201 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/groups/gB/join")"
check 'double join'                          409 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/groups/gB/join")"
check 'join as suspended'                    403 "$(code -X POST -H "Authorization: Bearer $TS" "$BASE/api/groups/gA/join")"
check 'join missing group'                   404 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/groups/nope/join")"
check 'SUSPENDED leave own membership (mirrored)' 200 "$(code -X POST -H "Authorization: Bearer $TS" "$BASE/api/groups/gB/leave")"
check 'leave not-a-member'                   404 "$(code -X POST -H "Authorization: Bearer $TS" "$BASE/api/groups/gA/leave")"
check 'group admin adds connected member'    201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"user_id\":\"$B\"}" "$BASE/api/groups/gI/members")"
check 'group admin adds UNconnected member'  403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d "{\"user_id\":\"$C\"}" "$BASE/api/groups/gB/members")"
check 'app admin not group admin adds member (denied per 0053)' 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d "{\"user_id\":\"$C\"}" "$BASE/api/groups/gB/members")" 
check 'add suspended target'                 403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"user_id\":\"$S\"}" "$BASE/api/groups/gI/members")"
check 'add self via members route'           400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"user_id\":\"$A\"}" "$BASE/api/groups/gI/members")"
check 'group admin removes other member'     200 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/groups/gI/members/$B")" 
check 'group admin cannot remove creator'    403 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/groups/gA/members/$A")"
check 'member_count nets on gB'              '2' "$(curl -s "$BASE/api/groups" | jget '.groups.find(x=>x.id==="gB").member_count.toString()')"
check 'join FULL group (cap 1003)'           403 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/groups/gFull/join")"

# --- invites
check 'invites read as non-member'           403 "$(code -H "Authorization: Bearer $TC" "$BASE/api/groups/gI/invites")"
check 'invites read as member'               200 "$(code -H "Authorization: Bearer $TA" "$BASE/api/groups/gI/invites")"
INV=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{}' "$BASE/api/groups/gI/invites")
TOKEN_V=$(echo "$INV" | jget '.token')
check 'invite create as member'              '24' "$(echo -n "$TOKEN_V" | wc -c)"
check 'invite create as non-member'          403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TC" -d '{}' "$BASE/api/groups/gI/invites")"
PREV=$(curl -s "$BASE/api/invites/$TOKEN_V")
check 'invite preview public'                'Invite Group' "$(echo "$PREV" | jget '.group.name')"
check 'invite preview leaks no member data'  'false' "$(echo "$PREV" | jget '.group.hasOwnProperty("members").toString()')" 
check 'invite preview invalid token'         404 "$(code "$BASE/api/invites/deadbeefdeadbeefdeadbeef")"
check 'join by token as active'              200 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/invites/$TOKEN_V/join")"
check 'join by token idempotent'             200 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/invites/$TOKEN_V/join")"
check 'join by token as suspended'           403 "$(code -X POST -H "Authorization: Bearer $TS" "$BASE/api/invites/$TOKEN_V/join")"
check 'join by token, no auth'               401 "$(code -X POST "$BASE/api/invites/$TOKEN_V/join")"
check 'join by invalid token'                404 "$(code -X POST -H "Authorization: Bearer $TC" "$BASE/api/invites/ffffffffffffffffffffffff/join")"

# --- communities
COM=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"Temp Comm"}' "$BASE/api/communities" | jget '.id')
check 'community create as active'           'true' "$([ "$COM" != "ERR" ] && [ -n "$COM" ] && echo true || echo false)"
check 'community create suspended'           403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"name":"x"}' "$BASE/api/communities")"
check 'community create forged creator'      403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"name\":\"x\",\"created_by\":\"$B\"}" "$BASE/api/communities")"
check 'community create long name'           400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"name\":\"$(printf 'x%.0s' $(seq 1 121))\"}" "$BASE/api/communities")"
check 'community patch as non-creator'       403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d '{"about":"hijack"}' "$BASE/api/communities/$COM")"
check 'community patch as creator'           200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"about":"about"}' "$BASE/api/communities/$COM")"
check 'community delete as app admin'        200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/communities/$COM")"
check 'link group as community+group owner'  201 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"group_id":"gA"}' "$BASE/api/communities/comm1/groups")"
check 'double link'                          409 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"group_id":"gA"}' "$BASE/api/communities/comm1/groups")"
check 'link as non-community-creator'        403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TB" -d '{"group_id":"gB"}' "$BASE/api/communities/comm1/groups")"
check 'link group owned by someone else'     403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"group_id":"gB"}' "$BASE/api/communities/comm1/groups")"
check 'link into FULL community (cap 23)'    403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"group_id":"gI"}' "$BASE/api/communities/commFull/groups")"
check 'unlink as non-creator'                403 "$(code -X DELETE -H "Authorization: Bearer $TB" "$BASE/api/communities/comm1/groups/gA")"
check 'unlink as creator'                    200 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/communities/comm1/groups/gA")"
check 'community link suspended caller'      403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"group_id":"gA"}' "$BASE/api/communities/comm1/groups")"

# --- resources (admin-only insert, 0046)
check 'resource create as regular member'    403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"title":"notes"}' "$BASE/api/resources")"
RID=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"title":"Admin Notes","subject":"CA"}' "$BASE/api/resources" | jget '.id')
check 'resource create as admin'             'true' "$([ "$RID" != "ERR" ] && [ -n "$RID" ] && echo true || echo false)"
check 'resource create forged owner'         403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d "{\"title\":\"x\",\"owner_id\":\"$A\"}" "$BASE/api/resources")"
check 'resource create long title'           400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d "{\"title\":\"$(printf 'x%.0s' $(seq 1 301))\"}" "$BASE/api/resources")"
check 'resource patch as non-owner'          403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"meta":"hijack"}' "$BASE/api/resources/$RID")"
check 'resource patch as owner-admin'        200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TADM" -d '{"meta":"updated"}' "$BASE/api/resources/$RID")"
check 'resource delete as non-owner'         403 "$(code -X DELETE -H "Authorization: Bearer $TA" "$BASE/api/resources/$RID")"
check 'resource delete as owner-admin'       200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/resources/$RID")"

# --- student notes
NID=$(curl -s -X POST -H "$J" -H "Authorization: Bearer $TA" -d '{"title":"My Notes","subject":"CA"}' "$BASE/api/student-notes" | jget '.id')
check 'note create as active member'         'true' "$([ "$NID" != "ERR" ] && [ -n "$NID" ] && echo true || echo false)"
check 'note uploader_name from profile'      'Alice Active' "$(curl -s "$BASE/api/student-notes" | jget '.notes.find(x=>x.id==="'$NID'").uploader_name')"
check 'note create as suspended'             403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TS" -d '{"title":"x"}' "$BASE/api/student-notes")"
check 'note create as deleted profile'       403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TDEL" -d '{"title":"x"}' "$BASE/api/student-notes")"
check 'note create forged owner'             403 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"title\":\"x\",\"owner_id\":\"$B\"}" "$BASE/api/student-notes")"
check 'note create long title'               400 "$(code -X POST -H "$J" -H "Authorization: Bearer $TA" -d "{\"title\":\"$(printf 'x%.0s' $(seq 1 301))\"}" "$BASE/api/student-notes")"
check 'note patch as non-owner'              403 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TB" -d '{"meta":"hijack"}' "$BASE/api/student-notes/$NID")"
check 'note patch as owner'                  200 "$(code -X PATCH -H "$J" -H "Authorization: Bearer $TA" -d '{"meta":"updated"}' "$BASE/api/student-notes/$NID")"
check 'note delete as app admin (not owner)' 200 "$(code -X DELETE -H "Authorization: Bearer $TADM" "$BASE/api/student-notes/$NID")"

# --- notifications (own only; creation NOT ported - gap)
check 'notifications own only'               'n1' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/notifications" | jget '.notifications.map(n=>n.id).join(",")')"
check 'mark others notification read'        403 "$(code -X POST -H "Authorization: Bearer $TB" "$BASE/api/notifications/n1/read")"
check 'mark own read'                        200 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/notifications/n1/read")"
check 'read_at set'                          'true' "$(curl -s -H "Authorization: Bearer $TA" "$BASE/api/notifications" | jget '.notifications.find(n=>n.id==="n1").read_at!==null')" 
check 'mark missing notification'            404 "$(code -X POST -H "Authorization: Bearer $TA" "$BASE/api/notifications/nope/read")"
check 'no client insert route for notifications' 404 "$(code -X POST -H "$J" -H "Authorization: Bearer $TADM" -d '{"kind":"system"}' "$BASE/api/notifications")"

echo
echo "slice5: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
