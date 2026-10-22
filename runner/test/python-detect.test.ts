// What a Python project has that can be checked: pytest, ruff or flake8, mypy, and a Flask, FastAPI, Django or Streamlit
// server for the browser check. It always uses the project's own virtual environment when there is one, never installs
// anything, and never runs macOS's stand in python3 (which opens an install window when Apple's tools are missing).
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { detectProject } from "../src/proof/detect.ts";
import { findPython, missingModule } from "../src/proof/python.ts";
import { pythonPortArgs } from "../src/proof/server.ts";
import { inspectProject } from "../src/proof/intake.ts";
import { PRODUCT } from "../src/names.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-pydet-")));
  made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); if (f.endsWith("bin/python")) chmodSync(join(d, f), 0o755); }
  return d;
}
const VENV = { ".venv/bin/python": "#!/bin/sh\n", ".venv/pyvenv.cfg": "home = /opt/homebrew/bin\n" };
const all = (d: ReturnType<typeof detectProject>) => [...d.checks.map((c) => c.command), d.tests?.command ?? "", d.start?.kind === "server" ? d.start.command : ""].join("\n");

describe("which Python runs the checks", () => {
  test("the project's own .venv first, then venv", () => {
    expect(findPython(project({ ...VENV, "app.py": "" }))).toEqual({ command: ".venv/bin/python", venv: ".venv" });
    expect(findPython(project({ "venv/bin/python": "#!/bin/sh\n", "app.py": "" }))).toEqual({ command: "venv/bin/python", venv: "venv" });
  });
  test("with no virtual environment, a python3 on the tool path", () => {
    const d = project({ "app.py": "" });
    expect(findPython(d, { path: ["/opt/homebrew/bin", "/usr/bin"], exists: (p) => p === "/opt/homebrew/bin/python3" })).toEqual({ command: "/opt/homebrew/bin/python3", venv: null });
  });
  test("macOS's stand in /usr/bin/python3 is never run without Apple's command line tools (it would open a window)", () => {
    const d = project({ "app.py": "" });
    expect(findPython(d, { path: ["/usr/bin"], exists: (p) => p === "/usr/bin/python3" })).toBeNull();
    expect(findPython(d, { path: ["/usr/bin"], exists: (p) => p === "/usr/bin/python3" || p === "/Library/Developer/CommandLineTools/usr/bin/python3" })).toEqual({ command: "/usr/bin/python3", venv: null });
  });
  test("a virtual environment whose Python is gone is called broken, and the Mac's Python is not used behind its back", () => {
    const d = project({ ".venv/pyvenv.cfg": "home = /old/python\n", "app.py": "" });
    mkdirSync(join(d, ".venv", "bin"), { recursive: true });
    symlinkSync("/nowhere/python3.11", join(d, ".venv", "bin", "python"));
    const det = detectProject(d);
    expect(det.kind).toBe("python");
    expect(det.python?.command).toBeNull();
    expect(det.python?.note).toMatch(/\.venv.*broken|broken.*\.venv/i);
    expect(det.checks).toEqual([]); expect(det.tests).toBeNull();
  });
});

