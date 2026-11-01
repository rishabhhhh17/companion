// What the operating system sandbox is told. Under Companion's own checks sits macOS's real sandbox: it was shown (with our
// checks switched off) to refuse writing outside the project, writing in the home folder, and all network traffic.
// Here we add: the few places packages may be downloaded from, and the places no agent may ever read.
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { isEnvFile } from "./diagram.ts";
import { PROTECTED } from "./safety.ts";

export const REGISTRY_DOMAINS = [
  "registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org",
  "crates.io", "static.crates.io", "index.crates.io", "rubygems.org", "index.rubygems.org",
  // Go modules, Maven Central and the Gradle plugin portal and distributions. Not a code host: Swift packages (GitHub) are not
  // reachable from the agent's own commands.
  "proxy.golang.org", "sum.golang.org", "repo.maven.apache.org", "repo1.maven.org", "plugins.gradle.org", "services.gradle.org", "downloads.gradle.org",
];

// Logins, keys, tokens, the person's own Claude login, Companion's own data, the Keychain, browsers, mail and messages.
const SENSITIVE = [
  ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".npmrc", ".netrc", ".pypirc", ".git-credentials", ".azure",
  ".config/gcloud", ".config/gh", ".config/op", ".terraform.d/credentials.tfrc.json",
  // The deploy tools Squibby drives keep their logins here, and so do Stripe, Cargo and Postgres.
  "Library/Application Support/com.vercel.cli", ".local/share/com.vercel.cli", "Library/Preferences/netlify", ".config/netlify",
  ".config/.wrangler", ".wrangler", ".config/configstore", ".supabase", ".config/stripe", ".cargo/credentials.toml", ".cargo/credentials", ".pgpass",
  // The shell's start up files, which often export API keys. Checks and Claude's commands run /bin/sh -c, which does not read them.
  ".zshrc", ".zprofile", ".zshenv", ".bash_profile", ".bashrc", ".profile",
  ".claude", ".claude.json", ".zsh_history", ".bash_history", ".python_history", ".node_repl_history",
  "Library/Keychains", "Library/Application Support/Companion", "Library/Application Support/Companion-test-claude", "Library/Application Support/dev.companion.app",
  "Library/Application Support/Google/Chrome", "Library/Application Support/Firefox", "Library/Application Support/Arc", "Library/Application Support/BraveSoftware",
  "Library/Application Support/Microsoft Edge", "Library/Application Support/Dia", "Library/Safari", "Library/Cookies", "Library/Messages", "Library/Mail", "Library/Accounts",
];
// The only places in the home folder a command may write: the download caches of package managers. Go, Maven, Gradle, Swift
// and Xcode keep theirs in folders of their own, listed one by one: never the tool's whole folder, because Maven's
// settings.xml, Gradle's gradle.properties and init scripts, and Cargo's config and credentials sit beside them. (Go's build
// cache, SwiftPM's cache and Xcode's other caches are under Library/Caches already.) Not here on purpose: SwiftPM's own folder
// (its mirrors.json and registries.json redirect later package fetches), and the Gradle and Maven wrapper folders (the build
// tools a check later runs outside this sandbox without asking; a check fetches those itself).
const CACHES = [
  ".npm", ".cache", "Library/Caches", ".bun/install", ".local/share/pnpm", "Library/pnpm", ".yarn", ".cargo/registry", ".cargo/git", ".gem", ".pnpm-store",
  ".cargo/.package-cache", ".cargo/.package-cache-mutate", ".cargo/.global-cache",   // cargo's lock and usage files, which it writes beside the registry
  "go/pkg/mod", ".m2/repository", ".gradle/caches", ".gradle/native", ".gradle/daemon", "Library/Developer/Xcode/DerivedData",
];
// Companion's own data folders among them: where it keeps its private copies of a project (which task broke it, the visual
// receipt's earlier version), which a check in the box must still read (proof/box.ts).
const OWN_DATA = SENSITIVE.filter((p) => p.startsWith("Library/Application Support/Companion") || p.startsWith("Library/Application Support/dev.companion.app"));
export const ownDataPaths = (home: string): string[] => OWN_DATA.map((p) => `${home}/${p}`);
export const cachePaths = (home: string): string[] => CACHES.map((p) => `${home}/${p}`);
export const sensitivePaths = (home: string): string[] => SENSITIVE.map((p) => `${home}/${p}`);

/** project: the folder the task works in. Its .companion folder (the house rules, memory) and .claude folder are never
 *  written by a command, as the safety hook already refuses for the file tools and for writes a command names; a script the
 *  agent runs is not seen by the hook, so the sandbox refuses them too. [verify] on a real run (real-sandbox.ts) that Claude
 *  Code's sandbox applies denyWrite to a script's own writes. Not .git: an approved git change must still be able to run. */
