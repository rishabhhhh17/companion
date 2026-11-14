// M92: signing ready. Offline checks of sign-release.sh: the dry run is green today and says what is missing, and the real
// run refuses a missing or wrong name before it runs anything else. Nothing here signs, notarizes, builds, uploads, opens
// the Keychain or reaches the network: a stand in for each of those tools is first on PATH and leaves a mark if it runs.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const dir = dirname(new URL(import.meta.url).pathname);
const appDir = join(dir, "..");
const rootDir = join(appDir, "..");
const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const temp = (name: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), name))); made.push(d); return d; };

// Tools that must never run in these tests. Each stand in writes its name to a marks file and fails.
const NEVER = ["security", "cargo", "hdiutil", "ditto", "spctl", "curl", "npm", "npx"];
function tripwires(noDevTools = false): { bin: string; marks: string } {
  const d = temp("companion-sign-trip-");
  const bin = join(d, "bin"); mkdirSync(bin);
  const marks = join(d, "marks");
  for (const t of NEVER) { const f = join(bin, t); writeFileSync(f, `#!/bin/sh\necho ${t} >> '${marks}'\nexit 97\n`); chmodSync(f, 0o755); }
  // xcrun may only be asked where a tool is (xcrun --find), never to run notarytool or stapler.
  const x = join(bin, "xcrun");
  // noDevTools: a Mac without Xcode or the Command Line Tools, where xcrun is there but finds no notarytool or stapler.
  const find = noDevTools ? "exit 1" : `exec /usr/bin/xcrun "$@"`;
  writeFileSync(x, `#!/bin/sh\nif [ "$1" = "--find" ]; then ${find}; fi\necho "xcrun $1" >> '${marks}'\nexit 97\n`); chmodSync(x, 0o755);
  return { bin, marks };
}
const ran = (marks: string) => (existsSync(marks) ? readFileSync(marks, "utf8").trim() : "");

const GOOD = { APPLE_SIGNING_IDENTITY: "Developer ID Application: Test Person (ABCDE12345)", APPLE_TEAM_ID: "ABCDE12345", SQUIBBY_NOTARY_PROFILE: "squibby-notary" };

