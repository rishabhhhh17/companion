// Reading shell command lines the way a shell does, closely enough to judge them. Shared by the safety guard and the house
// rules, so a trick that works against one cannot work against the other.
import { basename } from "node:path";

// A command line with line continuations joined ("git\<newline> push" is "git push").
export const normalize = (cmd: string): string => cmd.replace(/\\\r?\n/g, "");

// Split into commands and words. Quote aware; `$(...)`, backticks, subshells, pipes and `;` all start a new command.
export function parseShell(raw: string): string[][] {
  const cmd = normalize(raw);
  const commands: string[][] = [];
  let words: string[] = [];
  let word = "";
  let has = false;
  let q: "" | "'" | '"' = "";
  const endWord = () => { if (has) words.push(word); word = ""; has = false; };
  const endCmd = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = ""; else { word += c; has = true; } continue; }
    if (c === "$" && cmd[i + 1] === "(") { word += "$("; has = true; endCmd(); i++; continue; }
    if (c === "`") { endCmd(); continue; }
    if (q === '"') {
      if (c === '"') q = ""; else if (c === "\\" && i + 1 < cmd.length) { word += cmd[++i]; } else word += c;
      has = true; continue;
    }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === "\\" && i + 1 < cmd.length) { word += cmd[++i]; has = true; continue; }
    if (/\s/.test(c) && c !== "\n") { endWord(); continue; }
    if (c === "\n" || c === ";" || c === "|" || c === "&" || c === "(" || c === ")" || c === "{" || c === "}") { endCmd(); continue; }
    word += c; has = true;
  }
  endCmd();
  return commands.map((w) => w.map((x) => x.replace(/^\$\($/, "")).filter((x) => x.length > 0));
}

// The command builds part of itself while it runs ($VAR, $(...), backticks), so it cannot be fully checked in advance.
export const hasDynamic = (cmd: string): boolean => /\$\(|`|\$\{|\$[A-Za-z_]/.test(normalize(cmd));

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

// ---------- redirections: where output is written ----------

// The files a command line writes to with >, >>, >|, &> or 2>. File descriptor copies (>&2) and /dev/null are left out.
export function redirectTargets(raw: string): string[] {
  const cmd = normalize(raw);
  const out: string[] = [];
  let q: "" | "'" | '"' = "";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === q) q = ""; else if (c === "\\" && q === '"') i++; continue; }
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
  const cmd = normalize(raw);
  const out: string[] = [];
  let q: "" | "'" | '"' = "";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === q) q = ""; else if (c === "\\" && q === '"') i++; continue; }
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
