// Go, Rust, Java and Kotlin (Maven and Gradle), Swift packages and Xcode projects in the proof ladder: what a project has to
// check, the exact commands (pure functions, so the text is tested), and what to say when something is missing. Reads
// ordinary files only. It never installs a tool, and it never lets a build download packages the person did not allow:
// every command has an offline way that runs first (see the ladder), and the online way runs only when the install setting
// allows it. A missing tool is a plain gap with the command the person can run.
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { minimalEnv } from "../env.ts";
import { shq } from "./exec.ts";
import { PRODUCT } from "../names.ts";

export type Ecosystem = "go" | "rust" | "maven" | "gradle" | "swift" | "xcode";
// command: the way that may download packages. offline: the same without any download, or null when there is no way to run
// it without one (a wrapper whose build tool is not on this Mac yet would download it first).
export type NativeCheck = { name: "typecheck" | "lint" | "build"; command: string; offline: string | null; tool: string };
export type NativeTests = { command: string; offline: string | null; tool: string };
export type Plan = { checks: NativeCheck[]; tests: NativeTests | null };
// tests: the scheme has a test target that is not a UI test target. uiOnly: its only test targets are UI tests (set only then).
export type Scheme = { name: string; macos: boolean; tests: boolean; hosted: boolean; skipTesting: string[]; uiOnly?: true };
// missing: plain words (with the command to run) when a tool this project needs is not on this Mac, else null.
// gaps: things that cannot be checked here whatever is installed (an iPhone only project, tests that open the app); they
//   leave the result at best "passed with gaps" and are not something to install.
// hints: lines for About this project. note: the line for the install rung. downloads: whether a build may fetch packages.
// run: how the person starts it (a suggestion, never run by a check). fetch: what the person can run to fetch packages.
export type NativeSetup = {
  ecosystem: Ecosystem; label: string; missing: string | null; note: string; gaps: string[]; hints: string[];
  downloads: boolean; run: string | null; fetch: string; schemes: Scheme[]; stackNote: string | null;
  // Set only when the project has a mvnw or gradlew: whether the build tool it names is already on this Mac.
  wrapperCached?: boolean;
};
export type NativeDetected = { setup: NativeSetup; checks: NativeCheck[]; tests: NativeTests | null };
// has: whether a tool is on this Mac (tests give their own). home: where package caches live. xcodeApp: an Xcode that is
// installed but not the selected developer folder.
export type NativeEnv = { has?: (tool: string) => boolean; home?: string; xcodeApp?: string | null; exists?: (p: string) => boolean };

const readText = (p: string, max = 400_000): string => { try { const s = statSync(p); return s.isFile() && s.size <= max ? readFileSync(p, "utf8") : ""; } catch { return ""; } };
const has = (dir: string, f: string) => existsSync(join(dir, f));
const names = (dir: string): string[] => { try { return readdirSync(dir); } catch { return []; } };

// Folders that are never the person's own code when looking for tests and source.
const SKIP = new Set(["node_modules", ".git", "target", "build", ".gradle", ".build", "vendor", "Pods", "DerivedData", ".idea", ".venv", "venv", "dist", "out", "Carthage"]);
const subdirs = (dir: string): string[] => { try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return []; } };
/** A file under `dir`, at any depth, that `match` accepts. Folders `skip` refuses are not entered, and links are not followed.
 *  The room (`budget` entries) is for this one search, so a search in one folder never uses up the room of another. */
function walkFind(dir: string, match: (rel: string, name: string) => boolean, skip: (name: string) => boolean, budget = 100_000): string | null {
  let seen = 0;
  const walk = (rel: string): string | null => {
    let entries;
    try { entries = readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true }); } catch { return null; }
    entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    for (const e of entries) {
      if (++seen > budget) return null;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!skip(e.name)) { const hit = walk(r); if (hit) return hit; } }
      else if (e.isFile() && match(r, e.name)) return r;
    }
    return null;
  };
  return walk("");
}
const hidden = (n: string) => n.startsWith(".");
const JVM_CODE = /\.(?:java|kt|scala|groovy)$/;
/** Every `src` folder in the project (a module has its own), whatever the depth: only folders are looked at, and `src` is not entered. */
function srcDirs(dir: string): string[] {
  const out: string[] = [];
  let seen = 0;
  const walk = (rel: string) => {
    for (const n of subdirs(rel ? join(dir, rel) : dir)) {
      if (++seen > 50_000) return;
      const r = rel ? `${rel}/${n}` : n;
      if (n === "src") out.push(r);
      else if (!SKIP.has(n) && !hidden(n)) walk(r);
    }
  };
  walk("");
  return out;
}
/** Does a Java, Kotlin or Scala project have test code? It lives in src/test, in another test source set (src/integrationTest,
 *  src/jvmTest) or in src/<set>/test, of the project or of any module, and is searched there without a depth limit. Folders
 *  named build or out below a test folder are the person's package names, so they are entered. */
function hasJvmTests(dir: string): boolean {
  for (const src of srcDirs(dir)) {
    const roots = subdirs(join(dir, src)).flatMap((n) => (/^test$|Tests?$/.test(n) ? [`${src}/${n}`] : subdirs(join(dir, src, n)).includes("test") ? [`${src}/${n}/test`] : []));
    for (const root of roots) if (walkFind(join(dir, root), (_r, n) => JVM_CODE.test(n), (n) => hidden(n) || n === "node_modules")) return true;
  }
  return false;
}

// ---------------------------------------------------------------- tools on this Mac, and what to say when one is not

type Tool = "go" | "cargo" | "clippy" | "java" | "mvn" | "gradle" | "swift" | "xcodebuild";
const TOOL_BINARY: Partial<Record<Tool, string>> = { go: "go", cargo: "cargo", clippy: "cargo-clippy", mvn: "mvn", gradle: "gradle" };
const CLT = "/Library/Developer/CommandLineTools";

