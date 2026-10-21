// The proof ladder on Rust and Swift projects with this Mac's real tools, and the real javac and go when they are there.
// (A failing Swift Testing test is not run for real here: on a Mac with only the command line tools, Swift sometimes cannot find
// the toolchain's own TestingMacros plugin on a rebuild, which says nothing about Companion. Its real output is in
// fixtures/errors/swift-testing-issue.txt, captured once, and read by native-locate.)
// Every test skips cleanly when its tool is missing (a probe command decides, so the stand in java, swift and xcodebuild
// that macOS keeps in /usr/bin without anything behind them are not mistaken for the real ones). The projects are tiny, in
// temporary folders, with no packages: nothing is installed and nothing reaches the network. Xcode runs when this Mac has
// it (the selected one, or one in /Applications used through DEVELOPER_DIR). Maven and Gradle are not run here, because they
// always fetch their plugins from the internet; their commands and their output readers are covered by native-detect,
// native-ladder and native-locate.
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { detectNative } from "../src/proof/native.ts";
import { locateProblem } from "../src/proof/locate.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-natreal-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); } };
const probe = (cmd: string[]) => { try { return Bun.spawnSync(cmd, { env: { PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH ?? ""}`, HOME: process.env.HOME ?? "" } }).exitCode === 0; } catch { return false; } };
const cargo = probe(["cargo", "--version"]);
const swiftOk = probe(["swift", "--version"]);
const javac = probe(["javac", "-version"]);
const go = probe(["go", "version"]);
const on = (ok: boolean) => (ok ? test : test.skip);

// The tests assume every tool is there (test/setup.ts). Here the tools are real, so which of them is really on this Mac is
// looked at for real too (the stand ins macOS keeps for java, swift and xcodebuild, an Xcode that is not the selected one).
async function real<T>(fn: () => Promise<T>): Promise<T> {
  const was = process.env.COMPANION_TEST_ASSUME_TOOLS;
  process.env.COMPANION_TEST_ASSUME_TOOLS = "0";
  try { return await fn(); } finally { if (was === undefined) delete process.env.COMPANION_TEST_ASSUME_TOOLS; else process.env.COMPANION_TEST_ASSUME_TOOLS = was; }
}
async function check(files: Record<string, string>) {
  const dir = tmp();
  put(dir, files);
  const store = new CheckpointStore(tmp(), dir);
  const s = await store.snapshot("now");
  // noInstall: the way Point at the problem runs, so nothing is ever downloaded here.
  const result = await real(() => runLadder({ project: dir, store, beforeId: s.id, afterId: s.id, noInstall: true, noRoomWaitsMs: [] }));
  return { result, dir };
}
const CARGO = '[package]\nname = "shop"\nversion = "0.1.0"\nedition = "2021"\n';

describe("Rust with the real cargo", () => {
  on(cargo)("a healthy project with a test passes, and the build output stays in the project's own target folder", async () => {
    const { result, dir } = await check({ "Cargo.toml": CARGO, "src/lib.rs": "pub fn add(a: i32, b: i32) -> i32 { a + b }\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn adds() { assert_eq!(add(2, 2), 4); }\n}\n" });
    expect(result.steps.map((x) => `${x.rung}:${x.status}`)).toEqual(["install:skipped", "checks:passed", "tests:passed", "start:skipped", "browser:skipped"]);
    expect(["passed", "passed_with_gaps"]).toContain(result.verdict);
    expect(result.steps[2].detail).toMatch(/tests passed/i);
    expect(existsSync(join(dir, "target"))).toBe(true);
  }, 120_000);
  on(cargo)("a type error fails the check with the real place and words", async () => {
    const { result } = await check({ "Cargo.toml": CARGO, "src/main.rs": 'fn total(a: i32, b: i32) -> i32 {\n    a + b\n}\n\nfn main() {\n    let t: i32 = total(1, "two");\n    println!("{}", t);\n}\n' });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("checks");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "src/main.rs", line: 6, message: "mismatched types" });
  }, 120_000);
  on(cargo)("a failing test fails the tests step with the assertion's place", async () => {
    const { result } = await check({ "Cargo.toml": CARGO, "src/lib.rs": "pub fn add(a: i32, b: i32) -> i32 { a + b }\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn adds() {\n        assert_eq!(add(2, 2), 5);\n    }\n}\n" });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("tests");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "src/lib.rs", line: 8 });
    expect((result.failedAt?.problem as { message: string }).message).toContain("left: 4, right: 5");
  }, 120_000);
  on(cargo)("a project that needs a package this check may not download is a gap with the command to run, not a failure", async () => {
    const { result } = await check({ "Cargo.toml": CARGO + '\n[dependencies]\nserde = "1.0.9999"\n', "src/main.rs": "fn main() {}\n" });
    expect(result.verdict).toBe("failed");   // Point at the problem: it found that the project cannot be checked yet
    expect(result.failedAt?.rung).toBe("install");
    expect(result.failedAt?.detail).toContain("cargo fetch");
  }, 120_000);
});

describe("Swift packages with the real swift", () => {
  on(swiftOk)("a type error fails the build with the real place", async () => {
    const { result } = await check({
      "Package.swift": '// swift-tools-version:5.9\nimport PackageDescription\n\nlet package = Package(name: "shop", targets: [.executableTarget(name: "shop", path: "Sources/shop")])\n',
      "Sources/shop/main.swift": 'func total(_ a: Int, _ b: Int) -> Int { a + b }\n\nlet t: Int = total(1, "two")\nprint(t)\n',
    });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("checks");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "Sources/shop/main.swift", line: 3 });
    expect(result.failedAt?.detail).not.toMatch(/swift-frontend/);
  }, 180_000);
});

describe("javac and go, when they are there", () => {
  on(javac)("javac's real error is read to the line", () => {
    const dir = tmp();
    put(dir, { "src/App.java": "public class App {\n    public static void main(String[] args) {\n        System.out.println(totl(1, 2));\n    }\n}\n" });
    const r = Bun.spawnSync(["javac", "-d", "out", "src/App.java"], { cwd: dir, env: { PATH: process.env.PATH ?? "", HOME: dir } });
    expect(r.exitCode).not.toBe(0);
    expect(locateProblem(r.stdout.toString() + r.stderr.toString(), dir, "checks")).toMatchObject({ kind: "line", file: "src/App.java", line: 3 });
  }, 60_000);
  on(go)("go's real error and failing test are read to the line", () => {
    const dir = tmp();
    put(dir, { "go.mod": "module example.com/shop\n\ngo 1.21\n", "main.go": "package main\n\nfunc main() {\n\tprintln(totl(1, 2))\n}\n", "cart/cart.go": "package cart\n\nfunc Total() int { return 1 }\n", "cart/cart_test.go": 'package cart\n\nimport "testing"\n\nfunc TestTotal(t *testing.T) {\n\tif Total() != 2 {\n\t\tt.Errorf("Total() = %d; want 2", Total())\n\t}\n}\n' });
    const env = { PATH: process.env.PATH ?? "", HOME: dir, GOTOOLCHAIN: "local", GOPROXY: "off" };
    const b = Bun.spawnSync(["go", "build", "./..."], { cwd: dir, env });
    expect(b.exitCode).not.toBe(0);
    expect(locateProblem(b.stdout.toString() + b.stderr.toString(), dir, "checks")).toMatchObject({ kind: "line", file: "main.go", line: 4 });
    const t = Bun.spawnSync(["go", "test", "./cart/"], { cwd: dir, env });
    expect(locateProblem(t.stdout.toString() + t.stderr.toString(), dir, "tests")).toMatchObject({ kind: "line", file: "cart/cart_test.go", line: 7 });
  }, 60_000);
});

// Xcode, when this Mac has it: the selected developer folder, or an Xcode in /Applications used through DEVELOPER_DIR.
const xcodeApp = (() => { try { return Bun.spawnSync(["sh", "-c", "ls -d /Applications/Xcode*.app/Contents/Developer 2>/dev/null | head -1"]).stdout.toString().trim(); } catch { return ""; } })();
const xcode = probe(["xcodebuild", "-version"]) || (xcodeApp !== "" && Bun.spawnSync(["xcodebuild", "-version"], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", DEVELOPER_DIR: xcodeApp } }).exitCode === 0);
describe("Xcode with the real xcodebuild", () => {
  on(xcode)("a type error in the shipped Xcode project fails the build, for the Mac only, and the place is the Swift file's line", async () => {
    const dir = tmp();
    cpSync(join(import.meta.dir, "..", "..", "evals", "rescue-projects", "native-cases", "xcode-type-mismatch"), dir, { recursive: true });
    const store = new CheckpointStore(tmp(), dir);
    const s = await store.snapshot("now");
    const result = await real(() => runLadder({ project: dir, store, beforeId: s.id, afterId: s.id, noInstall: true, noRoomWaitsMs: [] }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("checks");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "Shop/main.swift", line: 5, column: 23 });
    expect(result.failedAt?.detail).not.toMatch(/swift-frontend|WARNING|BUILD FAILED/);
  }, 240_000);
});

describe("the Xcode project that ships with the rescue eval is read the way Xcode wrote it", () => {
  test("its Mac scheme is found and built for the Mac only, with signing off", () => {
    const dir = tmp();
    cpSync(join(import.meta.dir, "..", "..", "evals", "rescue-projects", "native-cases", "xcode-type-mismatch"), dir, { recursive: true });
    const d = detectNative(dir, { has: () => true, home: "/nonexistent-home" })!;
    expect(d.setup.ecosystem).toBe("xcode");
    expect(d.setup.schemes).toEqual([{ name: "Shop", macos: true, tests: false, hosted: false, skipTesting: [] }]);
    expect(d.checks[0].command).toBe("xcodebuild -project 'Shop.xcodeproj' -scheme 'Shop' -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= -quiet build");
    expect(d.tests).toBeNull();
  });
});
