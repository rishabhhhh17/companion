// The proof ladder on Python projects. Exit codes decide; pytest's own codes are read as pytest means them (5 is "no
// tests", not a failure); a missing package is a gap that says what to run, never a failure blamed on the code, and is
// never installed. The checks and tests are stubbed (no real Python needed). The server rung starts a stand in
// .venv/bin/python (a Bun script) for real, so binding to 127.0.0.1 on a free port and stopping it afterwards are the
// real thing. One last test uses this Mac's real Python and FastAPI when they are there, and skips cleanly otherwise.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder, type StepUpdate } from "../src/proof/ladder.ts";
import { detectProject } from "../src/proof/detect.ts";
import { findPython } from "../src/proof/python.ts";
import { minimalEnv } from "../src/env.ts";
import type { BrowserResult } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-pyl-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); } };
const res = (o: Partial<RunResult> = {}): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const fixture = (name: string, root: string) => readFileSync(join(import.meta.dir, "fixtures", "errors", `${name}.txt`), "utf8").replaceAll("{{ROOT}}", root);

// A stand in for the project's own Python: it acts like `python -m flask run --host H --port P` or
// `python manage.py runserver H:P` (or crashes, or is missing flask), and writes down how it was started, outside the
// project. "serve-db" and "crash-db" also do what Django's runserver does on its way up: open the default SQLite database,
// which makes an empty db.sqlite3 when there is none (its migration check only reads).
function fakePython(dir: string, mode: "serve" | "crash" | "no-flask" | "serve-db" | "crash-db", log: string) {
  const script = `#!${process.execPath}
const a = process.argv.slice(2);
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: a, flaskApp: process.env.FLASK_APP ?? null, noBytecode: process.env.PYTHONDONTWRITEBYTECODE ?? null }));
const mode = ${JSON.stringify(mode)};
if (mode.endsWith("-db")) fs.closeSync(fs.openSync("db.sqlite3", "a"));
if (mode === "no-flask") { console.error(".venv/bin/python: No module named flask"); process.exit(1); }
if (mode.startsWith("crash")) {
  console.error('Traceback (most recent call last):\\n  File "${dir}/main.py", line 3, in <module>\\n    app = Flask(nme)\\nNameError: name \\'nme\\' is not defined');
  process.exit(1);
}
const at = a.includes("runserver") ? a[a.length - 1].split(":") : [a[a.indexOf("--host") + 1], a[a.indexOf("--port") + 1]];
Bun.serve({ hostname: at[0], port: Number(at[1]), fetch: () => new Response("<h1>Shop</h1>", { headers: { "content-type": "text/html" } }) });
`;
  put(dir, { ".venv/bin/python": script, ".venv/pyvenv.cfg": "home = /opt/homebrew/bin\n" });
  chmodSync(join(dir, ".venv/bin/python"), 0o755);
}

const FLASK_APP = "from flask import Flask\n\napp = Flask(__name__)\n\n\n@app.route('/')\ndef home():\n    return '<h1>Shop</h1>'\n";
const okBrowser = async (url: string): Promise<BrowserResult> => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 }) as never;

async function ladder(files: Record<string, string>, o: { run?: (c: string, x: any) => Promise<RunResult>; browser?: (url: string) => Promise<BrowserResult>; python?: Parameters<typeof fakePython>[1]; detect?: (d: string) => ReturnType<typeof detectProject>; noInstall?: boolean } = {}) {
  const dir = tmp(), log = join(tmp(), "started.json");
  put(dir, files);
  if (o.python) fakePython(dir, o.python, log);
  const store = new CheckpointStore(tmp(), dir);
  const s = await store.snapshot("as it is");
  const updates: StepUpdate[] = [], calls: { command: string; env?: Record<string, string> }[] = [], urls: string[] = [];
  const run = async (command: string, x: any) => { calls.push({ command, env: x.env }); return o.run ? o.run(command, x) : res(); };
  const browser = async (url: string) => { urls.push(url); return (o.browser ?? okBrowser)(url); };
  const result = await runLadder({ project: dir, store, beforeId: s.id, afterId: s.id, onStep: (u) => updates.push(u), run: run as never, browser: browser as never, limits: { startMs: 15000, browserMs: 5000 }, ...(o.detect ? { detect: o.detect } : {}), ...(o.noInstall ? { noInstall: true } : {}) });
  const started = existsSync(log) ? JSON.parse(readFileSync(log, "utf8")) : null;
  return { result, updates, calls, urls, dir, started };
}
const rungs = (r: { steps: { rung: string; status: string }[] }) => r.steps.map((s) => `${s.rung}:${s.status}`);

