// Python projects in the proof ladder: which Python runs the checks, what the project has to check (pytest, ruff or
// flake8, mypy) and which dev server shows it (Flask, FastAPI, Django, Streamlit). Reads ordinary files only. It always
// prefers the project's own virtual environment, and it never installs anything: when a package is missing it says
// which command the person can run, inside a virtual environment.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { minimalEnv } from "../env.ts";
import { runCommand, shq, type RunOptions, type RunResult } from "./exec.ts";
import { PRODUCT } from "../names.ts";

export type PythonServer = "flask" | "uvicorn" | "django" | "streamlit";
export type PythonEnv = { command: string; venv: string | null };
export type PythonOptions = { path?: string[]; exists?: (p: string) => boolean };
// command: the Python the checks run with (null when there is none to use). note: the plain line for the install rung.
// install: what the person can run to get the project's packages (never run by Companion).
export type PythonSetup = { command: string | null; venv: string | null; declared: string[]; note: string; install: string };
export type PythonCheck = { name: "typecheck" | "lint"; command: string; tool: string };
export type PythonStart = { kind: "server"; command: string; python: PythonServer; env: Record<string, string> };
export type PythonDetected = { setup: PythonSetup; checks: PythonCheck[]; tests: { command: string; tool: string } | null; start: PythonStart | null };

const VENVS = [".venv", "venv"];
// Apple's command line tools: without them /usr/bin/python3 is only a stand in that opens an install window.
const APPLE_PYTHONS = ["/Library/Developer/CommandLineTools/usr/bin/python3", "/Applications/Xcode.app/Contents/Developer/usr/bin/python3"];

const readText = (p: string, max = 200_000): string => { try { const s = statSync(p); return s.isFile() && s.size <= max ? readFileSync(p, "utf8") : ""; } catch { return ""; } };

/** The project's own virtual environment, else a python3 on the tool path that can run without opening a window. */
export function findPython(dir: string, o: PythonOptions = {}): PythonEnv | null {
  const exists = o.exists ?? existsSync;
  for (const v of VENVS) if (exists(join(dir, v, "bin", "python"))) return { command: `${v}/bin/python`, venv: v };
  // Tests set COMPANION_TEST_ASSUME_TOOLS, so their results never depend on which Python the Mac running them has.
  if (!o.path && process.env.COMPANION_TEST_ASSUME_TOOLS === "1") return { command: "python3", venv: null };
  for (const d of o.path ?? (minimalEnv().PATH ?? "").split(":")) {
    if (!d) continue;
    const p = join(d, "python3");
    if (!exists(p)) continue;
    if (p === "/usr/bin/python3" && !APPLE_PYTHONS.some((a) => exists(a))) continue;
    return { command: p, venv: null };
  }
  return null;
}

// A virtual environment folder whose Python is gone (Python was upgraded or removed since it was made).
function brokenVenv(dir: string): string | null {
  for (const v of VENVS) {
    const py = join(dir, v, "bin", "python");
    let link = false;
    try { link = lstatSync(py).isSymbolicLink(); } catch { /* not there */ }
    if ((link || existsSync(join(dir, v, "pyvenv.cfg"))) && !existsSync(py)) return v;
  }
  return null;
}

/** Does this folder have the marks that only a Python project has (requirements, pyproject.toml, setup.py, a Pipfile,
 *  manage.py)? A stray .py file does not count: a Go or Rust project can keep a helper script. */
export function hasPythonMarks(dir: string): boolean {
  if (["requirements.txt", "pyproject.toml", "setup.py", "Pipfile", "manage.py"].some((f) => existsSync(join(dir, f)))) return true;
  try { return readdirSync(dir).some((n) => /^requirements.*\.txt$/.test(n)); } catch { return false; }
}

/** Does this folder look like a Python project? (A folder with a package.json is a Node project, as before.) */
export function looksPython(dir: string): boolean {
  if (hasPythonMarks(dir)) return true;
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return false; }
  if (names.some((n) => /^requirements.*\.txt$/.test(n))) return true;
  return names.some((n) => n.endsWith(".py")) && !names.includes("index.html");
}

