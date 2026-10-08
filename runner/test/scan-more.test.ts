import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFiles, scanProject } from "../src/ship/scan.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "scanmore-")); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

describe("more secret shapes", () => {
  test.each([
    ["const u = 'postgres://admin:hunter2hunter2@db.example.com/app'", "password inside a web address"],
    ["fetch(u, { headers: { Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789' } })", "login token"],
    ["const k = 'AIzaSyA1234567890abcdefghijklmnopqrstuv'", "Google API key"],
    ["url = 'https://hooks.slack.com/services/T0000000/B0000000/XXXXXXXXXXXXXXXXXXXXXXXX'", "Slack webhook"],
    ["const s = 'rk_live_abcdefghijklmnop1234'", "Stripe live key"],
  ])("%s", (line, kind) => {
    expect(scanFiles({ "a.ts": line }).map((f) => f.kind)).toContain(kind);
  });
  test("an ordinary web address is not a secret", () => {
    expect(scanFiles({ "a.ts": "const u = 'https://example.com/path?x=1'" })).toEqual([]);
  });
});

describe("walking a folder", () => {
  test("links are not followed and virtual environments are skipped", () => {
    const d = tmp(), outside = tmp();
    writeFileSync(join(outside, "secret.txt"), "const k = 'sk_live_abcdefghijklmnop1234'");
    symlinkSync(outside, join(d, "linked"));
    mkdirSync(join(d, ".venv")); writeFileSync(join(d, ".venv", "x.py"), "k = 'sk_live_abcdefghijklmnop1234'");
    writeFileSync(join(d, "index.html"), "<p>hi</p>");
    expect(scanProject(d).findings).toEqual([]);
  });
  test("a settings file git does not ignore with a real value is reported, an ignored one is not", () => {
    const d = tmp();
    writeFileSync(join(d, ".env"), "DATABASE_PASSWORD=correcthorsebatterystaple\n");
    expect(scanProject(d).findings.map((f) => f.kind)).toContain("secret in a settings file");
    writeFileSync(join(d, ".gitignore"), ".env\n");
    expect(scanProject(d).findings).toEqual([]);
  });
  test("placeholders in a template settings file are fine", () => {
    const d = tmp();
    writeFileSync(join(d, ".env.example"), "API_SECRET=your_secret_here\n");
    expect(scanProject(d).findings).toEqual([]);
  });
  test("a file in a published folder that could not be read is reported", () => {
    const d = tmp(); mkdirSync(join(d, "dist"));
    writeFileSync(join(d, "dist", "big.js"), "a".repeat(1_100_000));
    expect(scanProject(d).unreadablePublic).toBe(1);
  });
});
