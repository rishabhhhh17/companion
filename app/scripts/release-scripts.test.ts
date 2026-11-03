// Offline checks of the release scripts: they must parse, refuse safely without credentials, and never need the network, the
// Keychain or Apple to say what they need. Nothing here signs, notarizes, uploads or launches anything.
import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  // Must fix 6: a release is built only from a commit the whole gate passed on, with nothing uncommitted. The check comes
  // first, before any tool, Keychain or network step.
  test("release.sh refuses a tree with uncommitted changes, or a commit the gate has not passed, before anything else", () => {
    const r = run("release.sh", [], { COMPANION_SIGN_ID: "Developer ID Application: Nobody (TEAM)" });
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/FAIL: (there are uncommitted changes|the full test suite has not passed on commit)/);
    expect(r.out).not.toContain("signing certificate");
    const src = readFileSync(join(dir, "release.sh"), "utf8");
    const real = src.slice(src.indexOf(": \"${COMPANION_SIGN_ID:?"));
    expect(real.indexOf("tested-mark.sh check")).toBeGreaterThan(-1);
    expect(real.indexOf("tested-mark.sh check")).toBeLessThan(real.indexOf("for t in xcrun"));
  });

  test("the note of a tested commit is written only on a clean tree, and names only that commit", () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), "companion-tested-")));
    try {
      mkdirSync(join(repo, "scripts"));
      copyFileSync(join(appDir, "../scripts/tested-mark.sh"), join(repo, "scripts/tested-mark.sh"));
      writeFileSync(join(repo, ".gitignore"), ".tested-head\n");
      writeFileSync(join(repo, "a.txt"), "one\n");
      const env = { PATH: process.env.PATH ?? "", HOME: repo, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
      const git = (...a: string[]) => Bun.spawnSync(["git", ...a], { cwd: repo, env });
      git("init", "-q"); git("add", "-A"); git("commit", "-qm", "one");
      const mark = (a: string) => { const p = Bun.spawnSync(["sh", "scripts/tested-mark.sh", a], { cwd: repo, env }); return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() }; };
      expect(mark("check").out).toContain("has not passed");
      expect(mark("write").code).toBe(0);
      expect(mark("check").code).toBe(0);
      writeFileSync(join(repo, "a.txt"), "two\n");
      expect(mark("check").out).toContain("uncommitted changes");
      mark("write");
      git("commit", "-qam", "two");
      expect(mark("check").out).toContain("has not passed");   // the note named the old commit, and the dirty write left none
      mark("write");
      expect(mark("check").code).toBe(0);
      mark("clear");
      expect(mark("check").code).not.toBe(0);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  // Must fix 22: a build whose problem reports reach nobody is refused, with an override like the updater one; the real
  // run also installs Claude for real once.
  test("release.sh refuses an empty report.json and runs the real Claude install test before building", () => {
    const src = readFileSync(join(dir, "release.sh"), "utf8");
    const real = src.slice(src.indexOf(": \"${COMPANION_SIGN_ID:?"));
    expect(real).toContain("COMPANION_ALLOW_NO_REPORT");
    expect(real).toContain("report.json is empty");
    expect(real).toContain("cargo test real_install -- --ignored");
    expect(real.indexOf("cargo test real_install")).toBeLessThan(real.indexOf("sh scripts/build-app.sh"));
    const dry = run("release.sh", ["--dry-run"]);
    expect(dry.out).toContain("report.json (where problem reports go):");
    expect(dry.out).toContain("tested commit:");
  });

  // Must fix 22: latest.json names this version's own download, never the "latest" address that moves with each release.
  test("an update names its own version's download address", () => {
    const url = (endpoint: string, v: string) => { const p = Bun.spawnSync(["bash", join(dir, "build-update.sh"), "--url-for", endpoint, v]); return p.stdout.toString().trim(); };
    expect(url("https://github.com/me/companion-releases/releases/latest/download/latest.json", "0.2.0")).toBe("https://github.com/me/companion-releases/releases/download/v0.2.0/Squibby.app.tar.gz");
    expect(url("https://example.com/updates/latest.json", "0.2.0")).toBe("https://example.com/updates/v0.2.0/Squibby.app.tar.gz");
  });

  // Must fix 19: rule 8 never bends. The lint passes on today's code and catches each way a question could reach launch.
  test("the permission lint passes today, and fails on an event tap, a new asker or a question in setup", () => {
    const lint = (d?: string) => { const p = Bun.spawnSync(["bash", join(dir, "lint-permissions.sh"), ...(d ? [d] : [])]); return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() }; };
    const today = lint();
    expect(today.out).toContain("PASS");
    expect(today.code).toBe(0);
    const fixture = (files: Record<string, string>) => {
      const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-lint-")));
      const base: Record<string, string> = {
        "ax.rs": "pub fn trusted(ask: bool) -> bool { AXIsProcessTrustedWithOptions(d) }\n",
        "phelp.rs": "fn on_hotkey() {\n    if !ax::trusted(true) { return; }\n}\n",
        "main.rs": "fn main() {\n    tauri::Builder::default()\n        .setup(move |app| {\n            log(\"launch\");\n            Ok(())\n        })\n        .run();\n}\n",
      };
      for (const [n, t] of Object.entries({ ...base, ...files })) writeFileSync(join(d, n), t);
      return d;
    };
    const made: string[] = [];
    try {
      const ok = fixture({}); made.push(ok);
      expect(lint(ok).code).toBe(0);
      const tap = fixture({ "keys.rs": "fn listen() { CGEventTapCreate(1); }\n" }); made.push(tap);
      expect(lint(tap).out).toContain("Input Monitoring");
      const other = fixture({ "home.rs": "fn open_home() {\n    ax::trusted(true);\n}\n" }); made.push(other);
      expect(lint(other).out).toContain("home.rs:open_home");
      const setup = fixture({ "main.rs": "fn main() {\n    tauri::Builder::default()\n        .setup(move |app| {\n            voice_mac::ask_for_mic();\n            Ok(())\n        })\n        .run();\n}\n" }); made.push(setup);
      const r = lint(setup);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("setup asks for a permission at launch");
    } finally { for (const d of made) rmSync(d, { recursive: true, force: true }); }
  });
});