type Machine = { path: string[]; exists: (p: string) => boolean; home: string; javaHome: string | undefined; link: string | null };
function machine(o: NativeEnv): Machine {
  const assumed = process.env.COMPANION_TEST_ASSUME_TOOLS === "1";
  const e = minimalEnv();
  let link: string | null = null;
  try { link = readlinkSync("/var/db/xcode_select_link"); } catch { /* none selected */ }
  return { path: (e.PATH ?? "").split(":").filter(Boolean), exists: o.exists ?? existsSync, home: o.home ?? (assumed ? "/nonexistent-home-for-tests" : e.HOME || homedir()), javaHome: e.JAVA_HOME, link };
}
const onPath = (m: Machine, binary: string) => m.path.find((d) => m.exists(join(d, binary)));
const anyIn = (dir: string) => names(dir).some((n) => !n.startsWith("."));
/** Is a Java Development Kit really set up? macOS's /usr/bin/java is only a stand in that says "Unable to locate a Java Runtime". */
function javaPresent(m: Machine): boolean {
  if (m.javaHome && m.exists(join(m.javaHome, "bin", "java"))) return true;
  const found = onPath(m, "java");
  if (found && found !== "/usr/bin") return true;
  return anyIn("/Library/Java/JavaVirtualMachines") || anyIn(join(m.home, "Library/Java/JavaVirtualMachines"));
}
/** Apple's tools: the shims in /usr/bin exist without anything behind them. */
function swiftPresent(m: Machine): boolean {
  const found = onPath(m, "swift");
  if (found && found !== "/usr/bin") return true;
  if (m.link && /\.app\/Contents\/Developer$/.test(m.link)) return m.exists(join(m.link, "usr/bin/swift"));
  return m.exists(`${CLT}/usr/bin/swift`);
}
const xcodePresent = (m: Machine) => !!m.link && /\.app\/Contents\/Developer$/.test(m.link) && m.exists(join(m.link, "usr/bin/xcodebuild"));
/** An Xcode in /Applications that is not the one macOS points at (it points at the command line tools, say). */
function otherXcode(m: Machine): string | null {
  for (const n of names("/Applications").filter((x) => /^Xcode.*\.app$/.test(x)).sort()) {
    const dev = `/Applications/${n}/Contents/Developer`;
    if (m.exists(join(dev, "usr/bin/xcodebuild"))) return dev;
  }
  return null;
}

function toolCheck(o: NativeEnv): { has: (t: Tool) => boolean; machine: Machine; xcodeApp: string | null } {
  const m = machine(o);
  if (o.has) return { has: (t) => o.has!(t), machine: m, xcodeApp: o.xcodeApp ?? null };
  if (process.env.COMPANION_TEST_ASSUME_TOOLS === "1") return { has: () => true, machine: m, xcodeApp: null };
  return {
    machine: m, xcodeApp: o.xcodeApp !== undefined ? o.xcodeApp : otherXcode(m),
    has: (t) => t === "java" ? javaPresent(m) : t === "swift" ? swiftPresent(m) : t === "xcodebuild" ? xcodePresent(m) : !!onPath(m, TOOL_BINARY[t]!),
  };
}

