// Point at the problem: turn a failing check's output into one real place in the person's project, so the character can
// fly to it. Only files inside the project that the person (or their AI) wrote count: never node_modules, build output
// or anything a link leads to outside the folder. When no place can be trusted, the error sentence is kept instead, so
// it can still be found on the person's screen. Nothing here guesses a line.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { label, redact } from "../redact.ts";
import type { Problem } from "../../../protocol/index.ts";

export type { Problem };

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
// Folders the person did not write: tools, build output, Companion's own notes.
const NOT_THEIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", ".output", "coverage", ".companion", ".vercel", ".turbo", ".cache", "__pycache__", ".venv", "venv"]);
const MAX_FILE = 2_000_000;
const LINE_MAX = 200;
const MESSAGE_MAX = 200;

type Place = { path: string; line: number; column?: number; at: number; message?: string; declared?: boolean };

// path:line:col, path:line, path(line,col), with or without file://
const AT = /(?:file:\/\/)?((?:\.{0,2}\/)?[\w@~+.-][^\s()"'<>|,:]*\.[A-Za-z0-9]{1,6})(?::(\d+)(?::(\d+))?|\((\d+),(\d+)\))/g;
const PY = /File "([^"]+)", line (\d+)/g;
const ESLINT_FILE = /^((?:\/|\.{1,2}\/|[\w@-]+\/)\S*\.[A-Za-z0-9]{1,6})\s*$/;
const ESLINT_ROW = /^\s+(\d+):(\d+)\s+error\s+(.+?)(?:\s{2,}\S+)?\s*$/;
// What a tool says right after the place: "error TS2322: ...", "ERROR: ...", "error: ..."
const AFTER = /^(?::|\s+-)\s*(?:error\s+TS\d+|ERROR|error)\s*:\s*(.+)$/;
const ERROR_LINE = /^\s*((?:[A-Z][A-Za-z]*)?(?:Error|Exception)\b:.*)$/;
const ERRORISH = /error|not found|cannot|can't|failed|missing|ERR!|refused|denied|unexpected/i;

function places(text: string): { list: Place[]; python: boolean } {
  const list: Place[] = [];
  for (const m of text.matchAll(PY)) list.push({ path: m[1], line: Number(m[2]), at: m.index! });
  if (list.length) return { list, python: true };
  for (const m of text.matchAll(AT)) {
    const line = Number(m[2] ?? m[4]), column = m[3] ?? m[5];
    const rest = text.slice(m.index! + m[0].length).split("\n", 1)[0];
    const said = AFTER.exec(rest)?.[1]?.trim();
    // TAP output also says where a test was declared ("location: '...:9:1'"): a fallback, never the first choice (the check
    // that failed is in the stack, and is better to point at).
    const lineStart = text.lastIndexOf("\n", m.index!) + 1;
    const declared = /^\s*location:/.test(text.slice(lineStart, m.index!));
    list.push({ path: m[1], line, ...(column ? { column: Number(column) } : {}), at: m.index!, ...(said ? { message: said } : {}), ...(declared ? { declared: true } : {}) });
  }
  // ESLint names the file on its own line and the places under it.
  const lines = text.split("\n");
  let file = "", offset = 0;
  for (const l of lines) {
    const f = ESLINT_FILE.exec(l);
    if (f) file = f[1];
    else if (file) { const r = ESLINT_ROW.exec(l); if (r) list.push({ path: file, line: Number(r[1]), column: Number(r[2]), at: offset, message: r[3].trim() }); else if (l.trim() && !/^\s/.test(l)) file = ""; }
    offset += l.length + 1;
  }
  list.sort((a, b) => a.at - b.at);
  return { list, python: false };
}

// Folders that are never a person's own code when a path is matched loosely: installed packages and built files.
const NEVER_LOOSE = new Set([...NOT_THEIRS, "_next", "site-packages", "dist-packages", "@fs"]);

/** Every ordinary file in the project (paths relative to it), skipping folders the person did not write. Bounded. */
function projectFiles(root: string): string[] {
  const out: string[] = [];
  let seen = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || seen > 20_000) return;
    let names: string[];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (++seen > 20_000) return;
      if (NEVER_LOOSE.has(n)) continue;
      const p = join(dir, n);
      let st; try { st = lstatSync(p); } catch { continue; }   // a link is never followed
      if (st.isDirectory()) walk(p, depth + 1);
      else if (st.isFile()) out.push(relative(root, p).split(sep).join("/"));
    }
  };
  walk(root, 0);
  return out;
}

/** A path that is not in the project as written, matched to one file that is. A path that exists somewhere else on this Mac
 *  is another folder's, never this project's. A path from elsewhere (a build machine, a page address) counts when its end,
 *  at least the folder and the file, names a file here; a path from a terminal opened in a folder inside the project counts
 *  when exactly one file here ends with it. Anything less certain is not matched. */
function looseFile(root: string, path: string, files: () => string[]): string | null {
  if (isAbsolute(path) && existsSync(path)) return null;
  const parts = path.split(/[\\/]+/).filter((x) => x && x !== "." && x !== "..");
  if (parts.length === 0 || parts.some((x) => NEVER_LOOSE.has(x))) return null;
  const isFile = (rel: string) => { try { return statSync(join(root, rel)).isFile(); } catch { return false; } };
  if (isAbsolute(path)) for (let k = parts.length - 1; k >= Math.min(2, parts.length); k--) { const rel = parts.slice(-k).join("/"); if (isFile(rel)) return join(root, rel); }
  const tail = parts.join("/");
  const hits = files().filter((f) => f === tail || f.endsWith("/" + tail));
  return hits.length === 1 ? join(root, hits[0]) : null;
}

