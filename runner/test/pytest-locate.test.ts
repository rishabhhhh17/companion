// Point at the problem for Python projects: pytest's report (long, short, line and summary only), ruff, flake8 and mypy
// become one place in the person's project. Where the samples come from:
// - uvicorn-start.txt is real: Python 3.9 and uvicorn on this Mac (16 Oct 2026), a FastAPI app with a NameError.
// - pytest-*.txt, ruff-*.txt, flake8.txt and mypy.txt are written by hand in pytest 8, ruff 0.12 (and the older concise
//   form), flake8 and mypy's formats. pytest is not installed on this Mac and nothing was downloaded to capture them, so a
//   real pytest run is still to be checked (see the M11 notes).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { locateProblem } from "../src/proof/locate.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-pyloc-")));
  made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const fixture = (name: string, root: string) => readFileSync(join(import.meta.dir, "fixtures", "errors", `${name}.txt`), "utf8").replaceAll("{{ROOT}}", root);

const SHOP = {
  "tests/test_cart.py": [
    "from shop.cart import Cart, apply_discount", "import pytest", "", "",
    "def test_total_price():", "    cart = Cart()", '    cart.add("Mug", 12)', '    cart.add("Tea", 4)', "    assert cart.total() == 15", "", "",
    "def test_discount():", "    assert apply_discount(20, 0) == 20", "", "",
    "class TestCart:", "    def test_empty_total(self):", '        assert Cart().total() == 0, "an empty cart costs nothing"', "",
  ].join("\n"),
  "shop/__init__.py": "",
  "shop/cart.py": [
    "class Cart:", "    def __init__(self):", "        self.items = []", "", "    def add(self, name, price):", "        self.items.append((name, price))", "",
    "    def total(self):", "        return sum(p for _, p in self.items) + 1", "", "", "",
    "def apply_discount(price, percent):", "    return price - price / percent", "",
  ].join("\n"),
  "tests/test_app.py": ["import pytest", "", "from app import create_app, load_items", "", "", "def test_home():", "    client = create_app().test_client()", '    response = client.get("/")', "    assert response.status_code == 200", ""].join("\n"),
  "app.py": ["from flask import Flask, render_template", "", "", "", "def load_items():", '    with open("data/items.json") as f:', "        return f.read()", "", "", "def home():", '    return render_template("index.html", items=load_items())', ""].join("\n"),
};

