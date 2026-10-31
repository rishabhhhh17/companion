// Reading shell command lines the way a shell does, closely enough to judge them. Shared by the safety guard and the house
// rules, so a trick that works against one cannot work against the other.
import { basename } from "node:path";

// A command line with line continuations joined ("git\<newline> push" is "git push").
export const normalize = (cmd: string): string => cmd.replace(/\\\r?\n/g, "");

// $'...' (ANSI-C quoting, in bash and zsh): a backslash escapes the next character, so \' is a quote inside it, not its
// end. The escapes the checker reads the same as the shell; any other (\x63, \u, \c) is kept as written, and a line with
// this quoting always asks at least (hasAnsiQuote), since such an escape can spell a word no reader sees.
const ANSI: Record<string, string> = { "\\": "\\", "'": "'", '"': '"', "?": "?", n: "\n", t: "\t", r: "\r" };

// Split into commands and words. Quote aware; `$(...)`, backticks, subshells, pipes and `;` all start a new command.
export function parseShell(raw: string): string[][] {
  const cmd = normalize(raw);
  const commands: string[][] = [];
  let words: string[] = [];
  let word = "";
  let has = false;
  let q: "" | "'" | '"' | "$" = "";   // "$": inside $'...'
  const endWord = () => { if (has) words.push(word); word = ""; has = false; };
  const endCmd = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = ""; else { word += c; has = true; } continue; }
    if (q === "$") {
      if (c === "'") q = "";
      else if (c === "\\" && i + 1 < cmd.length) { const e = cmd[++i]; word += ANSI[e] ?? `\\${e}`; }
      else word += c;
      has = true; continue;
    }
    if (c === "$" && cmd[i + 1] === "(") { word += "$("; has = true; endCmd(); i++; continue; }
    if (c === "`") { endCmd(); continue; }
    if (q === '"') {
      // Inside "...", a backslash escapes only $ ` " \ and a newline; before anything else it stays (as the shell keeps it).
      if (c === '"') q = ""; else if (c === "\\" && i + 1 < cmd.length) { const e = cmd[++i]; word += /[$`"\\\n]/.test(e) ? e : `\\${e}`; } else word += c;
      has = true; continue;
    }
    if (c === "$" && cmd[i + 1] === "'") { q = "$"; has = true; i++; continue; }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === "\\" && i + 1 < cmd.length) { word += cmd[++i]; has = true; continue; }
    if (/\s/.test(c) && c !== "\n") { endWord(); continue; }
    if (c === "\n" || c === ";" || c === "|" || c === "&" || c === "(" || c === ")" || c === "{" || c === "}") { endCmd(); continue; }
    word += c; has = true;
  }
  endCmd();
  return commands.map((w) => w.map((x) => x.replace(/^\$\($/, "")).filter((x) => x.length > 0));
}

/** Whether the line uses $'...' quoting outside other quotes (inside "..." or '...' a $' is just text). */
export function hasAnsiQuote(raw: string): boolean {
  const cmd = normalize(raw);
  let q: "" | "'" | '"' = "";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = ""; continue; }
    if (q === '"') { if (c === '"') q = ""; else if (c === "\\") i++; continue; }
    if (c === "\\") { i++; continue; }
    if (c === "$" && cmd[i + 1] === "'") return true;
    if (c === "'" || c === '"') q = c;
  }
  return false;
}

// The command builds part of itself while it runs ($VAR, $(...), backticks), so it cannot be fully checked in advance.
export const hasDynamic = (cmd: string): boolean => /\$\(|`|\$\{|\$[A-Za-z_]|[<>]\(/.test(normalize(cmd));   // [<>]( is a process substitution: a pipeline built while it runs

// ---------- wrappers: programs that just run another program ----------

const OPTION_VALUES: Record<string, string[]> = {
  env: ["-u", "--unset", "-C", "--chdir", "-P"], nice: ["-n", "--adjustment"], timeout: ["-k", "--kill-after", "-s", "--signal"], stdbuf: ["-i", "-o", "-e"],
  caffeinate: ["-t", "-w"], watch: ["-n", "--interval"], xcrun: ["-sdk", "--sdk", "-toolchain", "--toolchain", "-log"], arch: ["-arch"], script: ["-t", "-F"],
  time: ["-o", "-f"], exec: ["-a"], ionice: ["-c", "-n", "-p"], command: [], builtin: [], nohup: [], chronic: [], unbuffer: [],
};
const WRAPPERS = new Set(Object.keys(OPTION_VALUES));
const RESERVED = new Set(["then", "do", "else", "elif", "if", "while", "until", "!", "time"]);

export type Unwrapped = { words: string[]; nested: string[] };

// Peel off VAR=value prefixes and wrappers (env, nice, timeout, caffeinate, arch, xcrun, watch, script, command, exec, ...).
// `nested` holds shell text found inside wrappers (like env -S 'git push'), which must be judged too.
export function unwrap(input: string[]): Unwrapped {
  let w = [...input];
  const nested: string[] = [];
  for (let guard = 0; guard < 30 && w.length; guard++) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || RESERVED.has(w[0])) { w.shift(); continue; }
    const name = basename(w[0]);
    if (!WRAPPERS.has(name)) break;
    w.shift();
    const takes = new Set(OPTION_VALUES[name]);
    let queryOnly = false;
    while (w.length && w[0].startsWith("-") && w[0] !== "-") {
      const o = w.shift()!;
      if (o === "--") break;
      if (name === "env" && (o === "-S" || o === "--split-string") && w.length) { nested.push(w.shift()!); continue; }
      if (name === "env" && o.startsWith("-S") && o.length > 2) { nested.push(o.slice(2)); continue; }
      if (name === "command" && /^-[vV]$/.test(o)) queryOnly = true;
      if (takes.has(o) && w.length) w.shift();
    }
    if (queryOnly) return { words: [], nested };
    if (name === "timeout" && w.length) w.shift();                      // the duration
    if (name === "script" && w.length) w.shift();                       // the typescript file name
    if (name === "env") while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w.shift();
  }
  return { words: w, nested };
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);

// Every real command in a line, fully unwrapped, looking inside `sh -c "..."`, `eval`, `env -S` and the like.
export function commandsOf(cmd: string, depth = 0): string[][] {
  if (depth > 4) return [["<too deep>"]];
  const out: string[][] = [];
  for (const raw of parseShell(cmd)) {
    const { words, nested } = unwrap(raw);
    for (const n of nested) out.push(...commandsOf(n, depth + 1));
    if (!words.length) continue;
    const name = basename(words[0]);
    if (SHELLS.has(name)) {
      const i = words.findIndex((a, k) => k > 0 && /^-[a-z]*c[a-z]*$/.test(a));
      if (i > 0 && words[i + 1] !== undefined) { out.push(...commandsOf(words[i + 1], depth + 1)); continue; }
    }
    if (name === "eval") { out.push(...commandsOf(words.slice(1).join(" "), depth + 1)); continue; }
    out.push(words);
  }
  return out;
}

/** The text inside every nested shell string, however deep: `sh -c "..."`, `eval "..."`, `env -S "..."`. commandsOf judges the commands in
 *  them; this lets a caller read what else such a string does (above all where it redirects output, which sits inside the quotes
 *  and is invisible to a scan of the outer line). */
export function nestedStrings(cmd: string, depth = 0): string[] {
  if (depth > 4) return [];
  const out: string[] = [];
  for (const raw of parseShell(cmd)) {
    const { words, nested } = unwrap(raw);
    for (const n of nested) out.push(n, ...nestedStrings(n, depth + 1));
    if (!words.length) continue;
    const name = basename(words[0]);
    let inner: string | undefined;
    if (SHELLS.has(name)) {
      const i = words.findIndex((a, k) => k > 0 && /^-[a-z]*c[a-z]*$/.test(a));
      if (i > 0) inner = words[i + 1];
    } else if (name === "eval") inner = words.slice(1).join(" ");
    if (inner !== undefined) out.push(inner, ...nestedStrings(inner, depth + 1));
  }
  return out;
}

// ---------- here documents ----------

// The command line with the text of each here document taken out (`cat <<EOF` ... `EOF`). That text is data handed to the
// command, never shell, so a `</div>` or a `1 > 0` in a page written this way is no redirection. The line that starts a here
// document and everything after its closing line are kept. A here document with no closing line runs to the end, as in a
// shell.
export function withoutHereDocs(raw: string): string {
  const cmd = normalize(raw);
  let out = "";
  let q: "" | "'" | '"' | "$" = "";   // "$": inside $'...', which ends at a ' that no backslash escapes
  // Inside arithmetic, $(( )), (( )) or $[ ], << shifts bits; it starts no here document.
  let arith = 0, closer = "";
  const pending: { word: string; tabs: boolean }[] = [];
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { out += c; if (c === (q === "$" ? "'" : q)) q = ""; else if (c === "\\" && q !== "'" && i + 1 < cmd.length) out += cmd[++i]; continue; }
    if (c === "$" && cmd[i + 1] === "'") { q = "$"; out += "$'"; i++; continue; }
    if (c === "'" || c === '"') { q = c; out += c; continue; }
    if (c === "\\" && i + 1 < cmd.length) { out += c + cmd[++i]; continue; }
    if (arith) {
      out += c;
      if (c === (closer === ")" ? "(" : "[")) arith++;
      else if (c === closer) arith--;
      continue;
    }
    if ((c === "(" && cmd[i + 1] === "(") || (c === "$" && cmd[i + 1] === "[")) {
      closer = c === "(" ? ")" : "]";
      arith = c === "(" ? 2 : 1;
      out += cmd.slice(i, i + 2); i++;
      continue;
    }
    if (c === "<" && cmd[i + 1] === "<" && cmd[i + 2] !== "<") {
      let j = i + 2;
      const tabs = cmd[j] === "-";
      if (tabs) j++;
      while (cmd[j] === " " || cmd[j] === "\t") j++;
      let word = "", wq = "";
      for (; j < cmd.length; j++) {
        const t = cmd[j];
        if (wq) { if (t === wq) wq = ""; else word += t; continue; }
        if (t === "'" || t === '"') { wq = t; continue; }
        if (t === "\\" && j + 1 < cmd.length) { word += cmd[++j]; continue; }
        if (/[\s;&|()<>]/.test(t)) break;
        word += t;
      }
      out += cmd.slice(i, j);
      if (word) pending.push({ word, tabs });
      i = j - 1;
      continue;
    }
    if (c === "\n" && pending.length) {
      // Skip each here document's text in turn, up to and including its closing line.
      out += c;
      let k = i + 1;
      for (const { word, tabs } of pending) {
        while (k < cmd.length) {
          const e = cmd.indexOf("\n", k), end = e < 0 ? cmd.length : e;
          const line = cmd.slice(k, end);
          k = end + 1;
          if ((tabs ? line.replace(/^\t+/, "") : line) === word) break;
        }
      }
      pending.length = 0;
      i = k - 1;
      continue;
    }
    out += c;
  }
  return out;
}

// ---------- redirections: where output is written ----------

// The files a command line writes to with >, >>, >|, &> or 2>. File descriptor copies (>&2) and /dev/null are left out.
export function redirectTargets(raw: string): string[] {
  const cmd = withoutHereDocs(raw);
  const out: string[] = [];
  let q: "" | "'" | '"' | "$" = "";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === (q === "$" ? "'" : q)) q = ""; else if (c === "\\" && q !== "'") i++; continue; }
    if (c === "$" && cmd[i + 1] === "'") { q = "$"; i++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === "\\") { i++; continue; }
    if (c !== ">") continue;
    let j = i + 1;
    if (cmd[j] === ">") j++;
    if (cmd[j] === "|") j++;
    if (cmd[j] === "&") { i = j; continue; }                      // >&2 copies a descriptor, it writes no file
    while (cmd[j] === " " || cmd[j] === "\t") j++;
    let target = "", tq = "";
    for (; j < cmd.length; j++) {
      const t = cmd[j];
      if (tq) { if (t === tq) { tq = ""; continue; } target += t; continue; }
      if (t === "'" || t === '"') { tq = t; continue; }
      if (/[\s;&|()<>]/.test(t)) break;
      target += t;
    }
    i = j - 1;
    if (target && !/^\/dev\/(null|stdout|stderr|tty|zero)$/.test(target)) out.push(target);
  }
  return out;
}

