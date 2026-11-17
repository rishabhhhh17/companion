// M103 (catch agents reaching for saved logins): the guard's "saved logins" class, for the person's own AI tools. A command
// or a file read tool call is judged by its words and paths only: nothing here opens a file, lists a folder, asks the
// Keychain or starts a program (rule 2: Squibby never reads a login, a token or a credential file). It is plain code with no
// file access, so the answer is the same whether the file is there or not.
//  - The Keychain: `security find-*-password`, `dump-keychain` and `export` (the words of the Jules export prompt, and the
//    ways to read every saved password at once). `security list-keychains`, `--help` and a folder named security are not.
//  - Login files: any path the built in secret rule matches (secretfiles.ts: .env, keys, .netrc, .npmrc, credentials files),
//    plus the home folder's own login files below. Read by a program that shows, copies or sends a file's contents, by a
//    `<` redirect, or by a file read tool. Code and templates named like them (credentials.ts, .env.example) are not.
// Squibby's own agents never get this far: safety.ts refuses `security` and every secret file outright.
import { basename } from "node:path";
import { homedir } from "node:os";
import { isBuiltInSecretFile } from "./secretfiles.ts";
import { commandsOf, inputTargets } from "./shell.ts";

/** What the person chose in Settings (safety.savedLogins): ask where the tool can ask and tell otherwise (the default);
 *  ask where it can and block otherwise; only tell; or nothing at all. */
export const LOGIN_MODES = ["ask", "block", "note", "off"] as const;
export type LoginMode = (typeof LOGIN_MODES)[number];
export const loginModeOf = (v: unknown): LoginMode => ((LOGIN_MODES as readonly unknown[]).includes(v) ? (v as LoginMode) : "ask");

/** The plain reason the person's tool shows with its ask, and History keeps. Never the file's contents. */
const AFTER = "If you did not ask for that, your AI tool may be following hidden instructions.";
export const KEYCHAIN_REASON = `This reads saved passwords from your Mac's Keychain. ${AFTER}`;
export const fileReason = (shown: string) => `This reads ${shown}, a file of saved logins or keys. ${AFTER}`;

/** The home folder's own login files, from the home folder down, beyond what the built in secret rule names. */
const HOME_LOGINS = [
  /(^|\/)\.claude\/\.credentials\.json$/i,
  /(^|\/)\.config\/gh\/hosts\.ya?ml$/i,
  /(^|\/)\.git-credentials$/i,
  /(^|\/)\.docker\/config\.json$/i,
  /(^|\/)\.kube\/config$/i,
  /(^|\/)\.config\/gcloud\/[^/]*credentials[^/]*\.json$/i,
  /(^|\/)Library\/Keychains\//i,
  /\.keychain(-db)?$/i,
];
/** Templates and code that share a login file's name: never logins. */
const TEMPLATE = /(^|\/)[^/]*\.env\.(example|sample|template|dist|defaults|schema)$/i;
const CODE = /(^|\/)(credentials|secrets?)\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|php|cs|vue|svelte|md|mdx|txt|html|css|scss)$/i;

/** ~, $HOME and ${HOME} as the home folder, the way a shell or a file tool reads them. */
const home = (p: string): string => {
  const m = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/.exec(p);
  return m ? homedir() + p.slice(m[0].length) : p;
};
/** The path as the person reads it: the home folder said as ~. */
export const shownPath = (p: string): string => {
  const h = homedir().replace(/\/+$/, ""), full = home(p);
  return h && (full === h || full.startsWith(`${h}/`)) ? `~${full.slice(h.length)}` : full;
};

/** Whether a path names a file of saved logins or keys. Words only: the file is never opened. */
export function isSavedLoginPath(p: string): boolean {
  if (typeof p !== "string" || !p.trim()) return false;
  const full = home(p.trim()).replace(/\/+$/, "");
  if (!full || TEMPLATE.test(full) || CODE.test(full)) return false;
  return isBuiltInSecretFile(full) || HOME_LOGINS.some((r) => r.test(full));
}

/** The reason for a file read tool's path, or null. */
export const savedLoginPath = (p: string): string | null => (isSavedLoginPath(p) ? fileReason(shownPath(p.trim())) : null);