describe("pytest: the failing place, in every report style", () => {
  test("a failed assert (the default long report): the assert line in the test, with what was compared", () => {
    const p = project(SHOP);
    const r = locateProblem(fixture("pytest-assert-long", p), p, "tests");
    expect(r).toMatchObject({ kind: "line", file: "tests/test_cart.py", line: 9, lineText: "assert cart.total() == 15", from: "tests" });
    expect(r && r.message).toBe("AssertionError: assert 16 == 15");
  });
  test("an error raised inside the code under test: the deepest line in the person's own code", () => {
    const p = project(SHOP);
    expect(locateProblem(fixture("pytest-exception-long", p), p, "tests")).toMatchObject({ kind: "line", file: "shop/cart.py", line: 14, lineText: "return price - price / percent", message: "ZeroDivisionError: division by zero" });
  });
  test("the short report Companion asks for: frames in the virtual environment are skipped", () => {
    const p = project(SHOP);
    for (const f of [".venv/lib/python3.12/site-packages/werkzeug/test.py", ".venv/lib/python3.12/site-packages/flask/testing.py", ".venv/lib/python3.12/site-packages/flask/app.py"]) { mkdirSync(dirname(join(p, f)), { recursive: true }); writeFileSync(join(p, f), "x\n".repeat(2000)); }
    expect(locateProblem(fixture("pytest-short-tb", p), p, "tests")).toMatchObject({ kind: "line", file: "app.py", line: 6, message: "FileNotFoundError: [Errno 2] No such file or directory: 'data/items.json'" });
  });
  test("packages kept in a folder with another name are not the person's code either", () => {
    const p = project(SHOP);
    const lib = "env/lib/python3.12/site-packages/flask/app.py";
    mkdirSync(dirname(join(p, lib)), { recursive: true }); writeFileSync(join(p, lib), "x\n".repeat(2000));
    const text = [
      "=================================== FAILURES ===================================", "__________________________________ test_home ___________________________________",
      "tests/test_app.py:8: in test_home", '    response = client.get("/")', `${lib}:1498: in wsgi_app`, "    response = self.full_dispatch_request()",
      "E   KeyError: 'SECRET_KEY'", "=========================== short test summary info ============================", "FAILED tests/test_app.py::test_home - KeyError: 'SECRET_KEY'",
    ].join("\n");
    expect(locateProblem(text, p, "tests")).toMatchObject({ kind: "line", file: "tests/test_app.py", line: 8, message: "KeyError: 'SECRET_KEY'" });
  });
  test("a test file that cannot be imported: the import line, and why", () => {
    const p = project(SHOP);
    const r = locateProblem(fixture("pytest-collect-error", p), p, "tests");
    expect(r).toMatchObject({ kind: "line", file: "tests/test_app.py", line: 3, lineText: "from app import create_app, load_items" });
    expect(r && r.message).toContain("ImportError: cannot import name 'load_items'");
  });
  test("a syntax error found while collecting: the broken line in the person's module", () => {
    const p = project({ ...SHOP, "shop/cart.py": "class Cart:\n    def __init__(self):\n        self.items = []\n\n    def add(self, name, price):\n        self.items.append((name, price))\n    def total(self)\n        return 0\n" });
    expect(locateProblem(fixture("pytest-syntax-error", p), p, "tests")).toMatchObject({ kind: "line", file: "shop/cart.py", line: 7, lineText: "def total(self)", message: "SyntaxError: expected ':'" });
  });
  test("only the summary line (--tb=no): the failing test's own definition, never a guessed line", () => {
    const p = project(SHOP);
    expect(locateProblem(fixture("pytest-summary-only", p), p, "tests")).toMatchObject({ kind: "line", file: "tests/test_cart.py", line: 5, lineText: "def test_total_price():", message: "assert 16 == 15" });
  });
  test("the one line report (--tb=line), with a full path", () => {
    const p = project(SHOP);
    expect(locateProblem(fixture("pytest-tb-line", p), p, "tests")).toMatchObject({ kind: "line", file: "tests/test_cart.py", line: 9, message: "assert 16 == 15" });
  });
  test("a test in a class, with its own failure message", () => {
    const p = project(SHOP);
    expect(locateProblem(fixture("pytest-class", p), p, "tests")).toMatchObject({ kind: "line", file: "tests/test_cart.py", line: 18, message: "AssertionError: an empty cart costs nothing" });
  });
  test("when no frame is in the project, the error sentence is kept, never a place outside it", () => {
    const p = project({ "tests/test_x.py": "def test_x():\n    pass\n" });
    const text = "=================================== FAILURES ===================================\n___ test_x ___\n/usr/lib/python3.12/json/decoder.py:355: in raw_decode\n    raise JSONDecodeError(\"Expecting value\", s, err.value) from None\nE   json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)\n=========================== short test summary info ============================\nFAILED nowhere.py::test_x - json.decoder.JSONDecodeError: Expecting value";
    expect(locateProblem(text, p, "tests")).toEqual({ kind: "message", message: "json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)", from: "tests" });
  });
});

describe("Python's lint and type checks", () => {
  const LINTED = { "app.py": ["import os", "from flask import Flask, render_template", "", "app = Flask(__name__)", "", "", "", "", '@app.route("/")', "def home():", '    return render_template("index.html", items=load_item())', ""].join("\n") };
  test("ruff's current report: the place under the arrow, the words above it, without the rule code", () => {
    const p = project(LINTED);
    expect(locateProblem(fixture("ruff-full", p), p, "checks")).toEqual({ kind: "line", file: "app.py", line: 1, column: 8, lineText: "import os", message: "`os` imported but unused", from: "checks" });
  });
  test("ruff's concise report", () => {
    const p = project(LINTED);
    expect(locateProblem(fixture("ruff-concise", p), p, "checks")).toMatchObject({ kind: "line", file: "app.py", line: 1, column: 8, message: "`os` imported but unused" });
  });
  test("flake8", () => {
    const p = project(LINTED);
    expect(locateProblem(fixture("flake8", p), p, "checks")).toMatchObject({ kind: "line", file: "app.py", line: 1, message: "'os' imported but unused" });
  });
  test("mypy, without the rule name in brackets", () => {
    const p = project(LINTED);
    expect(locateProblem(fixture("mypy", p), p, "checks")).toMatchObject({ kind: "line", file: "app.py", line: 11, message: 'Name "load_item" is not defined' });
  });
});

describe("a Python server that does not start (real uvicorn output)", () => {
  test("the line in the person's app, past twenty frames of uvicorn and Python itself", () => {
    const p = project({ "main.py": 'from fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/")\ndef home():\n    return {"items": load_items()}\n\n\nsettings = Settings()\n' });
    expect(locateProblem(fixture("uvicorn-start", p), p, "start")).toMatchObject({ kind: "line", file: "main.py", line: 11, lineText: "settings = Settings()", message: "NameError: name 'Settings' is not defined" });
  });
});