describe("what a Python project has to check", () => {
  test("pytest from a tests folder, run quietly with the short report and no cache written into the project", () => {
    const det = detectProject(project({ ...VENV, "requirements.txt": "flask==3.0.3\n", "app.py": "", "tests/test_app.py": "def test_x():\n    assert True\n" }));
    expect(det.kind).toBe("python");
    expect(det.tests).toEqual({ command: "'.venv/bin/python' -m pytest -q --tb=short -p no:cacheprovider", tool: "pytest" });
  });
  test("pytest named in requirements or pyproject counts even without a tests folder", () => {
    expect(detectProject(project({ ...VENV, "requirements-dev.txt": "pytest>=8\n", "main.py": "" })).tests?.tool).toBe("pytest");
    expect(detectProject(project({ ...VENV, "pyproject.toml": '[project]\nname = "shop"\ndependencies = ["fastapi"]\n\n[dependency-groups]\ndev = ["pytest>=8.3"]\n', "main.py": "" })).tests?.tool).toBe("pytest");
    expect(detectProject(project({ ...VENV, "pyproject.toml": '[tool.pytest.ini_options]\naddopts = "-ra"\n', "main.py": "" })).tests?.tool).toBe("pytest");
    expect(detectProject(project({ ...VENV, "main.py": "print(1)\n" })).tests).toBeNull();
  });
  test("ruff when the project uses it (preferred over flake8), flake8 otherwise, mypy when configured", () => {
    const ruff = detectProject(project({ ...VENV, "pyproject.toml": "[tool.ruff]\nline-length = 100\n", "requirements.txt": "flake8\n", "app.py": "" }));
    expect(ruff.checks).toEqual([{ name: "lint", command: "'.venv/bin/python' -m ruff check --no-cache .", tool: "ruff" }]);
    const flake = detectProject(project({ ...VENV, ".flake8": "[flake8]\nmax-line-length = 100\n", "app.py": "" }));
    expect(flake.checks[0]).toMatchObject({ name: "lint", tool: "flake8" });
    expect(flake.checks[0].command).toContain("--extend-exclude");   // never lints the packages in the virtual environment
    const mypy = detectProject(project({ ...VENV, "mypy.ini": "[mypy]\nstrict = True\n", "app.py": "" }));
    // mypy's own way to write no cache (.mypy_cache) into the project.
    expect(mypy.checks).toEqual([{ name: "typecheck", command: "'.venv/bin/python' -m mypy --cache-dir /dev/null .", tool: "mypy" }]);
    const files = detectProject(project({ ...VENV, "setup.cfg": "[mypy]\nfiles = src\n", "app.py": "" }));
    expect(files.checks).toEqual([{ name: "typecheck", command: "'.venv/bin/python' -m mypy --cache-dir /dev/null", tool: "mypy" }]);
    expect(detectProject(project({ ...VENV, "app.py": "" })).checks).toEqual([]);
  });
  test("each framework gets its own dev server command, with the reloader off", () => {
    const flask = detectProject(project({ ...VENV, "requirements.txt": "flask\n", "main.py": "from flask import Flask\n\napp = Flask(__name__)\n" }));
    expect(flask.start).toMatchObject({ kind: "server", command: "'.venv/bin/python' -m flask run --no-reload", python: "flask", env: { FLASK_APP: "main:app" } });
    const fast = detectProject(project({ ...VENV, "requirements.txt": "fastapi\nuvicorn\n", "app/main.py": "from fastapi import FastAPI\napi = FastAPI()\n", "app/__init__.py": "" }));
    expect(fast.start).toMatchObject({ kind: "server", command: "'.venv/bin/python' -m uvicorn app.main:api", python: "uvicorn" });
    const django = detectProject(project({ ...VENV, "requirements.txt": "Django>=5\n", "manage.py": "#!/usr/bin/env python\n" }));
    expect(django.start).toMatchObject({ kind: "server", command: "'.venv/bin/python' manage.py runserver --noreload", python: "django" });
    const lit = detectProject(project({ ...VENV, "requirements.txt": "streamlit\n", "streamlit_app.py": "import streamlit as st\nst.title('Hi')\n" }));
    expect(lit.start).toMatchObject({ kind: "server", command: "'.venv/bin/python' -m streamlit run 'streamlit_app.py' --server.headless true --browser.gatherUsageStats false", python: "streamlit" });
  });
  test(`the server is always told to listen only on this Mac, on the port ${PRODUCT} chose`, () => {
    expect(pythonPortArgs("flask", 5123)).toBe(" --host 127.0.0.1 --port 5123");
    expect(pythonPortArgs("uvicorn", 5123)).toBe(" --host 127.0.0.1 --port 5123");
    expect(pythonPortArgs("django", 5123)).toBe(" 127.0.0.1:5123");
    expect(pythonPortArgs("streamlit", 5123)).toBe(" --server.address 127.0.0.1 --server.port 5123");
  });
  test(`an app that runs itself (python main.py on Replit) is started by its framework instead, so it binds where ${PRODUCT} says`, () => {
    const det = detectProject(project({ ...VENV, ".replit": 'run = "python main.py"\n', "main.py": "from flask import Flask\napp = Flask(__name__)\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=8080)\n" }));
    expect(det.start).toMatchObject({ python: "flask" });
  });
  test("the project's own launch settings still come first", () => {
    const det = detectProject(project({ ...VENV, ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: "make", runtimeArgs: ["serve"], port: 9000 }] }), "main.py": "from flask import Flask\napp = Flask(__name__)\n" }));
    expect(det.start).toEqual({ kind: "server", command: "make serve", port: 9000, from: "launch" });
  });
  test("a project with a package.json is still a Node project, exactly as before", () => {
    const det = detectProject(project({ "package.json": JSON.stringify({ scripts: { test: "vitest" } }), "requirements.txt": "flask\n", "api/index.py": "" }));
    expect(det.kind).toBe("node"); expect(det.python).toBeUndefined(); expect(det.tests?.command).toBe("npm run test");
  });
  test("nothing ever installs a package: no pip, no uv, no poetry in any command", () => {
    const det = detectProject(project({ "requirements.txt": "flask\npytest\nruff\nmypy\n", "mypy.ini": "[mypy]\n", "main.py": "from flask import Flask\napp = Flask(__name__)\n", "tests/test_main.py": "" }));
    expect(all(det)).not.toMatch(/\bpip\b|\buv\b|poetry|install/);
    expect(det.python?.note).toMatch(/does not install/);
  });
  test("with no Python at all there is nothing to run, and the note says so plainly", () => {
    const det = detectProject(project({ "requirements.txt": "flask\n", "main.py": "", "tests/test_main.py": "" }), undefined, { path: ["/nowhere"], exists: () => false });
    expect(det.python?.command).toBeNull();
    expect(det.checks).toEqual([]); expect(det.tests).toBeNull(); expect(det.start).toBeNull();
    expect(det.python?.note).toMatch(/Python is not set up/);
  });
});

