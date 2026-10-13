#!/usr/bin/env bash
# Checks the mock API contract (SPEC §9.3, cases A01–A33) with curl + jq.
# Without API_URL the script starts `npm run mock:server` itself and stops it on exit.
set -u
cd "$(dirname "$0")/.."

for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 2; }
done

SERVER_PID=""
if [ -z "${API_URL:-}" ]; then
  MOCK_PORT="${MOCK_PORT:-3001}"
  API_URL="http://localhost:${MOCK_PORT}"
  MOCK_PORT="$MOCK_PORT" setsid npm run -s mock:server >/tmp/api-check-server.log 2>&1 &
  SERVER_PID=$!
  trap '[ -n "$SERVER_PID" ] && kill -- -"$SERVER_PID" 2>/dev/null' EXIT
  for _ in $(seq 1 100); do
    curl -s -o /dev/null "$API_URL/api/__dev/state" && break
    sleep 0.1
  done
fi

# --- dates -------------------------------------------------------------------
T=$(date +%F)
D=$(date -d "+1 day" +%F)
D2=$(date -d "+2 day" +%F)
Y=$(date -d "-1 day" +%F)

# --- request helpers -----------------------------------------------------------
TMP=$(mktemp)
HDR='Content-Type: application/json'
STATUS=""; CT=""; BODY=""; CURL_EXIT=0; TIME=0; LAST_REQ=""
A32_FAILS=""

