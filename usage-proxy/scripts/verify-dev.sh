#!/bin/sh
# M99 and M116 step 6: the whole server runs under `wrangler dev` on this machine, end to end. Passed under real workerd on
# 19 Nov 2026. Wrangler 4.156.0 needs Node 22 or later.
# No Cloudflare account, no Google account, no Dodo account, no real key, no model, no network beyond this Mac: the Worker runs
# locally (workerd) and talks only to three stand ins on 127.0.0.1: the model (scripts/stand-in-model.ts), Google
# (scripts/stand-in-google.ts, its own key pair) and Dodo's webhook (scripts/send-test-webhook.ts, signed with a made up secret).
# It proves, in order: sign in with Google (the server's nonce, then the stand in's ID token), the same nonce refused a second
# time, /v1/me on the free plan, one metered request, today's use booked, a signed test webhook turning Pro on, an unsigned
# forged expiry refused, sign out, and no token, ID token, email or key in the server's log.
#   1. cd usage-proxy && rm node_modules && bun install    (the committed node_modules is a link to itself; bun install
#      fetches wrangler 4.156.0 and @cloudflare/workers-types 5.20261029.1 as package.json pins them)
#   2. sh scripts/verify-dev.sh
# It writes a .dev.vars for the run (ignored by git, made up values only) and removes it after, and keeps the local store in a
# temporary folder it also removes. It never deploys. No token is
# written to a file: tokens stay in this script's memory, and the output folder keeps only logs and short answers.
set -u
cd "$(dirname "$0")/.." || exit 1
W="${WRANGLER:-node_modules/.bin/wrangler}"
[ -x "$W" ] || { echo "Wrangler is not installed. Run step 1 above first."; exit 1; }
[ -e .dev.vars ] && { echo "A .dev.vars file is already here. Move it away first, so this run does not overwrite it."; exit 1; }
OUT="${SQUIBBY_DIST:-dist}"
mkdir -p "$OUT"
MODEL_PORT="${MODEL_PORT:-8788}" GOOGLE_PORT="${GOOGLE_PORT:-8789}" WORKER_PORT="${WORKER_PORT:-8787}"
BASE="http://127.0.0.1:$WORKER_PORT"
KEY="stand-in-key-not-a-real-key"
CLIENT_ID="stand-in-client.apps.googleusercontent.com"
PRODUCT="pdt_stand_in_pro_monthly"
DODO_WEBHOOK_SECRET="whsec_$(openssl rand -base64 24)"
USER_ID_SECRET="$(openssl rand -hex 24)"
cat > .dev.vars <<VARS
PROXY_ON=on
ANTHROPIC_API_KEY=$KEY
METADATA_USER_ID_SECRET=$USER_ID_SECRET
UPSTREAM_BASE=http://127.0.0.1:$MODEL_PORT
GOOGLE_CLIENT_ID=$CLIENT_ID
GOOGLE_KEYS_URL=http://127.0.0.1:$GOOGLE_PORT/certs
PAYMENT_PROVIDER=dodo
DODO_WEBHOOK_SECRET=$DODO_WEBHOOK_SECRET
DODO_PRODUCTS={"$PRODUCT":{"item":"pro_monthly","plan":"pro"}}
VARS
MODEL_PID=""; GOOGLE_PID=""; DEV_PID=""
# The local store lives in a folder of its own for this run, so each run starts empty and nothing of it stays behind.
STATE=$(mktemp -d "${TMPDIR:-/tmp}/squibby-dev-state.XXXXXX")
cleanup() {
  for pid in $MODEL_PID $GOOGLE_PID $DEV_PID; do kill "$pid" 2>/dev/null; done
  rm -f .dev.vars
  rm -rf "$STATE"
}
trap cleanup EXIT INT TERM
fail() { echo "FAIL: $1"; exit 1; }
# Tokens never go on a command line (other people on this Mac can see those in `ps`): curl reads the header or the body from
# its standard input instead, written there by printf, which is built into the shell and so is not a process of its own.
bearer() { printf 'authorization: Bearer %s\n' "$TOKEN"; }
# One field of a JSON answer (a dotted path), or nothing.
field() { bun -e 'let j; try { j = JSON.parse(await Bun.stdin.text()); } catch { j = null; } const v = process.argv.at(-1).split(".").reduce((o, k) => (o == null ? o : o[k]), j); console.log(v ?? "")' "$1"; }

bun scripts/stand-in-model.ts "$MODEL_PORT" > "$OUT/stand-in.log" 2>&1 & MODEL_PID=$!
bun scripts/stand-in-google.ts "$GOOGLE_PORT" > "$OUT/stand-in-google.log" 2>&1 & GOOGLE_PID=$!
WRANGLER_SEND_METRICS=false "$W" dev --local --ip 127.0.0.1 --port "$WORKER_PORT" --persist-to "$STATE" > "$OUT/dev.log" 2>&1 & DEV_PID=$!
up=0
for _ in $(seq 1 60); do
  if curl -fsS "$BASE/v1/status" > "$OUT/status.json" 2>/dev/null && curl -fsS "http://127.0.0.1:$GOOGLE_PORT/certs" > /dev/null 2>&1; then up=1; break; fi
  sleep 1
done
[ "$up" -eq 1 ] || fail "wrangler dev or the stand in Google did not start within 60 seconds. See $OUT/dev.log."
echo "wrangler dev started. Status: $(cat "$OUT/status.json")"

