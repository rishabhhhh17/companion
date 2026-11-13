// M85 (research feature 12): the test guard also catches a test that still exists but checks less. B1 in the research:
// "manipulates tests instead of following instructions" (CC #7074). Before this, testguard.ts counted tests and caught
// removed files, fewer tests and skipped tests; an assertion loosened inside a test that stayed got through.
import { describe, expect, test } from "bun:test";
import { analyzeTests, loosenedAssertions } from "../src/proof/testguard.ts";

const js = (body: string, name = "adds the tax") => `import { price } from "../src/price";\ntest("${name}", () => {\n${body}\n});\ntest("rounds", () => {\n  expect(price(1.005)).toBe(1.01);\n});\n`;
const check = (before: string, after: string, file = "test/price.test.ts") => analyzeTests({ [file]: before }, { [file]: after });

describe("an exact check made loose", () => {
  const cases: [string, string][] = [
    ["  expect(price(10)).toBe(11);", "  expect(price(10)).toBeDefined();"],
    ["  expect(total).toEqual({ sum: 5 });", "  expect(total).toBeTruthy();"],
    ["  expect(list).toHaveLength(3);", "  expect(list).not.toBeNull();"],
    ["  expect(() => run()).toThrow(\"no key\");", "  expect(() => run()).toThrow();"],
    ["  assert.equal(price(10), 11);", "  assert.ok(price(10));"],
  ];
  for (const [b, a] of cases) test(`${b.trim()} -> ${a.trim()}`, () => {
    const r = check(js(b), js(a));
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain('"adds the tax" in test/price.test.ts');
    expect(r.problems.join(" ")).toContain("loosened");
  });
  test("python: assert x == 5 became assert x", () => {
    const r = check("def test_total():\n    assert total() == 5\n", "def test_total():\n    assert total()\n", "tests/test_total.py");
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("test_total");
  });
  test("python unittest: assertEqual became assertTrue", () => {
    const r = check("    def test_total(self):\n        self.assertEqual(total(), 5)\n", "    def test_total(self):\n        self.assertTrue(total())\n", "tests/test_total.py");
    expect(r.ok).toBe(false);
  });
});

describe("a limit widened", () => {
  const cases: [string, string][] = [
    ["  expect(ms).toBeLessThan(100);", "  expect(ms).toBeLessThan(1000);"],
    ["  expect(score).toBeGreaterThanOrEqual(0.9);", "  expect(score).toBeGreaterThanOrEqual(0.5);"],
    ["  expect(pi).toBeCloseTo(3.14159, 5);", "  expect(pi).toBeCloseTo(3.14159, 1);"],
  ];
  for (const [b, a] of cases) test(`${b.trim()} -> ${a.trim()}`, () => {
    const r = check(js(b), js(a));
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("widened");
  });
  test("python: assert elapsed < 1 became < 10, and approx rel widened", () => {
    expect(check("def test_fast():\n    assert elapsed() < 1\n", "def test_fast():\n    assert elapsed() < 10\n", "tests/test_fast.py").ok).toBe(false);
    expect(check("def test_v():\n    assert v() == approx(2.0, rel=1e-6)\n", "def test_v():\n    assert v() == approx(2.0, rel=0.5)\n", "tests/test_v.py").ok).toBe(false);
  });
  test("a limit made tighter is fine", () => {
    expect(check(js("  expect(ms).toBeLessThan(1000);"), js("  expect(ms).toBeLessThan(100);")).ok).toBe(true);
  });
});

describe("an expect removed from a test that still exists", () => {
  test("two checks became one", () => {
    const r = check(js("  expect(price(10)).toBe(11);\n  expect(price(0)).toBe(0);"), js("  expect(price(10)).toBe(11);"));
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("A check was removed from the test \"adds the tax\"");
    expect(r.problems.join(" ")).toContain("2 before, 1 now");
  });
  test("go: a t.Errorf removed", () => {
    const b = "func TestSum(t *testing.T) {\n\tif Sum(2, 2) != 4 { t.Errorf(\"bad\") }\n\tif Sum(0, 0) != 0 { t.Errorf(\"bad\") }\n}\n";
    const a = "func TestSum(t *testing.T) {\n\tif Sum(2, 2) != 4 { t.Errorf(\"bad\") }\n}\n";
    expect(check(b, a, "sum_test.go").ok).toBe(false);
  });
});

describe("what stays fine", () => {
  test("a stricter check, a new check, a renamed value and an unchanged file", () => {
    expect(check(js("  expect(price(10)).toBeDefined();"), js("  expect(price(10)).toBe(11);")).ok).toBe(true);
    expect(check(js("  expect(price(10)).toBe(11);"), js("  expect(price(10)).toBe(11);\n  expect(price(0)).toBe(0);")).ok).toBe(true);
    expect(check(js("  const p = price(10);\n  expect(p).toBe(11);"), js("  const withTax = price(10);\n  expect(withTax).toBe(11);")).ok).toBe(true);
    expect(check(js("  expect(price(10)).toBe(11);"), js("  expect(price(10)).toBe(11);")).ok).toBe(true);
  });
  test("a test renamed is not compared (fewer tests is caught by the count)", () => {
    expect(loosenedAssertions("a.test.ts", js("  expect(x).toBe(1);", "old name"), js("  expect(x).toBeDefined();", "new name"))).toEqual([]);
  });
  test("a commented out check does not count as a check", () => {
    const r = check(js("  expect(price(10)).toBe(11);\n  expect(price(0)).toBe(0);"), js("  expect(price(10)).toBe(11);\n  // expect(price(0)).toBe(0);"));
    expect(r.ok).toBe(false);
  });
  test("at most five lines for one file", () => {
    const many = (m: string) => Array.from({ length: 8 }, (_, i) => `test("t${i}", () => {\n  expect(f(${i}))${m};\n});`).join("\n");
    expect(loosenedAssertions("a.test.ts", many(".toBe(1)"), many(".toBeDefined()")).length).toBe(5);
  });
});

describe("the review of another tool's change sees a widened limit too (weakened.ts)", () => {
  test("toBeLessThan(100) became toBeLessThan(1000) in a test file", async () => {
    const { weakenedChecks } = await import("../src/review/weakened.ts");
    const r = weakenedChecks([{ file: "test/speed.test.ts", removed: [{ line: 4, text: "  expect(ms).toBeLessThan(100);" }], added: [{ line: 4, text: "  expect(ms).toBeLessThan(1000);" }] }]);
    expect(r.map((x) => x.kind)).toEqual(["weakened_check"]);
    expect(r[0].say).toContain("widened at line 4");
    expect(weakenedChecks([{ file: "test/speed.test.ts", removed: [{ line: 4, text: "  expect(ms).toBeLessThan(1000);" }], added: [{ line: 4, text: "  expect(ms).toBeLessThan(100);" }] }])).toEqual([]);
  });
});
