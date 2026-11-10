// M77 (the safety net, the research's moment 3): a change that makes a check go quiet instead of making the code right.
// Plain rules on the lines a change added and removed, no model and no file access: a test skipped or narrowed, an
// assertion deleted from a test file, a coverage threshold lowered, a CI step or a script told to pass anyway, a lint or
// type rule turned off. Each is a Fix this first reason with its file and line, placed before every other reason (rate.ts).
// Also here: "says it passed but did not run" (claimsPassed), what the changes did not tell you (untold), and whether the
// project has a git remote (a key in code that is pushed is public). Every sentence names a file and a line, never a value.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEnvFile } from "../secretfiles.ts";
import type { ReviewChecks, ReviewUntold } from "../../../protocol/index.ts";
import type { FileChange, Reason } from "./rate.ts";

/** The lines one file's change took away and added, each with its line number in that version. */
export type FileDelta = { file: string; added: { line: number; text: string }[]; removed: { line: number; text: string }[] };

export const TEST_FILE = /(^|\/)(__tests__|tests?|spec|e2e|cypress)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(py|go|rb)$|(^|\/)test_[^/]*\.py$|\.spec\.rb$|Test\.(java|kt|cs)$/i;
const CI_FILE = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$|(^|\/)\.gitlab-ci\.ya?ml$|(^|\/)\.circleci\/config\.ya?ml$|(^|\/)bitbucket-pipelines\.ya?ml$|(^|\/)azure-pipelines\.ya?ml$|(^|\/)Jenkinsfile$|(^|\/)\.travis\.ya?ml$/i;
const LINT_FILE = /(^|\/)(\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?[jt]s|biome\.jsonc?|\.prettierrc(\.[a-z]+)?|tsconfig(\.[a-z]+)?\.json|jsconfig\.json|\.pylintrc|pyproject\.toml|setup\.cfg|ruff\.toml|\.flake8|\.rubocop\.ya?ml|\.golangci\.ya?ml|stylelint\.config\.[cm]?js|\.stylelintrc(\.[a-z]+)?)$/i;
const COVERAGE_FILE = /(^|\/)(jest\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|\.nycrc(\.[a-z]+)?|nyc\.config\.[cm]?js|codecov\.ya?ml|\.coveragerc|pyproject\.toml|package\.json|karma\.conf\.[cm]?js)$/i;
const SCRIPT_FILE = /(^|\/)package\.json$|(^|\/)Makefile$|(^|\/)scripts?\/[^/]+\.(sh|bash|zsh|[cm]?js|ts|py)$|\.(sh|bash|zsh)$/i;

