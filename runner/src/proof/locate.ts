// Point at the problem: turn a failing check's output into one real place in the person's project, so the character can
// fly to it. Only files inside the project that the person (or their AI) wrote count: never node_modules, build output
// or anything a link leads to outside the folder. When no place can be trusted, the error sentence is kept instead, so
// it can still be found on the person's screen. Nothing here guesses a line.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
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

function lineIn(project: string, root: string, p: Place): { file: string; lineText: string } | null {
  if (!Number.isInteger(p.line) || p.line < 1) return null;
  const abs = isAbsolute(p.path) ? p.path : resolve(project, p.path);
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
  const rows = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const errors = rows.filter((l) => ERROR_LINE.test(l) && !/^at\s/.test(l));
  if (errors.length) return last ? errors.at(-1)! : errors[0];
  return rows.find((l) => ERRORISH.test(l) && !/^at\s/.test(l) && !l.startsWith(">")) ?? rows.find((l) => !l.startsWith(">") && !/^at\s/.test(l)) ?? null;
}

const tidy = (s: string) => label(redact(s), MESSAGE_MAX);

/** One place in the project for this failure, or the error sentence, or nothing at all. */
export function locateProblem(output: string, project: string, from: string): Problem | null {
  const text = output.replace(ANSI, "").replace(/\r/g, "");
  let root: string;
  try { root = realpathSync(project); } catch { return null; }
  const { list, python } = places(text);
  const ordered = (python ? [...list].reverse() : list).sort((a, b) => Number(!!a.declared) - Number(!!b.declared));   // Python prints the deepest frame last; a test's declaration only if nothing better
  const general = sentence(text, python);
  for (const p of ordered) {
    const hit = lineIn(project, root, p);
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