const NAMES: Record<Tool, { name: string; how: string }> = {
  go: { name: "Go", how: "brew install go (or download it from go.dev/dl)" },
  cargo: { name: "Rust", how: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" },
  clippy: { name: "Rust's clippy", how: "rustup component add clippy" },
  java: { name: "Java", how: "brew install --cask temurin" },
  mvn: { name: "Maven", how: "brew install maven" },
  gradle: { name: "Gradle", how: "brew install gradle" },
  swift: { name: "Swift", how: "xcode-select --install" },
  xcodebuild: { name: "Xcode", how: "xcode-select -s /Applications/Xcode.app/Contents/Developer" },
};
/** Plain words for a tool that is not on this Mac, with the command to install it (never run by Companion). */
export function missingTool(tool: Tool, label: string): string {
  const t = NAMES[tool];
  if (tool === "xcodebuild") return `Xcode is not installed on this Mac, so this ${label} project cannot be built. ${PRODUCT} does not install it. To install it, get Xcode from the App Store, open it once to accept its license, then in Terminal run: sudo ${t.how}`;
  if (tool === "swift") return `Swift is not installed on this Mac (the command line tools are missing), so this ${label} project cannot be checked. ${PRODUCT} does not install it. To install it, in Terminal, run: ${t.how}`;
  return `${t.name} is not installed on this Mac, so this ${label} project cannot be checked. ${PRODUCT} does not install it. To install it, in Terminal, run: ${t.how}`;
}

// ---------------------------------------------------------------- the commands

const GO = "GOTOOLCHAIN=local";   // never download another Go the project's go.mod names
const goCmd = (rest: string, off: boolean) => `${GO} ${off ? "GOPROXY=off " : ""}${rest}`;
export function goPlan(f: { hasTests: boolean }): Plan {
  const one = (rest: string) => ({ command: goCmd(rest, false), offline: goCmd(rest, true), tool: "go" });
  return {
    checks: [{ name: "build", ...one("go build -buildvcs=false ./...") }, { name: "lint", ...one("go vet ./...") }],
    tests: f.hasTests ? one("go test ./...") : null,
  };
}

const RUST = "RUSTUP_AUTO_INSTALL=0";   // never let rustup fetch a toolchain the project names
export function rustPlan(f: { hasTests: boolean; clippy: boolean }): Plan {
  const one = (rest: string) => ({ command: `${RUST} cargo ${rest}`, offline: `${RUST} cargo ${rest} --offline`, tool: "cargo" });
  const checks: NativeCheck[] = [{ name: "typecheck", ...one("check --workspace --all-targets --color never") }];
  if (f.clippy) checks.push({ name: "lint", ...one("clippy --workspace --all-targets --color never") });
  return { checks, tests: f.hasTests ? one("test --workspace --color never") : null };
}

type Wrapper = { cached: boolean } | null;
export function mavenPlan(f: { wrapper: Wrapper; hasTests: boolean; system?: boolean }): Plan {
  const mvn = f.wrapper ? "sh ./mvnw" : "mvn";
  // A wrapper whose Maven is not on this Mac yet downloads it before anything else, whatever flag it is given.
  const offlineMvn = f.wrapper && !f.wrapper.cached ? (f.system ? "mvn" : null) : mvn;
  const one = (goal: string) => ({ command: `${mvn} -B -q ${goal}`, offline: offlineMvn ? `${offlineMvn} -B -q -o ${goal}` : null, tool: "mvn" });
  return { checks: [{ name: "build", ...one("compile") }], tests: f.hasTests ? one("test") : null };
}

// No daemon is left running afterwards, no Java is downloaded for a toolchain, and Kotlin compiles inside Gradle itself.
const GRADLE_FLAGS = "--console=plain --no-daemon -Porg.gradle.java.installations.auto-download=false -Pkotlin.compiler.execution.strategy=in-process";
export function gradlePlan(f: { wrapper: Wrapper; hasTests: boolean; system?: boolean }): Plan {
  const gradle = f.wrapper ? "sh ./gradlew" : "gradle";
  const offlineGradle = f.wrapper && !f.wrapper.cached ? (f.system ? "gradle" : null) : gradle;
  const one = (task: string, quiet: boolean) => ({ command: `${gradle} ${task}${quiet ? " -q" : ""} ${GRADLE_FLAGS}`, offline: offlineGradle ? `${offlineGradle} ${task}${quiet ? " -q" : ""} --offline ${GRADLE_FLAGS}` : null, tool: "gradle" });
  // Quiet for the build, so the compiler's errors are what is left; not for the tests, whose failures Gradle only reports at its normal level.
  return { checks: [{ name: "build", ...one("build -x test", true) }], tests: f.hasTests ? one("test", false) : null };
}

export function swiftPlan(f: { hasTests: boolean }): Plan {
  const one = (verb: string) => ({ command: `swift ${verb}`, offline: `swift ${verb} --disable-automatic-resolution`, tool: "swift" });
  return { checks: [{ name: "build", ...one("build") }], tests: f.hasTests ? one("test") : null };
}

/** In the safety box for checks (box.ts), SwiftPM cannot put the package's manifest and plugins in a sandbox of its own:
 *  macOS gives a program one sandbox, and the box is already one ("sandbox_apply: Operation not permitted", seen on this
 *  Mac). So it is told not to try, and the box holds them instead, with the same rules as the rest of the check. */
export const swiftInBox = (command: string): string => command.replace(/^((?:[A-Z_]+=\S+\s+)*swift (?:build|test|run))(?=\s|$)/, "$1 --disable-sandbox");

export type XcodeFacts = { container: { kind: "project" | "workspace"; name: string }; scheme: string | null; testScheme: string | null; skipTesting: string[]; developerDir: string | null };
// Signing off, so no certificate or account is ever touched; the Mac as the only destination, so no simulator or device.
// No archive, export, install or provisioning update is ever in a command.
export function xcodePlan(f: XcodeFacts): Plan {
  const dev = f.developerDir ? `DEVELOPER_DIR=${shq(f.developerDir)} ` : "";
  const base = (scheme: string) => `${dev}xcodebuild ${f.container.kind === "workspace" ? "-workspace" : "-project"} ${shq(f.container.name)} -scheme ${shq(scheme)} -destination ${shq("platform=macOS")} CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=`;
  const one = (scheme: string, verb: string, skip: string[] = []) => ({
    command: `${base(scheme)}${skip.map((s) => ` -skip-testing:${shq(s)}`).join("")} -quiet ${verb}`,
    offline: `${base(scheme)}${skip.map((s) => ` -skip-testing:${shq(s)}`).join("")} -disableAutomaticPackageResolution -quiet ${verb}`,
    tool: "xcodebuild",
  });
  return {
    checks: f.scheme ? [{ name: "build", ...one(f.scheme, "build") }] : [],
    tests: f.testScheme ? one(f.testScheme, "test", f.skipTesting) : null,
  };
}

// ---------------------------------------------------------------- wrappers (mvnw, gradlew)

// The build tool a wrapper downloads is kept at a known place; when it is all there, the wrapper does not need the internet.
// Not all there: a folder a download began and never finished (Gradle writes a .ok marker when it is done; an unpacked Maven or
// Gradle has its bin folder), and, for Maven Wrapper 3.1 and older, the wrapper jar the script fetches itself when it is missing.
function wrapperCached(dir: string, kind: "maven" | "gradle", home: string, exists: (p: string) => boolean): boolean {
  const props = kind === "maven" ? ".mvn/wrapper/maven-wrapper.properties" : "gradle/wrapper/gradle-wrapper.properties";
  const text = readText(join(dir, props), 20_000);
  const url = /^\s*distributionUrl\s*=\s*(\S+)\s*$/m.exec(text)?.[1]?.replace(/\\:/g, ":") ?? "";
  const dist = /([^/]+?)\.zip$/.exec(url)?.[1];
  if (!dist || !/^[\w.-]+$/.test(dist)) return false;
  const root = join(home, kind === "maven" ? ".m2/wrapper/dists" : ".gradle/wrapper/dists", dist);
  if (!exists(root)) return false;
  const complete = names(root).filter((h) => !h.startsWith(".")).some((h) => {
    const folder = join(root, h), inside = names(folder);
    return (kind === "gradle" && inside.some((f) => f.endsWith(".ok"))) || inside.some((c) => exists(join(folder, c, "bin", kind === "maven" ? "mvn" : "gradle")));
  });
  if (!complete) return false;
  if (kind === "maven" && /^\s*wrapperUrl\s*=/m.test(text) && !has(dir, ".mvn/wrapper/maven-wrapper.jar")) return false;
  return true;
}

// ---------------------------------------------------------------- Xcode projects (read from their files)

type PbxObject = { isa: string; text: string };
/** The objects of a project.pbxproj, by id. Xcode writes each at two tabs, on one line or as a block. */
function pbxObjects(text: string): Map<string, PbxObject> {
  const out = new Map<string, PbxObject>();
  const isa = (t: string) => /\bisa = (\w+);/.exec(t)?.[1] ?? "";
  let id: string | null = null, buf: string[] = [];
  for (const l of text.split("\n")) {
    if (id === null) {
      const one = /^\t\t(\w+)(?: \/\*.*?\*\/)? = \{(.*)\};\s*$/.exec(l);
      if (one) { out.set(one[1], { isa: isa(one[2]), text: one[2] }); continue; }
      const open = /^\t\t(\w+)(?: \/\*.*?\*\/)? = \{\s*$/.exec(l);
      if (open) { id = open[1]; buf = []; }
    } else if (/^\t\t\};\s*$/.test(l)) { out.set(id, { isa: isa(buf.join("\n")), text: buf.join("\n") }); id = null; }
    else buf.push(l);
  }
  return out;
}
const field = (text: string, name: string): string | null => { const m = new RegExp(`^\\s*${name} = ("[^"]*"|[^;\\n]+);`, "m").exec(text); return m ? m[1].replace(/\s*\/\*.*?\*\/\s*$/, "").replace(/^"|"$/g, "") : null; };
const refs = (text: string, name: string): string[] => { const m = new RegExp(`${name} = \\(([^)]*)\\);`).exec(text); return m ? [...m[1].matchAll(/\b([0-9A-Fa-f]{24})\b/g)].map((x) => x[1]) : []; };
type Target = { name: string; type: string; macos: boolean; hosted: boolean };
// A test target takes its settings from an .xcconfig file when its build configuration names one. Companion does not read those,
// and TEST_HOST (the app the tests run inside) is a setting they often hold, so such a target may be hosted.
const fromXcconfig = (settings: string) => /\bbaseConfigurationReference = /.test(settings);

function settingsOf(objects: Map<string, PbxObject>, listId: string | null): string {
  const list = listId ? objects.get(listId) : undefined;
  return list ? refs(list.text, "buildConfigurations").map((c) => objects.get(c)?.text ?? "").join("\n") : "";
}
// Which platforms a block of build settings builds for: SDKROOT, and SUPPORTED_PLATFORMS for the multiplatform "auto".
function platforms(settings: string): Set<string> | null {
  const out = new Set<string>();
  for (const m of settings.matchAll(/\bSDKROOT = "?(\w+)"?;/g)) if (m[1] !== "auto") out.add(m[1]);
  for (const m of settings.matchAll(/\bSUPPORTED_PLATFORMS = "([^"]*)";/g)) for (const p of m[1].split(/\s+/).filter(Boolean)) out.add(p);
  return out.size ? out : null;
}
function pbxTargets(text: string): Target[] {
  const objects = pbxObjects(text);
  const project = [...objects.values()].find((o) => o.isa === "PBXProject");
  const inherited = project ? platforms(settingsOf(objects, field(project.text, "buildConfigurationList"))) : null;
  const out: Target[] = [];
  for (const o of objects.values()) {
    if (o.isa !== "PBXNativeTarget") continue;
    const settings = settingsOf(objects, field(o.text, "buildConfigurationList"));
    const p = platforms(settings) ?? inherited;
    out.push({ name: field(o.text, "name") ?? "", type: field(o.text, "productType") ?? "", macos: !!p && (p.has("macosx")), hosted: /\bTEST_HOST = /.test(settings) || fromXcconfig(settings) });
  }
  return out.filter((t) => t.name);
}

const SCHEME_TYPES = /\.product-type\.(?:application|tool|framework|library\.static|library\.dynamic|xpc-service|app-extension)\b|^com\.apple\.product-type\.(?:application|tool|framework)$/;
function schemeFiles(container: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  const dirs = [join(container, "xcshareddata", "xcschemes"), ...names(join(container, "xcuserdata")).map((u) => join(container, "xcuserdata", u, "xcschemes"))];
  for (const d of dirs) for (const n of names(d)) if (n.endsWith(".xcscheme")) out.push({ name: n.slice(0, -".xcscheme".length), text: readText(join(d, n), 200_000) });
  return out;
}
function xcodeSchemes(dir: string, container: string, projects: string[]): Scheme[] {
  const targets = new Map<string, Target>();
  const pbx = projects.map((p) => ({ p, targets: pbxTargets(readText(join(dir, p, "project.pbxproj"), 4_000_000)) }));
  for (const { targets: ts } of pbx) for (const t of ts) if (!targets.has(t.name)) targets.set(t.name, t);
  const files = [...schemeFiles(join(dir, container)), ...projects.filter((p) => p !== container).flatMap((p) => schemeFiles(join(dir, p)))];
  const out = new Map<string, Scheme>();
  for (const f of files) {
    if (out.has(f.name)) continue;
    // Xcode writes `BlueprintName = "Shop"` with spaces; a tool that rewrites the file may not.
    const build = /<BuildActionEntry\b[\s\S]*?BlueprintName\s*=\s*"([^"]+)"/.exec(f.text)?.[1];
    const testRefs = [...(/<TestAction\b[\s\S]*?<\/TestAction>/.exec(f.text)?.[0] ?? "").matchAll(/<TestableReference\b[\s\S]*?BlueprintName\s*=\s*"([^"]+)"[\s\S]*?<\/TestableReference>/g)].map((m) => m[1]);
    const testTargets = testRefs.map((n) => targets.get(n)).filter((t): t is Target => !!t);
    const ui = testRefs.filter((n) => /ui-testing/.test(targets.get(n)?.type ?? ""));
    const unit = testRefs.filter((n) => !ui.includes(n));
    const hosted = testTargets.some((t) => !/ui-testing/.test(t.type) && t.hosted);
    out.set(f.name, { name: f.name, macos: !!build && !!targets.get(build)?.macos, tests: unit.length > 0, hosted, skipTesting: ui, ...(testRefs.length > 0 && unit.length === 0 ? { uiOnly: true as const } : {}) });
  }
  // Without saved schemes Xcode makes one for each target that builds something.
  if (!out.size) for (const t of targets.values()) if (SCHEME_TYPES.test(t.type) && !out.has(t.name)) out.set(t.name, { name: t.name, macos: t.macos, tests: false, hosted: false, skipTesting: [] });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function xcodeContainer(dir: string): { container: string; kind: "project" | "workspace"; projects: string[] } | null {
  const top = names(dir).sort();
  const projects = top.filter((n) => n.endsWith(".xcodeproj"));
  const workspaces = top.filter((n) => n.endsWith(".xcworkspace"));
  if (!projects.length && !workspaces.length) return null;
  if (workspaces.length) {
    const w = workspaces[0];
    const listed = [...readText(join(dir, w, "contents.xcworkspacedata"), 100_000).matchAll(/location\s*=\s*"group:([^"]+\.xcodeproj)"/g)].map((m) => m[1]).filter((p) => !/(^|\/)Pods\//.test(p) && !p.includes("..") && existsSync(join(dir, p)));
    if (listed.length) return { container: w, kind: "workspace", projects: listed };
  }
  if (!projects.length) return null;
  return { container: projects[0], kind: "project", projects: [projects[0]] };
}

