#!/bin/sh
# [verify] M99 on a real Mac: `wrangler dev` starts on this machine and serves one fake metered request.
# No Cloudflare account, no real key, no model: the Worker runs locally (workerd) and forwards to a stand in on 127.0.0.1.
#   1. cd usage-proxy && rm node_modules && bun install    (the committed node_modules is a link to itself; bun install
#      fetches wrangler 4.156.0 and @cloudflare/workers-types 5.20261029.1 as package.json pins them)
#   2. sh scripts/verify-dev.sh
# It writes a .dev.vars for the run (ignored by git, made up values only) and removes it after. It never deploys.
set -u
cd "$(dirname "$0")/.." || exit 1
W="${WRANGLER:-node_modules/.bin/wrangler}"
[ -x "$W" ] || { echo "Wrangler is not installed. Run step 1 above first."; exit 1; }
[ -e .dev.vars ] && { echo "A .dev.vars file is already here. Move it away first, so this run does not overwrite it."; exit 1; }
OUT="${SQUIBBY_DIST:-dist}"
mkdir -p "$OUT"
MODEL_PORT="${MODEL_PORT:-8788}" WORKER_PORT="${WORKER_PORT:-8787}"
KEY="stand-in-key-not-a-real-key"
cat > .dev.vars <<VARS
PROXY_ON=on
ANTHROPIC_API_KEY=$KEY
METADATA_USER_ID_SECRET=$(openssl rand -hex 24)
UPSTREAM_BASE=http://127.0.0.1:$MODEL_PORT
DEV_TOKENS=on
VARS
MODEL_PID=""; DEV_PID=""
cleanup() { [ -n "$MODEL_PID" ] && kill "$MODEL_PID" 2>/dev/null; [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null; rm -f .dev.vars; }
trap cleanup EXIT INT TERM
bun scripts/stand-in-model.ts "$MODEL_PORT" > "$OUT/stand-in.log" 2>&1 & MODEL_PID=$!
WRANGLER_SEND_METRICS=false "$W" dev --local --ip 127.0.0.1 --port "$WORKER_PORT" > "$OUT/dev.log" 2>&1 & DEV_PID=$!
up=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$WORKER_PORT/v1/status" > "$OUT/status.json" 2>/dev/null; then up=1; break; fi
  sleep 1
done
[ "$up" -eq 1 ] || { echo "FAIL: wrangler dev did not start within 60 seconds. See $OUT/dev.log."; exit 1; }
echo "wrangler dev started. Status: $(cat "$OUT/status.json")"
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:$WORKER_PORT/v1/dev/token" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "FAIL: no test token. See $OUT/dev.log."; exit 1; }
CODE=$(curl -sS -o "$OUT/reply.json" -w '%{http_code}' -X POST "http://127.0.0.1:$WORKER_PORT/v1/messages" -H "x-api-key: $TOKEN" -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-5-5","max_tokens":500,"messages":[{"role":"user","content":"hello"}]}')
SEEN=$(curl -fsS "http://127.0.0.1:$MODEL_PORT/seen")
if [ "$CODE" = "200" ] && grep -q "stand in answer" "$OUT/reply.json" && echo "$SEEN" | grep -q "\"key\":\"$KEY\""; then
  echo "PASS: one metered request went through wrangler dev to the stand in, with the server's key and not the token."
  echo "Check $OUT/dev.log for one line with \"kind\":\"request\" and a usd above 0 (the cost was booked on the Durable Object)."
else
  echo "FAIL: the answer was $CODE. See $OUT/reply.json and $OUT/dev.log."
  exit 1
fi
