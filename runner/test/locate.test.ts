// Point at the problem: a failing check's output becomes one place in the person's project (file, line, the line's text)
// or a button in their app, or at least the error sentence. The fixtures are real output from TypeScript, Vite, Vitest,
// ESLint, Node, Bun and Python, captured on 10 Oct 2026 from a broken sample project.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { locateProblem, buttonProblem } from "../src/proof/locate.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });

const FILES: Record<string, string> = {
  "src/App.tsx": 'import { useState } from "react";\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n  const total: number = "three";\n  return <button onClick={() => setCount(count + 1)}>Count {count} {totl}</button>;\n}\n',
  "src/math.test.ts": 'import { expect, test } from "vitest";\nimport { add } from "./math";\n\ntest("adds two numbers", () => {\n  expect(add(2, 3)).toBe(5);\n});\n',
  "src/crash.js": "const a = 1;\nfunction go() {\n  return undefinedThing.value;\n}\ngo();\n",
  "src/crash.py": "def go():\n    return 1 / 0\n\ngo()\n",
  "test/signup.test.js": "// c\n// c\n// c\n// c\n// c\n// c\n// c\n// c\ntest('joining the list works', async () => {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  const d = 4;\n  const e = 5;\n  const f = 6;\n  const g = 7;\n  assert.strictEqual(res.status, 200);\n});\n",
  "src/bad2.ts": 'import { add } from "./math";\nexport const y = add(1 2);\n',
};
function project(): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-loc-")));
  made.push(d);
  for (const [f, c] of Object.entries(FILES)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const fixture = (name: string, root: string) => readFileSync(join(import.meta.dir, "fixtures", "errors", `${name}.txt`), "utf8").replaceAll("{{ROOT}}", root);

describe("Node's test output when the assertion has no message of its own", () => {
  test("the person reads what was wrong, not the formatting of the report ('error: |-')", () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-loc2-"))); made.push(d);
    mkdirSync(join(d, "test")); writeFileSync(join(d, "test", "price.js"), "const test = require('node:test');\nconst assert = require('node:assert');\nconst { withTax } = require('../price');\n\ntest('adds 20 percent tax', () => {\n  assert.strictEqual(withTax(100), 120);\n});\n");
    const p = locateProblem(fixture("node-test-tap-block", d), d, "tests");
    expect(p).toMatchObject({ kind: "line", file: "test/price.js", line: 6 });
    expect(p && p.message).toBe("Expected values to be strictly equal. Got 110.00000000000001, expected 120.");
    expect(p && p.message).not.toMatch(/\|-|^error/);
  });
});

describe("Node's test runner, as the practice stuck moments meet it (real output, Node 18 and Node 24, 16 Oct 2026)", () => {
  test("a test file that cannot even load: the person reads the error it printed, not Node's own 'test failed'", () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-loc3-"))); made.push(d);
    const settings = readFileSync(join(import.meta.dir, "../../app/sample/stuck-setting/settings.js"), "utf8");
    writeFileSync(join(d, "settings.js"), settings); writeFileSync(join(d, "server.js"), "x\nx\nconst { shopName } = require(\"./settings.js\");\n");
    const p = locateProblem(fixture("node-test-tap-load", d), d, "tests");
    expect(p).toMatchObject({ kind: "line", file: "settings.js", line: 16, message: "Error: SHOP_NAME is not set. Add it to .env.local in this folder." });
  });
  test("Node 24 says where the test starts ('test at ...:9:1') before the failing check: the failing check wins", () => {
    const p = project();
    expect(locateProblem(fixture("node24-test-spec", p), p, "tests")).toMatchObject({ kind: "line", file: "test/signup.test.js", line: 17, lineText: "assert.strictEqual(res.status, 200);" });
  });
  test("Node's own 'test failed' is still said when nothing better was printed", () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-loc4-"))); made.push(d);
    expect(locateProblem("TAP version 13\nnot ok 1 - x\n  ---\n  error: 'test failed'\n  ...\n", d, "tests")).toMatchObject({ kind: "message", message: "test failed" });
  });
});