describe("a missing package is a gap to fill, not a bug in the person's code", () => {
  const declared = ["flask", "python-dotenv", "pyyaml", "pytest"];
  test("the tool itself is missing (python -m pytest)", () => {
    expect(missingModule("/Library/Developer/CommandLineTools/usr/bin/python3: No module named pytest\n", "pytest", declared)).toEqual({ module: "pytest", tool: true });
    expect(missingModule(".venv/bin/python: No module named ruff", "ruff", [])).toEqual({ module: "ruff", tool: true });
  });
  test("a package the project lists but that is not installed, including names that differ (yaml is pyyaml)", () => {
    expect(missingModule("E   ModuleNotFoundError: No module named 'flask'", "pytest", declared)).toEqual({ module: "flask", tool: false });
    expect(missingModule("ModuleNotFoundError: No module named 'dotenv'", undefined, declared)).toEqual({ module: "dotenv", tool: false });
    expect(missingModule("ModuleNotFoundError: No module named 'yaml.loader'", undefined, declared)).toEqual({ module: "yaml", tool: false });
  });
  test("a module nobody listed is a real problem in the code, and stays a failure", () => {
    expect(missingModule("ModuleNotFoundError: No module named 'requets'", "pytest", declared)).toBeNull();
    expect(missingModule("AssertionError: assert 1 == 2", "pytest", declared)).toBeNull();
  });
});

describe("About this project, for Python", () => {
  test("the note names the virtual environment it will use, and says packages are never installed for you", () => {
    expect(inspectProject(project({ ...VENV, "requirements.txt": "flask\n", "main.py": "x" })).notes.join(" ")).toMatch(/\.venv/);
    const bare = inspectProject(project({ "requirements.txt": "flask\n", "main.py": "x" })).notes.join(" ");
    expect(bare).toContain("cannot install its packages");
    expect(bare).toContain("python3 -m venv .venv");
    expect(bare).toContain(".venv/bin/pip install -r requirements.txt");
  });
});
