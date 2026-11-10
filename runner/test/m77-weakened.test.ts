// M77 (the safety net): tests and checks a change weakened are found with their file and line and come first; words that
// claim a pass the checks did not give are said; a key in a project with a git remote says what pushing means; what the
// changes did not tell you comes from the review's own data. Pure rules, no model, temporary folders only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REVIEW_REASONS } from "../../protocol/index.ts";
import { rate, type RateInput } from "../src/review/rate.ts";
import { applyStrictness, STOP_KINDS } from "../src/review/look.ts";
import { fixPrompt, sendBackText } from "../src/review/sendback.ts";
import { beyondUsual, claimedPassedReason, claimsPassed, hasGitRemote, PUSH_RISK, untoldOf, weakenedChecks, withPushRisk, type FileDelta } from "../src/review/weakened.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m77w-${label}-`)); made.push(d); return d; };
const delta = (file: string, added: string[], removed: string[] = []): FileDelta => ({ file, added: added.map((text, i) => ({ line: i + 1, text })), removed: removed.map((text, i) => ({ line: i + 1, text })) });

describe("weakened tests and checks", () => {
  test("a skipped test, a narrowed run, a pytest skip and a Go skip are each found with file and line", () => {
    const r = weakenedChecks([
      delta("src/pay.test.ts", ["  it.skip('charges the card', async () => {"]),
      delta("src/cart.spec.js", ["describe.only('cart', () => {"]),
      delta("tests/test_pay.py", ["@pytest.mark.skip(reason='flaky')"]),
      delta("pay_test.go", ["\tt.Skip()"]),
    ]);
    expect(r.map((x) => [x.kind, x.file, x.line])).toEqual([["weakened_check", "src/pay.test.ts", 1], ["weakened_check", "src/cart.spec.js", 1], ["weakened_check", "tests/test_pay.py", 1], ["weakened_check", "pay_test.go", 1]]);
    expect(r[0].say).toContain("skipped");
    expect(r[1].say).toContain(".only");
    for (const x of r) { expect(x.say).not.toMatch(/Claude|your AI/); expect(x.say).not.toMatch(/—|–/); }
  });
  test("a skip that was already there, a skip in ordinary code, and a test file with more checks are not flagged", () => {
    expect(weakenedChecks([delta("src/pay.test.ts", ["  it.skip('x', () => {"], ["  it.skip('x', () => {"])])).toEqual([]);
    expect(weakenedChecks([delta("src/pay.ts", ["const skip = it.skip;"])])).toEqual([]);
    expect(weakenedChecks([delta("src/pay.test.ts", ["expect(a).toBe(1);", "expect(b).toBe(2);"], ["expect(a).toBe(1);"])])).toEqual([]);
    expect(weakenedChecks([delta("src/pay.test.ts", ["it('adds', () => { expect(add(1, 2)).toBe(3); });"])])).toEqual([]);
  });
  test("assertions deleted from a test file count once, with the first line; a whole test file deleted is the removed file rule's business", () => {
    const r = weakenedChecks([delta("src/pay.test.ts", ["  // later"], ["  expect(total).toBe(10);", "  expect(tax).toBe(1);", "  expect(sum).toBe(11);"])]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "weakened_check", file: "src/pay.test.ts", line: 1 });
    expect(r[0].say).toContain("3 checks were removed");
    expect(weakenedChecks([delta("src/pay.test.ts", [], Array.from({ length: 45 }, (_, i) => `expect(x${i}).toBe(${i});`))])).toEqual([]);
  });
  test("a lowered coverage threshold is found; a raised one is not", () => {
    expect(weakenedChecks([delta("jest.config.js", ["      lines: 60,"], ["      lines: 80,"])])).toHaveLength(1);
    expect(weakenedChecks([delta("jest.config.js", ["      lines: 90,"], ["      lines: 80,"])])).toEqual([]);
    expect(weakenedChecks([delta("pyproject.toml", ["fail_under = 50"], ["fail_under = 85"])])).toHaveLength(1);
  });
  test("a CI step or a script told to pass anyway, and a lint or type rule turned off, are found", () => {
    const r = weakenedChecks([
      delta(".github/workflows/ci.yml", ["        continue-on-error: true"]),
      delta("package.json", ['    "test": "vitest run || true",'], ['    "test": "vitest run",']),
      delta(".eslintrc.json", ['    "no-unused-vars": "off",'], ['    "no-unused-vars": "error",']),
      delta("tsconfig.json", ['    "strict": false,'], ['    "strict": true,']),
      delta("src/pay.ts", ["// @ts-ignore", "  const x: number = 'a';"]),
      delta("src/app.py", ["import os  # noqa"]),
    ]);
    expect(r.map((x) => x.file)).toEqual([".github/workflows/ci.yml", "package.json", ".eslintrc.json", "tsconfig.json", "src/pay.ts", "src/app.py"]);
    expect(r[0].say).toContain("pass whatever happens");
    expect(r[2].say).toContain("turned off");
    expect(r[4].say).toContain("ignore");
    // An ordinary code line in an ordinary file is nothing.
    expect(weakenedChecks([delta("src/pay.ts", ["const total = a || 0;", "if (ok) return true;"])])).toEqual([]);
    // A settings or key file is never read into this.
    expect(weakenedChecks([delta(".env", ["CI_ALLOW_FAILURE=true"])])).toEqual([]);
  });
  test("at most eight, and rate puts them before every other reason; strictness never hides them", () => {
    const many = weakenedChecks([delta("src/pay.test.ts", Array.from({ length: 12 }, (_, i) => `it.skip('t${i}', () => {})`))]);
    expect(many).toHaveLength(8);
    expect(REVIEW_REASONS[0]).toBe("weakened_check");
    expect(STOP_KINDS.has("weakened_check") && STOP_KINDS.has("claimed_passed")).toBe(true);
    const input: RateInput = { changes: [{ file: "src/pay.test.ts", kind: "modified" }, { file: "src/pay.ts", kind: "modified" }], touches: ["payments"], secrets: [{ file: "src/pay.ts", line: 3 }], stillUsed: [], secretFiles: [], checks: "failed", count: 2, capped: false, found: [many[0]] };
    const r = rate(input);
    expect(r.rating).toBe("stop");
    expect(r.reasons[0].kind).toBe("weakened_check");
    expect(r.reasons[1].kind).toBe("secret_in_code");
    const quiet = applyStrictness(r, "quiet", new Set());
    expect(quiet.reasons.some((x) => x.kind === "weakened_check")).toBe(true);
  });
});

