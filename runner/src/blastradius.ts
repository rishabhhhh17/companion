// M118 (docs/milestones/M118-blast-radius.md): whole-codebase blast-radius check.
// Scans local TypeScript/JavaScript files for callers broken by an exported function's arity increase or removed export.
// It reads names, not types, so it is only ever worth a look (callers_may_break), never a stop, and review.blastRadius turns it off.
// Never runs git in the user's repo, skips symlinks and build/vendor folders, and redacts any secret-looking text.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, posix, relative, resolve } from "node:path";
import { clip, redact } from "./redact.ts";
import type { Reason } from "./review/rate.ts";

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "target", ".next", ".turbo", ".cache", "coverage"]);
const MAX_FILE_BYTES = 256 * 1024;

export type ExportSig = { name: string; minArgs: number; isFunc: boolean };
export type ExportChange =
  | { kind: "arity"; name: string; oldMin: number; newMin: number }
  | { kind: "removed"; name: string };

/** test: the caller is a test file (labelled, and never the only reason for a finding). */
export type BrokenCaller = { file: string; line: number; passedArgs?: number; test?: boolean };
export type BlastFinding = {
  file: string;
  symbol: string;
  kind: "arity" | "removed";
  oldMin?: number;
  newMin?: number;
  callers: BrokenCaller[];
};

function countRequiredParams(paramList: string): number {
  const trimmed = paramList.trim();
  if (!trimmed) return 0;
  let depth = 0;
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  let required = 0;
  for (const p of parts) {
    if (!p || p.startsWith("...")) continue;
    // Strip top-level type annotation or default value to check optional `?` or `=`.
    const beforeType = splitTopLevel(p, ":")[0].trim();
    const hasDefault = splitTopLevel(p, "=").length > 1;
    const isOptional = beforeType.endsWith("?") || hasDefault;
    if (!isOptional) required++;
  }
  return required;
}

function splitTopLevel(s: string, sep: string): string[] {
  let depth = 0;
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const escapeRe = (s: string) => s.replace(/[$]/g, "\\$");

/** The source with every comment blanked (spaces, newlines kept, so places stay the same). keepStrings false also blanks
 *  what is inside each string, keeping its quotes, so a name inside a string or a comment is never a call. */
export function blankComments(src: string, keepStrings = true): string {
  let out = "";
  let i = 0;
  const blank = (t: string) => t.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const ch = src[i], next = src[i + 1];
    if (ch === "/" && next === "/") {
      const e = src.indexOf("\n", i);
      const stop = e < 0 ? src.length : e;
      out += blank(src.slice(i, stop)); i = stop; continue;
    }
    if (ch === "/" && next === "*") {
      const e = src.indexOf("*/", i + 2);
      const stop = e < 0 ? src.length : e + 2;
      out += blank(src.slice(i, stop)); i = stop; continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) { if (src[j] === "\\") j++; else if (ch !== "`" && src[j] === "\n") break; j++; }
      const body = src.slice(i + 1, Math.min(j, src.length));
      out += ch + (keepStrings ? body : blank(body)) + (j < src.length ? src[j] : "");
      i = j + 1; continue;
    }
    out += ch; i++;
  }
  return out;
}

const FN_RE = /export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>{]*>)?\s*\(([^)]*)\)/g;
const ARROW_RE = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:<[^>{]*>)?\s*\(([^)]*)\)\s*(?::[^=]+)?=>/g;
const FN_EXPR_RE = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?function\b\s*\*?\s*[\w$]*\s*(?:<[^>{]*>)?\s*\(([^)]*)\)/g;
const LIST_RE = /export\s+(?:type\s+)?\{([^}]*)\}\s*(from\s*["'][^"']+["'])?/g;

/** The required arguments of a function declared in the file under this local name, or null when none is found. */
function localSig(code: string, name: string): number | null {
  const n = escapeRe(name);
  const fn = new RegExp(`(?:^|[^\\w$.])(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*(?:<[^>{]*>)?\\s*\\(([^)]*)\\)`).exec(code);
  if (fn) return countRequiredParams(fn[1]);
  const arrow = new RegExp(`(?:const|let|var)\\s+${n}\\s*(?::[^=]+)?=\\s*(?:async\\s+)?(?:<[^>{]*>)?\\s*\\(([^)]*)\\)\\s*(?::[^=]+)?=>`).exec(code);
  if (arrow) return countRequiredParams(arrow[1]);
  const expr = new RegExp(`(?:const|let|var)\\s+${n}\\s*(?::[^=]+)?=\\s*(?:async\\s+)?function\\b\\s*\\*?\\s*[\\w$]*\\s*(?:<[^>{]*>)?\\s*\\(([^)]*)\\)`).exec(code);
  return expr ? countRequiredParams(expr[1]) : null;
}