// ---------- editable installs: code a virtual environment imports from a folder, not from inside itself ----------

const FINDER = /^__editable__.*_finder\.py$/;
/** The folders a virtual environment's editable installs (pip install -e ., Poetry, uv, setup.py develop) import code from,
 *  read from its site-packages files (full path to text): each .pth line that is a folder (not one that starts with
 *  "import", which is code), the folder of each package a setuptools editable finder maps, and each .egg-link's folder. */
export function editableSources(files: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    const here = dirname(path), name = basename(path);
    if (name.endsWith(".pth")) {
      for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim();
        if (l && !l.startsWith("#") && !/^import[\s\t]/.test(l)) out.add(resolve(here, l));
      }
    } else if (name.endsWith(".egg-link")) {
      const l = text.split(/\r?\n/)[0]?.trim();
      if (l) out.add(resolve(here, l));
    } else if (FINDER.test(name)) {
      const map = /MAPPING\s*(?::[^=\n]*)?=\s*\{([^}]*)\}/.exec(text)?.[1] ?? "";
      for (const m of map.matchAll(/(["'])(?:(?!\1).)*\1\s*:\s*(["'])((?:(?!\2).)+)\2/g)) out.add(dirname(resolve(here, m[3])));
    }
  }
  return [...out];
}

/** The Python packages (a folder with an __init__.py) and modules (name.py) kept in the project's src folder, as the names
 *  site-packages would hold them. */
function srcPythonNames(project: string): string[] {
  let names: string[];
  try { names = readdirSync(join(project, "src")); } catch { return []; }
  return names.filter((n) => !n.startsWith(".") && !n.startsWith("__") && (n.endsWith(".py") || existsSync(join(project, "src", n, "__init__.py"))));
}

/** Where a Python imports code from: its sys.path, and the folders of its standard library (sys.base_prefix and
 *  sys.base_exec_prefix). */
export type PythonPaths = { path: string[]; base: string[] };
const ASK_PATH = 'import json, sys; print(json.dumps({"path": sys.path, "base": [getattr(sys, "base_prefix", sys.prefix), getattr(sys, "base_exec_prefix", sys.exec_prefix)]}))';
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Ask a Python where it imports code from. `python` is the command the private copies run (a virtual environment's, as a
 *  path inside the project, or this Mac's python3), so the answer is about the very Python that checks them, its own and
 *  the person's user site folders included. Asked from `cwd`, an empty folder, so nothing of a project is on the path,
 *  with the environment every check gets and no bytecode written. Null when it gives no whole answer. */
export async function pythonPaths(python: string, project: string, o: { cwd: string; run?: (command: string, o: RunOptions) => Promise<RunResult>; signal?: AbortSignal; timeoutMs?: number }): Promise<PythonPaths | null> {
  const exe = python.includes("/") && !isAbsolute(python) ? join(project, python) : python;
  const r = await (o.run ?? runCommand)(`${shq(exe)} -c ${shq(ASK_PATH)}`, { cwd: o.cwd, timeoutMs: o.timeoutMs ?? 60_000, env: { PYTHONDONTWRITEBYTECODE: "1" }, ...(o.signal ? { signal: o.signal } : {}), keep: 200_000 });
  if (r.code !== 0 || r.timedOut || r.aborted) return null;
  // A .pth file may print something of its own first: the answer is the last line.
  const line = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
  try {
    const j = JSON.parse(line) as { path?: unknown; base?: unknown };
    return strings(j.path) && strings(j.base) ? { path: j.path, base: j.base } : null;
  } catch { return null; }
}

/** A folder inside the project, other than its top one, that the Python checking the private copies imports the project's
 *  code from (relative to the project), or "src" when a package of the project's src folder is kept installed where that
 *  Python looks; null when there is none. A copy of an earlier version that borrows that Python has its own top folder first
 *  on the path, so code there is the copy's own; code found through any other folder of the project (src, a build link
 *  tree), or the project's src installed without -e (pip install .), would be today's, not the earlier version's. `paths`
 *  is what that Python said (pythonPaths): every folder on its path is looked at, a site folder's .pth, .egg-link and
 *  editable finder files too, wherever it is (the project's virtual environment, that Python's own or the person's user
 *  site). Without it only the project's own virtual environment is read. What is inside that virtual environment is
 *  borrowed by each copy as it is, so a folder of its own (pywin32's, an old egg) is never the project's code. The standard
 *  library is never where the project's code is installed, so a src module that shares a name with it is left alone.
 *  Reads a few small files only. */
export function editableInside(project: string, paths?: PythonPaths): string | null {
  const real = (p: string): string | null => { try { return realpathSync(p); } catch { return null; } };   // Python leaves out a folder that is not there
  const root = real(project);
  if (!root) return null;
  const under = (p: string, dir: string) => p === dir || p.startsWith(dir === "/" ? dir : `${dir}/`);
  const venvs = VENVS.map((v) => real(join(project, v))).filter((v): v is string => v !== null);
  const ownCode = (p: string) => p !== root && under(p, root) && !venvs.some((v) => under(p, v));
  const fromSrc = srcPythonNames(project);
  const base = (paths?.base ?? []).filter((b) => isAbsolute(b)).map(real).filter((b): b is string => b !== null);
  const folders: string[] = [];
  for (const v of VENVS) {
    folders.push(join(project, v, "Lib", "site-packages"));
    try { for (const n of readdirSync(join(project, v, "lib"))) if (/^python\d/.test(n)) folders.push(join(project, v, "lib", n, "site-packages")); } catch { /* no lib folder */ }
  }
  for (const p of paths?.path ?? []) if (isAbsolute(p)) folders.push(p);   // "" is the folder Python was asked from
  const seen = new Set<string>();
  for (const folder of folders) {
    const dir = real(folder);
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    if (ownCode(dir)) return relative(root, dir);
    let names: string[];
    try { names = readdirSync(dir); } catch { continue; }   // a zip of the standard library, or not a folder
    const site = /(?:site|dist)-packages$/.test(folder) || /(?:site|dist)-packages$/.test(dir);
    if (site) {
      const files: Record<string, string> = {};
      for (const n of names) if (n.endsWith(".pth") || n.endsWith(".egg-link") || FINDER.test(n)) files[join(folder, n)] = readText(join(folder, n), 100_000);
      for (const src of editableSources(files)) { const r = real(src); if (r && ownCode(r)) return relative(root, r); }
    }
    if (!site && base.some((b) => under(dir, b))) continue;   // the standard library
    if (fromSrc.some((n) => names.includes(n))) return "src";
  }
  return null;
}

// ---------- the packages the project says it needs (names only) ----------

const norm = (n: string) => n.trim().toLowerCase().replace(/[_.]+/g, "-");
const REQ_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;

function requirementFiles(dir: string): string[] {
  const out: string[] = [];
  try { for (const n of readdirSync(dir)) if (/^(?:requirements.*|.*-requirements)\.txt$/.test(n)) out.push(join(dir, n)); } catch { /* none */ }
  try { for (const n of readdirSync(join(dir, "requirements"))) if (n.endsWith(".txt")) out.push(join(dir, "requirements", n)); } catch { /* none */ }
  return out;
}

/** The package names a project lists: requirements files, pyproject.toml (PEP 621, dependency groups, Poetry) and Pipfile. */
export function declaredPackages(dir: string): string[] {
  const found = new Set<string>();
  for (const f of requirementFiles(dir)) {
    for (const line of readText(f).split("\n")) {
      const l = line.replace(/#.*$/, "").trim();
      if (!l || l.startsWith("-")) continue;
      const m = REQ_NAME.exec(l);
      if (m) found.add(norm(m[1]));
    }
  }
  // TOML, read just enough: the strings in dependency lists, and the keys of Poetry's and Pipenv's dependency tables.
  const toml = (text: string, keyed: (section: string) => boolean, listed: (section: string, key: string) => boolean) => {
    let section = "", inList = false, key = "";
    for (const raw of text.split("\n")) {
      const line = raw.replace(/(^|\s)#.*$/, "").trim();
      const head = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
      if (head) { section = head[1]; inList = false; continue; }
      if (!inList) {
        const kv = /^([A-Za-z0-9_.-]+|"[^"]+")\s*=\s*(.*)$/.exec(line);
        if (!kv) continue;
        key = kv[1].replace(/"/g, "");
        if (keyed(section) && key.toLowerCase() !== "python") found.add(norm(key));
        if (listed(section, key) && kv[2].startsWith("[")) { inList = !kv[2].includes("]"); for (const s of kv[2].matchAll(/["']([^"']+)["']/g)) { const m = REQ_NAME.exec(s[1]); if (m) found.add(norm(m[1])); } }
      } else {
        for (const s of line.matchAll(/["']([^"']+)["']/g)) { const m = REQ_NAME.exec(s[1]); if (m) found.add(norm(m[1])); }
        if (line.includes("]")) inList = false;
      }
    }
  };
  toml(readText(join(dir, "pyproject.toml")),
    (s) => /^tool\.poetry(?:\.group\.[^.]+)?\.(?:dev-)?dependencies$/.test(s),
    (s, k) => (s === "project" && k === "dependencies") || s === "project.optional-dependencies" || s === "dependency-groups" || (s === "tool.uv" && k === "dev-dependencies"));
  toml(readText(join(dir, "Pipfile")), (s) => s === "packages" || s === "dev-packages", () => false);
  return [...found].sort();
}

// The module a package is imported as, when it differs from its name.
const IMPORTED_AS: Record<string, string[]> = {
  yaml: ["pyyaml"], cv2: ["opencv-python", "opencv-python-headless", "opencv-contrib-python"], bs4: ["beautifulsoup4"], dotenv: ["python-dotenv"],
  jwt: ["pyjwt"], sklearn: ["scikit-learn"], pil: ["pillow"], dateutil: ["python-dateutil"], attr: ["attrs"], openssl: ["pyopenssl"],
  crypto: ["pycryptodome"], magic: ["python-magic"], multipart: ["python-multipart"], jose: ["python-jose"], docx: ["python-docx"],
  pptx: ["python-pptx"], telegram: ["python-telegram-bot"], discord: ["discord-py"], mysqldb: ["mysqlclient"], serial: ["pyserial"],
  git: ["gitpython"], fitz: ["pymupdf"], psycopg2: ["psycopg2-binary"], google: ["google-generativeai", "google-genai", "google-cloud-storage", "google-api-python-client"],
};
const listed = (module: string, declared: string[]) => {
  const m = norm(module);
  return declared.some((d) => d === m || d.startsWith(`${m}-`) || (IMPORTED_AS[m] ?? []).includes(d));
};

/** A failed Python command that failed only because a package is not installed: the tool itself (python -m pytest),
 *  or a package the project lists. A module nobody listed is a real mistake in the code, so it is not a gap. */
export function missingModule(output: string, tool: string | undefined, declared: string[]): { module: string; tool: boolean } | null {
  const self = /^\S*python[\d.]*'?:\s*No module named ([\w.]+)/m.exec(output);
  if (self) { const top = self[1].split(".")[0]; return { module: top, tool: top === tool }; }
  if (/Couldn't import Django/.test(output) && listed("django", declared)) return { module: "django", tool: false };
  const m = /ModuleNotFoundError: No module named '([\w.]+)'/.exec(output);
  if (!m) return null;
  const top = m[1].split(".")[0];
  return listed(top, declared) ? { module: top, tool: false } : null;
}

// ---------- what to check, and how to show it ----------

const has = (dir: string, f: string) => existsSync(join(dir, f));

function hasTests(dir: string): boolean {
  if (["conftest.py", "pytest.ini"].some((f) => has(dir, f))) return true;
  for (const d of ["tests", "test"]) {
    try { if (readdirSync(join(dir, d)).some((n) => /^test_.*\.py$|_test\.py$|^conftest\.py$/.test(n))) return true; } catch { /* none */ }
  }
  try { return readdirSync(dir).some((n) => /^test_.*\.py$|_test\.py$/.test(n)); } catch { return false; }
}

// Where an app object is made, in the usual places: main.py, app.py, app/main.py, src/main.py and friends.
const APP_FILES = ["main.py", "app.py", "wsgi.py", "asgi.py", "server.py", "api.py", "application.py", "run.py", "app/main.py", "app/__init__.py", "src/main.py", "src/app.py", "api/index.py"];
function findApp(dir: string, maker: RegExp): { module: string; name: string } | null {
  for (const f of APP_FILES) {
    const m = maker.exec(readText(join(dir, f)));
    if (m) return { module: f.replace(/\/__init__\.py$/, "").replace(/\.py$/, "").replace(/\//g, "."), name: m[1] };
  }
  return null;
}

function streamlitFile(dir: string): string | null {
  let names: string[] = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith(".py")).sort(); } catch { return null; }
  const order = ["streamlit_app.py", "app.py", "main.py", "Home.py", ...names];
  return order.find((n) => names.includes(n) && /^\s*(?:import streamlit|from streamlit\b)/m.test(readText(join(dir, n)))) ?? null;
}

export function detectPython(dir: string, o: PythonOptions = {}): PythonDetected {
  const declared = declaredPackages(dir);
  const reqs = requirementFiles(dir).map((f) => f.slice(dir.length + 1)).sort((a, b) => Number(b === "requirements.txt") - Number(a === "requirements.txt"));
  const broken = brokenVenv(dir);
  const env = broken ? null : findPython(dir, o);
  const venv = env?.venv ?? null;
  // What the person can run to get the project's packages. Companion never runs it.
  const pkgs = reqs.length ? `pip install -r ${reqs[0]}` : has(dir, "pyproject.toml") ? "pip install -e ." : "pip install <the packages it needs>";
  const install = venv ? `${venv}/bin/${pkgs}` : `python3 -m venv .venv, then .venv/bin/${pkgs}`;
  const where = venv ? `this project's own virtual environment (${venv})` : env ? `this Mac's Python (${env.command}), because the project has no virtual environment` : "";
  const note = broken
    ? `This project's virtual environment (${broken}) is broken: the Python it was made with is gone, so the Python checks cannot run. ${PRODUCT} does not install Python packages. To make it again, in Terminal in the project folder, run: rm -rf ${broken}, then python3 -m venv .venv, then .venv/bin/${pkgs}`
    : !env ? "Python is not set up on this Mac, so this Python project cannot be checked. Install Python from python.org, then try again."
    : `${PRODUCT} does not install Python packages. It checks this project with ${where}.`;
  const setup: PythonSetup = { command: env?.command ?? null, venv, declared, note, install };
  if (!env) return { setup, checks: [], tests: null, start: null };

  const py = shq(env.command);
  const pyproject = readText(join(dir, "pyproject.toml"));
  const setupCfg = readText(join(dir, "setup.cfg")) + readText(join(dir, "tox.ini"));
  const uses = (pkg: string) => declared.includes(pkg);
  const checks: PythonCheck[] = [];
  if (uses("ruff") || /^\s*\[tool\.ruff[\].]/m.test(pyproject) || has(dir, "ruff.toml") || has(dir, ".ruff.toml")) checks.push({ name: "lint", command: `${py} -m ruff check --no-cache .`, tool: "ruff" });
  else if (uses("flake8") || has(dir, ".flake8") || /^\s*\[flake8\]/m.test(setupCfg)) checks.push({ name: "lint", command: `${py} -m flake8 --extend-exclude .venv,venv,node_modules,build,dist .`, tool: "flake8" });
  const mypyCfg = readText(join(dir, "mypy.ini")) + readText(join(dir, ".mypy.ini")) + (/^\s*\[mypy\]/m.test(setupCfg) ? setupCfg : "") + (/^\s*\[tool\.mypy\]/m.test(pyproject) ? pyproject : "");
  // --cache-dir /dev/null is mypy's own way to write no cache (.mypy_cache) into the project.
  if (uses("mypy") || mypyCfg) checks.push({ name: "typecheck", command: `${py} -m mypy --cache-dir /dev/null${/^\s*files\s*=/m.test(mypyCfg) ? "" : " ."}`, tool: "mypy" });

  const tests = uses("pytest") || /^\s*\[tool\.pytest/m.test(pyproject) || /^\s*\[(?:tool:)?pytest\]/m.test(setupCfg) || hasTests(dir)
    ? { command: `${py} -m pytest -q --tb=short -p no:cacheprovider`, tool: "pytest" } : null;

  // The dev server: the project's framework, never the app's own `python main.py` (that picks its own host and port).
  const pyEnv = { PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" };
  let start: PythonStart | null = null;
  const lit = streamlitFile(dir);
  const fast = findApp(dir, /^(\w+)\s*=\s*FastAPI\(/m);
  const flask = findApp(dir, /^(\w+)\s*=\s*Flask\(/m) ?? findApp(dir, /^def (create_app)\s*\(/m);
  if (has(dir, "manage.py")) start = { kind: "server", command: `${py} manage.py runserver --noreload`, python: "django", env: pyEnv };
  else if (lit) start = { kind: "server", command: `${py} -m streamlit run ${shq(lit)} --server.headless true --browser.gatherUsageStats false`, python: "streamlit", env: pyEnv };
  else if (fast) start = { kind: "server", command: `${py} -m uvicorn ${fast.module}:${fast.name}`, python: "uvicorn", env: pyEnv };
  else if (flask) start = { kind: "server", command: `${py} -m flask run --no-reload`, python: "flask", env: { ...pyEnv, FLASK_APP: flask.name === "create_app" ? flask.module : `${flask.module}:${flask.name}` } };
  return { setup, checks, tests, start };
}

// ---------- leaving the project as it was found ----------

// Django's runserver opens the default SQLite database on its way up (its migration check only reads), and SQLite makes
// an empty file when there is none. A check must not leave one behind. Only files at the top of the project with a
// database's name are looked at (Django's default is db.sqlite3 next to manage.py).
const DATABASE_FILE = /\.(?:sqlite3?|db)$/i;
/** The database files at the top of the project before the server starts. */
export function databaseFiles(dir: string): Set<string> {
  try { return new Set(readdirSync(dir).filter((n) => DATABASE_FILE.test(n))); } catch { return new Set(); }
}
/** Remove the database files the server made that are still empty: one that was there before, or with anything in it, stays. */
export function removeNewEmptyDatabases(dir: string, before: Set<string>): string[] {
  const gone: string[] = [];
  for (const n of databaseFiles(dir)) {
    if (before.has(n)) continue;
    const p = join(dir, n);
    try { const s = lstatSync(p); if (s.isFile() && s.size === 0) { unlinkSync(p); gone.push(n); } } catch { /* already gone */ }
  }
  return gone;
}

/** The one line About this project shows for a Python project. */
export function pythonIntakeNote(s: PythonSetup): string {
  if (!s.command) return s.note;
  return s.venv
    ? `${PRODUCT} checks this Python project with its own virtual environment (${s.venv}). It cannot install its packages for you.`
    : `This Python project has no virtual environment, so its packages are probably not installed here. ${PRODUCT} cannot install its packages for you. In Terminal, in the project folder, run: ${s.install}`;
}

/** Plain words for a check that could not run because a package is missing, with what to run (never run by Companion). */
export function missingWords(miss: { module: string; tool: boolean }, s: PythonSetup, what: string): string {
  const where = s.venv ? `in this project's virtual environment (${s.venv})` : "for this Mac's Python";
  const fix = miss.tool ? (s.venv ? `${s.venv}/bin/pip install ${miss.module}` : `python3 -m venv .venv, then .venv/bin/pip install ${miss.module}`) : s.install;
  const subject = miss.tool ? `${miss.module} is not installed ${where}, so ${what} could not run.` : `${what[0].toUpperCase()}${what.slice(1)} need${what.endsWith("s") ? "" : "s"} ${miss.module}, which is not installed ${where}.`;
  return `${subject} ${PRODUCT} does not install Python packages. To install ${miss.tool ? "it" : "them"}, in Terminal in the project folder, run: ${fix}`;
}