describe("says it passed but did not run", () => {
  test("claims are found, and words that only talk about running or failing tests are not claims", () => {
    for (const t of ["Done. All tests pass.", "The build is green and the 12 tests pass.", "Tests passing now.", "I ran the checks and they succeeded.", "No failing tests."]) expect(claimsPassed(t), t).toBe(true);
    for (const t of ["Run the tests to make sure they pass.", "The tests should pass once you install the package.", "Two tests failed.", "I did not run the tests.", "The tests could not run here.", "Added a test for the cart.", "", "Fixed the button."]) expect(claimsPassed(t), t).toBe(false);
    expect(claimsPassed(null)).toBe(false);
  });
  test("the reason says not run or failed, and nothing when the checks passed or nothing was claimed", () => {
    expect(claimedPassedReason(["All tests pass."], "not_run")).toMatchObject({ kind: "claimed_passed", say: "The words say the checks pass, but the checks did not run here." });
    expect(claimedPassedReason(["All tests pass."], "unknown")?.say).toContain("did not run");
    expect(claimedPassedReason(["All tests pass."], "failed")?.say).toContain("failed here");
    expect(claimedPassedReason(["All tests pass."], "passed")).toBeNull();
    expect(claimedPassedReason(["Fixed the menu."], "not_run")).toBeNull();
    expect(rate({ changes: [], touches: [], secrets: [], stillUsed: [], secretFiles: [], checks: "not_run", count: 0, capped: false, found: [claimedPassedReason(["Tests pass"], "not_run")!] }).rating).toBe("stop");
  });
});