describe("a healthy Python project", () => {
  test("every rung runs with the project's own .venv, nothing is installed, and the server listens only on this Mac", async () => {
    const { result, calls, urls, started } = await ladder({ "requirements.txt": "flask\npytest\nruff\n", "main.py": FLASK_APP, "tests/test_main.py": "def test_home():\n    assert True\n" }, { python: "serve" });
    expect(rungs(result)).toEqual(["install:skipped", "checks:passed", "tests:passed", "start:passed", "browser:passed"]);
    expect(result.verdict).toBe("passed");
    expect(result.steps[0].detail).toMatch(/does not install/);
    expect(calls.map((c) => c.command)).toEqual(["'.venv/bin/python' -m ruff check --no-cache .", "'.venv/bin/python' -m pytest -q --tb=short -p no:cacheprovider"]);
    expect(calls.every((c) => c.env?.PYTHONDONTWRITEBYTECODE === "1")).toBe(true);
    expect(calls.some((c) => /\bpip\b|install/.test(c.command))).toBe(false);
    expect(urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const port = Number(new URL(urls[0]).port);
    expect(started.args).toEqual(["-m", "flask", "run", "--no-reload", "--host", "127.0.0.1", "--port", String(port)]);
    expect(started.flaskApp).toBe("main:app");
    expect(started.noBytecode).toBe("1");
    // Stopped afterwards: nothing answers on that port any more.
    expect(await fetch(urls[0], { signal: AbortSignal.timeout(500) }).then(() => "answered", () => "gone")).toBe("gone");
  }, 30000);
});

describe("exit codes first", () => {
  test("a failing test fails the ladder there, pointing at the assert", async () => {
    const files = { "requirements.txt": "pytest\n", "shop/__init__.py": "", "shop/cart.py": "", "tests/test_cart.py": "from shop.cart import Cart, apply_discount\nimport pytest\n\n\ndef test_total_price():\n    cart = Cart()\n    cart.add('Mug', 12)\n    cart.add('Tea', 4)\n    assert cart.total() == 15\n" };
    const { result } = await ladder(files, { run: async (c, x) => (/pytest/.test(c) ? res({ code: 1, stdout: fixture("pytest-assert-long", x.cwd) }) : res()) });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("tests");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "tests/test_cart.py", line: 9, message: "AssertionError: assert 16 == 15", from: "tests" });
  }, 30000);
  test("pytest's exit code 5 means it found no tests: skipped, not failed", async () => {
    const { result } = await ladder({ "requirements.txt": "pytest\n", "main.py": "print(1)\n" }, { run: async () => res({ code: 5, stdout: "no tests ran in 0.01s" }) });
    expect(result.steps.find((s) => s.rung === "tests")).toMatchObject({ status: "skipped" });
    expect(result.steps.find((s) => s.rung === "tests")!.detail).toMatch(/no tests/i);
    expect(result.verdict).toBe("nothing_to_check");
  }, 30000);
  test("ruff finding a problem fails the checks, pointing at the line", async () => {
    const files = { "pyproject.toml": "[tool.ruff]\n", "app.py": "import os\nfrom flask import Flask, render_template\n" };
    const { result } = await ladder(files, { run: async (c) => (/ruff/.test(c) ? res({ code: 1, stdout: fixture("ruff-full", "") }) : res()) });
    expect(result.failedAt?.rung).toBe("checks");
    expect(result.failedAt?.detail).toMatch(/^lint failed/);
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "app.py", line: 1, message: "`os` imported but unused" });
  }, 30000);
});