/** Extracts the named exports of TypeScript/JavaScript source text: functions and const functions with their required
 *  arguments, and names exported another way (an export list, a re-export) with no signature. Comments are left out; a
 *  default export has no name to import, so it is not one. */
export function parseExports(src: string): Map<string, ExportSig> {
  const code = blankComments(src);
  const out = new Map<string, ExportSig>();
  for (const re of [FN_RE, ARROW_RE, FN_EXPR_RE]) {
    for (const m of code.matchAll(re)) out.set(m[1], { name: m[1], minArgs: countRequiredParams(m[2]), isFunc: true });
  }
  for (const m of code.matchAll(LIST_RE)) {
    const reexport = !!m[2];
    for (const part of m[1].split(",")) {
      const p = part.trim().replace(/^type\s+/, "");
      if (!p) continue;
      const [local, exported] = p.split(/\s+as\s+/).map((x) => x.trim());
      const name = exported ?? local;
      if (!/^[A-Za-z_$][\w$]*$/.test(name) || name === "default" || out.has(name)) continue;
      const min = reexport ? null : localSig(code, local);
      out.set(name, { name, minArgs: min ?? 0, isFunc: min !== null });
    }
  }
  return out;
}

/** Compares exports before and after an edit to find breaking arity increases or removed exports. A file that now
 *  re-exports everything from another (export * from) may still export any name, so nothing is said removed. */
export function diffExports(before: string, after: string): ExportChange[] {
  const prev = parseExports(before);
  const next = parseExports(after);
  const star = /export\s*\*\s*from\b/.test(blankComments(after));
  const changes: ExportChange[] = [];
  for (const [name, oldSig] of prev) {
    const newSig = next.get(name);
    if (!newSig) {
      if (!star) changes.push({ kind: "removed", name });
    } else if (oldSig.isFunc && newSig.isFunc && newSig.minArgs > oldSig.minArgs) {
      changes.push({ kind: "arity", name, oldMin: oldSig.minArgs, newMin: newSig.minArgs });
    }
  }
  return changes;
}

const TEST_FILE = /(^|\/)(__tests__|__mocks__|test|tests|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const isDts = (name: string) => /\.d\.[cm]?ts$/.test(name);
const tick = () => new Promise<void>((r) => setImmediate(r));

type Walk = { signal?: AbortSignal; maxFiles: number; over: () => boolean };
async function walkCodeFiles(root: string, w: Walk): Promise<string[]> {
  const files: string[] = [];
  const stack = [resolve(root)];
  let dirs = 0;
  while (stack.length && files.length < w.maxFiles) {
    if (w.signal?.aborted || w.over()) break;
    if (++dirs % 32 === 0) await tick();
    const dir = stack.pop()!;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (ent.name.startsWith(".") && ent.name !== ".well-known") continue;
      if (SKIP_DIRS.has(ent.name)) continue;
      const full = join(dir, ent.name);
      let st;
      try { st = lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { stack.push(full); continue; }
      if (st.isFile() && CODE_EXTS.has(extname(ent.name)) && !isDts(ent.name) && st.size <= MAX_FILE_BYTES) {
        files.push(full);
        if (files.length >= w.maxFiles) break;
      }
    }
  }
  return files;
}

/** One import of a file: its path as written, the line it starts on, the names it brings in (imported name to local
 *  name), and the local names that hold the whole module (import * as m, const m = require(...), await import(...)). */
type Import = { spec: string; line: number; named: { imported: string; local: string }[]; whole: string[] };

function bindingsOf(clause: string, destructure: "as" | ":"): { named: Import["named"]; whole: string[] } {
  const named: Import["named"] = [], whole: string[] = [];
  const c = clause.trim();
  const brace = /\{([^}]*)\}/.exec(c);
  if (brace) {
    for (const part of brace[1].split(",")) {
      const p = part.trim();
      if (!p || /^type\s/.test(p)) continue;
      const [imported, local] = (destructure === "as" ? p.split(/\s+as\s+/) : p.split(/\s*:\s*/)).map((x) => x.trim().split(/\s*=/)[0]);
      if (/^[A-Za-z_$][\w$]*$/.test(imported)) named.push({ imported, local: local && /^[A-Za-z_$][\w$]*$/.test(local) ? local : imported });
    }
  }
  const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(c);
  if (ns) whole.push(ns[1]);
  if (destructure === ":" && /^[A-Za-z_$][\w$]*$/.test(c)) whole.push(c);
  return { named, whole };
}

