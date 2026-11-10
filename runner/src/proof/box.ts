// The safety box for proof checks. A check runs the project's own code (its scripts, tests, sources and configs), and the
// agent can edit all of it from inside its own sandbox. So every proof command runs in macOS's own sandbox too
// (sandbox-exec), with the rules Claude's own commands get (sandbox.ts):
//   - writes only to the project, the package managers' download caches, and a temporary folder of its own (TMPDIR);
//     never to git's folder, Claude's or Companion's settings in the project, or editor settings that run code;
//   - no reading the private places (logins, keys, Companion's own data, the Keychain, browsers, mail). The one exception is
//     the project itself when it is one of Companion's own private copies inside its data folder (which task broke it, the
//     visual receipt's earlier version): that copy is what is being checked, and the rest of the data folder stays refused;
//   - no writing the Mac's settings of any app (preferences), which would land outside the project and the box;
//   - for the build, the checks, the tests and the server: no internet, only this Mac's own addresses. Host names cannot be
//     told apart here (the sandbox sees addresses, not names), so the package registries are not reachable either. An
//     install, and a build the person allowed to download, keep the internet (their own approved rung, net "open");
//   - never a way out through another program: no opening apps or documents (Launch Services), no Apple Events, no jobs
//     handed to launchd, no clipboard, no signals to programs outside the box.
// Every path goes into the rules as a parameter (sandbox-exec -D), never as text, so no folder name can change them.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { cachePaths, ownDataPaths, sensitivePaths } from "../sandbox.ts";
import { PRODUCT } from "../names.ts";

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
/** "local": only this Mac's own addresses. "open": the internet too (an install, a build allowed to download). */
export type Net = "local" | "open";
export type Box = { project: string; net: Net };

// Inside the project, never written by a check: git's folder (rule 10), Claude's and Companion's own folders (settings,
// hooks, commands), editor settings that run code when the folder is opened, the MCP servers file and git's submodules file.
const KEPT_DIRS = [".git", ".claude", ".companion", ".vscode", ".idea"];
const KEPT_FILES = [".mcp.json", ".gitmodules"];

// Two folders of this Mac's own per person folders (not the home folder) that Apple's build tools cannot work without, and
// only those, never the other programs' caches and temporary files beside them: Clang's and Swift's shared module cache (a
// Swift or Xcode build cannot even read its SDK without writing there), and the folder macOS saves a file through before
// it takes its place (xcodebuild saves its logs in DerivedData that way). Seen on this Mac, 31 Oct 2026.
let userCache: string | null | undefined;
export function systemCaches(): string[] {
  if (userCache === undefined) {
    try { userCache = process.platform === "darwin" ? execFileSync("/usr/bin/getconf", ["DARWIN_USER_CACHE_DIR"], { encoding: "utf8", timeout: 5000 }).trim() || null : null; } catch { userCache = null; }
  }
  return userCache ? [join(userCache, "clang", "ModuleCache"), join(userCache.replace(/\/C\/?$/, "/T"), "TemporaryItems")] : [];
}

/** A path as the sandbox sees it: with links resolved (/tmp is /private/tmp), also when the path does not exist yet. */
export function real(p: string): string {
  try { return realpathSync(p); } catch { const up = dirname(p); return up === p ? p : join(real(up), basename(p)); }
}

/** The rules, and the paths they name (each a parameter). home: the home folder the command gets. tmp: its own temporary
 *  folder. data: Companion's own data folder when it is not in the usual place (COMPANION_DATA). */
