#!/bin/sh
# M92: makes Squibby's real test kit, a throwaway app wired for Supabase, Vercel and Stripe, in the folder you name.
# Usage: sh make-real-test-kit.sh ~/Desktop/squibby-real-kit
# The guide, one step at a time: docs/milestones/M92-real-test-kit.md.
# It only writes files, only inside the new folder. It never runs git, never reaches the network, never makes an account,
# and holds no key or password: you put your own values into your own tools during the guide.
# Three holes are in it on purpose, so Squibby has something real to find:
#   1. the signups table has no row level security (the migration switches it off),
#   2. the Stripe webhook needs STRIPE_WEBHOOK_SECRET, which the guide leaves out of Vercel,
#   3. /admin is a private looking page that opens for anyone.
set -eu
DIR="${1:?give a folder, for example ~/Desktop/squibby-real-kit}"
[ -e "$DIR" ] && { echo "$DIR already exists; pick a new folder"; exit 1; }
mkdir -p "$DIR/api/webhooks" "$DIR/lib" "$DIR/public/admin" "$DIR/supabase/migrations"

cat > "$DIR/KIT.json" <<'J'
{
  "what": "Squibby's real test kit (M92). Throwaway: delete it and its Supabase, Vercel and Stripe parts after the session.",
  "openTable": "signups",
  "protectedTable": "notes",
  "missingInVercel": "STRIPE_WEBHOOK_SECRET",
  "openPage": "/admin",
  "webhookPath": "/api/webhooks/stripe"
}
J

cat > "$DIR/package.json" <<'J'
{
  "name": "squibby-real-kit",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" }
}
J

cat > "$DIR/vercel.json" <<'J'
{
  "cleanUrls": true,
  "outputDirectory": "public"
}
J

cat > "$DIR/.gitignore" <<'G'
.env
.env.*
!.env.example
.vercel
supabase/.temp
supabase/.branches
G

cat > "$DIR/.env.example" <<'E'
# The values this app reads. Copy each from your own dashboard straight into Vercel with:
#   vercel env add NAME production
# Never paste a value into a chat. Step 7 of the guide leaves STRIPE_WEBHOOK_SECRET out of Vercel on purpose.
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
E

cat > "$DIR/README.md" <<'R'
# Squibby's real test kit

A throwaway app for one guided session (docs/milestones/M92-real-test-kit.md in the Squibby repo). Delete it, and its
Supabase project, Vercel project and Stripe webhook, when the session is over.

- `public/` the pages: a list of notes, a signup form, a sign in page, and `/admin`.
- `api/notes.js` reads the notes from Supabase. `api/signup.js` adds an email to the signups table.
- `api/webhooks/stripe.js` takes Stripe's test mode events and checks their signature.
- `supabase/migrations/` makes the two tables.

Three holes are in it on purpose, for Squibby to find:

1. The `signups` table has no row level security, so anyone with the public key can read every email in it.
2. The webhook needs `STRIPE_WEBHOOK_SECRET`, which the guide leaves out of Vercel, so Stripe's deliveries fail.
3. `/admin` looks private but opens for anyone.

No package to install: it uses only what Node and Vercel already have.
R

cat > "$DIR/supabase/migrations/20261114000000_kit.sql" <<'S'
-- Squibby's real test kit: two tables.