/** A test or a group of tests skipped or narrowed: JavaScript and TypeScript runners, pytest, Go, Ruby, Rust. */
const SKIP = /\b(?:it|test|describe|context|suite|bench)\s*\.\s*(?:skip|only|todo|fixme)\b|\b(?:it|test|describe)\.(?:skip|only)\.each\b|\b(?:xit|xtest|xdescribe|xcontext|fit|fdescribe|fcontext|ftest)\s*\(|@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.skip\s*\(|@unittest\.skip|@skip(?:If|Unless)?\s*\(|\bt\.Skip(?:Now|f)?\s*\(|\bskip\s*(?:\(|:)\s*["']|^\s*#\[ignore\]|\bpending\s*\(|\bxit\s+["']/;
/** A line that asserts something in a test file. */
const ASSERT = /\bexpect\s*\(|\bassert(?:\.|\s*\(|\s+\w)|\b(?:should|must)\s*\(|\bassert_(?:eq|ne|equal|true|false|raises|in|that)\b|\.to(?:Be|Equal|Have|Match|Throw|Contain|Strict)\w*\(|\bt\.(?:Error|Fatal|Errorf|Fatalf)\(|\bassertEquals?\(|\brefute\b|\bexpect_/;
/** A coverage threshold line, with its number. */
const THRESHOLD = /\b(?:branches|functions|lines|statements|fail[-_]?under|fail_under|check[-_]?coverage|min(?:imum)?[-_]?coverage|coverage[-_]?threshold|threshold)\b[^0-9\n]{0,24}?(\d{1,3})(?:\.\d+)?\s*%?/i;
/** A step or script told to pass whatever happens. */
const PASS_ANYWAY = /\bcontinue-on-error\s*:\s*true\b|\ballow_failure\s*:\s*true\b|\ballow-failure\s*:\s*true\b|\|\|\s*(?:true|exit\s+0|:)\s*(?:$|["'&;)])|;\s*exit\s+0\s*(?:$|["'])|\bset\s+\+e\b|\bprocess\.exit\s*\(\s*0\s*\)|\b--passWithNoTests\b|\b--pass-with-no-tests\b|\bfailOnError\s*:\s*false\b|\bbail\s*:\s*false\b|\b--no-verify\b|\bskipLibCheck["']?\s*:\s*true\b|\bignoreBuildErrors\s*:\s*true\b|\bignoreDuringBuilds\s*:\s*true\b|\btypecheck\s*:\s*false\b/i;
/** A lint or type rule turned off, or a whole file or line told to ignore the checker. */
const RULE_OFF = /^\s*["']?[\w@/-]+["']?\s*:\s*(?:["']off["']|0|\[\s*(?:["']off["']|0)\b)|\beslint-disable(?:-next-line|-line)?\b|@ts-(?:ignore|nocheck|expect-error)\b|\bnoqa\b|#\s*type:\s*ignore\b|\brubocop:disable\b|\bnolint\b|\bpylint:\s*disable\b|\/\/\s*biome-ignore\b|\bstylelint-disable\b|^\s*"strict"\s*:\s*false\b|^\s*"noImplicitAny"\s*:\s*false\b|^\s*"strictNullChecks"\s*:\s*false\b|\bignore_errors\s*=\s*[Tt]rue\b|\bexclude\s*:\s*\[.*(?:test|spec)/i;

const nameOnly = (f: string) => f.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const SKIP_WORDS = /\.only\b|\bfit\(|\bfdescribe\(|\bfcontext\(|\bftest\(/;
const say = (what: string) => what;

/** M77b (the 10 Nov real run): an assertion that checks one exact answer (equal to, the same as, this length). One that
 *  only says "not" an answer is not exact. */
const EXACT = /\bassert\.(?:strictEqual|equal|deepStrictEqual|deepEqual)\s*\(|\.(?:toBe|toEqual|toStrictEqual|toBeCloseTo|toHaveLength|toMatchObject|toMatchSnapshot|toMatchInlineSnapshot|toHaveBeenCalledWith|toHaveProperty)\s*\(\s*[^\s)]|\.to\.(?:deep\.)?(?:equal|eql|equals)\s*\(|\.to\.be\.equal\s*\(|\bassert(?:Equals?|StrictEquals?|Same|Identical)\s*\(|\bassert_(?:eq|equal)\b|\bt\.(?:equal|is|deepEqual|same|strictSame|strictEqual)\s*\(|\bassert\s+[^\n]*?[^=!<>]==(?!=)|\b(?:assert(?:\.ok)?|expect)\s*\([^\n]*?[^=!<>]===?(?!=)/;
const NOT_EXACT = /\.not\.|\bassert\.not\w*\(|\bassertNot\w*\(|\bassert_ne\b|\bt\.not\w*\(/;
const exact = (t: string) => ASSERT.test(t) && EXACT.test(t) && !NOT_EXACT.test(t);
/** The literal values in a line (numbers, quoted text, true, false, null), in order. */
const LITERAL = /(["'`])(?:\\.|(?!\1)[^\\\n])*\1|-?\b\d+(?:\.\d+)?\b|\b(?:true|false|null|undefined|None|True|False|nil)\b/g;
const literals = (t: string) => t.match(LITERAL) ?? [];
const skeleton = (t: string) => t.trim().replace(LITERAL, "#").replace(/\s+/g, " ");
const CODE_FILE = /\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|cs|swift|php|vue|svelte)$/i;
/** A file's name without its folder, its extension and its test marks: test/price.test.js and price.js are both "price". */
const stemOf = (f: string) => (f.split("/").pop() ?? f).replace(/\.[^.]+$/, "").replace(/(?:[._-](?:test|spec))+$/i, "").replace(/^test_/i, "").replace(/_test$/i, "").replace(/(?:Test|Tests|Spec)$/, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whether a code file is what a test file checks: the same name, or the test's own text brings it in by name. */
function checks(testFile: string, codeFile: string, texts: Readonly<Record<string, string>>): boolean {
  const stem = stemOf(codeFile);
  if (!stem) return false;
  if (stemOf(testFile) === stem) return true;
  const text = texts[testFile];
  return typeof text === "string" && new RegExp(`(?:require\\s*\\(|from\\s+|import\\s*\\(?)\\s*["'](?:[^"'\\n]*/)?${escapeRe(stem)}(?:\\.\\w+)?["']`, "i").test(text);
}

/** The weakened checks in a change, the most serious first, at most 8. Each names a file and a line; never a value.
 *  texts: the changed files as they are after the change (by name), so a test can be matched to the code it brings in. */
export function weakenedChecks(deltas: readonly FileDelta[], texts: Readonly<Record<string, string>> = {}): Reason[] {
  const out: Reason[] = [];
  const add = (file: string, line: number, text: string) => { if (out.length < 8) out.push({ kind: "weakened_check", file: nameOnly(file), line, say: text }); };
  for (const d of deltas) {
    if (isEnvFile(d.file)) continue;
    const f = nameOnly(d.file);
    const test = TEST_FILE.test(d.file), ci = CI_FILE.test(d.file), lint = LINT_FILE.test(d.file), cov = COVERAGE_FILE.test(d.file), script = SCRIPT_FILE.test(d.file);
    const removedTexts = d.removed.map((r) => r.text.trim());
    // A test skipped, narrowed to .only, or marked to do later: only in a test file, and only when the line is new (a
    // skip that was already there before the change is not this change's doing).
    if (test) {
      for (const a of d.added) {
        if (!SKIP.test(a.text) || removedTexts.includes(a.text.trim())) continue;
        const narrowed = SKIP_WORDS.test(a.text);
        add(f, a.line, say(narrowed ? `A test run was narrowed to one test in ${f} at line ${a.line} (.only). The other tests in that file no longer run, so they cannot fail.` : `A test was skipped in ${f} at line ${a.line}. A check that is skipped cannot fail, so it no longer proves anything.`));
      }
      // Assertions deleted: more assert lines taken away than added, in a file that still exists.
      const lost = d.removed.filter((r) => ASSERT.test(r.text)).length, gained = d.added.filter((a) => ASSERT.test(a.text)).length;
      if (lost > gained && d.added.length + d.removed.length > 0 && !(d.added.length === 0 && d.removed.length >= 40)) {
        const first = d.removed.find((r) => ASSERT.test(r.text))!;
        add(f, first.line, say(`${lost - gained} ${lost - gained === 1 ? "check was" : "checks were"} removed from ${f} (the first at line ${first.line} before the change). A test with fewer checks proves less.`));
      }
      // M77b: the same number of checks, but an exact one swapped for a loose one ("is 13" became "is not negative", "is
      // defined", "is more than 0"). The count stays equal, so the rule above cannot see it. Only new lines count.
      const exactLost = d.removed.filter((r) => exact(r.text)).length, exactGained = d.added.filter((a) => exact(a.text)).length;
      const loose = d.added.filter((a) => ASSERT.test(a.text) && !exact(a.text) && !removedTexts.includes(a.text.trim()));
      if (lost <= gained && exactLost > exactGained && loose.length) {
        add(f, loose[0].line, say(`An exact check in ${f} was swapped for a looser one at line ${loose[0].line}. It now passes for many wrong answers, so it proves less.`));
      }
      // M77b: the expected answer of a check changed in the same change as the code that check tests. If the code is now
      // wrong, the test was made to agree with it. Only the expected value (the last value on the line) may differ.
      const code = deltas.filter((x) => x !== d && !isEnvFile(x.file) && !TEST_FILE.test(x.file) && CODE_FILE.test(x.file) && x.added.length + x.removed.length > 0 && checks(d.file, x.file, texts));
      if (code.length) {
        const used = new Set<number>();
        for (const a of d.added) {
          if (!exact(a.text) || removedTexts.includes(a.text.trim())) continue;
          const la = literals(a.text);
          const i = d.removed.findIndex((r, n) => !used.has(n) && exact(r.text) && skeleton(r.text) === skeleton(a.text) && (() => {
            const lr = literals(r.text);
            return lr.length === la.length && la.length > 0 && lr.at(-1) !== la.at(-1) && lr.slice(0, -1).every((v, k) => v === la[k]);
          })());
          if (i < 0) continue;
          used.add(i);
          add(f, a.line, say(`The expected answer in ${f} at line ${a.line} was changed in the same change as ${nameOnly(code[0].file)}, the code it checks. If that code is now wrong, the test was made to agree with it.`));
          break;
        }
      }
    }
    // A coverage threshold lowered: the same named threshold, a smaller number than before.
    if (cov || test) {
      for (const a of d.added) {
        const m = THRESHOLD.exec(a.text);
        if (!m) continue;
        const key = a.text.replace(/\d+(\.\d+)?/g, "#").trim();
        const before = d.removed.map((r) => ({ r, m: THRESHOLD.exec(r.text) })).find((x) => x.m && x.r.text.replace(/\d+(\.\d+)?/g, "#").trim() === key);
        if (before?.m && Number(before.m[1]) > Number(m[1])) add(f, a.line, say(`A coverage threshold was lowered in ${f} at line ${a.line}. Less of the code has to be tested for the check to pass.`));
      }
    }
    // A CI step or a script told to pass anyway.
    if (ci || script || cov || lint) {
      for (const a of d.added) if (PASS_ANYWAY.test(a.text) && !removedTexts.includes(a.text.trim())) add(f, a.line, say(`A check in ${f} at line ${a.line} was told to pass whatever happens. It can no longer fail, so it no longer proves anything.`));
    }
    // A lint or type rule turned off: in a lint config, or an ignore comment added anywhere in code.
    for (const a of d.added) {
      if (!RULE_OFF.test(a.text) || removedTexts.includes(a.text.trim())) continue;
      if (lint) add(f, a.line, say(`A lint or type rule was turned off in ${f} at line ${a.line}. The problems it caught will no longer be caught.`));
      else if (/eslint-disable|@ts-(?:ignore|nocheck|expect-error)|noqa|type:\s*ignore|rubocop:disable|nolint|pylint:\s*disable|biome-ignore|stylelint-disable/i.test(a.text)) add(f, a.line, say(`A checker was told to ignore ${/nocheck/.test(a.text) ? "the whole file" : "a line"} in ${f} at line ${a.line}. Whatever it would have found there is hidden now.`));
    }
  }
  return out;
}

/** Words that claim the checks pass: tests, checks, the build or lint, said to pass, be green or succeed. */
const CLAIM = /\b(?:all\s+)?(?:\d+\s+)?(?:tests?|checks?|specs?|builds?|lint(?:ing)?|type\s*checks?|typecheck|ci|test\s+suite|suite)\b[^.!\n]{0,40}?\b(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?|successful(?:ly)?|clean|ok|okay)\b|\b(?:pass(?:es|ed|ing)|green)\b[^.!\n]{0,20}?\b(?:tests?|checks?|build|lint)\b|\bno\s+(?:failing|failed)\s+tests?\b|\b(?:tests?|build)\s+(?:is|are|now)\s+(?:passing|green|fine|ok)\b/i;
const NOT_CLAIM = /\b(?:should|would|will|once|when|if|after|before|until|make|need|needs|must|run|runs|running|let's|to)\s+(?:the\s+)?(?:tests?|checks?|build)\b|\b(?:tests?|checks?|build)\s+(?:should|would|will|must|need|needs|ought)\b|\b(?:once|if|when|after)\s+you\b|\bdid\s+not\b|\bdidn't\b|\bnot\s+(?:pass|run|green)|\bfail(?:s|ed|ing)?\b|\bcould\s+not\b|\bcouldn't\b|\bno\s+tests\s+(?:were\s+)?run\b|\bskipped\b|\bdo(?:es)?(?:\s+not|n't)\b|\b(?:is|are)(?:\s+not|n't)\b|\bno\s+longer\b/i;
/** M77b: advice to run the checks, never a claim that they passed ("Once fixed, run the project's checks again to confirm
 *  they pass", the 10 Nov real run): a sentence that tells someone to run, confirm or make sure, or starts as an instruction. */
const ADVICE = /^\s*(?:please\s+)?(?:re-?run|run|confirm|make\s+sure|verify|ensure|try)\b|^\s*(?:please\s+)?check\b(?!\s+pass)|\b(?:re-?run|run)\b[^.!?\n]{0,60}\b(?:again|first|yourself)\b|\bto\s+(?:confirm|check|make\s+sure|verify|ensure|see\s+(?:if|whether))\b|\bonce\s+(?:it\s+is\s+|that\s+is\s+|this\s+is\s+)?(?:fixed|done|changed|put\s+back|back)\b/i;
/** Whether some words claim the checks pass (and do not take it back in the same sentence). */
export function claimsPassed(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const sentence of text.split(/(?<=[.!?\n])\s+|\n+/)) {
    if (/\bno\s+(?:failing|failed)\s+tests?\b/i.test(sentence)) return true;
    if (CLAIM.test(sentence) && !NOT_CLAIM.test(sentence) && !ADVICE.test(sentence)) return true;
  }
  return false;
}
/** The reason for words that claim a pass the checks did not give: the checks did not run, or failed. Null when they passed
 *  (or nothing was claimed). words: only what the change or the task says it did (a task's last words, a review's summary
 *  of the change), never Squibby's own advice (a review's notes), which may tell someone to run the checks. */
export function claimedPassedReason(words: string[], checks: ReviewChecks): Reason | null {
  if (checks === "passed" || !words.some(claimsPassed)) return null;
  return { kind: "claimed_passed", say: checks === "failed" ? "The words say the checks pass, but the checks failed here." : "The words say the checks pass, but the checks did not run here." };
}

/** M77: whether the project has a git remote, read from its own .git/config (read only, never written: rule 10). A
 *  folder that is not a git project, or whose config cannot be read, has none. */
export function hasGitRemote(project: string): boolean {
  try {
    const f = join(project, ".git", "config");
    if (!existsSync(f)) return false;
    return /^\s*\[remote\s+"[^"]+"\]/m.test(readFileSync(f, "utf8"));
  } catch { return false; }
}
export const PUSH_RISK = "If this is pushed, the key is public.";
/** The key reasons with the push warning added, when the project has a remote. Other reasons are left as they are. */
export function withPushRisk(reasons: Reason[], remote: boolean): Reason[] {
  if (!remote) return reasons;
  return reasons.map((r) => ((r.kind === "secret_in_code" || r.kind === "key_in_page") && !r.say.includes(PUSH_RISK) ? { ...r, say: `${r.say} ${PUSH_RISK}` } : r));
}

/** Files beyond the usual code: tests, CI and lint config, settings, dependencies, settings and key files, and scripts. */
const DEP_OR_SETTINGS = /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements[^/]*\.txt|Pipfile(\.lock)?|poetry\.lock|pyproject\.toml|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?|composer\.(json|lock)|next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|nuxt\.config\.[cm]?[jt]s|svelte\.config\.[cm]?js|astro\.config\.[cm]?[jt]s|webpack\.config\.[cm]?js|vercel\.json|netlify\.toml|firebase\.json|wrangler\.toml|fly\.toml|render\.yaml|Procfile|Dockerfile|docker-compose\.ya?ml|\.npmrc|\.nvmrc|\.gitignore|\.gitattributes|\.editorconfig|\.husky\/[^/]+|\.env\.example)$/i;
export const beyondUsual = (file: string): boolean => TEST_FILE.test(file) || CI_FILE.test(file) || LINT_FILE.test(file) || COVERAGE_FILE.test(file) || DEP_OR_SETTINGS.test(file) || isEnvFile(file) || /(^|\/)\.(claude|codex|cursor|vscode|github)\//i.test(file) || /(^|\/)(AGENTS|CLAUDE)\.md$/i.test(file);
const TODO = /\b(?:TODO|FIXME|XXX|HACK)\b|\bthrow\s+new\s+Error\s*\(\s*["'`]not implemented|\bNotImplemented(?:Error|Exception)\b|\bunimplemented!\s*\(|\btodo!\s*\(/;

/** What the changes did not tell you, from the review's own data. */
export function untoldOf(files: readonly FileChange[], deltas: readonly FileDelta[], checks: ReviewChecks): ReviewUntold {
  const beyond = files.map((f) => f.file).filter(beyondUsual).sort();
  let todos = 0;
  for (const d of deltas) for (const a of d.added) if (TODO.test(a.text)) todos++;
  return { beyond: beyond.slice(0, 5).map(nameOnly), beyondMore: Math.max(0, beyond.length - 5), todos, checks };
}