req() { # METHOD PATH [RAW_BODY]
  local method="$1" path="$2" data="${3:-}" out
  LAST_REQ="$method $path${data:+ $data}"
  if [ -n "$data" ]; then
    out=$(curl -sS -o "$TMP" -w '%{http_code}|%{content_type}|%{time_total}' -X "$method" -H "$HDR" -d "$data" "$API_URL$path" 2>/dev/null)
  else
    out=$(curl -sS -o "$TMP" -w '%{http_code}|%{content_type}|%{time_total}' -X "$method" "$API_URL$path" 2>/dev/null)
  fi
  CURL_EXIT=$?
  STATUS="${out%%|*}"; local rest="${out#*|}"; CT="${rest%%|*}"; TIME="${rest#*|}"
  BODY=$(cat "$TMP")
  # A32: every error response must follow ApiErrorBody
  if [ "$CURL_EXIT" -eq 0 ] && [ "$STATUS" -ge 400 ] && [[ "$path" != /api/__dev/* ]]; then
    if ! { [[ "$CT" == application/json* ]] && echo "$BODY" | jq -e '
        (.error | type == "object")
        and (.error.code | IN("BAD_REQUEST","VALIDATION_ERROR","CONFLICT","NOT_FOUND","INTERNAL"))
        and (.error.message | type == "string")
        and ((.error | has("conflicts")) == (.error.code == "CONFLICT"))
        and ((.error.conflicts // []) | type == "array")' >/dev/null 2>&1; }; then
      A32_FAILS="$A32_FAILS\n    $LAST_REQ -> $STATUS [$CT] $BODY"
    fi
  fi
}

dev() { # METHOD ENDPOINT [BODY]
  if [ -n "${3:-}" ]; then curl -s -o /dev/null -X "$1" -H "$HDR" -d "$3" "$API_URL/api/__dev/$2"
  else curl -s -o /dev/null -X "$1" "$API_URL/api/__dev/$2"; fi
}

# reset_all [CLOCK_TIME_ON_T]: empty storage, clock at T HH:mm:ss.sss, default simulation
reset_all() {
  dev PUT clock "{\"now\":\"${T}T${1:-12:00:00.000}\"}"
  dev PUT simulation '{"latencyMs":0,"raceProbability":0,"forceConflictNext":false,"failNext":null}'
  dev POST reset '{"seed":false}'
}

bk() { # DATE START END [TITLE]
  if [ -n "${4:-}" ]; then jq -nc --arg d "$1" --arg s "$2" --arg e "$3" --arg t "$4" '{date:$d,start:$s,end:$e,title:$t}'
  else jq -nc --arg d "$1" --arg s "$2" --arg e "$3" '{date:$d,start:$s,end:$e}'; fi
}
id_of() { echo "$BODY" | jq -r '.id'; }
create() { req POST /api/bookings "$(bk "$@")"; } # then id_of

# --- assertions ------------------------------------------------------------------
TOTAL=0; PASSED=0; CASE_ID=""; CASE_DESC=""; CASE_FAIL=0; CASE_MSGS=""
begin() { CASE_ID="$1"; CASE_DESC="$2"; CASE_FAIL=0; CASE_MSGS=""; TOTAL=$((TOTAL+1)); }
fail() {
  CASE_FAIL=1
  CASE_MSGS="$CASE_MSGS\n  ✗ $1\n    request:  $LAST_REQ\n    response: $STATUS [$CT] $(echo "$BODY" | head -c 600)"
}
status() { [ "$STATUS" = "$1" ] || fail "expected status $1, got $STATUS"; }
json_ct() { [[ "$CT" == application/json* ]] || fail "expected Content-Type application/json, got '$CT'"; }
jqok() { echo "$BODY" | jq -e "$1" >/dev/null 2>&1 || fail "${2:-jq check failed}: $1"; }
err() { # STATUS CODE [FIELD RULE]
  status "$1"; json_ct
  jqok ".error.code == \"$2\"" "error.code != $2"
  if [ -n "${3:-}" ]; then jqok ".error.fieldErrors.$3.code == \"$4\"" "fieldErrors.$3.code != $4"; fi
}
finish() {
  if [ "$CASE_FAIL" -eq 0 ]; then PASSED=$((PASSED+1)); echo "PASS $CASE_ID  $CASE_DESC"
  else echo "FAIL $CASE_ID  $CASE_DESC"; printf '%b\n' "$CASE_MSGS"; fi
}
no_overlaps='sort_by(.start) | . as $a | all(range(1; length); $a[.-1].end <= $a[.].start)'

echo "API: $API_URL   T=$T D=$D Y=$Y"

# --- A01 -------------------------------------------------------------------------
reset_all
begin A01 "GET returns bookings sorted by start"
req POST /api/__dev/bookings "[$(bk $D 13:00 14:00 Позже),$(bk $D 10:00 11:00 Раньше)]"
req GET "/api/bookings?date=$D"
status 200; json_ct
jqok 'map(.start) == ["10:00","13:00"]' "not sorted"
jqok 'all(.[]; (.id|type=="string") and (.date|type=="string") and (.start|type=="string") and (.end|type=="string"))' "schema"
finish

# --- A02 -------------------------------------------------------------------------
begin A02 "GET with missing or invalid date -> 400"
for q in "" "?date=abc" "?date=2026-02-30"; do req GET "/api/bookings$q"; err 400 BAD_REQUEST; done
finish

# --- A03 -------------------------------------------------------------------------
reset_all
begin A03 "POST valid -> 201"
create $D 10:00 11:00 Планёрка
status 201; json_ct
jqok '.id|type=="string" and length>0'
jqok ".date==\"$D\" and .start==\"10:00\" and .end==\"11:00\" and .title==\"Планёрка\""
finish

# --- A04 -------------------------------------------------------------------------
begin A04 "POST malformed bodies -> 400"
for body in '{oops' "{\"date\":\"$D\",\"end\":\"11:00\"}" "{\"date\":\"$D\",\"start\":\"9:00\",\"end\":\"11:00\"}" \
  "{\"date\":\"$D\",\"start\":\"25:00\",\"end\":\"11:00\"}" "{\"date\":\"$D\",\"start\":\"10:00\",\"end\":\"11:00\",\"title\":null}" \
  "{\"date\":\"$D\",\"start\":900,\"end\":\"11:00\"}"; do
  req POST /api/bookings "$body"; err 400 BAD_REQUEST
done
finish

# --- A05–A08 ---------------------------------------------------------------------
reset_all
begin A05 "POST unaligned start -> 422 NOT_ALIGNED"
create $D 10:10 11:00; err 422 VALIDATION_ERROR start NOT_ALIGNED
finish

begin A06 "POST outside working hours -> 422 OUT_OF_WORKING_HOURS"
create $D 08:45 09:30; err 422 VALIDATION_ERROR start OUT_OF_WORKING_HOURS
create $D 17:30 18:15; err 422 VALIDATION_ERROR end OUT_OF_WORKING_HOURS
finish

begin A07 "POST start >= end -> 422 START_NOT_BEFORE_END"
create $D 11:00 11:00; err 422 VALIDATION_ERROR end START_NOT_BEFORE_END
create $D 12:00 11:00; err 422 VALIDATION_ERROR end START_NOT_BEFORE_END
finish

begin A08 "POST too short / too long"
create $D 10:00 10:15; err 422 VALIDATION_ERROR end TOO_SHORT
create $D 10:00 12:15; err 422 VALIDATION_ERROR end TOO_LONG
finish

# --- A09 -------------------------------------------------------------------------
reset_all
begin A09 "POST boundary bookings -> 201"
create $D 09:00 09:30; status 201
create $D 13:00 15:00; status 201
create $D 17:30 18:00; status 201
finish

# --- A10 -------------------------------------------------------------------------
reset_all
begin A10 "POST on a past date -> 422 PAST_DATE"
create $Y 10:00 11:00; err 422 VALIDATION_ERROR date PAST_DATE
finish

# --- A11 -------------------------------------------------------------------------
reset_all 12:00:00.000
begin A11 "POST today vs clock (strict boundary)"
create $T 11:45 12:30; err 422 VALIDATION_ERROR start PAST_TIME
create $T 12:00 12:30; err 422 VALIDATION_ERROR start PAST_TIME
create $T 12:15 12:45; status 201
reset_all 11:59:59.999
create $T 12:00 12:30; status 201
finish

# --- A12 -------------------------------------------------------------------------
reset_all
begin A12 "title length and trimming"
t101=$(printf 'x%.0s' $(seq 1 101)); t100=$(printf 'x%.0s' $(seq 1 100))
create $D 10:00 10:30 "$t101"; err 422 VALIDATION_ERROR title TITLE_TOO_LONG
create $D 10:00 10:30 "$t100"; status 201
create $D 11:00 11:30 "   "; status 201; jqok 'has("title") | not' "title must be absent"
create $D 12:00 12:30 "  abc "; status 201; jqok '.title=="abc"'
finish

# --- A13 / A14 ---------------------------------------------------------------------
reset_all
create $D 10:00 11:00 Планёрка
begin A13 "POST overlapping -> 409 with conflicts"
for iv in "10:30 11:30" "09:30 10:30" "10:15 10:45" "10:00 11:00" "09:30 11:30"; do
  create $D $iv; err 409 CONFLICT
  jqok '(.error.conflicts|length==1) and .error.conflicts[0].start=="10:00" and .error.conflicts[0].end=="11:00"' "conflicts"
  jqok '.error|has("fieldErrors")|not' "409 must not carry fieldErrors"
done
finish

begin A14 "touching intervals are allowed"
create $D 11:00 12:00; status 201
create $D 09:00 10:00; status 201
finish

# --- A15–A17, A21, A22, A24 --------------------------------------------------------------
reset_all
create $D 10:00 11:00 Планёрка; ID=$(id_of)
begin A15 "PATCH own booking, no self-conflict (R7)"
req PATCH "/api/bookings/$ID" '{"end":"11:30"}'; status 200; jqok '.end=="11:30"'
finish

begin A16 "PATCH title only"
req PATCH "/api/bookings/$ID" '{"title":"Новое"}'; status 200
jqok '.title=="Новое" and .start=="10:00" and .end=="11:30"' "time must not change"
finish

begin A21 "PATCH empty title removes it"
req PATCH "/api/bookings/$ID" '{"title":""}'; status 200; jqok 'has("title")|not' "title must be absent"
finish

begin A22 "PATCH validates the merged result"
req PATCH "/api/bookings/$ID" '{"end":"13:00"}'; err 422 VALIDATION_ERROR end TOO_LONG
finish

begin A24 "PATCH {} and unknown fields"
req PATCH "/api/bookings/$ID" '{}'; status 200
jqok ".id==\"$ID\" and .start==\"10:00\" and .end==\"11:30\"" "unchanged"
req PATCH "/api/bookings/$ID" '{"id":"x","foo":1,"title":"A"}'; status 200
jqok ".id==\"$ID\" and has(\"foo\")==false and .title==\"A\""
finish

reset_all
create $D 10:00 11:00; ID=$(id_of); create $D 11:30 12:30
begin A17 "PATCH into a neighbour -> 409, conflicts without itself"
req PATCH "/api/bookings/$ID" '{"end":"12:00"}'; err 409 CONFLICT
jqok '(.error.conflicts|length==1) and .error.conflicts[0].start=="11:30" and .error.conflicts[0].end=="12:30"' "conflicts"
finish

# --- A18 -------------------------------------------------------------------------
begin A18 "unknown id -> 404"
req PATCH /api/bookings/unknown '{"title":"x"}'; err 404 NOT_FOUND
req DELETE /api/bookings/unknown; err 404 NOT_FOUND
finish

# --- A19 / A20 ---------------------------------------------------------------------
reset_all
create $D 10:00 11:00; ID=$(id_of)
begin A19 "PATCH moves to another date"
req PATCH "/api/bookings/$ID" "{\"date\":\"$D2\"}"; status 200
req GET "/api/bookings?date=$D"; jqok 'length==0' "must be gone from D"
req GET "/api/bookings?date=$D2"; jqok "length==1 and .[0].id==\"$ID\"" "must be on D+1"
finish

reset_all
create $D 10:00 11:00; ID=$(id_of); create $D2 10:00 11:00
begin A20 "PATCH move into an occupied slot -> 409"
req PATCH "/api/bookings/$ID" "{\"date\":\"$D2\"}"; err 409 CONFLICT
finish

# --- A23 -------------------------------------------------------------------------
reset_all 12:00:00.000
begin A23 "ongoing/past bookings are locked (422 BOOKING_LOCKED)"
req POST /api/__dev/bookings "[$(bk $T 12:00 13:00 Идёт),$(bk $Y 10:00 11:00 Прошла)]"
ids=$(echo "$BODY" | jq -r '.[].id')
for i in $ids; do
  req PATCH "/api/bookings/$i" '{"title":"x"}'; err 422 VALIDATION_ERROR
  jqok '.error.reason=="BOOKING_LOCKED" and (.error|has("fieldErrors")|not)' "reason"
  req DELETE "/api/bookings/$i"; err 422 VALIDATION_ERROR
  jqok '.error.reason=="BOOKING_LOCKED" and (.error|has("fieldErrors")|not)' "reason"
done
finish

# --- A25 -------------------------------------------------------------------------
reset_all
create $D 10:00 11:00; ID=$(id_of)
begin A25 "DELETE then DELETE again"
req DELETE "/api/bookings/$ID"; status 204
req DELETE "/api/bookings/$ID"; err 404 NOT_FOUND
req GET "/api/bookings?date=$D"; jqok "map(.id)|index(\"$ID\")==null" "must be gone"
finish

# --- A26 -------------------------------------------------------------------------
reset_all
create $D 09:00 10:00
begin A26 "invalid interval is not masked by OVERLAP"
create $D 08:45 09:30; err 422 VALIDATION_ERROR start OUT_OF_WORKING_HOURS
finish

# --- A27 / A28 ---------------------------------------------------------------------
reset_all
begin A27 "failNext 500 on GET; dev endpoints do not spend it"
dev PUT simulation '{"failNext":{"kind":"500","method":"GET","count":1}}'
req GET /api/__dev/state; status 200; jqok '.simulation.failNext != null' "flag must stay"
req GET "/api/bookings?date=$D"; err 500 INTERNAL
req GET "/api/bookings?date=$D"; status 200
finish

begin A28 "network failure drops the connection"
dev PUT simulation '{"failNext":{"kind":"network","method":"ANY","count":1}}'
req GET "/api/bookings?date=$D"
{ [ "$CURL_EXIT" = 52 ] || [ "$CURL_EXIT" = 56 ]; } || fail "expected curl exit 52/56, got $CURL_EXIT"
req GET "/api/bookings?date=$D"; status 200
finish

# --- A29 -------------------------------------------------------------------------
reset_all
begin A29 "forceConflictNext -> 409 and a real foreign booking"
dev PUT simulation '{"forceConflictNext":true}'
create $D 10:00 11:00; err 409 CONFLICT
req GET "/api/bookings?date=$D"; jqok 'any(.[]; .title=="Занято другим сотрудником")' "foreign booking"
finish

# --- A30 -------------------------------------------------------------------------
reset_all
create $D 10:00 11:00; ID=$(id_of)
begin A30 "raceProbability 1 on POST/PATCH keeps the store consistent"
dev PUT simulation '{"raceProbability":1}'
create $D 14:00 15:00; err 409 CONFLICT
req PATCH "/api/bookings/$ID" '{"end":"11:30"}'; err 409 CONFLICT
req GET "/api/bookings?date=$D"
jqok 'any(.[]; .title=="Занято другим сотрудником" and .start=="11:00" and .end=="11:30")' "foreign 11:00–11:30"
jqok "$no_overlaps" "overlaps in store"
req PATCH "/api/bookings/$ID" '{"title":"Только название"}'; status 200
dev PUT simulation '{"raceProbability":0}'
create $D 16:00 17:00; status 201
finish

# --- A31 -------------------------------------------------------------------------
reset_all
begin A31 "latencyMs applies to /api/bookings only"
dev PUT simulation '{"latencyMs":1500}'
req GET "/api/bookings?date=$D"
awk -v t="$TIME" 'BEGIN{exit !(t>=1.5)}' || fail "time_total=$TIME, expected >= 1.5"
req GET /api/__dev/state
awk -v t="$TIME" 'BEGIN{exit !(t<0.5)}' || fail "dev endpoint took $TIME s"
dev PUT simulation '{"latencyMs":0}'
finish

# --- A33 (runs before the A32 summary: uses seed data) ------------------------------------
dev PUT clock "{\"now\":\"${T}T12:00:00.000\"}"
dev PUT simulation '{"latencyMs":0,"raceProbability":0,"forceConflictNext":false,"failNext":null}'
begin A33 "reset with and without seed"
dev POST reset '{"seed":true}'
req GET "/api/bookings?date=$T"; jqok 'length>=2' "seed on T"
req GET "/api/bookings?date=$D"; jqok 'length>=2' "seed on D"
dev POST reset '{"seed":false}'
req GET "/api/bookings?date=$T"; jqok 'length==0' "no re-seed"
req GET "/api/bookings?date=$D"; jqok 'length==0' "no re-seed"
finish

# --- A32 -------------------------------------------------------------------------
begin A32 "every error response matches ApiErrorBody (checked on all requests above)"
if [ -n "$A32_FAILS" ]; then CASE_FAIL=1; CASE_MSGS="  ✗ malformed error responses:$A32_FAILS"; fi
finish

rm -f "$TMP"
echo "----"
echo "$PASSED/$TOTAL passed"
[ "$PASSED" -eq "$TOTAL" ]
