#!/bin/sh
# Squibby's usage server on Cloudflare (M99).
#
#   sh scripts/deploy.sh           a dry run: builds the Worker into dist/ and checks it, deploys nothing, needs no account
#   sh scripts/deploy.sh --apply   a real deploy, and only when every secret it needs is already set on Cloudflare
#   add --live-payments            M116: needed when DODO_API_BASE in wrangler.toml is Dodo's live address (and refused with the
#                                  test one), so live payments are never deployed by accident. It also needs live mode's webhook
#                                  secret (DODO_WEBHOOK_SECRET_LIVE) to be set first: the go live order is the secrets, then this.
#
# It never signs in, never creates an account or anything on an account by itself (a deploy only makes what wrangler.toml
# names), never prints a secret and never prints wrangler's own output: what wrangler said is saved in the out folder.
# WRANGLER names the wrangler to run (the tests use a stand in); SQUIBBY_DIST names the out folder (default dist).
set -u
cd "$(dirname "$0")/.." || exit 1

# M116: the secrets in lists (the Worker's ALWAYS_SECRETS, FORWARDING_SECRETS, PAYMENT_SECRETS and LIVE_PAYMENT_SECRETS).
# Always: accounts and the operator.
ALWAYS="METADATA_USER_ID_SECRET OPERATOR_KEY GOOGLE_CLIENT_ID"
# Only once PROXY_ON is set: Squibby's Anthropic key. Until then the server needs no Anthropic key at all.
FORWARDING="ANTHROPIC_API_KEY"
# Only once payments are on (PAYMENTS_ON is set, or PAYMENT_PROVIDER is dodo): Dodo's API key, the webhook's secret and the
# product table. On the test address, test mode's webhook secret.
PAYMENTS="DODO_PAYMENTS_API_KEY DODO_WEBHOOK_SECRET DODO_PRODUCTS"
# On the live address, live mode's webhook secret in its place (audit run 2, finding 5, re-attack round 1). The server keeps an
# event as live only when live mode's secret verified it, so this is checked before the live address is ever deployed.
LIVE_PAYMENTS="DODO_PAYMENTS_API_KEY DODO_WEBHOOK_SECRET_LIVE DODO_PRODUCTS"
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
# Audit run 2, finding 5, close out round 1: the bindings are read from wrangler's bindings table and nowhere else, and only
# when every row in it is plainly one binding. Wrangler prints a var's NAME exactly as written, newlines included, so a var
# named "x<newline>env.DODO_API_BASE (...)" prints a line that looks like a binding the Worker does not have. The table is
# the lines between the one "Binding ... Resource" header (right after wrangler's title line) and the first empty line. Each
# row must be printable ASCII (C locale, bytes), start with env.<NAME> where NAME is a plain identifier, then an optional
# " (<value>)", then spaces, with the resource word starting exactly in the header's Resource column. Wrangler pads each
# whole name and value (newlines counted) to one width before that column, so no line of a name or value split over lines
# can reach it. A second header, a row that breaks any of this, or an env. line outside the table refuses the deploy. What
# this keeps, one "<binding><tab><resource>" line per row, is what every later binding check reads.
BINDINGS="$OUT/bindings.txt"
if ! LC_ALL=C awk -v out="$BINDINGS" '
  BEGIN { state = 0; headers = 0; bad = 0; prev = ""; printf "" > out }
  /^Binding +Resource( +Mode)? *$/ { headers++ }
  state == 0 && /^Binding +Resource( +Mode)? *$/ {
    if (prev != "Your Worker has access to the following bindings:") bad = 1
    col = index($0, "Resource"); state = 1; prev = $0; next
  }
  state == 1 && $0 == "" { state = 2; prev = $0; next }
  state == 1 {
    row = $0
    if (row !~ /^[ -~]+$/ || col < 6 || length(row) < col || substr(row, col - 4, 4) != "    " || substr(row, col, 1) == " ") { bad = 1; next }
    cell = substr(row, 1, col - 1); sub(/ +$/, "", cell)
    res = substr(row, col); sub(/ +$/, "", res)
    if (cell !~ /^env\.[A-Za-z_][A-Za-z0-9_]*( \(.*\))?$/ || res !~ /^[A-Za-z][A-Za-z0-9 ]*$/) { bad = 1; next }
    print cell "\t" res > out; prev = $0; next
  }
  /^ *env\./ { bad = 1 }
  { prev = $0 }
  END { if (headers != 1 || state != 2 || bad) exit 1 }
' "$OUT/dry-run.log"; then
  echo "The dry run's bindings could not be read plainly (one table, each row one binding with a plain name). A var name or value with a line break in it, or an odd character, does this. See $OUT/dry-run.log. Nothing was deployed."
  exit 1
