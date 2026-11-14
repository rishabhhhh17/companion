#!/bin/sh
# Makes the demo project for the 60 second video in the folder you name.
# Usage: sh make-demo.sh ~/Desktop/signup-demo
# It never touches git. It writes only inside the folder you give it.
set -eu
DIR="${1:?give a folder, for example ~/Desktop/signup-demo}"
[ -e "$DIR" ] && { echo "$DIR already exists; pick a new folder"; exit 1; }
mkdir -p "$DIR/src" "$DIR/test"
cat > "$DIR/package.json" <<'J'
{ "name": "signup-demo", "private": true, "type": "module",
  "scripts": { "dev": "bunx serve src -l 5173", "test": "bun test" } }
J
cat > "$DIR/src/index.html" <<'H'
<!doctype html><meta charset="utf-8"><title>Join the list</title>
<style>body{font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f6f7f9}
form{background:#fff;padding:28px;border-radius:14px;box-shadow:0 2px 12px #0001;display:grid;gap:10px;width:300px}
button{padding:10px;border:0;border-radius:8px;background:#1f6feb;color:#fff;font-weight:600}#msg{min-height:1.2em}</style>
<form id="f"><h2>Join the list</h2><input id="email" placeholder="you@example.com">
<input id="pw" type="password" placeholder="Password"><button>Join</button><div id="msg"></div></form>
<script type="module">
import { check } from "./signup.js";
document.getElementById("f").onsubmit = e => { e.preventDefault();
  const r = check(document.getElementById("email").value, document.getElementById("pw").value);
  document.getElementById("msg").textContent = r.ok ? "You're on the list." : r.why; };
</script>
H
cat > "$DIR/src/signup.js" <<'S'
// The bug for the video: the email check is backwards, so good emails are refused.
export function check(email, pw) {
  if (email.includes("@")) return { ok: false, why: "That email looks wrong." };
  if (pw.length < 8) return { ok: false, why: "Use at least 8 characters." };
  return { ok: true };
}
S
cat > "$DIR/test/signup.test.js" <<'T'
import { test, expect } from "bun:test";
import { check } from "../src/signup.js";
test("a good email and password join", () => expect(check("a@b.co", "longenough").ok).toBe(true));
test("a short password is refused", () => expect(check("a@b.co", "short").ok).toBe(false));
test("an email without @ is refused", () => expect(check("nope", "longenough").ok).toBe(false));
T
echo "Made $DIR. Open it in Squibby, then ask your AI tool: 'the signup form refuses my email, fix it'."
