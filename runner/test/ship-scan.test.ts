// The secret scan: before anything goes on the internet, look for keys, tokens and passwords in what would be published,
// including the ones that end up readable by every visitor of the site.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprint, scanFiles, scanProject, type Finding } from "../src/ship/scan.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-sc-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };
const kinds = (f: Finding[]) => f.map((x) => x.kind);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: object) => `eyJ${b64({ alg: "HS256", typ: "JWT" }).slice(3)}.${b64(payload)}.abcdefghijklmnopqrstuvwxyz0123`;

describe("what counts as a secret", () => {
  test("live payment keys, cloud keys and tokens in source are found", () => {
    const f = scanFiles({ "src/pay.js": 'const k = "sk_live_abcdefghijklmnopqrstuvwxyz"; const a = "AKIAABCDEFGHIJKLMNOP"; const g = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"; const s = "xoxb-1234567890-abcdefghij"' });
    expect(kinds(f).sort()).toEqual(["AWS key", "GitHub token", "Slack token", "Stripe live key"]);
  });
  test("a private key block is found", () => expect(kinds(scanFiles({ "k.pem": "-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----" }))).toEqual(["private key"]));
  test("a password or secret assigned in code is found", () => {
    expect(kinds(scanFiles({ "a.js": 'const password = "correcthorsebatterystaple"' }))).toEqual(["password or secret in code"]);
    expect(kinds(scanFiles({ "a.py": 'API_SECRET = "a1b2c3d4e5f6g7h8i9j0"' }))).toEqual(["password or secret in code"]);
  });
  test("ordinary text and short or empty values are not secrets", () => {
    expect(scanFiles({ "a.js": 'const password = ""; const token = process.env.TOKEN; const name = "hello world"; // password: hunter2' })).toEqual([]);
    expect(scanFiles({ "README.md": "Set your key in the env file. Never commit sk_live keys." })).toEqual([]);
  });
  test("keys meant to be public are fine: Stripe publishable keys and Supabase anon keys", () => {
    expect(scanFiles({ "a.js": 'Stripe("pk_live_abcdefghijklmnopqrstuvwxyz")' })).toEqual([]);
    expect(scanFiles({ "a.js": `createClient(url, "${jwt({ role: "anon", iss: "supabase" })}")` })).toEqual([]);
  });
  test("a Supabase service role key is a secret", () => {
    expect(kinds(scanFiles({ "a.js": `const k = "${jwt({ role: "service_role", iss: "supabase" })}"` }))).toEqual(["Supabase service key"]);
  });
  test("other login tokens are secrets", () => expect(kinds(scanFiles({ "a.js": `const t = "${jwt({ sub: "123", name: "Pat" })}"` }))).toEqual(["login token"]));
});

describe("keys that every visitor can read", () => {
  test("a secret sounding name in a public setting is blocked even with an ordinary looking value", () => {
    const f = scanFiles({ ".env.production": "NEXT_PUBLIC_STRIPE_SECRET_KEY=hello_world_not_a_key_xx\nVITE_ADMIN_PASSWORD=abc\nNEXT_PUBLIC_SITE_NAME=Studio\nNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_abcdefghijklmnopqrstuvwxyz" });
    expect(f.map((x) => x.kind)).toEqual(["secret in a public setting", "secret in a public setting"]);
    expect(f.map((x) => x.line)).toEqual([1, 2]);
  });
  test("a harmless public setting passes", () => expect(scanFiles({ ".env": "NEXT_PUBLIC_SITE_NAME=Studio\nVITE_API_URL=https://api.example.com" })).toEqual([]));
  test("every kind of public prefix is understood", () => {
    for (const p of ["NEXT_PUBLIC_", "VITE_", "REACT_APP_", "PUBLIC_", "NUXT_PUBLIC_", "EXPO_PUBLIC_", "GATSBY_"]) {
      expect(kinds(scanFiles({ ".env": `${p}DB_SECRET=something_long_enough_here` })), p).toEqual(["secret in a public setting"]);
    }
  });
  test("a private setting with a secret name is not a public one", () => expect(scanFiles({ ".env": "STRIPE_SECRET_KEY=hello_world_not_a_key_xx" })).toEqual([]));
});