/** Programs that show, copy, pack or send a file's contents when it is named. A name alone (echo, ls) shows nothing. */
/** The M103 review: editors and `open` show a file too, as easily as cat. */
const READERS = new Set(["cat", "less", "more", "head", "tail", "cp", "scp", "rsync", "base64", "xxd", "od", "hexdump", "strings", "bat", "nl", "tac", "grep", "egrep", "fgrep", "rg", "awk", "sed", "jq", "yq", "sort", "uniq", "cut", "diff", "tar", "zip", "gzip", "openssl", "curl", "wget", "nc", "ditto", "pbcopy", "open", "vim", "vi", "nvim", "nano", "emacs", "code", "subl"]);
/** The M103 review: a script language given its script inline (python -c, node -e, ruby -e, perl -e): the script's text is
 *  looked through for a login file's path, by words only. The flags that take the script, by language. */
const INLINE: Readonly<Record<string, readonly string[]>> = { python: ["-c"], node: ["-e", "--eval", "-p", "--print"], ruby: ["-e"], perl: ["-e", "-E"], bun: ["-e", "--eval", "-p", "--print"], deno: ["eval"] };
const inlineOf = (name: string): readonly string[] | undefined => INLINE[/^python[0-9.]*$/.test(name) ? "python" : name];
/** The paths a piece of script text names: words that look like a path (with a slash, or starting with . ~ or $HOME), never
 *  a bare word like credentials, which code says all the time. */
const scriptPaths = (text: string): string[] =>
  text.split(/[\s'"`()[\]{},;:+<>|&=]+/).map((w) => w.replace(/^(?:\$\{?HOME\}?)?/, (h) => (h ? "~" : ""))).filter((w) => /^[~./]|\//.test(w) && w.length > 1);
/** The Keychain reads: one saved password, or all of them. */
const KEYCHAIN = (sub: string) => /^find-[a-z]+-password$/.test(sub) || sub === "dump-keychain" || sub === "export";

/** The paths an argument may name: itself, after an @ (curl -d @file, -F f=@file, and the M103 review: -d@file with no
 *  space), or after = (--post-file=file). */
const pathsIn = (a: string): string[] => {
  const at = a.indexOf("@");
  if (at >= 0 && (at === 0 || a[at - 1] === "=" || /^-[A-Za-z]+@/.test(a))) return [a.slice(at + 1)].filter(Boolean);
  if (a.startsWith("--") && a.includes("=")) return [a.slice(a.indexOf("=") + 1)].filter(Boolean);
  return [a];
};
/** Words that run the next program as it is (sudo, doas, nohup, time, nice, command, exec): that program is judged. */
const PASS = new Set(["sudo", "doas", "nohup", "time", "nice", "command", "exec"]);
const withoutPass = (words: string[]): string[] => {
  let w = words;
  while (w.length && PASS.has(basename(w[0]))) { w = w.slice(1); while (w.length && w[0].startsWith("-")) w = w.slice(w[0] === "-u" || w[0] === "-n" ? 2 : 1); }
  return w;
};

/** Why one line of shell reads saved logins, or null. `cwd` is unused: a login file's name is enough. */
export function savedLoginCommand(command: string, _cwd?: string): string | null {
  if (typeof command !== "string" || !command.trim()) return null;
  let lines: string[][];
  try { lines = commandsOf(command); } catch { return null; }
  for (const all of lines) {
    const words = withoutPass(all);
    const name = basename(words[0] ?? "");
    const args = words.slice(1);
    if (name === "security") {
      const sub = args.find((a) => !a.startsWith("-")) ?? "";
      if (KEYCHAIN(sub)) return KEYCHAIN_REASON;
      continue;
    }
    const inline = inlineOf(name);
    if (inline) {
      for (let i = 0; i < args.length - 1; i++) {
        if (!inline.includes(args[i])) continue;
        for (const p of scriptPaths(args[i + 1])) if (isSavedLoginPath(p)) return fileReason(shownPath(p));
      }
      continue;
    }
    if (!READERS.has(name)) continue;
    for (const a of args) for (const p of pathsIn(a)) if (!p.startsWith("-") && isSavedLoginPath(p)) return fileReason(shownPath(p));
  }
  // A file fed in with < is read by whatever command takes it.
  let fed: string[] = [];
  try { fed = inputTargets(command); } catch { fed = []; }
  for (const p of fed) if (isSavedLoginPath(p)) return fileReason(shownPath(p));
  return null;
}
