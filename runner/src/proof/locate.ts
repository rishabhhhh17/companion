// Point at the problem: turn a failing check's output into one real place in the person's project, so the character can
// fly to it. Only files inside the project that the person (or their AI) wrote count: never node_modules, build output
// or anything a link leads to outside the folder. When no place can be trusted, the error sentence is kept instead, so
// it can still be found on the person's screen. Nothing here guesses a line.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { label, redact } from "../redact.ts";
import { readPytest } from "./pytest.ts";
import type { Problem } from "../../../protocol/index.ts";

export type { Problem };

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
// Folders the person did not write: tools, build output, Companion's own notes.
const NOT_THEIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", ".output", "coverage", ".companion", ".vercel", ".turbo", ".cache", "__pycache__", ".venv", "venv", "site-packages", "dist-packages"]);
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
// Python's linters: "app.py:1:8: F401 [*] `os` imported but unused" (ruff concise, flake8). The rule code is left out.
const LINT_AFTER = /^:\s*[A-Z]{1,4}\d{2,4}\s+(?:\[\*\]\s+)?(.+)$/;
// ruff's current report puts the words on the line above the place: "F401 [*] `os` imported but unused" then " --> app.py:1:8".
const LINT_ABOVE = /^\s*[A-Z]{1,4}\d{2,4}\s+(?:\[\*\]\s+)?(.+?)\s*$/;
const RULE_NAME = /\s{2,}\[[a-z][a-z0-9-]*\]\s*$/;   // mypy's "  [name-defined]"
const ERROR_LINE = /^\s*((?:[A-Z][A-Za-z]*)?(?:Error|Exception)\b:.*)$/;
const ERRORISH = /error|not found|cannot|can't|failed|missing|ERR!|refused|denied|unexpected/i;

function places(text: string): { list: Place[]; python: boolean } {
  const list: Place[] = [];
  for (const m of text.matchAll(PY)) list.push({ path: m[1], line: Number(m[2]), at: m.index! });
  if (list.length) return { list, python: true };
  for (const m of text.matchAll(AT)) {
    const line = Number(m[2] ?? m[4]), column = m[3] ?? m[5];
    const rest = text.slice(m.index! + m[0].length).split("\n", 1)[0];
    // Node's test runner also says where a test was declared (TAP: "location: '...:9:1'"; the spec report from Node 24:
    // "test at test/x.test.js:9:1"): a fallback, never the first choice (the check that failed is in the stack, and is
    // better to point at).
    const lineStart = text.lastIndexOf("\n", m.index!) + 1;
    const declared = /^\s*(?:location:|(?:test|suite) at\s*$)/.test(text.slice(lineStart, m.index!));
    let said = AFTER.exec(rest)?.[1]?.trim() ?? LINT_AFTER.exec(rest)?.[1]?.trim();
    if (!said && /^\s*-->\s*$/.test(text.slice(lineStart, m.index!))) {
      const above = text.slice(0, Math.max(0, lineStart - 1)).split("\n").reverse().find((l) => l.trim());
      said = above ? LINT_ABOVE.exec(above)?.[1] : undefined;
    }
    if (said) said = said.replace(RULE_NAME, "");
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

// A file inside the project that the person (or their AI) wrote, with its lines; null for anything else.
function theirFile(project: string, root: string, path: string): { file: string; rows: string[] } | null {
  const abs = isAbsolute(path) ? path : resolve(project, path);
  let real: string;
  try { real = realpathSync(abs); } catch { return null; }
  if (!real.startsWith(root + sep)) return null;
  const rel = relative(root, real);
  if (rel.split(sep).some((part) => NOT_THEIRS.has(part))) return null;
  try { const st = statSync(real); if (!st.isFile() || st.size > MAX_FILE) return null; } catch { return null; }
  try { return { file: rel.split(sep).join("/"), rows: readFileSync(real, "utf8").split("\n") }; } catch { return null; }
}

function lineIn(project: string, root: string, p: Place): { file: string; lineText: string } | null {
  if (!Number.isInteger(p.line) || p.line < 1) return null;
  const f = theirFile(project, root, p.path);
  if (!f || p.line > f.rows.length) return null;
  return { file: f.file, lineText: label(f.rows[p.line - 1], LINE_MAX) };
}

/** One line in a file the person wrote, inside the project: the same rules as every place found here. */
export function projectLine(project: string, path: string, line: number): { file: string; lineText: string; text: string } | null {
  let root: string;
  try { root = realpathSync(project); } catch { return null; }
  const hit = lineIn(project, root, { path, line, at: 0 });
  if (!hit) return null;
  return { ...hit, text: theirFile(project, root, path)!.rows[line - 1] };
}

/** The lines of a file the person wrote, inside the project (for finding where something is in it). */
export function projectRows(project: string, path: string): { file: string; rows: string[] } | null {
  let root: string;
  try { root = realpathSync(project); } catch { return null; }
  return theirFile(project, root, path);
}

function sentence(text: string, last: boolean): string | null {
  // TAP (Node's test runner) gives the failure's own words: error: 'Pressing Join ... answered 404'
  const isTap = /^(?:TAP version|not ok )/m.test(text);
  const tap = isTap ? /^\s*(?:error|message):\s*'(.+)'\s*$/m.exec(text) : null;   // only in TAP output, never in a project's own log lines
  // "test failed" is Node's own word for a test file that could not even load (Node 18 and 20); the real words are in the
  // error it printed above, as "# Error: ..." comment lines.
  if (tap && tap[1] !== "test failed") return tap[1];
  if (tap) {
    const printed = text.split("\n").map((l) => l.trim().replace(/^#\s?/, "")).find((l) => ERROR_LINE.test(l) && !/^at\s/.test(l));
    return printed ?? tap[1];
  }
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

/** One place in the project for this failure, or the error sentence, or nothing at all. */
export function locateProblem(output: string, project: string, from: string): Problem | null {
  const text = output.replace(ANSI, "").replace(/\r/g, "");
  let root: string;
  try { root = realpathSync(project); } catch { return null; }
  // pytest's report has its own shape: the deepest frame of the first failure, else the failing test's own definition.
  const pt = readPytest(text);
  if (pt) {
    const said = pt.message ?? sentence(text, true) ?? "";
    for (const p of pt.places) {
      const hit = lineIn(project, root, { path: p.path, line: p.line, at: 0 });
      if (hit) return { kind: "line", file: hit.file, line: p.line, lineText: hit.lineText, message: tidy(said), from };
    }
    for (const t of pt.tests) {
      const name = t.name.replace(/[^\w]/g, "");
      const f = name ? theirFile(project, root, t.path) : null;
      const n = f ? f.rows.findIndex((r) => new RegExp(`^\\s*(?:async\\s+)?def\\s+${name}\\s*\\(`).test(r)) + 1 : 0;
      if (f && n > 0) return { kind: "line", file: f.file, line: n, lineText: label(f.rows[n - 1], LINE_MAX), message: tidy(said), from };
    }
    return said ? { kind: "message", message: tidy(said), from } : null;
  }
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