// ---------- input redirections: where input is read from ----------

// The files a command line reads with < (or <>). Here documents (<<, <<<), process substitution (<(...)) and descriptor
// copies (<&3) name no file, so they are left out.
export function inputTargets(raw: string): string[] {
  const cmd = withoutHereDocs(raw);
  const out: string[] = [];
  let q: "" | "'" | '"' | "$" = "";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === (q === "$" ? "'" : q)) q = ""; else if (c === "\\" && q !== "'") i++; continue; }
    if (c === "$" && cmd[i + 1] === "'") { q = "$"; i++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === "\\") { i++; continue; }
    if (c !== "<") continue;
    let j = i + 1;
    if (cmd[j] === "<") { i = j + (cmd[j + 1] === "<" ? 1 : 0); continue; }   // a here document or here string
    if (cmd[j] === "(" || cmd[j] === "&") { i = j; continue; }               // process substitution, or a descriptor copy
    if (cmd[j] === ">") j++;
    while (cmd[j] === " " || cmd[j] === "\t") j++;
    let target = "", tq = "";
    for (; j < cmd.length; j++) {
      const t = cmd[j];
      if (tq) { if (t === tq) { tq = ""; continue; } target += t; continue; }
      if (t === "'" || t === '"') { tq = t; continue; }
      if (/[\s;&|()<>]/.test(t)) break;
      target += t;
    }
    i = j - 1;
    if (target && !/^\/dev\/(null|stdin|zero|urandom|random|tty)$/.test(target)) out.push(target);
  }
  return out;
}
