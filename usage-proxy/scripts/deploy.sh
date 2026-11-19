#!/bin/sh
# Squibby's usage server on Cloudflare (M99).
#
#   sh scripts/deploy.sh           a dry run: builds the Worker into dist/ and checks it, deploys nothing, needs no account
#   sh scripts/deploy.sh --apply   a real deploy, and only when every secret it needs is already set on Cloudflare
#   add --live-payments            M116: needed when DODO_API_BASE in wrangler.toml is Dodo's live address (and refused with the
#                                  test one), so live payments are never deployed by accident
#
# It never signs in, never creates an account or anything on an account by itself (a deploy only makes what wrangler.toml
# names), never prints a secret and never prints wrangler's own output: what wrangler said is saved in the out folder.
# WRANGLER names the wrangler to run (the tests use a stand in); SQUIBBY_DIST names the out folder (default dist).
set -u
cd "$(dirname "$0")/.." || exit 1

# M116: the secrets in three lists (the Worker's ALWAYS_SECRETS, FORWARDING_SECRETS and PAYMENT_SECRETS).
# Always: accounts and the operator.
ALWAYS="METADATA_USER_ID_SECRET OPERATOR_KEY GOOGLE_CLIENT_ID"
# Only once PROXY_ON is set: Squibby's Anthropic key. Until then the server needs no Anthropic key at all.
FORWARDING="ANTHROPIC_API_KEY"
# Only once payments are on (PAYMENTS_ON is set, or PAYMENT_PROVIDER is dodo): Dodo's API key and the webhook's secrets.
PAYMENTS="DODO_PAYMENTS_API_KEY DODO_WEBHOOK_SECRET DODO_PRODUCTS"
# Only for a local run (wrangler dev). A real deploy refuses while any of them is set on Cloudflare or as a var.
DEV_ONLY="DEV_TOKENS UPSTREAM_BASE GOOGLE_KEYS_URL"
OUT="${SQUIBBY_DIST:-dist}"

apply=0
live=0
for a in "$@"; do
  case "$a" in
    --apply) apply=1 ;;
    --live-payments) live=1 ;;
    --dry-run) ;;
    *) echo "That option is not known. Use no option for a dry run, or --apply to deploy (with --live-payments for Dodo's live address). Nothing was deployed."; exit 2 ;;
  esac
done

W="${WRANGLER:-}"
if [ -z "$W" ]; then
  if [ -x node_modules/.bin/wrangler ]; then W=node_modules/.bin/wrangler
  elif command -v wrangler >/dev/null 2>&1; then W=wrangler
  else echo "Wrangler is not installed. In usage-proxy, run bun install first. Nothing was deployed."; exit 1
  fi
fi

# 1. Always the dry run first: build the bundle and read the bindings, with no account and no network to Cloudflare.
rm -rf "$OUT" && mkdir -p "$OUT"
if ! "$W" deploy --dry-run --outdir "$OUT" > "$OUT/dry-run.log" 2>&1; then
  echo "The dry run did not build. What wrangler said is in $OUT/dry-run.log. Nothing was deployed."
  exit 1
fi
# The bundle is named after wrangler.toml's main (src/entry.ts gives entry.js).
BUNDLE=$(sed -n 's/^main = "\(.*\)"$/\1/p' wrangler.toml | head -n 1)
BUNDLE=$(basename "${BUNDLE:-src/entry.ts}"); BUNDLE="${BUNDLE%.*}.js"
if [ ! -f "$OUT/$BUNDLE" ] || ! grep -q "StoreObject" "$OUT/$BUNDLE"; then
  echo "The dry run made no Worker with the store in it ($OUT/$BUNDLE). Nothing was deployed."
  exit 1
fi
if ! grep -q "env.STORE" "$OUT/dry-run.log" || ! grep -q "StoreObject" "$OUT/dry-run.log"; then
  echo "The store's binding (STORE, StoreObject) did not resolve in the dry run. See $OUT/dry-run.log. Nothing was deployed."
  exit 1
fi
echo "The dry run passed: the Worker builds and the store's binding resolves."

if [ "$apply" -eq 0 ]; then
  echo "Nothing was deployed. To deploy for real, run again with --apply."
  exit 0
fi

# 2. Never a local only setting as a plain var: in the bindings the dry run listed, or in wrangler.toml (comments aside). Such a
#    var would be deployed as it is, and UPSTREAM_BASE would send Squibby's key to that address.
devvar=""
for name in $DEV_ONLY; do
  if grep -Eq "env\.${name}([^A-Za-z0-9_]|\$)" "$OUT/dry-run.log" || sed 's/#.*//' wrangler.toml | grep -Eq "(^|[^A-Za-z0-9_])${name}[[:space:]]*="; then devvar="$devvar $name"; fi
done
if [ -n "$devvar" ]; then
  for name in $devvar; do echo "The setting $name is only for a run on this Mac, and it is a var in wrangler.toml or the bindings. Remove it from wrangler.toml (and any --var)."; done
  echo "Nothing was deployed."
  exit 1
fi