-- notes: row level security on, and one rule that lets anyone read them.
create table public.notes (
  id bigint generated always as identity primary key,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create policy "Anyone can read notes" on public.notes for select to anon using (true);
grant select on public.notes to anon;
insert into public.notes (body) values ('First note from the test kit'), ('Second note from the test kit');

-- signups: left open on purpose. Row level security is switched off, so anyone with the public key can read every email.
create table public.signups (
  id bigint generated always as identity primary key,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.signups disable row level security;
grant select, insert on public.signups to anon;
S

cat > "$DIR/lib/stripe-signature.js" <<'L'
// Stripe's webhook signature, checked with Node's own crypto: the Stripe-Signature header is "t=<seconds>,v1=<hex>", and
// v1 is HMAC-SHA256 of "<t>.<raw body>" with the endpoint's signing secret. Too old (over 5 minutes) is refused.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(body, header, secret, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  if (!header || !secret) return false;
  let t = "";
  const v1 = [];
  for (const part of String(header).split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    if (k === "v1") v1.push(v);
  }
  if (!/^\d+$/.test(t) || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  return v1.some((s) => { const got = Buffer.from(s); return got.length === want.length && timingSafeEqual(got, want); });
}
L

cat > "$DIR/api/webhooks/stripe.js" <<'W'
// Stripe sends test mode events here. The signing secret comes from Vercel's settings; until it is set there, every
// delivery fails with 500, which Stripe shows as a failed delivery (hole 2 of the kit).
import { verifyStripeSignature } from "../../lib/stripe-signature.js";

export function respond({ method, secret, header, body, now }) {
  if (method !== "POST") return { status: 405, json: { error: "Stripe sends POST only" } };
  if (!secret) return { status: 500, json: { error: "STRIPE_WEBHOOK_SECRET is not set on this server" } };
  if (!verifyStripeSignature(body, header, secret, now)) return { status: 400, json: { error: "The signature does not match" } };
  return { status: 200, json: { received: true } };
}

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = req.method === "POST" ? await rawBody(req) : "";
  const r = respond({ method: req.method, secret, header: req.headers["stripe-signature"], body, now: Math.floor(Date.now() / 1000) });
  res.status(r.status).json(r.json);
}
W

cat > "$DIR/api/notes.js" <<'N'
// The notes, read from Supabase with the public key. Row level security is on for this table, with a rule that anyone may
// read it, so this is fine.
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set on this server" });
  const r = await fetch(`${url}/rest/v1/notes?select=id,body&order=id`, { headers: { apikey: key } });
  res.status(r.status).json(await r.json());
}
N

cat > "$DIR/api/signup.js" <<'U'
// Adds an email to the signups table with the public key. It works only because that table has no row level security,
// which also means anyone can read every email in it (hole 1 of the kit).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST an email" });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set on this server" });
  const email = String((req.body && req.body.email) || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "That email looks wrong" });
  const r = await fetch(`${url}/rest/v1/signups`, { method: "POST", headers: { apikey: key, "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify({ email }) });
  res.status(r.ok ? 200 : r.status).json(r.ok ? { ok: true } : { error: "Supabase said no" });
}
U

cat > "$DIR/public/index.html" <<'H'
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test kit notes</title>
<style>body{font:16px system-ui;max-width:560px;margin:40px auto;padding:0 16px}li{margin:6px 0}form{display:flex;gap:8px;margin-top:24px}</style>
<h1>Notes</h1>
<ul id="notes"><li>Loading the notes</li></ul>
<form id="f"><input id="email" placeholder="you@example.com" aria-label="Email"><button>Join the list</button></form>
<p id="msg" role="status"></p>
<script>
fetch("/api/notes").then(r => r.json()).then(list => {
  const ul = document.getElementById("notes");
  ul.textContent = "";
  for (const n of Array.isArray(list) ? list : []) { const li = document.createElement("li"); li.textContent = n.body; ul.append(li); }
  if (!ul.children.length) ul.textContent = "No notes, or the server is missing a setting.";
});
document.getElementById("f").onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: document.getElementById("email").value }) });
  document.getElementById("msg").textContent = r.ok ? "You're on the list." : "That did not work.";
};
</script>
</html>
H

cat > "$DIR/public/login.html" <<'I'
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in</title>
<style>body{font:16px system-ui;max-width:360px;margin:40px auto;padding:0 16px}form{display:grid;gap:8px}</style>
<h1>Sign in</h1>
<form onsubmit="event.preventDefault();document.getElementById('m').textContent='Signing in is not built in this test kit.'">
<input placeholder="you@example.com" aria-label="Email"><input type="password" aria-label="Password"><button>Sign in</button></form>
<p id="m" role="status"></p>
</html>
I

cat > "$DIR/public/admin/index.html" <<'A'
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin</title>
<style>body{font:16px system-ui;max-width:560px;margin:40px auto;padding:0 16px}</style>
<h1>Admin</h1>
<p>Everyone who joined the list would be shown here. This page should be private, and it is not: it opens for anyone.</p>
</html>
A

echo "Made $DIR."
echo "Next: the guide in the Squibby repo, docs/milestones/M92-real-test-kit.md, one step at a time."