fi
# bound_rows NAME prints every row of the table for the binding NAME (its "env.NAME (value)<tab>resource" line).
bound_rows() { LC_ALL=C awk -F '\t' -v n="env.$1" '{ c = $1; sub(/ .*/, "", c); if (c == n) print }' "$BINDINGS"; }
is_bound() { [ -n "$(bound_rows "$1")" ]; }
if [ "$(bound_rows STORE)" != "$(printf 'env.STORE (StoreObject)\tDurable Object')" ]; then
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
  if is_bound "$name" || sed 's/#.*//' wrangler.toml | grep -Eq "(^|[^A-Za-z0-9_])${name}[[:space:]]*="; then devvar="$devvar $name"; fi
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
# Exactly one plain double quoted line, or none (the test address). Anything else (single quotes, a second line in an [env.*]
# section) could make this script read one address while another is deployed, so it is refused.
defs=$(sed 's/#.*//' wrangler.toml | grep -Ec "(^|[^A-Za-z0-9_])DODO_API_BASE[[:space:]]*=")
base=$(sed 's/#.*//' wrangler.toml | sed -n 's/^[[:space:]]*DODO_API_BASE[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' | head -n 1)
if [ "$defs" -gt 1 ] || { [ "$defs" -eq 1 ] && [ -z "$base" ]; }; then
  echo "DODO_API_BASE must be written once in wrangler.toml, as DODO_API_BASE = \"<address>\" under [vars]. Nothing was deployed."
  exit 1
fi
# Audit run 2, finding 5, round 3: the address the Worker really gets is the one the dry run binds. A line outside [vars] (or
# a quoted key, or one in an [env.*] table) can make the text above say one address while wrangler binds another, or none,
# and none is Dodo's test address on the server. So the binding is read too, from the checked bindings table only (close out
# round 1: never from free text in wrangler's output): exactly one row that is exactly
# env.DODO_API_BASE ("<address>") with the resource Environment Variable, or none, and it must be the same as the text.
bound_n=$(bound_rows DODO_API_BASE | wc -l | tr -d ' ')
bound=$(bound_rows DODO_API_BASE | LC_ALL=C sed -n 's/^env\.DODO_API_BASE ("\([!#-~]*\)")	\(Environment Variable\)$/\1/p' | head -n 1)
if [ "$bound_n" -gt 1 ] || { [ "$bound_n" -eq 1 ] && [ -z "$bound" ]; }; then
  echo "The dry run binds DODO_API_BASE in a way this script cannot read plainly. See $OUT/dry-run.log. Nothing was deployed."
  exit 1
fi
if [ "$bound" != "$base" ]; then
  echo "DODO_API_BASE in wrangler.toml (${base:-none}) is not what the dry run binds (${bound:-none}). Write it once, as DODO_API_BASE = \"<address>\" under [vars]. Nothing was deployed."
  exit 1
fi
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
if has_name DODO_API_BASE; then
  rm -f "$OUT/secret-names.json"
  echo "DODO_API_BASE is set as a secret on Cloudflare, so this script cannot read it. Remove it with: wrangler secret delete DODO_API_BASE (it belongs in wrangler.toml). Nothing was deployed."
  exit 1
fi
PAY_NEEDED="$PAYMENTS"
[ "$base" = "$DODO_LIVE" ] && PAY_NEEDED="$LIVE_PAYMENTS"
# A switch counts as set when its name is set on Cloudflare (its value is never read), or it is a binding in the dry run.
proxy_set=0; pay_set=0
if has_name PROXY_ON || is_bound PROXY_ON; then NEEDED="$NEEDED $FORWARDING"; proxy_set=1; fi
# PAYMENT_PROVIDER counts as dodo however it is written (the server ignores case and ASCII spaces), and when it is a secret,
# whose value this script never reads (audit run 2, finding 5 re-attack). Re-attack round 2: grep's [[:space:]] and JS trim()
# do not agree on Unicode spaces (U+FEFF, U+2028), so the two are made to agree on the safe side. The server trims only ASCII
# (src/payments.ts). Here, in the C locale (bytes, ASCII only), a PAYMENT_PROVIDER binding counts as payments on unless every
# line that names it is the whole binding with a plain printable ASCII value that is not dodo. (Close out round 1: a Unicode
# character, a tab or a value split over lines now stops the deploy earlier, at the bindings table. This stays as a backstop.)
provider_on() {
  is_bound PAYMENT_PROVIDER || return 1
  bound_rows PAYMENT_PROVIDER | LC_ALL=C grep -Evq '^env\.PAYMENT_PROVIDER \("[ -~]*"\)	Environment Variable$' && return 0
  bound_rows PAYMENT_PROVIDER | LC_ALL=C grep -Eiq '^env\.PAYMENT_PROVIDER \(" *dodo *"\)	'
}
if has_name PAYMENTS_ON || is_bound PAYMENTS_ON || has_name PAYMENT_PROVIDER || provider_on; then NEEDED="$NEEDED $PAY_NEEDED"; pay_set=1; fi
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
# Live mode with test mode's webhook secret still set: harmless (what it verifies is kept as test mode and never counts once
# live), but the test endpoint should be gone. Said, not refused.
test_hook_left=0
if [ "$base" = "$DODO_LIVE" ] && has_name DODO_WEBHOOK_SECRET; then test_hook_left=1; fi
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
if [ "$test_hook_left" -eq 1 ]; then
  echo "Test mode's webhook secret is still set. Events it verifies are kept as test mode and never count now that Dodo is live. To finish go live, delete the test mode webhook in Dodo's dashboard and run: wrangler secret delete DODO_WEBHOOK_SECRET"
fi
