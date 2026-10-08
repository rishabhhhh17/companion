import { describe, expect, test } from "bun:test";
import { analyzeScripts, analyzeTests } from "../src/proof/testguard.ts";

const pkg = (scripts: Record<string, string>) => JSON.stringify({ scripts });
describe("test guard, harder cases", () => {
  test("an error swallowed with || true is a weakened check", () => {
    expect(analyzeScripts(pkg({ test: "vitest run" }), pkg({ test: "vitest run || true" })).ok).toBe(false);
    expect(analyzeScripts(pkg({ build: "tsc" }), pkg({ build: "tsc; exit 0" })).ok).toBe(false);
  });
  test("passing with no tests found is a weakened check", () => {
    expect(analyzeScripts(pkg({ test: "jest" }), pkg({ test: "jest --passWithNoTests" })).ok).toBe(false);
  });
  test("commented out tests do not count", () => {
    const r = analyzeTests({ "a.test.ts": "test('x',()=>{});test('y',()=>{});" }, { "a.test.ts": "test('x',()=>{});// test('y',()=>{});" });
    expect(r.ok).toBe(false);
  });
  test("moving a test file keeps its tests and is fine", () => {
    const r = analyzeTests({ "a.test.ts": "test('x',()=>{});" }, { "tests/a.test.ts": "test('x',()=>{});" });
    expect(r.ok).toBe(true);
  });
  test("python and go tests are counted", () => {
    expect(analyzeTests({ "test_a.py": "def test_one():\n  pass\ndef test_two():\n  pass\n" }, { "test_a.py": "def test_one():\n  pass\n" }).ok).toBe(false);
    expect(analyzeTests({ "a_test.go": "func TestA(t *testing.T) {}\nfunc TestB(t *testing.T) {}" }, { "a_test.go": "func TestA(t *testing.T) {}" }).ok).toBe(false);
  });
});
