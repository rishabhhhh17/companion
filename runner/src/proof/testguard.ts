// Did the task weaken the tests to make them pass? Compares the test files before and after.
export type TestReport = { ok: boolean; before: number; after: number; problems: string[] };

export const isTestFile = (path: string) => /(^|\/)(tests?|__tests__)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
const ACTIVE = /(?<![\w.])(?:test|it)\s*(?:\.(?:concurrent|each\s*\([^)]*\)))?\s*\(/g;
const SWITCHED_OFF = /(?<![\w.])(?:(?:test|it|describe)\.(?:skip|only|todo)\b|xit\b|xtest\b|xdescribe\b)/g;
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export function analyzeTests(before: Record<string, string>, after: Record<string, string>): TestReport {
  const b = Object.entries(before).filter(([p]) => isTestFile(p));
  const a = Object.entries(after).filter(([p]) => isTestFile(p));
  const sum = (list: [string, string][], re: RegExp) => list.reduce((n, [, t]) => n + count(t, re), 0);
  const [bn, an] = [sum(b, ACTIVE), sum(a, ACTIVE)];
  const problems: string[] = [];
  for (const [p] of b) if (!(p in after)) problems.push(`Test file removed: ${p}`);
  if (an < bn) problems.push(`There are fewer tests now (${bn} before, ${an} now)`);
  if (sum(a, SWITCHED_OFF) > sum(b, SWITCHED_OFF)) problems.push("A test was switched off (skip, only or todo) in this task");
  return { ok: problems.length === 0, before: bn, after: an, problems };
}