// ---------------------------------------------------------------- detection

const KINDS = ["go.mod", "Cargo.toml", "pom.xml"] as const;
const gradleFiles = (dir: string) => ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"].filter((f) => has(dir, f));
/** Does this folder hold a Go, Rust, Maven, Gradle, Swift package or Xcode project? */
export function looksNative(dir: string): boolean {
  return KINDS.some((f) => has(dir, f)) || gradleFiles(dir).length > 0 || has(dir, "Package.swift") || names(dir).some((n) => n.endsWith(".xcodeproj") || n.endsWith(".xcworkspace"));
}

const NOTE = (what: string, how: string, downloads: boolean) => `${what} ${PRODUCT} checks it with ${how}.${downloads ? ` A build may download the packages the project needs from the internet. ${PRODUCT} tries without downloading first, and downloads only when your install setting allows it.` : ""}`;

function goFacts(dir: string, tools: ReturnType<typeof toolCheck>): NativeDetected {
  const mod = readText(join(dir, "go.mod"));
  const downloads = /^\s*require\b/m.test(mod);
  const hasTests = !!walkFind(dir, (_r, n) => n.endsWith("_test.go"), (n) => hidden(n) || n.startsWith("_") || n === "vendor" || n === "node_modules" || n === "testdata");
  const plan = goPlan({ hasTests });
  const missing = tools.has("go") ? null : missingTool("go", "Go");
  const web = /gin-gonic\/gin/.test(mod) ? "Gin" : /labstack\/echo/.test(mod) ? "Echo" : /gofiber\/fiber/.test(mod) ? "Fiber" : /go-chi\/chi/.test(mod) ? "chi" : /gorilla\/mux/.test(mod) ? "Gorilla mux" : /"net\/http"/.test(readText(join(dir, "main.go"))) ? "Go's own web server" : null;
  const setup: NativeSetup = {
    ecosystem: "go", label: "Go", missing, downloads, run: "go run .", fetch: "go mod download", schemes: [], gaps: [], hints: [],
    stackNote: web,
    note: NOTE("This is a Go project.", "go build, go vet and go test", downloads),
  };
  return { setup, checks: missing ? [] : plan.checks, tests: missing ? null : plan.tests };
}