function run(args: string[], env: Record<string, string> = {}, noDevTools = false) {
  const t = tripwires(noDevTools);
  const clean: Record<string, string> = { PATH: `${t.bin}:${process.env.PATH ?? ""}`, HOME: process.env.HOME ?? "" };
  const p = Bun.spawnSync(["bash", join(dir, "sign-release.sh"), ...args], { cwd: appDir, env: { ...clean, ...env }, stdin: "ignore" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString(), ran: ran(t.marks) };
}

const sdkClaude = join(rootDir, "runner/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude");

describe("sign-release.sh (M92)", () => {
  test("the dry run is green with no names set, lists each missing name, and runs nothing risky", () => {
    const r = run(["--dry-run"]);
    expect(r.out).toContain("DRY RUN");
    expect(r.code).toBe(0);
    for (const n of ["APPLE_SIGNING_IDENTITY", "APPLE_TEAM_ID", "SQUIBBY_NOTARY_PROFILE"]) expect(r.out).toContain(`${n}: NOT SET`);
    expect(r.out).toContain("Missing before a real run:");
    expect(r.out).toContain("NOT READY");
    expect(r.ran).toBe("");
  }, 60_000);

  test("the dry run checks the entitlements, the Claude copy and the repo, and says why there is no JIT entitlement", () => {
    const r = run(["--dry-run"], GOOD);
    expect(r.code).toBe(0);
    expect(r.out).toContain("entitlements: exactly com.apple.security.device.audio-input");
    expect(r.out).toContain("no signing files in the repo");
    expect(r.out).toMatch(/allow-jit/);
    if (existsSync(sdkClaude)) expect(r.out).toContain("Claude in the SDK package: signed by Anthropic PBC (Q6L2SF6YDW)");
    // With every name set and well formed, nothing about the names is missing (the identity itself is checked in the real run).
    expect(r.out).not.toContain("NOT SET");
    expect(r.out).toContain("APPLE_TEAM_ID: set (ABCDE12345, matches the identity)");
    expect(r.ran).toBe("");
  }, 60_000);

  test("the dry run's final list carries what the release steps found missing: a Mac without notarytool is NOT READY", () => {
    // M92 review: release.sh's own MISSING and MISMATCH lines, and a tested commit that is not a pass, were printed but never
    // reached the final list, so all names set could still print READY above a notarytool MISSING line.
    const r = run(["--dry-run"], GOOD, true);
    expect(r.code).toBe(0);
    expect(r.out).toContain("tool notarytool: MISSING");
    const list = r.out.slice(r.out.indexOf("Missing before a real run:"));
    expect(r.out).toContain("Missing before a real run:");
    expect(list).toContain("  - tool notarytool: MISSING");
    expect(list).toContain("  - tool stapler: MISSING");
    expect(r.out).toContain("NOT READY");
    expect(r.out).not.toContain("READY to run for real");
    expect(r.ran).toBe("");
  }, 60_000);

  test("the dry run lists a tested commit that is not a pass (this worktree has changes, so it never is here)", () => {
    const r = run(["--dry-run"], GOOD);
    const dirty = Bun.spawnSync(["git", "--no-optional-locks", "status", "--porcelain"], { cwd: rootDir }).stdout.toString().trim() !== "";
    if (!dirty) return;   // a clean, tested checkout: nothing to list for this line
    const list = r.out.slice(r.out.indexOf("Missing before a real run:"));
    expect(list).toMatch(/  - tested commit: there are uncommitted changes/);
    expect(r.out).toContain("NOT READY");
  }, 60_000);

  test("the real run refuses when any one name is missing, names it, and runs nothing", () => {
    for (const missing of Object.keys(GOOD)) {
      const env: Record<string, string> = { ...GOOD };
      delete env[missing];
      const r = run([], env);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(`${missing} is not set`);
      expect(r.out).toContain("--dry-run");
      expect(r.ran).toBe("");
      expect(r.out).not.toContain("tested");   // stopped before the tested commit check, the build and the Keychain
    }
  }, 60_000);

  test("the real run refuses a wrong identity, a team that does not match, or an odd profile name, before anything", () => {
    const cases: [Record<string, string>, string][] = [
      [{ ...GOOD, APPLE_SIGNING_IDENTITY: "Apple Development: Test Person (ABCDE12345)" }, "Developer ID Application"],
      [{ ...GOOD, APPLE_TEAM_ID: "ZZZZZ99999" }, "does not end with (ZZZZZ99999)"],
      [{ ...GOOD, APPLE_TEAM_ID: "abc", APPLE_SIGNING_IDENTITY: "Developer ID Application: Test Person (abc)" }, "10 capital letters and digits"],
      [{ ...GOOD, SQUIBBY_NOTARY_PROFILE: "my profile; rm -rf" }, "SQUIBBY_NOTARY_PROFILE"],
    ];
    for (const [env, says] of cases) {
      const r = run([], env);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(says);
      expect(r.ran).toBe("");
    }
  }, 60_000);

  test("it reads names only: no password, no key file, and notarizes through a stored keychain profile", () => {
    const src = readFileSync(join(dir, "sign-release.sh"), "utf8");
    const code = src.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
    expect(code).not.toMatch(/--password|APPLE_PASSWORD|APPLE_ID_PASSWORD|--key |--key-id|--issuer|security (import|unlock|add|delete|find-generic)/);
    // Key file names appear only in the check that refuses them when they are committed.
    for (const l of code.split("\n").filter((l) => /\.p12|\.p8\b/.test(l))) expect(l).toMatch(/git ls-files|no \.p12/);
    expect(code).toContain("COMPANION_NOTARY_PROFILE=\"$SQUIBBY_NOTARY_PROFILE\"");
    const rel = readFileSync(join(dir, "release.sh"), "utf8");
    expect(rel).toContain("--keychain-profile \"$PROFILE\"");
    // Anthropic's binary is never signed or changed by us: no codesign that writes is aimed at it.
    expect(code).not.toMatch(/codesign[^\n]*--sign[^\n]*claude/i);
  });

  test("the entitlements are exactly the microphone: no JIT, no camera, no library validation switched off", () => {
    const p = Bun.spawnSync(["plutil", "-convert", "json", "-o", "-", join(appDir, "src-tauri/Entitlements.plist")]);
    expect(Object.keys(JSON.parse(p.stdout.toString()))).toEqual(["com.apple.security.device.audio-input"]);
  });

  test("--verify-only refuses an app with any Claude binary inside it (M22), before the signature checks", () => {
    const d = temp("companion-sign-app-");
    const app = join(d, "Squibby.app");
    mkdirSync(join(app, "Contents/Resources/engine/bin"), { recursive: true });
    writeFileSync(join(app, "Contents/Resources/engine/bin/claude"), "not anthropic's\n");
    const r = run(["--verify-only", app], GOOD);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("a Claude binary is inside the app");
    expect(r.out).not.toContain("signature verifies");
    expect(r.ran).toBe("");
  }, 60_000);

  test("--verify-only on an app with no Claude inside goes on to the signature checks, and an unsigned one fails them", () => {
    const d = temp("companion-sign-app-");
    const app = join(d, "Squibby.app");
    mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
    writeFileSync(join(app, "Contents/MacOS/squibby"), "#!/bin/sh\n");
    const r = run(["--verify-only", app], GOOD);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("no Claude binary inside the app");
    expect(r.out).toContain("FAIL: the app's signature does not verify");
  }, 60_000);

  test("--check-claude passes Anthropic's own copy and refuses a copy changed by one byte", () => {
    if (!existsSync(sdkClaude)) return;   // runner packages not installed: nothing to compare
    const ok = run(["--check-claude", sdkClaude]);
    expect(ok.out).toContain("signed by Anthropic PBC (Q6L2SF6YDW)");
    expect(ok.code).toBe(0);
    const d = temp("companion-sign-claude-");
    const bad = join(d, "claude");
    copyFileSync(sdkClaude, bad);
    writeFileSync(bad, Buffer.from([0]), { flag: "a" });
    const r = run(["--check-claude", bad]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("FAIL");
    expect(r.out).toContain("not the same bytes as the SDK package's copy");
  }, 60_000);
});
