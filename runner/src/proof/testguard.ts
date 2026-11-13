// Did the task weaken the tests to make them pass? Compares the test files before and after.
export type TestReport = { ok: boolean; before: number; after: number; problems: string[] };

// Rust keeps its unit tests in the same file as the code (#[cfg(test)]), so every .rs file is looked at. Java, Kotlin and Swift
// keep tests in src/test or Tests, in files named ...Test, ...Tests or ...IT.
export const isTestFile = (path: string) =>
  /(^|\/)(tests?|__tests__|Tests)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)test_[^/]+\.py$/.test(path) || /_test\.(py|go)$/.test(path)
  || /\.rs$/.test(path) || /(?:Tests?|IT)\.(?:java|kt|scala|groovy|swift)$/.test(path);
const ACTIVE = /(?<![\w.])(?:test|it)\s*(?:\.(?:concurrent|each\s*\([^)]*\)))?\s*\(|^\s*(?:async\s+)?def\s+test_\w+|^func\s+Test\w+\s*\(|^\s*@(?:Parameterized|Repeated)?Test\b|#\[(?:\w+::)?test\b|^\s*(?:override\s+)?func\s+test\w*\s*\(/gm;
// pytest's xfail, a skip or xfail call inside a test, importorskip and unittest's expectedFailure switch a test off too, while
// its def test_ line stays (audit A32).
const SWITCHED_OFF = /(?<![\w.])(?:(?:test|it|describe)\.(?:skip|only|todo)\b|xit\b|xtest\b|xdescribe\b)|@(?:pytest\.mark\.(?:skip\w*|xfail)|unittest\.(?:skip\w*|expectedFailure))\b|\bpytest\.(?:skip|xfail|importorskip)\s*\(|\bt\.Skip(?:Now)?\s*\(|#\[ignore\b|@(?:Disabled|Ignore)\b|\bXCTSkip\w*\s*\(|\.disabled\s*\(/g;
// A commented out test is not a test.
// (A line that starts with #[ is a Rust attribute, not a comment.)
const uncomment = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}()])\/\/.*$/gm, "$1").replace(/^\s*#(?![[!]).*$/gm, "");
const count = (text: string, re: RegExp) => (uncomment(text).match(re) ?? []).length;

export function analyzeTests(before: Record<string, string>, after: Record<string, string>): TestReport {
  const b = Object.entries(before).filter(([p]) => isTestFile(p));
  const a = Object.entries(after).filter(([p]) => isTestFile(p));
  const sum = (list: [string, string][], re: RegExp) => list.reduce((n, [, t]) => n + count(t, re), 0);
  const [bn, an] = [sum(b, ACTIVE), sum(a, ACTIVE)];
  const problems: string[] = [];
  // A moved or renamed file keeps its tests, so a removed file only matters when the total falls.
  if (an < bn) for (const [p, t] of b) if (!(p in after) && count(t, ACTIVE) > 0) problems.push(`Test file removed: ${p}`);
  if (an < bn) problems.push(`There are fewer tests now (${bn} before, ${an} now)`);
  if (sum(a, SWITCHED_OFF) > sum(b, SWITCHED_OFF)) problems.push("A test was switched off (skip, only or todo) in this task");
  // M85 (research feature 12, B1: CC #7074 "manipulates tests instead of following instructions"): a test that still exists
  // but checks less than it did.
  for (const [p, t] of a) { const was = before[p]; if (typeof was === "string" && was !== t) problems.push(...loosenedAssertions(p, was, t)); }
  return { ok: problems.length === 0, before: bn, after: an, problems };
}

// ---- M85: loosened assertions inside a test that still exists ----

/** A test's start and its name: test("name", it('name', def test_name(, func TestName(. */
const TEST_START = /(?<![\w.])(?:test|it)\s*(?:\.(?:concurrent|each\s*\([^)]*\)))?\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\\n])*)\1|^\s*(?:async\s+)?def\s+(test_\w+)|^func\s+(Test\w+)\s*\(/gm;
/** One check, of any kind. */
const CHECK = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|^\s*assert\s+\S|\bself\.assert\w*\s*\(|\bassert_\w+!?\s*\(|\bt\.(?:Error|Errorf|Fatal|Fatalf)\s*\(/gm;
/** A check that pins one answer. */
const EXACT_M = /\.(?:toBe|toEqual|toStrictEqual|toMatchObject|toHaveLength|toHaveProperty|toContain|toContainEqual|toMatch|toHaveBeenCalledWith|toHaveBeenCalledTimes|toMatchSnapshot|toMatchInlineSnapshot)\s*\(\s*[^)\s]|\.toThrow\s*\(\s*[^)\s]|\bassert\.(?:equal|strictEqual|deepEqual|deepStrictEqual|match|throws)\s*\(|\bself\.assert(?:Equal|Equals|In|Is|Raises|ListEqual|DictEqual|CountEqual|AlmostEqual)\s*\(|^\s*assert\s+[^\n]*?(?:==|\bin\b|\bis\b(?!\s+not\s+None))|\bassert_eq!\s*\(/gm;
/** A check that passes for almost any answer. */
const LOOSE_M = /\.(?:toBeDefined|toBeTruthy|toBeFalsy|toBeUndefined|toBeNull)\s*\(\s*\)|\.not\.(?:toBeNull|toBeUndefined|toBeNaN|toBe\s*\(\s*(?:undefined|null)\s*\))|\.toBeInstanceOf\s*\(|\.toThrow\s*\(\s*\)|\bassert\.ok\s*\(|\bassert\s*\(\s*[^,)]+\)|\bself\.assert(?:True|IsNotNone|IsInstance)\s*\(|^\s*assert\s+(?![^\n]*(?:==|<|>|\bin\b))[\w.()\[\]'"]+\s*$/gm;
/** A limit: below, at most, above, at least, close to (with its digits). */
const LIMIT = /\.(toBeLessThan|toBeLessThanOrEqual|toBeGreaterThan|toBeGreaterThanOrEqual)\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)|\.toBeCloseTo\s*\([^,()]+,\s*(\d+)\s*\)|\bassert\s+[^\n]*?(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)\s*$|\brel\s*=\s*(\d+(?:\.\d+)?(?:e-?\d+)?)/gm;
const quiet = (t: string) => uncomment(t);
/** The tests of a file by name, each with its own text (to the next test's start). */
function testsOf(text: string): Map<string, string> {
  const t = quiet(text), out = new Map<string, string>(), starts: { name: string; at: number }[] = [];
  for (const m of t.matchAll(TEST_START)) { const name = m[2] ?? m[3] ?? m[4]; if (name !== undefined) starts.push({ name, at: m.index ?? 0 }); }
  starts.forEach((s, i) => { if (!out.has(s.name)) out.set(s.name, t.slice(s.at, starts[i + 1]?.at ?? t.length)); });
  return out;
}
const n = (t: string, re: RegExp) => (t.match(re) ?? []).length;
type Lim = { kind: string; v: number };
function limitsOf(t: string): Lim[] {
  const out: Lim[] = [];
  for (const m of t.matchAll(LIMIT)) {
    if (m[1]) out.push({ kind: m[1], v: Number(m[2]) });
    else if (m[3]) out.push({ kind: "closeTo", v: Number(m[3]) });
    else if (m[4]) out.push({ kind: m[4] === "<" ? "toBeLessThan" : m[4] === "<=" ? "toBeLessThanOrEqual" : m[4] === ">" ? "toBeGreaterThan" : "toBeGreaterThanOrEqual", v: Number(m[5]) });
    else if (m[6]) out.push({ kind: "rel", v: Number(m[6]) });
  }
  return out;
}
/** Whether a limit lets more answers through than before: a higher ceiling, a lower floor, fewer digits, a wider margin. */
const wider = (b: Lim, a: Lim) => b.kind === a.kind && (/Less/.test(a.kind) ? a.v > b.v : /Greater/.test(a.kind) ? a.v < b.v : a.kind === "closeTo" ? a.v < b.v : a.kind === "rel" ? a.v > b.v : false);
/** The plain words for each test in a file that checks less now: a check removed, an exact check made loose, a limit widened. */
export function loosenedAssertions(file: string, before: string, after: string): string[] {
  const out: string[] = [];
  const was = testsOf(before), now = testsOf(after);
  for (const [name, a] of now) {
    const b = was.get(name);
    if (b === undefined || b === a) continue;
    const label = `"${name.length > 60 ? `${name.slice(0, 59)}…` : name}" in ${file}`;
    const [bc, ac] = [n(b, CHECK), n(a, CHECK)];
    if (ac < bc) { out.push(`A check was removed from the test ${label} (${bc} before, ${ac} now)`); continue; }
    if (n(a, EXACT_M) < n(b, EXACT_M) && n(a, LOOSE_M) > n(b, LOOSE_M)) { out.push(`An exact check in the test ${label} was loosened, so it passes for many wrong answers`); continue; }
    const [bl, al] = [limitsOf(b), limitsOf(a)];
    if (bl.length === al.length && bl.some((x, i) => wider(x, al[i]))) out.push(`A limit in the test ${label} was widened, so it lets more wrong answers pass`);
  }
  return out.slice(0, 5);
}

// Did the task weaken the project's own checks (build, tests, lint) so they pass without checking anything?
const CHECK_SCRIPTS = ["build", "test", "lint", "typecheck", "type-check", "check"];
const DOES_NOTHING = /\|\|\s*(?:true|:|exit\s+0)\s*$|;\s*(?:true|:|exit\s+0)\s*$|--passWithNoTests|--no-error-on-unmatched-pattern|^\s*(?:true|:|exit\s+0|echo\b[^;&|]*|(?:sh|bash)\s+-c\s+["']?\s*(?:true|:|exit\s+0)\s*["']?|echo\b[^;&|]*(?:&&|;)\s*(?:true|exit\s+0))\s*$/;
function scriptsOf(text: string | undefined): Record<string, string> | null {
  if (text === undefined) return null;
  try { const s = JSON.parse(text)?.scripts; return s && typeof s === "object" ? s : {}; } catch { return null; }
}
export function analyzeScripts(before: string | undefined, after: string | undefined): { ok: boolean; problems: string[] } {
  const [b, a] = [scriptsOf(before), scriptsOf(after)];
  const problems: string[] = [];
  if (b && a) {
    for (const n of CHECK_SCRIPTS) {
      if (typeof b[n] !== "string") continue;
      if (typeof a[n] !== "string") problems.push(`The "${n}" step was removed from package.json`);
      else if (a[n] !== b[n] && DOES_NOTHING.test(a[n]) && !DOES_NOTHING.test(b[n])) problems.push(`The "${n}" step now checks nothing (it was changed to: ${a[n]})`);
    }
  }
  return { ok: problems.length === 0, problems };
}