describe("real tool output becomes a file and a line", () => {
  test("TypeScript (plain): the first error, with the line's own text", () => {
    const p = project();
    expect(locateProblem(fixture("tsc", p), p, "checks")).toEqual({ kind: "line", file: "src/App.tsx", line: 5, column: 9, lineText: 'const total: number = "three";', message: "Type 'string' is not assignable to type 'number'.", from: "checks" });
  });
  test("TypeScript (pretty, with colours)", () => {
    const p = project();
    const r = locateProblem(fixture("tsc-pretty", p), p, "checks");
    expect(r).toMatchObject({ kind: "line", file: "src/App.tsx", line: 5, message: "Type 'string' is not assignable to type 'number'." });
  });
  test("Vitest: the failing line in the test, past the colours and the boxes", () => {
    const p = project();
    expect(locateProblem(fixture("vitest", p), p, "tests")).toMatchObject({ kind: "line", file: "src/math.test.ts", line: 5, lineText: "expect(add(2, 3)).toBe(5);", message: "AssertionError: expected -1 to be 5 // Object.is equality" });
  });
  test("ESLint: the file on its own line, the place on the next", () => {
    const p = project();
    expect(locateProblem(fixture("eslint", p), p, "checks")).toMatchObject({ kind: "line", file: "src/App.tsx", line: 5, column: 9, message: "'total' is assigned a value but never used" });
  });
  test("Node: a crash, with a file:// address", () => {
    const p = project();
    expect(locateProblem(fixture("node", p), p, "start")).toMatchObject({ kind: "line", file: "src/crash.js", line: 3, lineText: "return undefinedThing.value;", message: "ReferenceError: undefinedThing is not defined" });
  });
  test("Bun: a crash", () => {
    const p = project();
    expect(locateProblem(fixture("bun", p), p, "start")).toMatchObject({ kind: "line", file: "src/crash.js", line: 3, message: "ReferenceError: undefinedThing is not defined" });
  });
  test("Python: the deepest frame in the project, not the first", () => {
    const p = project();
    expect(locateProblem(fixture("python", p), p, "tests")).toMatchObject({ kind: "line", file: "src/crash.py", line: 2, lineText: "return 1 / 0", message: "ZeroDivisionError: division by zero" });
  });
  test("Node's test runner (TAP): the failing check at line 17, not where the test starts at line 9, with its own message", () => {
    const p = project();
    expect(locateProblem(fixture("node-test-tap", p), p, "tests")).toMatchObject({ kind: "line", file: "test/signup.test.js", line: 17, lineText: "assert.strictEqual(res.status, 200);", message: "Pressing Join sends the email to /api/signup, which answered 404" });
  });
  test("Node's test runner (spec)", () => {
    const p = project();
    expect(locateProblem(fixture("node-test-spec", p), p, "tests")).toMatchObject({ kind: "line", file: "test/signup.test.js", line: 17 });
  });
  test("Vite: the project's file, never the build tool's own files in node_modules", () => {
    const p = project();
    expect(locateProblem(fixture("vite2", p), p, "checks")).toMatchObject({ kind: "line", file: "src/bad2.ts", line: 2, lineText: "export const y = add(1 2);", message: 'Expected ")" but found "2"' });
  });
});

describe("only real places inside the project", () => {
  test("a file outside the project is never offered", () => {
    const p = project();
    expect(locateProblem("/etc/hosts:3:1: error: nope", p, "checks")).toEqual({ kind: "message", message: "/etc/hosts:3:1: error: nope", from: "checks" });
  });
  test("climbing out with ../ does not work", () => {
    const p = project();
    expect(locateProblem("src/../../outside.ts(2,1): error TS1: x", p, "checks")?.kind).toBe("message");
  });
  test("a link inside the project that leads outside is not followed", () => {
    const p = project();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "companion-out-"))); made.push(outside);
    writeFileSync(join(outside, "secret.ts"), "a\nb\nc\n");
    symlinkSync(join(outside, "secret.ts"), join(p, "src", "link.ts"));
    expect(locateProblem("src/link.ts(2,1): error TS1: x", p, "checks")?.kind).toBe("message");
  });
  test("a line past the end of the file, or a missing file, is skipped for the next real one", () => {
    const p = project();
    const r = locateProblem("src/App.tsx(99,1): error TS1: gone\nsrc/nope.ts(1,1): error TS2: missing\nsrc/App.tsx(6,3): error TS3: real one", p, "checks");
    expect(r).toMatchObject({ kind: "line", file: "src/App.tsx", line: 6, message: "real one" });
  });
  test("files the person did not write (node_modules, build output, .git) are skipped", () => {
    const p = project();
    for (const f of ["node_modules/x/index.js", "dist/app.js", ".next/server.js", ".git/config"]) { mkdirSync(dirname(join(p, f)), { recursive: true }); writeFileSync(join(p, f), "1\n2\n3\n"); }
    expect(locateProblem(`${p}/node_modules/x/index.js:2:1\n${p}/dist/app.js:2:1\n${p}/.next/server.js:1:1\n.git/config:1:1\nError: boom`, p, "start")).toEqual({ kind: "message", message: "Error: boom", from: "start" });
  });
  test("the line's text is cut to a sensible length and never contains a secret", () => {
    const p = project();
    writeFileSync(join(p, "src", "keys.ts"), `export const k = "sk-ant-api03-${"a".repeat(60)}";\nexport const long = ${JSON.stringify("x".repeat(500))};\n`);
    const a = locateProblem("src/keys.ts(1,1): error TS1: bad", p, "checks") as any;
    expect(a.lineText).not.toContain("sk-ant-api03");
    const b = locateProblem("src/keys.ts(2,1): error TS1: bad", p, "checks") as any;
    expect(b.lineText.length).toBeLessThanOrEqual(200);
  });
});

describe("no file and line", () => {
  test("the error sentence is kept, so it can still be found on the person's screen", () => {
    const p = project();
    expect(locateProblem("> build\n\nsh: vite: command not found\n", p, "checks")).toEqual({ kind: "message", message: "sh: vite: command not found", from: "checks" });
  });
  test("nothing useful at all gives nothing", () => {
    expect(locateProblem("\n\n   \n", project(), "checks")).toBeNull();
  });
  test("a broken button in the browser check names the button", () => {
    expect(buttonProblem(['The page crashed with: Cannot read properties of undefined (reading \'map\') (after pressing "Save")'])).toEqual({ kind: "button", label: "Save", message: "Cannot read properties of undefined (reading 'map')", from: "browser" });
    expect(buttonProblem(["The page answered with an error (500)"])).toBeNull();
  });
  test("an error: line in some other tool's output is not taken for a TAP failure message", () => {
    const p = project();
    expect(locateProblem("src/App.tsx(5,9): error TS2322: Type mismatch.\nerror: 'a log line of the project'", p, "checks")).toMatchObject({ message: "Type mismatch." });
  });
});