# 1. Sign in: the server's own nonce, the stand in Google's ID token for it, then POST /v1/signin/google.
nonce() { curl -fsS "$BASE/v1/signin/nonce" | field nonce; }
id_token() { curl -fsS -X POST "http://127.0.0.1:$GOOGLE_PORT/id-token" -d "{\"nonce\":\"$1\",\"clientId\":\"$CLIENT_ID\"}"; }
NONCE=$(nonce)
[ -n "$NONCE" ] || fail "the server gave no sign in nonce. See $OUT/dev.log."
GOOGLE=$(id_token "$NONCE")
ID_TOKEN=$(echo "$GOOGLE" | field idToken)
OWNER="google:$(echo "$GOOGLE" | field sub)"
EMAIL="stand-in-person@example.com"
[ -n "$ID_TOKEN" ] || fail "the stand in Google gave no ID token. See $OUT/stand-in-google.log."
SIGNIN=$(printf '{"idToken":"%s"}' "$ID_TOKEN" | curl -sS -X POST "$BASE/v1/signin/google" -H "content-type: application/json" --data-binary @-)
TOKEN=$(echo "$SIGNIN" | field token)
PLAN=$(echo "$SIGNIN" | field plan)
case "$TOKEN" in cmp_*) ;; *) fail "sign in gave no sign in token. See $OUT/dev.log." ;; esac
[ "$PLAN" = "free" ] || fail "sign in answered the plan \"$PLAN\", not free."
echo "PASS: sign in with the stand in Google gave a sign in token on the free plan."
SECOND=$(id_token "$NONCE" | field idToken)
AGAIN=$(printf '{"idToken":"%s"}' "$SECOND" | curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/signin/google" -H "content-type: application/json" --data-binary @-)
[ "$AGAIN" = "401" ] || fail "the same nonce a second time answered $AGAIN, not 401."
echo "PASS: the same nonce a second time was refused."

# 2. /v1/me with the token.
me() { bearer | curl -sS "$BASE/v1/me" -H @- -w '\n%{http_code}'; }
ME=$(me)
[ "$(echo "$ME" | tail -n 1)" = "200" ] && [ "$(echo "$ME" | sed '$d' | field plan)" = "free" ] || fail "/v1/me did not answer the free plan."
echo "PASS: /v1/me answered the free plan."

# 3. One metered request with the sign in token, forwarded with the server's key.
CODE=$(printf 'x-api-key: %s\n' "$TOKEN" | curl -sS -o "$OUT/reply.json" -w '%{http_code}' -X POST "$BASE/v1/messages" -H @- -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-5-5","max_tokens":500,"messages":[{"role":"user","content":"hello"}]}')
SEEN=$(curl -fsS "http://127.0.0.1:$MODEL_PORT/seen")
if [ "$CODE" = "200" ] && grep -q "stand in answer" "$OUT/reply.json" && echo "$SEEN" | grep -q "\"key\":\"$KEY\"" && ! echo "$SEEN" | grep -q "cmp_"; then
  echo "PASS: one metered request went through wrangler dev to the stand in, with the server's key and not the token."
else
  fail "the model request answered $CODE. See $OUT/reply.json and $OUT/dev.log."
fi
# The cost is booked after the answer, so ask a few times.
used=""
for _ in $(seq 1 20); do
  used=$(me | sed '$d' | field use.today)
  [ -n "$used" ] && [ "$used" != "0" ] && break
  sleep 0.25
done
[ -n "$used" ] && [ "$used" != "0" ] || fail "/v1/me shows no use today after the metered request. See $OUT/dev.log."
echo "PASS: /v1/me shows today's use above 0 ($used of the day's allowance): the cost was booked."

# 4. A signed test webhook (Dodo's subscription.active for this owner) turns Pro on; an unsigned forged expiry changes nothing.
HOOK=$(DODO_WEBHOOK_SECRET="$DODO_WEBHOOK_SECRET" bun scripts/send-test-webhook.ts "$BASE" "$OWNER" "$PRODUCT")
[ "$(echo "$HOOK" | head -n 1)" = "200" ] && echo "$HOOK" | grep -q '"applied"' || fail "the signed test webhook was not applied: $(echo "$HOOK" | head -n 1). See $OUT/dev.log."
[ "$(me | sed '$d' | field plan)" = "pro" ] || fail "after the signed test webhook /v1/me does not answer Pro."
echo "PASS: a signed test webhook turned Pro on, and /v1/me says so."
UNSIGNED=$(DODO_WEBHOOK_SECRET="" bun scripts/send-test-webhook.ts "$BASE" "$OWNER" "$PRODUCT" --unsigned | head -n 1)
case "$UNSIGNED" in 2*) fail "an unsigned webhook answered $UNSIGNED." ;; esac
[ "$(me | sed '$d' | field plan)" = "pro" ] || fail "an unsigned webhook (a forged subscription.expired) turned Pro off."
echo "PASS: an unsigned webhook was refused and changed nothing ($UNSIGNED)."

# 5. Sign out stops the token.
bearer | curl -fsS -X POST "$BASE/v1/signout" -H @- > /dev/null || fail "sign out did not work."
[ "$(me | tail -n 1)" = "401" ] || fail "after sign out the token still works."
echo "PASS: after sign out the token is refused."

# 6. The server's own log holds no token, ID token, email or key.
for secret in "$TOKEN" "$ID_TOKEN" "$SECOND" "$EMAIL" "$KEY" "$DODO_WEBHOOK_SECRET" "$USER_ID_SECRET"; do
  grep -qF -- "$secret" "$OUT/dev.log" && fail "the server's log holds something private. See $OUT/dev.log."
done
grep -q '"kind":"request"' "$OUT/dev.log" || fail "the server's log has no line for the metered request. See $OUT/dev.log."
echo "PASS: no sign in token, ID token, email, key or secret in the server's log."
echo "PASS: the whole server works on this Mac. Nothing was deployed and nothing left this machine."