# 2b. M116: Dodo's address. Only the test or the live one, and the live one only on purpose. The key itself is a secret this
#     script never reads, so the server checks that the key's mode agrees with the address before every call to Dodo.
DODO_TEST="https://test.dodopayments.com"
DODO_LIVE="https://live.dodopayments.com"
base=$(sed 's/#.*//' wrangler.toml | sed -n 's/^[[:space:]]*DODO_API_BASE[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
[ -z "$base" ] && base="$DODO_TEST"
if [ "$base" != "$DODO_TEST" ] && [ "$base" != "$DODO_LIVE" ]; then
  echo "DODO_API_BASE in wrangler.toml must be $DODO_TEST or $DODO_LIVE. Nothing was deployed."
  exit 1
fi
if [ "$base" = "$DODO_LIVE" ] && [ "$live" -eq 0 ]; then
  echo "DODO_API_BASE is Dodo's live address. To deploy live payments on purpose, run again with --live-payments. Nothing was deployed."
  exit 1
fi
if [ "$base" = "$DODO_TEST" ] && [ "$live" -eq 1 ]; then
  echo "--live-payments was given, but DODO_API_BASE is Dodo's test address. Set it to $DODO_LIVE first. Nothing was deployed."
  exit 1
fi
if [ "$base" = "$DODO_LIVE" ]; then echo "Live payments: DODO_PAYMENTS_API_KEY must be a live key (dodo_live_). With a test key, no checkout is made."; fi

# 3. A real deploy only when every secret it needs is already set. Only the names are read, never a value.
if ! "$W" secret list --format json > "$OUT/secret-names.json" 2> "$OUT/secret-list.log"; then
  echo "Could not read the secret names from Cloudflare. Sign in yourself first (wrangler login), then try again. Nothing was deployed."
  rm -f "$OUT/secret-names.json"
  exit 1
fi
has_name() { grep -q "\"name\": *\"$1\"" "$OUT/secret-names.json"; }
NEEDED="$ALWAYS"
# A switch counts as set when its name is set on Cloudflare (its value is never read), or it is a binding in the dry run.
proxy_set=0; pay_set=0
if has_name PROXY_ON || grep -Eq "env\.PROXY_ON([^A-Za-z0-9_]|\$)" "$OUT/dry-run.log"; then NEEDED="$NEEDED $FORWARDING"; proxy_set=1; fi
if has_name PAYMENTS_ON || grep -Eq "env\.PAYMENTS_ON([^A-Za-z0-9_]|\$)" "$OUT/dry-run.log" || has_name PAYMENT_PROVIDER || grep -Eiq 'env\.PAYMENT_PROVIDER \("[[:space:]]*dodo[[:space:]]*"\)' "$OUT/dry-run.log"; then NEEDED="$NEEDED $PAYMENTS"; pay_set=1; fi
# PAYMENT_PROVIDER counts as dodo however it is written (the server ignores case and spaces), and when it is a secret, whose
# value this script never reads (audit run 2, finding 5 re-attack).
# Audit run 2, finding 5: forwarding and payments together only on Dodo's live address. In test mode anyone can pay with a
# free test card, and with forwarding on that would spend Squibby's Anthropic key. (The server also holds every paid plan to
# Free's limits while Dodo is in test mode, apart from the owners in TEST_PAYERS, for a switch set later without this script.)
if [ "$proxy_set" -eq 1 ] && [ "$pay_set" -eq 1 ] && [ "$base" = "$DODO_TEST" ]; then
  rm -f "$OUT/secret-names.json"
  echo "PROXY_ON and payments are both on, and Dodo is in test mode ($DODO_TEST). Anyone could get Pro with a test card, on Squibby's Anthropic key."
  echo "Turn one off first (wrangler secret delete PROXY_ON, or wrangler secret delete PAYMENTS_ON with PAYMENT_PROVIDER none), or move Dodo to live and deploy with --live-payments."
  echo "Nothing was deployed."
  exit 1
fi
missing=""
for name in $NEEDED; do
  if ! grep -q "\"name\": *\"$name\"" "$OUT/secret-names.json"; then missing="$missing $name"; fi
done
devset=""
for name in $DEV_ONLY; do
  if grep -q "\"name\": *\"$name\"" "$OUT/secret-names.json"; then devset="$devset $name"; fi
done
rm -f "$OUT/secret-names.json"
if [ -n "$devset" ]; then
  for name in $devset; do echo "The setting $name is only for a run on this Mac, and it is set on Cloudflare. Remove it with: wrangler secret delete $name"; done
  echo "Nothing was deployed."
  exit 1
fi
if [ -n "$missing" ]; then
  for name in $missing; do echo "The secret $name is not set. Set it with: wrangler secret put $name"; done
  # The switch counts as set by its name alone, so PROXY_ON set to "off" still asks for the Anthropic key. Say how to really turn it off.
  case " $missing " in *" ANTHROPIC_API_KEY "*) echo "PROXY_ON is set, so the Anthropic key is needed even if its value is off. To deploy with forwarding off and no Anthropic key, delete the switch instead: wrangler secret delete PROXY_ON";; esac
  echo "Nothing was deployed."
  exit 1
fi

# 4. The deploy.
if ! "$W" deploy > "$OUT/deploy.log" 2>&1; then
  echo "The deploy did not finish. What wrangler said is in $OUT/deploy.log."
  exit 1
fi
echo "Deployed. What wrangler said is in $OUT/deploy.log. The switch is whatever PROXY_ON is: off unless it is on."