describe("a missing package is a gap, never a failure blamed on the code, and never installed", () => {
  test("pytest itself is not in the .venv: the tests are skipped with the command to add it, and the result is not a pass", async () => {
    const { result, calls } = await ladder({ "requirements.txt": "flask\n", "main.py": FLASK_APP, "tests/test_main.py": "def test_x():\n    pass\n" }, { python: "serve", run: async (c) => (/pytest/.test(c) ? res({ code: 1, stderr: "'.venv/bin/python': No module named pytest" }) : res()) });
    const t = result.steps.find((s) => s.rung === "tests")!;
    expect(t.status).toBe("skipped");
    expect(t.detail).toContain("pytest is not installed in this project's virtual environment (.venv)");
    expect(t.detail).toContain(".venv/bin/pip install pytest");
    expect(t.detail).toMatch(/does not install/);
    expect(result.verdict).toBe("passed_with_gaps");
    expect(calls.some((c) => /pip/.test(c.command))).toBe(false);
  }, 30000);
  test("no virtual environment and the project's own packages missing: the advice makes one first", async () => {
    const files = { "requirements.txt": "flask\npytest\n", "app.py": "from flask import Flask\n", "tests/test_app.py": "from app import Flask\n" };
    const { result } = await ladder(files, { run: async () => res({ code: 2, stdout: "==================================== ERRORS ====================================\n___ ERROR collecting tests/test_app.py ___\ntests/test_app.py:1: in <module>\n    from app import Flask\napp.py:1: in <module>\n    from flask import Flask\nE   ModuleNotFoundError: No module named 'flask'\n" }) });
    const t = result.steps.find((s) => s.rung === "tests")!;
    expect(t.status).toBe("skipped");
    expect(t.detail).toContain("flask");
    expect(t.detail).toContain("python3 -m venv .venv, then .venv/bin/pip install -r requirements.txt");
    expect(result.verdict).toBe("nothing_to_check");
  }, 30000);
  test("a module the project never lists is a real mistake in the code, so it fails", async () => {
    const files = { "requirements.txt": "pytest\n", "app.py": "import requets\n", "tests/test_app.py": "import app\n" };
    const { result } = await ladder(files, { run: async () => res({ code: 2, stdout: "==================================== ERRORS ====================================\n___ ERROR collecting tests/test_app.py ___\ntests/test_app.py:1: in <module>\n    import app\napp.py:1: in <module>\n    import requets\nE   ModuleNotFoundError: No module named 'requets'\n" }) });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "app.py", line: 1 });
  }, 30000);
  test("flask missing from the .venv: the start is a gap, not 'the server crashed'", async () => {
    const { result } = await ladder({ "requirements.txt": "flask\npytest\n", "main.py": FLASK_APP, "tests/test_main.py": "def test_x():\n    pass\n" }, { python: "no-flask" });
    expect(rungs(result)).toEqual(["install:skipped", "checks:skipped", "tests:passed", "start:skipped", "browser:skipped"]);
    expect(result.steps.find((s) => s.rung === "start")!.detail).toContain("flask is not installed in this project's virtual environment (.venv)");
    expect(result.verdict).toBe("passed_with_gaps");
  }, 30000);
});