describe("what is reported", () => {
  const f = scanFiles({ "src/app.js": 'line one\nconst k = "sk_live_abcdefghijklmnopqrstuvwxyz";' })[0];
  test("the file, the line and the kind, in words", () => {
    expect(f).toMatchObject({ file: "src/app.js", line: 2, kind: "Stripe live key" });
    expect(f.message).toMatch(/src\/app\.js/);
    expect(f.message).toMatch(/line 2/);
    expect(f.advice.length).toBeGreaterThan(10);
  });
  test("the secret itself is never repeated in the report", () => {
    expect(JSON.stringify(f)).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(f.preview).toMatch(/\[hidden/);
  });
  test("one finding per place, not one per detector", () => {
    expect(scanFiles({ "a.js": 'const password = "sk_live_abcdefghijklmnopqrstuvwxyz"' }).length).toBe(1);
  });
  test("a finding has a stable fingerprint, so it can be marked as not a secret", () => {
    const again = scanFiles({ "src/app.js": 'line one\nconst k = "sk_live_abcdefghijklmnopqrstuvwxyz";' })[0];
    expect(fingerprint(f)).toBe(fingerprint(again));
    const moved = scanFiles({ "src/app.js": '\n\nline one\nconst k = "sk_live_abcdefghijklmnopqrstuvwxyz";' })[0];
    expect(fingerprint(moved)).toBe(fingerprint(f));
    expect(fingerprint(f)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
  test("an allowed fingerprint is left out", () => {
    expect(scanFiles({ "src/app.js": 'line one\nconst k = "sk_live_abcdefghijklmnopqrstuvwxyz";' }, { allow: new Set([fingerprint(f)]) })).toEqual([]);
  });
});

describe("scanning a real folder", () => {
  test("source files and built files are both scanned, heavy folders are not", () => {
    const d = tmp();
    put(d, { "src/a.js": 'x = "sk_live_abcdefghijklmnopqrstuvwxyz"', "dist/assets/index-1.js": 'y = "AKIAABCDEFGHIJKLMNOP"', "node_modules/pkg/i.js": 'z = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"', ".git/config": 'w = "sk_live_abcdefghijklmnopqrstuvwxyz"' });
    const r = scanProject(d);
    expect(r.findings.map((x) => x.file).sort()).toEqual(["dist/assets/index-1.js", "src/a.js"]);
    expect(r.scanned).toBe(2);
  });
  test("a built bundle is marked as something visitors download", () => {
    const d = tmp(); put(d, { "dist/index.js": 'k = "sk_live_abcdefghijklmnopqrstuvwxyz"', "src/a.js": 'k = "sk_live_abcdefghijklmnopqrstuvwxyz"' });
    const r = scanProject(d);
    expect(r.findings.find((x) => x.file === "dist/index.js")?.public).toBe(true);
    expect(r.findings.find((x) => x.file === "src/a.js")?.public).toBe(false);
    expect(r.findings.find((x) => x.file === "dist/index.js")?.message).toMatch(/anyone who opens your site/i);
  });
  test("a secret in an env file that git ignores is fine; one that would be published is not", () => {
    const ok = tmp(); put(ok, { ".gitignore": "node_modules\n.env\n.env.*\n", ".env": "STRIPE_SECRET_KEY=sk_live_abcdefghijklmnopqrstuvwxyz" });
    expect(scanProject(ok).findings).toEqual([]);
    const bad = tmp(); put(bad, { ".env": "STRIPE_SECRET_KEY=sk_live_abcdefghijklmnopqrstuvwxyz" });
    const r = scanProject(bad);
    expect(r.findings.length).toBe(1);
    expect(r.findings[0].advice).toMatch(/\.gitignore/);
  });
  test("an ignored env file with a secret in a PUBLIC setting still blocks, because the build would put it in the site", () => {
    const d = tmp(); put(d, { ".gitignore": ".env\n", ".env": "NEXT_PUBLIC_SECRET_TOKEN=this_will_be_public_xx" });
    expect(kinds(scanProject(d).findings)).toEqual(["secret in a public setting"]);
  });
  test("large and binary files are skipped, and the count says so", () => {
    const d = tmp(); put(d, { "big.txt": "a".repeat(3_000_000), "image.png": "\u0000\u0001\u0002 sk_live_abcdefghijklmnopqrstuvwxyz", "ok.js": "1" });
    const r = scanProject(d);
    expect(r.findings).toEqual([]);
    expect(r.skipped).toBeGreaterThanOrEqual(2);
  });
  test("a folder that does not exist is nothing to scan, not a crash", () => expect(scanProject("/nowhere/at/all")).toEqual({ findings: [], scanned: 0, skipped: 0 }));
  test("a project with a thousand files finishes quickly", () => {
    const d = tmp(); for (let i = 0; i < 1000; i++) put(d, { [`src/f${i}.js`]: `export const n${i} = ${i};` });
    const t0 = Date.now(); const r = scanProject(d);
    expect(r.scanned).toBe(1000); expect(Date.now() - t0).toBeLessThan(3000);
  });
});