export function boxProfile(b: Box, at: { home: string; tmp: string; data?: string }): { text: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  let n = 0;
  const param = (path: string) => { const k = `P${n++}`; params[k] = real(path); return `(param "${k}")`; };
  const project = real(b.project);
  const writable = [project, ...cachePaths(at.home), ...systemCaches(), at.tmp].map((p) => `(subpath ${param(p)})`).join(" ");
  const kept = [...KEPT_DIRS.map((d) => `(subpath ${param(join(project, d))})`), ...KEPT_FILES.map((f) => `(literal ${param(join(project, f))})`)].join(" ");
  const unreadable = [...sensitivePaths(at.home), ...(at.data ? [at.data] : [])].map((p) => `(subpath ${param(p)})`).join(" ");
  const own = `(subpath ${param(project)}) (subpath ${param(at.tmp)})`;
  // A private copy inside Companion's own data folder is the project being checked: it is read like any project.
  const ownData = [...ownDataPaths(at.home), ...(at.data ? [at.data] : [])].map(real);
  const isCopy = ownData.some((d) => project.startsWith(d + "/"));
  const text = [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* ${writable} (subpath "/dev"))`,
    `(deny file-write* ${kept})`,
    `(deny file-read* ${unreadable})`,
    ...(isCopy ? [`(allow file-read* (subpath ${param(project)}))`] : []),
    "(deny user-preference-write)",
    "(deny lsopen)",
    "(deny appleevent-send)",
    "(deny job-creation)",
    '(deny mach-lookup (global-name "com.apple.pasteboard.1"))',
    "(deny signal)",
    "(allow signal (target same-sandbox))",
    ...(b.net === "local" ? [
      "(deny network-outbound)",
      '(allow network-outbound (remote ip "localhost:*"))',
      // Sockets of its own (a test's helper process); never another program's, such as the name lookup service, which would
      // carry data out in a name.
      `(allow network-outbound (remote unix-socket ${own}))`,
    ] : []),
  ].join("\n");
  return { text, params };
}

/** sandbox-exec's arguments before the command: the rules, then each path. */
export function boxArgs(b: Box, at: { home: string; tmp: string; data?: string }): string[] {
  const p = boxProfile(b, at);
  return ["-p", p.text, ...Object.entries(p.params).flatMap(([k, v]) => ["-D", `${k}=${v}`])];
}

/** Whether sandbox-exec is here at all (macOS only). */
export function boxReady(): boolean { return process.platform === "darwin" && existsSync(SANDBOX_EXEC); }
export type Opened = { args: string[]; tmp: string; close: () => void };
/** The box for one command: its own temporary folder, and sandbox-exec's arguments. Null when it cannot be used here. */
export function openBox(b: Box, home: string): Opened | null {
  if (!boxReady()) return null;
  let tmp: string;
  try { tmp = real(mkdtempSync(join(tmpdir(), "companion-check-"))); } catch { return null; }
  const close = () => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* gone */ } };
  try { return { args: boxArgs(b, { home, tmp, ...(process.env.COMPANION_DATA ? { data: process.env.COMPANION_DATA } : {}) }), tmp, close }; }
  catch { close(); return null; }
}

/** Whether the box works for this project: the same rules a check gets, tried by listing the project from inside it (a box
 *  that cannot read the project would fail every check for a reason that is not the project's). False when sandbox-exec is
 *  missing or refuses them; the ladder then runs nothing without a yes (ladder.ts). */
export function boxWorks(project: string, o: { home?: string; timeoutMs?: number } = {}): Promise<boolean> {
  const opened = openBox({ project, net: "local" }, o.home ?? process.env.HOME ?? homedir());
  if (!opened) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const end = (ok: boolean) => { if (done) return; done = true; clearTimeout(t); opened.close(); resolve(ok); };
    const child = spawn(SANDBOX_EXEC, [...opened.args, "/bin/ls", "-a"], { cwd: project, stdio: "ignore" });
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } end(false); }, o.timeoutMs ?? 10_000);
    child.on("error", () => end(false));
    child.on("exit", (code) => end(code === 0));
  });
}

/** M77b (the 10 Nov real run, bug 9): whether this engine was started inside another app's sandbox, where sandbox-exec
 *  cannot start one of its own (macOS does not nest them: "sandbox_apply: Operation not permitted"). Then no check can run
 *  in the safety box, and the words should say so instead of "Try again". Asked once, by starting the smallest box. */
let nested: Promise<boolean> | null = null;
export function nestedSandbox(): Promise<boolean> {
  if (!boxReady()) return Promise.resolve(false);
  return (nested ??= new Promise((resolve) => {
    let said = "", done = false;
    const end = (v: boolean) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const child = spawn(SANDBOX_EXEC, ["-p", "(version 1)(allow default)", "/usr/bin/true"], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr?.on("data", (b) => { said += String(b); });
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } end(false); }, 5000);
    child.on("error", () => end(false));
    child.on("exit", (code) => end(code !== 0 && /sandbox_apply|Operation not permitted/i.test(said)));
  }));
}
/** What a review and a check say when that is the cause, instead of blaming Claude or the project. */
export const SANDBOXED_CHECKS = `The checks could not run, because ${PRODUCT} was started inside another app's sandbox, and macOS does not let it open its own safety box for checks there. Open ${PRODUCT} by itself, not from inside another app, and review again.`;
export const SANDBOXED_WORDS = `Claude could not be reached from inside another app's sandbox, where ${PRODUCT} was started, so these are the rules' own words.`;

const LOCAL_NAME = /^(?:localhost|127(?:\.\d+){3}|::1|\[::1\]|0\.0\.0\.0|[\w.-]+\.localhost)$/i;
/** Whether a command's output says the box itself stopped it, not the project: a write to a fixed temporary folder outside
 *  the project (/tmp, which the box does not give; the command has a temporary folder of its own), a browser that keeps its
 *  own sandbox on (macOS allows only one), or, with no internet in the box, a name on the internet that could not be looked
 *  up or reached (Next's font download among them; `bun`: the command ran on the engine's own Bun, which says ECONNREFUSED), or
 *  "git": a write into git's folder, which checks never make (an install setting up git hooks). Reading a private place is never one of these: that stays the
 *  project's failure. Null when the output says nothing of the kind. */
export function boxRefusal(output: string, net: Net, o: { bun?: boolean } = {}): "write" | "browser" | "net" | "git" | null {
  if (/sandbox initialization failed|sandbox_apply|sandbox_init\b/i.test(output)) return "browser";
  for (const line of output.split("\n")) {
    // A write into git's folder, which the box keeps (rule 10): an install's prepare step setting up git hooks (husky).
    if (/Operation not permitted|\bEPERM\b/i.test(line) && /(?:could not lock|unable to (?:create|write)|cannot (?:create|write)|open|mkdir|rename|unlink|copyfile)[^\n]*(?:^|[\s'"`(:=/])\.git\/[\w./-]/i.test(line)) return "git";
    if (/Operation not permitted|\bEPERM\b/i.test(line) && /(?:^|[\s'"`(:=])\/(?:private\/)?(?:var\/)?tmp\//.test(line)) return "write";
  }
  if (net === "local") {
    if (/Failed to fetch font|Failed to download `[^`]+` from Google Fonts/.test(output)) return "net";
    for (const m of output.matchAll(/\b(?:getaddrinfo )?(?:ENOTFOUND|EAI_AGAIN)\s+([^\s'"`,)]+)/g)) if (!LOCAL_NAME.test(m[1])) return "net";
    for (const m of output.matchAll(/\bconnect EPERM\s+([0-9a-f.:[\]]+?)(?::\d+)?(?=\s|$)/gi)) if (!LOCAL_NAME.test(m[1])) return "net";
    // The engine's own Bun (a practice without Node, practicerun.ts) reports the box's refusal as ECONNREFUSED, where Node
    // says EPERM (spikes/practice-bun, RESULTS.md). Only for an address that is not this Mac's: a local server that is down
    // is still the project's own failure.
    if (o.bun) for (const m of output.matchAll(/\bconnect ECONNREFUSED\s+([0-9a-f.:[\]]+?)(?::\d+)?(?=\s|$)/gi)) if (!LOCAL_NAME.test(m[1])) return "net";
  }
  return null;
}