describe("the server rung", () => {
  test("a server that crashes on start fails there, pointing at the line in the person's app", async () => {
    const { result } = await ladder({ "requirements.txt": "flask\n", "main.py": "from flask import Flask\n\napp = Flask(nme)\n" }, { python: "crash" });
    expect(result.failedAt?.rung).toBe("start");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "main.py", line: 3, message: "NameError: name 'nme' is not defined" });
  }, 30000);
  test("with no Python on this Mac nothing is run, and the reason is said plainly", async () => {
    const { result, calls } = await ladder({ "requirements.txt": "flask\npytest\n", "main.py": FLASK_APP, "tests/test_main.py": "" }, { detect: (d) => detectProject(d, undefined, { path: [], exists: () => false }) });
    expect(calls).toEqual([]);
    expect(result.verdict).toBe("nothing_to_check");
    expect(result.steps[0].detail).toMatch(/Python is not set up/);
  }, 30000);
});

// Django's runserver opens the default SQLite database on its way up (its migration check), and SQLite makes an empty
// db.sqlite3 when there is none (checked on this Mac with Python's own sqlite3: a read leaves a 0 byte file). A check
// must leave the project as it found it, so an empty database file that Companion's run made is taken away again; one
// that was there before, or one with anything in it, is never touched.
describe("the server rung leaves no database file behind", () => {
  const DJANGO = { "manage.py": "#!/usr/bin/env python\nimport os, sys\n\nif __name__ == '__main__':\n    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'shop.settings')\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n", "requirements.txt": "django\n", "shop/__init__.py": "", "shop/settings.py": "DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}\n" };
  test("an empty db.sqlite3 made by Django's start is removed after the check, and the page was still checked", async () => {
    const { result, dir, started } = await ladder(DJANGO, { python: "serve-db" });
    expect(started.args.slice(0, 3)).toEqual(["manage.py", "runserver", "--noreload"]);
    expect(rungs(result)).toEqual(["install:skipped", "checks:skipped", "tests:skipped", "start:passed", "browser:passed"]);
    expect(existsSync(join(dir, "db.sqlite3"))).toBe(false);
  }, 30000);
  test("also when the server stops on its own after making it", async () => {
    const { result, dir } = await ladder(DJANGO, { python: "crash-db" });
    expect(result.failedAt?.rung).toBe("start");
    expect(existsSync(join(dir, "db.sqlite3"))).toBe(false);
  }, 30000);
  test("a database that was there before is never touched, even an empty one", async () => {
    for (const before of ["SQLite format 3\u0000 the person's data", ""]) {
      const { dir } = await ladder({ ...DJANGO, "db.sqlite3": before }, { python: "serve-db" });
      expect(readFileSync(join(dir, "db.sqlite3"), "utf8")).toBe(before);
    }
  }, 30000);
});

