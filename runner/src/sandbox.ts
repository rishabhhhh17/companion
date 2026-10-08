// What the operating system sandbox is told. Under Companion's own checks sits macOS's real sandbox: it was shown (with our
// checks switched off) to refuse writing outside the project, writing in the home folder, and all network traffic.
// Here we add: the few places packages may be downloaded from, and the places no agent may ever read.
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const REGISTRY_DOMAINS = [
  "registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org",
  "crates.io", "static.crates.io", "index.crates.io", "rubygems.org", "index.rubygems.org",
];

// Logins, keys, tokens, the person's own Claude login, Companion's own data, the Keychain, browsers, mail and messages.
const SENSITIVE = [
  ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".npmrc", ".netrc", ".pypirc", ".git-credentials", ".azure",
  ".config/gcloud", ".config/gh", ".config/op", ".terraform.d/credentials.tfrc.json",
  ".claude", ".claude.json", ".zsh_history", ".bash_history", ".python_history", ".node_repl_history",
  "Library/Keychains", "Library/Application Support/Companion", "Library/Application Support/Companion-test-claude", "Library/Application Support/dev.companion.app",
  "Library/Application Support/Google/Chrome", "Library/Application Support/Firefox", "Library/Application Support/Arc", "Library/Application Support/BraveSoftware",
  "Library/Application Support/Microsoft Edge", "Library/Application Support/Dia", "Library/Safari", "Library/Cookies", "Library/Messages", "Library/Mail", "Library/Accounts",
];
// The only places in the home folder a command may write: the download caches of package managers.
const CACHES = [".npm", ".cache", "Library/Caches", ".bun/install", ".local/share/pnpm", "Library/pnpm", ".yarn", ".cargo/registry", ".cargo/git", ".gem", ".pnpm-store"];
export const cachePaths = (home: string): string[] => CACHES.map((p) => `${home}/${p}`);
export const sensitivePaths = (home: string): string[] => SENSITIVE.map((p) => `${home}/${p}`);

export function sandboxSettings(home: string, platform: string = process.platform) {
  return {
    enabled: platform === "darwin",
    allowUnsandboxedCommands: false,
    network: { allowedDomains: REGISTRY_DOMAINS, strictAllowlist: true, allowLocalBinding: true },
    filesystem: { denyRead: sensitivePaths(home), allowWrite: cachePaths(home) },
  };
}

const MAX_NOTES = 20_000;
// The project's own notes file, given to Claude as plain text. Claude Code is not told to load the project's settings
// (those can hold hooks and environment settings that run code), so this is how a project's instructions still arrive.
export function projectNotes(project: string): string | null {
  const f = join(project, "CLAUDE.md");
  try {
    const st = lstatSync(f);
    if (!st.isFile() || st.isSymbolicLink()) return null;      // never read through a link
    const text = readFileSync(f, "utf8");
    return text.length > MAX_NOTES ? `${text.slice(0, MAX_NOTES)}\n[... cut: the notes file is longer than what is passed on ...]` : text;
  } catch { return null; }
}

// Claude's own file reading tools are not inside the operating system sandbox, so the same places are refused for them too.
export const readDenyRules = (): string[] => SENSITIVE.flatMap((p) => [`Read(~/${p})`, `Read(~/${p}/**)`]);