function importsOf(code: string, lineAt: (i: number) => number): Import[] {
  const out: Import[] = [];
  for (const m of code.matchAll(/(?:^|[^\w$.])import\s+(?!type\s)([\w$\s{},*]+?)\s*from\s*["']([^"']+)["']/g)) {
    out.push({ spec: m[2], line: lineAt(m.index! + m[0].indexOf("import")), ...bindingsOf(m[1], "as") });
  }
  for (const m of code.matchAll(/(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*(?:require\s*\(|await\s+import\s*\()\s*["']([^"']+)["']\s*\)/g)) {
    out.push({ spec: m[2], line: lineAt(m.index!), ...bindingsOf(m[1], ":") });
  }
  return out;
}

const stripExt = (p: string) => (CODE_EXTS.has(extname(p)) ? p.slice(0, -extname(p).length) : p);
/** Whether an import written in file `from` names the module at `target` (both relative to the project): a relative path,
 *  with or without its extension (a .js path for a .ts file too), or the folder of an index file. A package name never
 *  does. */
export function importNames(from: string, spec: string, target: string): boolean {
  if (!spec.startsWith(".")) return false;
  const key = stripExt(posix.normalize(posix.join(posix.dirname(from), spec)));
  const t = stripExt(target);
  return key === t || `${key}/index` === t;
}

function countCallArgs(lineAfterOpenParen: string): number | null {
  let depth = 0;
  let inStr: string | null = null;
  let argText = "";
  let closed = false;
  for (let i = 0; i < lineAfterOpenParen.length; i++) {
    const ch = lineAfterOpenParen[i];
    if (inStr) {
      if (ch === "\\" && i + 1 < lineAfterOpenParen.length) { argText += ch + lineAfterOpenParen[++i]; continue; }
      if (ch === inStr) inStr = null;
      argText += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; argText += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; argText += ch; continue; }
    if (ch === ")" && depth === 0) { closed = true; break; }
    if (ch === ")" || ch === "]" || ch === "}") { depth = Math.max(0, depth - 1); argText += ch; continue; }
    argText += ch;
  }
  if (!closed) return null;
  const trimmed = argText.trim();
  if (!trimmed) return 0;
  return splitTopLevel(trimmed, ",").filter((x) => x.trim().length > 0).length;
}

export type ChangedFile = { file: string; before: string; after: string };
export type BlastOptions = { signal?: AbortSignal; maxFiles?: number; maxMs?: number; now?: () => number };
/** The most files one check reads, and the most time it takes, so a big project never holds a review up. */
export const BLAST_MAX_FILES = 4000;
export const BLAST_MAX_MS = 2000;

/** Scans the project for callers in other files broken by the changed files' export edits. A caller counts only when its
 *  own import or require names the changed module's path. Every file is read once for all the changed names; the walk
 *  yields, ends at the abort signal (with nothing), and stops at maxFiles files or maxMs. Callers that are only tests are
 *  left out; a test beside a real caller is labelled. */
export async function checkBlastRadius(projectDir: string, changed: readonly ChangedFile[], o: BlastOptions = {}): Promise<BlastFinding[]> {
  const now = o.now ?? (() => performance.now());
  const start = now();
  const maxMs = o.maxMs ?? BLAST_MAX_MS;
  const over = () => now() - start > maxMs;
  const edits = changed.flatMap((ch) => diffExports(ch.before, ch.after).map((edit) => ({ module: ch.file.replace(/\\/g, "/"), edit })));
  if (!edits.length || o.signal?.aborted) return [];
  const root = resolve(projectDir);
  const allFiles = await walkCodeFiles(root, { signal: o.signal, maxFiles: o.maxFiles ?? BLAST_MAX_FILES, over });
  const names = [...new Set(edits.map((e) => e.edit.name))];
  const callers = new Map<number, BrokenCaller[]>();

  let read = 0;
  for (const full of allFiles) {
    if (o.signal?.aborted) return [];
    if (over()) break;
    if (++read % 64 === 0) await tick();
    const rel = relative(root, full).replace(/\\/g, "/");
    let text: string;
    try { text = readFileSync(full, "utf8"); } catch { continue; }
    if (!names.some((n) => text.includes(n))) continue;
    const code = blankComments(text);
    const starts = [0];
    for (let i = 0; i < code.length; i++) if (code[i] === "\n") starts.push(i + 1);
    const lineAt = (idx: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
    const imports = importsOf(code, lineAt);
    if (!imports.length) continue;
    let bare: string | null = null;
    const test = TEST_FILE.test(rel);

    edits.forEach(({ module, edit }, k) => {
      if (rel === module) return;
      const from = imports.filter((im) => importNames(rel, im.spec, module));
      if (!from.length) return;
      const locals = from.flatMap((im) => im.named.filter((n) => n.imported === edit.name).map((n) => n.local));
      const wholes = from.flatMap((im) => im.whole);
      if (!locals.length && !wholes.length) return;
      bare ??= blankComments(text, false);
      const found: BrokenCaller[] = [];
      const push = (c: BrokenCaller) => { if (!found.some((x) => x.line === c.line)) found.push(c); };
      if (edit.kind === "removed") {
        const named = from.find((im) => im.named.some((n) => n.imported === edit.name));
        if (named) push({ file: rel, line: named.line, ...(test ? { test } : {}) });
        for (const w of wholes) {
          const m = new RegExp(`(?<![\\w$.])${escapeRe(w)}\\s*\\.\\s*${escapeRe(edit.name)}\\b`).exec(bare);
          if (m) push({ file: rel, line: lineAt(m.index), ...(test ? { test } : {}) });
        }
      } else {
        const pats = [...locals.map((l) => `(?<![\\w$.])${escapeRe(l)}`), ...wholes.map((w) => `(?<![\\w$.])${escapeRe(w)}\\s*\\.\\s*${escapeRe(edit.name)}`)];
        for (const pat of pats) {
          const re = new RegExp(`${pat}\\s*\\(`, "g");
          for (const m of bare.matchAll(re)) {
            const at = m.index!;
            const lineStart = starts[lineAt(at) - 1];
            const before = bare.slice(lineStart, at);
            if (/\bfunction\s*\*?\s*$/.test(before)) continue;   // a declaration, declare function too
            const passed = countCallArgs(bare.slice(at + m[0].length, at + m[0].length + 4000));
            if (passed === null) continue;
            // A method definition: only modifiers before it on its line, and a body (or a return type and a body) after it.
            if (/^\s*(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*$/.test(before)) {
              const close = closeOf(bare, at + m[0].length);
              if (close >= 0 && /^\s*(?::[^;{}()=]*)?\{/.test(bare.slice(close + 1, close + 200))) continue;
            }
            if (passed < edit.newMin) push({ file: rel, line: lineAt(at), passedArgs: passed, ...(test ? { test } : {}) });
          }
        }
      }
      if (found.length) callers.set(k, [...(callers.get(k) ?? []), ...found]);
    });
  }

  const findings: BlastFinding[] = [];
  edits.forEach(({ module, edit }, k) => {
    const list = callers.get(k) ?? [];
    if (!list.some((c) => !c.test)) return;
    list.sort((a, b) => Number(!!a.test) - Number(!!b.test) || a.file.localeCompare(b.file) || a.line - b.line);
    findings.push({ file: module, symbol: edit.name, kind: edit.kind, ...(edit.kind === "arity" ? { oldMin: edit.oldMin, newMin: edit.newMin } : {}), callers: list });
  });
  return findings;
}

/** The index of the ")" that closes the call whose arguments start at `from`, or -1. */
function closeOf(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < Math.min(s.length, from + 4000); i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" && depth === 0) return i;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
  }
  return -1;
}

const placeOf = (c: BrokenCaller) => `${c.file} (line ${c.line}${c.test ? ", a test" : ""})`;
/** Formats blast-radius findings into plain sentences for review cards or reports (no em dashes, redacted). */
export function formatBlastFindings(findings: readonly BlastFinding[]): string[] {
  return findings.map((f) => {
    const places = f.callers.slice(0, 3).map(placeOf).join(" and ");
    const more = f.callers.length > 3 ? ` and ${f.callers.length - 3} more` : "";
    const first = f.callers[0].passedArgs ?? 0;
    const msg = f.kind === "removed"
      ? `Removing ${f.symbol} in ${f.file} may break ${places}${more}, which still import it.`
      : `Changing ${f.symbol} in ${f.file} may break ${places}${more}, which still pass ${first} argument${first === 1 ? "" : "s"} instead of ${f.newMin}.`;
    return clip(redact(msg), 240);
  });
}

/** Converts blast-radius findings into ReviewService Reason rows: callers_may_break, worth a look at most, never a stop
 *  (the check reads names, not types, so it can be wrong). */
export async function blastRadiusReasons(projectDir: string, changed: readonly ChangedFile[], o: BlastOptions = {}): Promise<Reason[]> {
  const findings = await checkBlastRadius(projectDir, changed, o);
  return findings.map((f) => ({
    kind: "callers_may_break",
    file: f.callers[0]?.file ?? f.file,
    line: f.callers[0]?.line,
    say: formatBlastFindings([f])[0],
  }));
}