// Point at the problem changes nothing (noInstall), so it cannot install what is missing. When that is why nothing could
// be checked, that is what it found, said with the command to run (as for a Node project whose packages are missing),
// never "nothing to check". When some checks ran, the words for the ones that could not are kept for the card.
describe("Point at the problem, when a Python project's packages are missing", () => {
  const TESTS_NEED_FLASK = "==================================== ERRORS ====================================\n___ ERROR collecting tests/test_app.py ___\ntests/test_app.py:1: in <module>\n    from app import Flask\napp.py:1: in <module>\n    from flask import Flask\nE   ModuleNotFoundError: No module named 'flask'\n";
  const FILES = { "requirements.txt": "flask\npytest\n", "app.py": "from flask import Flask\n", "tests/test_app.py": "from app import Flask\n" };
  test("nothing could run: it is what was found, with the command to run, and nothing is pointed at on screen", async () => {
    const { result, calls } = await ladder(FILES, { noInstall: true, run: async () => res({ code: 2, stdout: TESTS_NEED_FLASK }) });
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("install");
    expect(result.failedAt?.detail).toContain("python3 -m venv .venv, then .venv/bin/pip install -r requirements.txt");
    expect(result.failedAt?.detail).toMatch(/does not install Python packages/);
    expect(result.failedAt?.problem).toBeUndefined();   // Companion's own words are not on the screen to circle
    expect(calls.some((c) => /\bpip\b/.test(c.command))).toBe(false);
  }, 30000);
  test("no Python on this Mac: said plainly as what was found, and nothing is run", async () => {
    const { result, calls } = await ladder(FILES, { noInstall: true, detect: (d) => detectProject(d, undefined, { path: [], exists: () => false }) });
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ verdict: "failed", failedAt: { rung: "install", status: "failed" } });
    expect(result.failedAt?.detail).toMatch(/^Python is not set up on this Mac/);
  }, 30000);
  test("a broken virtual environment: said plainly with how to make it again", async () => {
    const { result, calls } = await ladder({ ...FILES, ".venv/pyvenv.cfg": "home = /opt/homebrew/Cellar/python@3.11/gone\n" }, { noInstall: true });
    expect(calls).toEqual([]);
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.detail).toMatch(/virtual environment \(\.venv\) is broken/);
    expect(result.failedAt?.detail).toContain("rm -rf .venv");
  }, 30000);
  test("some checks ran: still not a failure, and the first thing to install is kept (the project's packages before a lone tool)", async () => {
    const files = { "requirements.txt": "flask\npytest\nruff\n", "app.py": "from flask import Flask\n", "tests/test_app.py": "from app import Flask\n", "pyproject.toml": "[tool.mypy]\n" };
    const { result } = await ladder(files, { noInstall: true, python: "serve", run: async (c) => (/ruff/.test(c) ? res() : /mypy/.test(c) ? res({ code: 1, stderr: "'.venv/bin/python': No module named mypy" }) : /pytest/.test(c) ? res({ code: 2, stdout: TESTS_NEED_FLASK }) : res()) });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.gaps).toHaveLength(2);
    expect(result.gaps![0]).toContain("The tests need flask");
    expect(result.gaps![1]).toContain(".venv/bin/pip install mypy");
  }, 30000);
  test("Rescue (which may install) still gets 'nothing to check' with the words in the steps, as before", async () => {
    const { result } = await ladder(FILES, { run: async () => res({ code: 2, stdout: TESTS_NEED_FLASK }) });
    expect(result.verdict).toBe("nothing_to_check");
    expect(result.gaps![0]).toContain("pip install -r requirements.txt");
  }, 30000);
});

// The real thing, when this Mac has it: Python, FastAPI and uvicorn (not installed by this test, never downloaded).
const realPath = (minimalEnv().PATH ?? "").split(":");
const realPy = (() => { try { return findPython(tmpdir(), { path: realPath }); } catch { return null; } })();
const haveFastApi = !!realPy && Bun.spawnSync([realPy.command, "-c", "import fastapi, uvicorn"], { env: { PATH: realPath.join(":"), HOME: process.env.HOME ?? "" } }).exitCode === 0;
describe("this Mac's real Python", () => {
  (haveFastApi ? test : test.skip)("a FastAPI app really starts through uvicorn on 127.0.0.1, answers, and is stopped, with nothing written into the project", async () => {
    const answers: number[] = [];
    const { result, dir, urls } = await ladder({ "requirements.txt": "fastapi\nuvicorn\n", "main.py": 'from fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/")\ndef home():\n    return {"ok": True}\n' }, {
      detect: (d) => detectProject(d, undefined, { path: realPath }),
      browser: async (url) => { answers.push((await fetch(url)).status); return okBrowser(url); },
    });
    if (result.verdict !== "passed") console.log(JSON.stringify(result.steps));
    expect(rungs(result)).toEqual(["install:skipped", "checks:skipped", "tests:skipped", "start:passed", "browser:passed"]);
    expect(answers).toEqual([200]);
    expect(urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(await fetch(urls[0], { signal: AbortSignal.timeout(500) }).then(() => "answered", () => "gone")).toBe("gone");
    expect(existsSync(join(dir, "__pycache__"))).toBe(false);
  }, 60000);
});
