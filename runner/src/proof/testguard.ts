// Did the task weaken the tests to make them pass? Compares the test files before and after.
export type TestReport = { ok: boolean; before: number; after: number; problems: string[] };

export const isTestFile = (path: string) =>
  /(^|\/)(tests?|__tests__)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)test_[^/]+\.py$/.test(path) || /_test\.(py|go)$/.test(path);
const ACTIVE = /(?<![\w.])(?:test|it)\s*(?:\.(?:concurrent|each\s*\([^)]*\)))?\s*\(|^\s*(?:async\s+)?def\s+test_\w+|^func\s+Test\w+\s*\(/gm;
// pytest's xfail, a skip or xfail call inside a test, importorskip and unittest's expectedFailure switch a test off too, while
// its def test_ line stays (audit A32).
const SWITCHED_OFF = /(?<![\w.])(?:(?:test|it|describe)\.(?:skip|only|todo)\b|xit\b|xtest\b|xdescribe\b)|@(?:pytest\.mark\.(?:skip\w*|xfail)|unittest\.(?:skip\w*|expectedFailure))\b|\bpytest\.(?:skip|xfail|importorskip)\s*\(|\bt\.Skip(?:Now)?\s*\(/g;
// A commented out test is not a test.
const uncomment = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}()])\/\/.*$/gm, "$1").replace(/^\s*#.*$/gm, "");
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
  return { ok: problems.length === 0, before: bn, after: an, problems };
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