export function sandboxSettings(home: string, platform: string = process.platform, project?: string) {
  return {
    enabled: platform === "darwin",
    // Claude Code would otherwise run a shell command inside the sandbox without asking (its default). Companion's safety
    // hook says yes or no to every command itself, and that yes is what lets a command run. So a command the hook gave no
    // answer for (if Claude Code ever gave up waiting on it) goes on to canUseTool, which always says no. [verify] on a real
    // run that a command the hook allows still runs with this off (real-verify.ts and real-sandbox.ts show it).
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
    // The one command that must run outside the box: Claude Code's sandbox refuses to create a .git folder, so an approved
    // `git init` did nothing (real run, 21 Oct 2026). Exactly this text, no arguments, no wildcard. It still goes through the
    // safety hook, which asks first (git changes need a tap), so it only ever runs after a yes. Any other git change stays inside.
    excludedCommands: ["git init"],
    network: { allowedDomains: REGISTRY_DOMAINS, strictAllowlist: true, allowLocalBinding: true },
    filesystem: { denyRead: sensitivePaths(home), allowWrite: cachePaths(home), ...(project ? { denyWrite: [join(project, ".companion"), join(project, ".claude")] } : {}) },
  };
}

const MAX_NOTES = 20_000;
// Enough bytes to fill the limit even when every character takes four.
const MAX_READ = MAX_NOTES * 4;

// A plain file inside `root`, read without ever passing through a link: not the file, not any folder on the way. At most
// `max` bytes. Null for anything else (outside the project, a link, a folder, missing, unreadable).
function readInside(root: string, path: string, max: number): string | null {
  if (!path || path.startsWith("~")) return null;
  const rel = isAbsolute(path) ? relative(resolve(root), resolve(path)) : normalize(path);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  const parts = rel.split(sep).filter((p) => p && p !== ".");
  if (!parts.length) return null;
  let p = root;
  for (let i = 0; i < parts.length; i++) {
    p = join(p, parts[i]);
    let st;
    try { st = lstatSync(p); } catch { return null; }
    if (st.isSymbolicLink()) return null;
    if (i < parts.length - 1 ? !st.isDirectory() : !st.isFile()) return null;
  }
  let fd: number | undefined;
  try {
    // No following a link put there since the check, and no waiting on a pipe put there instead of the file.
    fd = openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    if (!fstatSync(fd).isFile()) return null;
    const buf = Buffer.alloc(max);
    let n = 0;
    for (;;) { const got = readSync(fd, buf, n, max - n, n); if (got <= 0) break; n += got; if (n >= max) break; }
    return buf.subarray(0, n).toString("utf8");
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* closed */ } }
}

// "@AGENTS.md" on a line of its own is an import (the way Claude Code reads a notes file). Not inside a code example.
const IMPORT = /^\s*@(\S+)\s*$/;
const FENCE = /^\s*(```|~~~)/;
// Never imported, in any spelling: settings and key files (.env, id_rsa, credentials.json and the like), and anything in
// Claude's, git's or Companion's own folders. The notes go into the instructions of every task, Plan, Rescue and Research
// included, where reading these files is refused, so a cloned project's CLAUDE.md must not be a way around that.
const privateFile = (rel: string) => isEnvFile(rel) || rel.split(sep).some((p) => PROTECTED.has(p.toLowerCase()));

// The project's own notes file, given to Claude as plain text. Claude Code is not told to load the project's settings
// (those can hold hooks and environment settings that run code), so this is how a project's instructions still arrive.
// Import lines are followed one level deep, only to plain files inside the project and never through a link, so a
// CLAUDE.md that is just "@AGENTS.md" (which Companion itself writes) gives Claude what AGENTS.md says. Settings and key
// files are never followed. What is not followed is left as the line it was. Everything together is held to the same size
// limit.
export function projectNotes(project: string): string | null {
  const text = readInside(project, "CLAUDE.md", MAX_READ);
  if (text === null) return null;
  const seen = new Set<string>(["CLAUDE.md"]);
  const out: string[] = [];
  let size = 0, inCode = false, stopped = false;
  for (const line of text.split("\n")) {
    if (size > MAX_NOTES) { stopped = true; break; }   // the rest would be cut anyway, so nothing more is read
    if (FENCE.test(line)) inCode = !inCode;
    const m = inCode ? null : IMPORT.exec(line);
    let piece = line;
    if (m) {
      const target = m[1];
      const key = isAbsolute(target) ? relative(resolve(project), resolve(target)) : normalize(target);
      const body = seen.has(key) || privateFile(key) ? null : readInside(project, target, MAX_READ);
      if (body !== null) { seen.add(key); piece = `[From ${key}]\n${body.replace(/\n+$/, "")}`; }
      else if (seen.has(key)) piece = "";
    }
    out.push(piece);
    size += piece.length + 1;
  }
  const all = out.join("\n");
  return all.length > MAX_NOTES || stopped ? `${all.slice(0, MAX_NOTES)}\n[... cut: the notes file is longer than what is passed on ...]` : all;
}

// Claude's own file reading tools are not inside the operating system sandbox, so the same places are refused for them too.
export const readDenyRules = (): string[] => SENSITIVE.flatMap((p) => [`Read(~/${p})`, `Read(~/${p}/**)`]);