function lineIn(project: string, root: string, p: Place, loose?: () => string[]): { file: string; lineText: string } | null {
  if (!Number.isInteger(p.line) || p.line < 1) return null;
  let abs = isAbsolute(p.path) ? p.path : resolve(project, p.path);
  if (loose && !existsSync(abs)) { const f = looseFile(root, p.path, loose); if (!f) return null; abs = f; }
  let real: string;
  try { real = realpathSync(abs); } catch { return null; }
  if (!real.startsWith(root + sep)) return null;
  const rel = relative(root, real);
  if (rel.split(sep).some((part) => NOT_THEIRS.has(part))) return null;
  try { const st = statSync(real); if (!st.isFile() || st.size > MAX_FILE) return null; } catch { return null; }
  let rows: string[];
  try { rows = readFileSync(real, "utf8").split("\n"); } catch { return null; }
  if (p.line > rows.length) return null;
  return { file: rel.split(sep).join("/"), lineText: label(rows[p.line - 1], LINE_MAX) };
}

function sentence(text: string, last: boolean): string | null {
  // TAP (Node's test runner) gives the failure's own words: error: 'Pressing Join ... answered 404'
  const tap = /^(?:TAP version|not ok )/m.test(text) ? /^\s*(?:error|message):\s*'(.+)'\s*$/m.exec(text) : null;   // only in TAP output, never in a project's own log lines
  if (tap) return tap[1];
  // The same report when the assertion has no words of its own: "error: |-" and the message on the lines under it.
  if (/^(?:TAP version|not ok )/m.test(text)) {
    const block = /^(\s*)(?:error|message):\s*[|>][+-]?[ \t]*\n((?:\1[ \t]+.*\n?)+)/m.exec(text);
    if (block) {
      const first = block[2].split("\n").map((l) => l.trim()).find(Boolean)?.replace(/:$/, "") ?? "";
      const field = (name: string) => new RegExp(`^${block[1]}${name}:[ \\t]*(.+)$`, "m").exec(text)?.[1].trim();
      const [got, want] = [field("actual"), field("expected")];
      if (first) return got !== undefined && want !== undefined ? `${first}. Got ${got}, expected ${want}.` : first;
    }
  }
  const rows = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const errors = rows.filter((l) => ERROR_LINE.test(l) && !/^at\s/.test(l));
  if (errors.length) return last ? errors.at(-1)! : errors[0];
  return rows.find((l) => ERRORISH.test(l) && !/^at\s/.test(l) && !l.startsWith(">")) ?? rows.find((l) => !l.startsWith(">") && !/^at\s/.test(l)) ?? null;
}

const tidy = (s: string) => label(redact(s), MESSAGE_MAX);

// "Failed to resolve import "./Header" from "src/App.tsx"" (Vite) names the file but not the line: the line is the one that
// imports exactly that, if there is exactly one.
const FAILED_IMPORT = /Failed to resolve import ["']([^"'\n]+)["'] from ["']([^"'\n]+)["']/;

/** One place in the project for this failure, or the error sentence, or nothing at all. With `loose` (text a person selected,
 *  not a check Companion ran) a path that is not in the project as written may still be matched to one file that is (see
 *  looseFile), and a failed import is found by the line that imports it. */
export function locateProblem(output: string, project: string, from: string, opts: { loose?: boolean } = {}): Problem | null {
  const text = output.replace(ANSI, "").replace(/\r/g, "");
  let root: string;
  try { root = realpathSync(project); } catch { return null; }
  const { list, python } = places(text);
  const ordered = (python ? [...list].reverse() : list).sort((a, b) => Number(!!a.declared) - Number(!!b.declared));   // Python prints the deepest frame last; a test's declaration only if nothing better
  const general = sentence(text, python);
  let files: string[] | null = null;
  const loose = opts.loose ? () => (files ??= projectFiles(root)) : undefined;
  const imp = loose ? FAILED_IMPORT.exec(text) : null;
  if (imp) {
    const [said, wants, path] = imp;
    const file = lineIn(project, root, { path, line: 1, at: imp.index }, loose);   // the file, checked like any other place
    let rows: string[] = [];
    try { if (file) rows = readFileSync(join(root, file.file), "utf8").split("\n"); } catch { rows = []; }
    const at = rows.flatMap((r, i) => (r.includes(`"${wants}"`) || r.includes(`'${wants}'`) ? [i + 1] : []));
    if (file && at.length === 1) return { kind: "line", file: file.file, line: at[0], lineText: label(rows[at[0] - 1], LINE_MAX), message: tidy(said), from };
  }
  for (const p of ordered) {
    const hit = lineIn(project, root, p, loose);
    if (!hit) continue;
    const message = p.message ?? general ?? "";
    return { kind: "line", file: hit.file, line: p.line, ...(p.column !== undefined ? { column: p.column } : {}), lineText: hit.lineText, message: tidy(message), from };
  }
  return general ? { kind: "message", message: tidy(general), from } : null;
}

const PRESSED = /^The page (?:crashed with|logged an error): (.+) \(after pressing "(.+)"\)$/;

/** The browser check pressed a button and the page broke: that button is the place to point at. */
export function buttonProblem(problems: string[]): Problem | null {
  for (const p of problems) {
    const m = PRESSED.exec(p.trim());
    if (m) return { kind: "button", label: label(m[2], 60), message: tidy(m[1]), from: "browser" };
  }
  return null;
}
