// Offline checks of the release scripts: they must parse, refuse safely without credentials, and never need the network, the
// Keychain or Apple to say what they need. Nothing here signs, notarizes, uploads or launches anything.
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const dir = dirname(new URL(import.meta.url).pathname);
const appDir = join(dir, "..");

function run(script: string, args: string[], env: Record<string, string> = {}) {
  const clean: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
  const p = Bun.spawnSync(["bash", join(dir, script), ...args], { cwd: appDir, env: { ...clean, ...env }, stdin: "ignore" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}

describe("release scripts", () => {
  test("every script parses", () => {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sh"))) {
      const p = Bun.spawnSync(["bash", "-n", join(dir, f)]);
      expect(`${f} ${p.exitCode} ${p.stderr.toString()}`).toBe(`${f} 0 `);
    }
  });

  test("release.sh --dry-run lists every step and the credentials, and succeeds without any", () => {
    const r = run("release.sh", ["--dry-run"]);
    expect(r.code).toBe(0);
    for (const s of ["Developer ID Application", "notary profile", "Staple", "disk image", "COMPANION_SIGN_ID", "updater.json"]) expect(r.out).toContain(s);
    expect(r.out).toContain("NOT SET");
  });

  test("release.sh without a signing identity stops at once with a plain message", () => {
    const r = run("release.sh", []);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("COMPANION_SIGN_ID");
    expect(r.out).toContain("--dry-run");
  });

  test("make-update-key.sh refuses a missing or non https address before touching the Keychain", () => {
    expect(run("make-update-key.sh", []).code).not.toBe(0);
    const r = run("make-update-key.sh", ["http://example.com/latest.json"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("https://");
  });

  test("build-update.sh needs notes, and an empty updater.json stops it before signing", () => {
    expect(run("build-update.sh", []).code).not.toBe(0);
    const src = Bun.file(join(appDir, "src-tauri/updater.json"));
    return src.json().then((cfg: { pubkey: string; endpoint: string }) => {
      if (cfg.endpoint) return; // already set up: the empty case is not testable here
      const r = run("build-update.sh", ["notes"]);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("updater.json is not filled in");
    });
  });

  test("the release config keeps its promises: macOS 14, no Dock icon, hardened runtime in the signing step", async () => {
    const conf = await Bun.file(join(appDir, "src-tauri/tauri.conf.json")).json();
    expect(conf.bundle.macOS.minimumSystemVersion).toBe("14.0");
    const plist = await Bun.file(join(appDir, "src-tauri/Info.plist")).text();
    expect(plist).toContain("<key>LSUIElement</key>");
    expect(plist).toMatch(/NSMicrophoneUsageDescription<\/key>\s*<string>[^<]{20,}/);
    const build = await Bun.file(join(dir, "build-app.sh")).text();
    expect(build).toContain("--options runtime --timestamp");
    expect(conf.bundle.macOS.files["Resources/engine"]).toBeDefined(); // the Claude binary goes in as a file, never as an externalBin
    expect(conf.bundle.externalBin).toBeUndefined();
  });
});