function cargoHasDependencies(text: string): boolean {
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    const head = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
    if (head) { section = head[1]; continue; }
    if (/(?:^|\.)(?:dev-|build-)?dependencies$/.test(section) && /^[\w-]+(?:\.[\w-]+)?\s*=/.test(line)) return true;
    if (/(?:^|\.)(?:dev-|build-)?dependencies\.[\w-]+$/.test(section)) return true;
  }
  return false;
}
function rustFacts(dir: string, tools: ReturnType<typeof toolCheck>): NativeDetected {
  const toml = readText(join(dir, "Cargo.toml"));
  const downloads = cargoHasDependencies(toml);
  let reads = 0;   // source files opened looking for a test: bounded
  const hasTests = names(join(dir, "tests")).some((n) => n.endsWith(".rs")) || !!walkFind(dir, (r, n) => n.endsWith(".rs") && ++reads <= 5000 && /#\[(?:test|tokio::test)\]|#\[cfg\(test\)\]/.test(readText(join(dir, r), 400_000)), (n) => hidden(n) || n === "target" || n === "vendor" || n === "node_modules");
  const clippy = tools.has("clippy");
  const plan = rustPlan({ hasTests, clippy });
  const missing = tools.has("cargo") ? null : missingTool("cargo", "Rust");
  const web = /^\s*axum\b/m.test(toml) ? "Axum" : /^\s*actix-web\b/m.test(toml) ? "Actix" : /^\s*rocket\b/m.test(toml) ? "Rocket" : /^\s*warp\b/m.test(toml) ? "Warp" : null;
  const setup: NativeSetup = {
    ecosystem: "rust", label: "Rust", missing, downloads, run: "cargo run", fetch: "cargo fetch", schemes: [], gaps: [],
    hints: !missing && !clippy ? [`Rust's clippy (the extra lint check) is not installed, so only cargo check and the tests run. To add it, in Terminal, run: ${NAMES.clippy.how}`] : [],
    stackNote: web,
    note: NOTE("This is a Rust project.", clippy ? "cargo check, cargo clippy and cargo test" : "cargo check and cargo test", downloads),
  };
  return { setup, checks: missing ? [] : plan.checks, tests: missing ? null : plan.tests };
}

function jvmLabel(dir: string, gradle: boolean): string {
  if (!gradle) return "Java (Maven)";
  const text = gradleFiles(dir).map((f) => readText(join(dir, f), 100_000)).join("\n");
  return /kotlin/i.test(text) || !!walkFind(dir, (_r, n) => n.endsWith(".kt") || n.endsWith(".kts") && n !== "build.gradle.kts" && n !== "settings.gradle.kts", (n) => hidden(n) || SKIP.has(n), 5000) ? "Kotlin (Gradle)" : "Java (Gradle)";
}
function isAndroid(dir: string): boolean {
  const files = [...gradleFiles(dir).map((f) => join(dir, f)), ...names(dir).filter((n) => { try { return statSync(join(dir, n)).isDirectory() && !SKIP.has(n) && !n.startsWith("."); } catch { return false; } }).flatMap((n) => ["build.gradle", "build.gradle.kts"].map((f) => join(dir, n, f)))];
  return files.some((f) => /com\.android\.(?:application|library|test|dynamic-feature)|apply plugin:\s*['"]com\.android|android\s*\{/.test(readText(f, 100_000)));
}
function jvmFacts(dir: string, tools: ReturnType<typeof toolCheck>, gradle: boolean): NativeDetected {
  const m = tools.machine;
  const wrapperName = gradle ? "gradlew" : "mvnw";
  const wrapper: Wrapper = has(dir, wrapperName) ? { cached: wrapperCached(dir, gradle ? "gradle" : "maven", m.home, m.exists) } : null;
  const system = tools.has(gradle ? "gradle" : "mvn");
  const hasTests = hasJvmTests(dir);
  const plan = (gradle ? gradlePlan : mavenPlan)({ wrapper, hasTests, system });
  const label = jvmLabel(dir, gradle);
  const text = gradle ? gradleFiles(dir).map((f) => readText(join(dir, f), 200_000)).join("\n") : readText(join(dir, "pom.xml"));
  const spring = /spring-boot/.test(text);
  const android = gradle && isAndroid(dir);
  let missing: string | null = null;
  if (!tools.has("java")) missing = missingTool("java", label);
  else if (!wrapper && !system) missing = missingTool(gradle ? "gradle" : "mvn", label);
  const gaps = android ? [`This is an Android project. Building it needs the Android SDK, which ${PRODUCT} does not use, so it was not built.`] : [];
  const stop = !!missing || android;
  const setup: NativeSetup = {
    ecosystem: gradle ? "gradle" : "maven", label, missing, downloads: true, schemes: [], gaps, hints: [], stackNote: spring ? "Spring Boot" : null, ...(wrapper ? { wrapperCached: wrapper.cached } : {}),
    run: spring ? (gradle ? `${wrapper ? "./gradlew" : "gradle"} bootRun` : `${wrapper ? "./mvnw" : "mvn"} spring-boot:run`) : null,
    fetch: gradle ? `${wrapper ? "./gradlew" : "gradle"} build` : `${wrapper ? "./mvnw" : "mvn"} -q compile`,
    note: NOTE(`This is a ${label} project.`, gradle ? `${wrapper ? "its own gradlew" : "gradle"} build and test` : `${wrapper ? "its own mvnw" : "mvn"} compile and test`, true),
  };
  return { setup, checks: stop ? [] : plan.checks, tests: stop ? null : plan.tests };
}

function swiftFacts(dir: string, tools: ReturnType<typeof toolCheck>): NativeDetected {
  const text = readText(join(dir, "Package.swift"));
  const downloads = /\.package\s*\(/.test(text);
  const hasTests = /\.testTarget\s*\(/.test(text) || names(join(dir, "Tests")).length > 0 && !!walkFind(join(dir, "Tests"), (_r, n) => n.endsWith(".swift"), (n) => hidden(n));
  const plan = swiftPlan({ hasTests });
  const missing = tools.has("swift") ? null : missingTool("swift", "Swift");
  const setup: NativeSetup = {
    ecosystem: "swift", label: "Swift", missing, downloads, run: "swift run", fetch: "swift package resolve", schemes: [], gaps: [], hints: [],
    stackNote: /vapor\/vapor/.test(text) ? "Vapor" : null,
    note: NOTE("This is a Swift package.", "swift build and swift test", downloads),
  };
  return { setup, checks: missing ? [] : plan.checks, tests: missing ? null : plan.tests };
}

function xcodeFacts(dir: string, tools: ReturnType<typeof toolCheck>): NativeDetected | null {
  const c = xcodeContainer(dir);
  if (!c) return null;
  const schemes = xcodeSchemes(dir, c.container, c.projects);
  const pbxText = c.projects.map((p) => readText(join(dir, p, "project.pbxproj"), 4_000_000)).join("\n");
  const downloads = /XCRemoteSwiftPackageReference/.test(pbxText);
  const macs = schemes.filter((s) => s.macos);
  const base = c.container.replace(/\.(?:xcodeproj|xcworkspace)$/, "");
  const buildScheme = macs.find((s) => s.name === base) ?? macs[0] ?? null;
  const testScheme = macs.find((s) => s.tests && !s.hosted && s.name === buildScheme?.name) ?? macs.find((s) => s.tests && !s.hosted) ?? null;
  const gaps: string[] = [];
  if (!schemes.length) gaps.push(`No scheme was found in this Xcode project, so there is nothing for ${PRODUCT} to build. Open it in Xcode once so it makes one.`);
  else if (!buildScheme) gaps.push(`This Xcode project builds for iPhone or iPad only. ${PRODUCT} builds only for the Mac and never installs on a simulator or a device, so it was not built.`);
  const hostedOnly = macs.find((s) => s.tests && s.hosted);
  if (buildScheme && !testScheme && hostedOnly) gaps.push(`The tests of the scheme ${hostedOnly.name} run inside the app (or take their settings from an .xcconfig file, which may say so), which would open it on this Mac, so ${PRODUCT} did not run them.`);
  const uiOnly = macs.find((s) => s.uiOnly);
  if (buildScheme && !testScheme && !hostedOnly && uiOnly) gaps.push(`The only tests of the scheme ${uiOnly.name} are UI tests, which drive the app on screen, so ${PRODUCT} did not run them.`);
  const xcodeOk = tools.has("xcodebuild"), alt = !xcodeOk ? tools.xcodeApp : null;
  const missing = !buildScheme || xcodeOk || alt ? null : missingTool("xcodebuild", "Xcode");
  const plan = xcodePlan({ container: { kind: c.kind, name: c.container }, scheme: buildScheme?.name ?? null, testScheme: testScheme?.name ?? null, skipTesting: (testScheme ?? buildScheme)?.skipTesting ?? [], developerDir: alt });
  const list = schemes.map((s) => `${s.name} (${s.macos ? "Mac" : "not Mac"}${s.tests ? ", has tests" : ""})`).join(", ");
  const setup: NativeSetup = {
    ecosystem: "xcode", label: "Xcode", missing, downloads, run: null, fetch: "xcodebuild -resolvePackageDependencies", schemes, gaps,
    hints: [...(schemes.length ? [`Schemes: ${list}.`] : []), "To run it, open the project in Xcode and press Run."], stackNote: null,
    note: NOTE("This is an Xcode project.", "xcodebuild for the Mac only, with signing off (it never installs on a simulator or a device, and never archives or exports)", downloads),
  };
  const stop = !!missing || !buildScheme;
  return { setup, checks: stop ? [] : plan.checks, tests: stop ? null : plan.tests };
}

/** What a Go, Rust, Maven, Gradle, Swift package or Xcode project has that can be checked, or null when the folder is none of them. */
export function detectNative(dir: string, o: NativeEnv = {}): NativeDetected | null {
  if (!looksNative(dir)) return null;
  const tools = toolCheck(o);
  if (has(dir, "go.mod")) return goFacts(dir, tools);
  if (has(dir, "Cargo.toml")) return rustFacts(dir, tools);
  if (has(dir, "pom.xml")) return jvmFacts(dir, tools, false);
  if (gradleFiles(dir).length) return jvmFacts(dir, tools, true);
  if (has(dir, "Package.swift")) return swiftFacts(dir, tools);
  return xcodeFacts(dir, tools);
}


// ---------------------------------------------------------------- at check time: downloads, missing tools, noise

/** The install question for a build that needs to download packages starts with this, so the card can say it in its own words. */
export const DOWNLOAD_ASK = "download: ";
/** What a wrapper (mvnw, gradlew) run offline says when its build tool is not on this Mac: it would have to download it first. */
export const WRAPPER_NOT_CACHED = `${PRODUCT} did not run the project's wrapper: its build tool is not on this Mac yet, and the wrapper would download it first.`;
export type NetWhy = "noInstall" | "no" | "never";

// An offline try that failed because a package is not on this Mac yet. Only these are retried the other way (when allowed):
// any other failure is the project's own.
const NEEDS_DOWNLOAD: Record<Ecosystem, RegExp> = {
  go: /module lookup disabled by GOPROXY=off|missing go\.sum entry|GOPROXY list is empty/,
  rust: /offline mode|--offline|attempting to make an HTTP request/i,
  maven: /in offline mode|offline mode and the artifact|Cannot access .+ in offline mode/i,
  gradle: /offline mode|No cached version of/i,
  swift: /automatic dependency resolution is disabled|Dependencies could not be resolved|Package\.resolved file is most likely severely out-of-date|a resolved file is required/i,
  xcode: /Could not resolve package dependencies|Missing package product|Package resolution (?:is|was) disabled|packages? (?:are|is) not resolved|Failed to resolve dependencies|disableAutomaticPackageResolution/i,
};
export const needsDownload = (output: string, eco: Ecosystem): boolean => NEEDS_DOWNLOAD[eco].test(output) || (eco === "maven" || eco === "gradle") && output.includes(WRAPPER_NOT_CACHED);
// Online, but the internet did not answer: that says nothing about the project.
const UNREACHABLE = /Could not resolve host|UnknownHostException|Unknown host|nodename nor servname|Network is unreachable|Connection (?:timed out|refused|reset)|Temporary failure in name resolution|dial tcp[^\n]*(?:lookup|i\/o timeout|connection refused)|no such host|failed to resolve address|spurious network error|Internet connection appears to be offline|Operation timed out|Read timed out/i;

const WHY: Record<NetWhy, string> = {
  noInstall: "this check never downloads packages",
  no: "you said no, or did not answer",
  never: "Settings says never to install packages for a check",
};

function runtimeMissing(output: string, s: NativeSetup): string | null {
  if (/Unable to locate a Java Runtime|No Java runtime present|JAVA_HOME is not set and no 'java'|JAVA_HOME is set to an invalid directory/.test(output)) return missingTool("java", s.label);
  if (/xcode-select: error: tool '\w+' requires Xcode|requires Xcode, but active developer directory/.test(output)) return missingTool("xcodebuild", s.label);
  if (/You have not agreed to the Xcode license|Xcode license agreements/.test(output)) return `Xcode's license has not been accepted on this Mac, so this ${s.label} project could not be built. ${PRODUCT} cannot accept it for you. To accept it, in Terminal, run: sudo xcodebuild -license`;
  if (/unable to resolve module dependency: 'XCTest'|no such module 'XCTest'/.test(output)) return `Swift's test framework (XCTest) comes with Xcode, which is not set up on this Mac, so the tests could not run. ${PRODUCT} does not install it. Get Xcode from the App Store, then in Terminal run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`;
  if (/xcrun: error: invalid active developer path|xcrun: error: unable to find utility/.test(output)) return missingTool("swift", s.label);
  const tc = /toolchain '([^']+)' is not installed/.exec(output)?.[1];
  if (tc) return `This project asks for the Rust toolchain ${tc}, which is not installed on this Mac. ${PRODUCT} does not install it. To install it, in Terminal, run: rustup toolchain install ${tc}`;
  if (/no such command: `?clippy`?/.test(output)) return missingTool("clippy", s.label);
  const go = /requires go >= ([\d.]+)/.exec(output)?.[1];
  if (go) return `This project needs Go ${go} or newer, and this Mac has an older one. ${PRODUCT} does not install it. To update it, in Terminal, run: brew upgrade go`;
  if (/No matching toolchains? found|Cannot find a Java installation on your machine|invalid (?:source|target) release: \d+|release version \d+ not supported|Unsupported class file major version|compiled by a more recent version of the Java Runtime|requires Java \d+/i.test(output)) return `This project needs a newer or different Java than the one on this Mac. ${PRODUCT} does not install it. To install one, in Terminal, run: ${NAMES.java.how}`;
  if (/Macro "?\w+"? must be enabled before it can be used|macro .* must be enabled/i.test(output)) return `This project uses a Swift macro that has to be allowed once in Xcode, and ${PRODUCT} cannot allow it for you, so it could not be built.`;
  const cmd = /(?:^|\n)(?:sh|bash|zsh): (?:line \d+: )?(go|cargo|mvn|gradle|java|swift|xcodebuild|rustc): (?:command )?not found/.exec(output)?.[1];
  if (cmd) return missingTool(cmd === "rustc" ? "cargo" : (cmd as Tool), s.label);
  return null;
}

/** Plain words for a failed command that failed only because something is not there: a tool, a toolchain, or packages this
 *  check was not allowed to download (or could not, with no internet). Null when it is the project's own failure.
 *  allowed: the way that may download was used. what: the step, in words ("the build", "the tests"). */
export function nativeGap(output: string, o: { setup: NativeSetup; allowed: boolean; why: NetWhy; what: string }): string | null {
  const miss = runtimeMissing(output, o.setup);
  if (miss) return miss;
  if (!o.allowed) {
    if (!needsDownload(output, o.setup.ecosystem)) return null;
    const words = `${o.what[0].toUpperCase()}${o.what.slice(1)} needs packages that are not on this Mac yet, and this check was not allowed to download them (${WHY[o.why]}). ${PRODUCT} does not download packages unless your install setting allows it.`;
    return `${words} To fetch them yourself, in Terminal in the project folder, run: ${o.setup.fetch}`;
  }
  if (UNREACHABLE.test(output)) return `${o.what[0].toUpperCase()}${o.what.slice(1)} needed to download packages, but this Mac could not reach the internet, so it could not run. Try again when you are online.`;
  return null;
}

/** A test run that exited with success but ran no test at all: XCTest's "Executed 0 tests" (with Swift Testing's "Test run with 0
 *  tests", when it counts none either) and cargo's "running 0 tests" in every test program. Nothing was checked, so it is never
 *  called a pass. False when the output says nothing about how many tests ran. */
export function ranNoTests(output: string, eco: Ecosystem): boolean {
  const nums = (re: RegExp) => [...output.matchAll(re)].map((m) => Number(m[1]));
  if (eco === "swift" || eco === "xcode") {
    const xc = nums(/Executed (\d+) tests?\b/g), st = nums(/Test run with (\d+) tests?\b/g);
    return xc.length + st.length > 0 && Math.max(0, ...xc) + Math.max(0, ...st) === 0;
  }
  if (eco === "rust") { const n = nums(/\brunning (\d+) tests?\b/g); return n.length > 0 && Math.max(...n) === 0; }
  return false;
}

/** A command from .claude/launch.json that starts a project's server, made to run without downloading when it can be:
 *  Maven and Gradle get their offline switch (MAVEN_ARGS is only read by Maven 3.9 and newer, so the switch goes in the
 *  command), Go and Cargo are told by the environment (serverEnv). `download` is set when it cannot be made to run without
 *  one: a wrapper whose build tool is not on this Mac yet downloads it first, and swift run and xcodebuild have no offline
 *  switch for a project that has remote packages. The caller then asks, as for a build, or does not start it. */
export function serverOffline(command: string, setup: NativeSetup): { command: string; download: boolean } {
  const tool = /(^|[\s;&|])((?:\.\/)?(?:mvnw|gradlew|mvn|gradle))(?=\s|$)/.exec(command);
  if (tool) {
    const name = tool[2].replace(/^\.\//, "");
    if ((name === "mvnw" || name === "gradlew") && setup.wrapperCached !== true) return { command, download: true };
    const flag = name.startsWith("mvn") ? "-o" : "--offline";
    if (new RegExp(`(?:^|\\s)(?:${flag}|--offline)(?=\\s|$)`).test(command)) return { command, download: false };
    const at = tool.index + tool[1].length + tool[2].length;
    return { command: `${command.slice(0, at)} ${flag}${command.slice(at)}`, download: false };
  }
  if (setup.downloads && /(^|[\s;&|])(?:swift|xcodebuild)(?=\s|$)/.test(command)) return { command, download: true };
  return { command, download: false };
}
/** Plain words for a server that was not started because starting it would download packages or a build tool. */
export const serverHeldBack = (command: string, why: NetWhy): string => `The project's server (${command.length > 60 ? `${command.slice(0, 57)}...` : command}) was not started: starting it would download packages or its build tool from the internet, and this check was not allowed to (${WHY[why]}). So the page was not checked.`;

/** The environment a project's own server is started with. A toolchain is never downloaded; packages are fetched only when the
 *  check was allowed to. */
export function serverEnv(allowDownloads: boolean): Record<string, string> {
  return { GOTOOLCHAIN: "local", RUSTUP_AUTO_INSTALL: "0", ...(allowDownloads ? {} : { GOPROXY: "off", CARGO_NET_OFFLINE: "true", MAVEN_ARGS: "-o", GRADLE_OPTS: "-Dorg.gradle.offline=true" }) };
}

// Lines that are the tool talking about itself, not about the project: Swift's progress counters and the compiler command
// line it prints after an error, Gradle's advice after a failed build.
const NOISE = /^\s*(?:\[\d+ \/ \d+\].*|Failed frontend command:?|Command line:.*|BUILD FAILED.*|\* Try:|\* Get more help at.*|> Run with --.*|> Get more help.*|> Task :.*|Deprecated Gradle features.*|You can use '--warning-mode.*|For more on this, please refer.*|See https:\/\/docs\.gradle\.org.*|Use '--warning-mode.*|\d+ actionable tasks?:.*|error: Swift(?:Compile|Driver) .* Command line:.*|error: Build failed|\*\* BUILD FAILED \*\*|error: the following command failed with exit code \d+ but produced no further output|(?:SwiftCompile|SwiftDriver|CompileSwift|Ld|SwiftEmitModule) .* \(in target .*\)|note: Using codesigning identity override.*|--- xcodebuild: WARNING:.*|\{ platform:.*\})\s*$/;
export const withoutNoise = (text: string): string => text.split("\n").filter((l) => l.length <= 600 && !NOISE.test(l) && !/^\s*$/.test(l)).join("\n");