describe("a key about to be pushed", () => {
  test("a remote is read from .git/config only; no remote, no git, or no folder means none", () => {
    const p = tmp("remote");
    expect(hasGitRemote(p)).toBe(false);
    mkdirSync(join(p, ".git"));
    writeFileSync(join(p, ".git/config"), "[core]\n\tbare = false\n");
    expect(hasGitRemote(p)).toBe(false);
    writeFileSync(join(p, ".git/config"), "[core]\n\tbare = false\n[remote \"origin\"]\n\turl = git@github.com:x/y.git\n");
    expect(hasGitRemote(p)).toBe(true);
    expect(hasGitRemote(join(p, "nowhere"))).toBe(false);
  });
  test("the key reasons say what pushing means, once, and the Copy for my AI text says to remove it before any commit", () => {
    const reasons = [{ kind: "secret_in_code" as const, file: "src/pay.ts", line: 2, say: "A key or password is written into src/pay.ts at line 2." }, { kind: "files_removed" as const, say: "1 file was removed." }];
    const with_ = withPushRisk(reasons, true);
    expect(with_[0].say.endsWith(PUSH_RISK)).toBe(true);
    expect(with_[1].say).toBe(reasons[1].say);
    expect(withPushRisk(with_, true)[0].say.split(PUSH_RISK)).toHaveLength(2);
    expect(withPushRisk(reasons, false)).toEqual(reasons);
    const words = { rating: "stop" as const, reasons: with_, touches: [], files: [{ file: "src/pay.ts", kind: "modified" as const }], count: 1, summary: "A key was added.", notes: [], pushRisk: true };
    const text = sendBackText(words);
    expect(text).toContain("Remove the key from the code before any commit or push");
    expect(text.toLowerCase()).toContain("if this is pushed, the key is public");
    expect(fixPrompt(words)).toContain("before any commit or push");
    expect(sendBackText({ ...words, pushRisk: false })).not.toContain("before any commit or push");
    // Never a git command for the person to run, and never a value.
    expect(text).not.toMatch(/git (rm|reset|commit|push|filter)/);
  });
});

describe("what the changes did not tell you", () => {
  test("files beyond the usual code are named (at most five), TODO lines are counted, and the checks are carried", () => {
    const files = [{ file: "src/pay.ts", kind: "modified" as const }, { file: "src/pay.test.ts", kind: "modified" as const }, { file: ".github/workflows/ci.yml", kind: "modified" as const }, { file: "package.json", kind: "modified" as const }, { file: ".eslintrc.json", kind: "modified" as const }, { file: ".env", kind: "modified" as const }, { file: "vite.config.ts", kind: "added" as const }, { file: "CLAUDE.md", kind: "modified" as const }];
    const u = untoldOf(files, [delta("src/pay.ts", ["// TODO: handle refunds", "throw new Error('not implemented yet')"]), delta("src/pay.test.ts", ["it('x', () => {})"])], "not_run");
    expect(u.beyond).toHaveLength(5);
    expect(u.beyondMore).toBe(2);
    expect(u.beyond).not.toContain("src/pay.ts");
    expect(u.todos).toBe(2);
    expect(u.checks).toBe("not_run");
    expect(beyondUsual("src/app.tsx")).toBe(false);
    expect(beyondUsual("app/page.tsx")).toBe(false);
    expect(untoldOf([{ file: "src/app.tsx", kind: "modified" }], [], "passed")).toEqual({ beyond: [], beyondMore: 0, todos: 0, checks: "passed" });
  });
});
