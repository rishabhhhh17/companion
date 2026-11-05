// M58 feature 9, the sixth practice on the pages (docs/milestones/M58-fix-and-first-run.md, B2): the practice's pretend AI
// writes a made up key into the copy, the review stops it, Copy for my AI is there, and the fixed fix moves the key to
// .env.local with Undo. No model, no sign in, no cost. The engine's side is runner/test/m58-practicekey.test.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { CATALOG, costWords, FIRST_PRACTICE, keyPracticeReduce, listRows, markFor, NO_RECORD, practiceKind, practiceOf, practiceNotes, threadOf } from "./practice.ts";
import { S } from "./strings.ts";
import { practiceKey } from "./commands.ts";
import { parseCommand } from "../../protocol/index.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const P = "/Users/sam/Squibby practice key in the code";
const ev = (e: Record<string, unknown> & { type: string }) => ({ v: 1, id: "x", ts: "2026-11-05T10:00:00Z", ...e });
const STOP = ev({ type: "review.result", project: P, batch: "rv_4f2a9c01de", ok: true, rating: "stop", touches: ["payments"], summary: "Changed pay.js.", notes: [], files: [{ file: "pay.js", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: "not_run", sendBack: "My AI tool wrote a key into pay.js at line 2. Please move it to .env.local.", lane: "none", usdEstimate: 0,
  reasons: [{ kind: "secret_in_code", file: "pay.js", line: 2, say: "A key or password is written into pay.js at line 2. It belongs in a settings file such as .env, not in the code.", lines: [{ n: 1, text: "// Takes payments" }, { n: 2, text: "const PAYMENTS_SECRET_KEY = \"sk_…\";" }] }] });
// The engine says the batch first (review.now measures it), then the review's answer.
const BATCH = ev({ type: "review.batch", project: P, batch: "rv_4f2a9c01de", files: [{ file: "pay.js", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false });
function started(): Model {
  let m = { ...initial(), folder: P } as Model;
  m = reduce(m, { type: "ui.practiceStarted", project: P, kind: "key" } as never);
  return m;
}
const go = (m: Model, ...es: Record<string, unknown>[]): Model => es.reduce<Model>((x, e) => reduce(x, e as never), m);

describe("the catalog on the pages", () => {
  test("the key practice comes first, so the first run and Learn start with it; it is free, with no Claude", () => {
    expect(CATALOG.map((e) => e.id)).toEqual(["key", "signup", "setting", "route", "import", "open-table"]);
    expect(FIRST_PRACTICE).toBe("key");
    const e = practiceOf("key")!;
    expect(e).toMatchObject({ find: "review", fix: "fixed", prove: "review", needsNode: false, costUsd: 0 });
    expect(costWords(e)).toBe(S.practiceFree);
    expect(practiceKind(e)).toBe("live");
    expect(listRows(NO_RECORD, null)[0]).toMatchObject({ title: "A key written into the code", needsNode: false });
  });
  test("the command is the protocol's own, and names only the step", () => {
    for (const step of ["write", "fix"] as const) {
      const c = practiceKey(P, step);
      expect(c).toMatchObject({ type: "practice.key", project: P, step });
      expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
    }
  });
});

describe("the key practice, from its events and presses", () => {
  test("the press: the pretend AI writes, the review stops it, and the problem is the key at pay.js line 2", () => {
    let m = started();
    expect(m.practice).toMatchObject({ kind: "key", stage: "start" });
    m = go(m, { type: "ui.practiceKeyWrite" });
    expect(m.practice!.pretend).toBe("writing");
    m = go(m, ev({ type: "practice.key", project: P, step: "wrote", written: true }));
    expect(m.practice!.pretend).toBe("wrote");
    const before = m.practice;
    m = go(m, BATCH, STOP);
    expect(m.practice).toMatchObject({ stage: "found", label: S.practiceKey.label, problem: { kind: "line", file: "pay.js", line: 2, from: "review" } });
    expect(m.practice!.pretend).toBeUndefined();
    // The pointed line is the review's own masked one, never the key.
    expect((m.practice!.problem as { lineText: string }).lineText).toBe('const PAYMENTS_SECRET_KEY = "sk_…";');
    // The review's own card shows too, with Copy for my AI (its send back text).
    expect(m.review?.result?.sendBack).toContain("pay.js");
    expect(markFor(before, m.practice)).toBe("found");
    expect(practiceNotes(before, m.practice)).toEqual(["practice_found"]);
    expect(threadOf(m.practice!)).toEqual({ find: "done", fix: "now", prove: "todo" });
  });
  test("pressed again on a copy that already has the key, it is found at once: nothing new was written", () => {
    const m = go(started(), { type: "ui.practiceKeyWrite" }, ev({ type: "practice.key", project: P, step: "wrote", written: false }));
    expect(m.practice).toMatchObject({ stage: "found", problem: { file: "pay.js", line: 2, message: S.practiceKey.inCode("pay.js", 2) } });
  });
  test("a review that could not run, or a refusal, says why and offers the button again; never found, never done", () => {
    const off = go(started(), { type: "ui.practiceKeyWrite" }, ev({ type: "review.result", project: P, ok: false, reason: "Reviews of changes are off. Turn them on in Settings.", usdEstimate: 0 }));
    expect(off.practice).toMatchObject({ stage: "blocked", block: "couldNotRun", why: "Reviews of changes are off. Turn them on in Settings." });
    const again = go(off, { type: "ui.practiceKeyWrite" });
    expect(again.practice).toMatchObject({ stage: "start", pretend: "writing" });
    const refused = go(started(), { type: "ui.practiceKeyWrite" }, ev({ type: "practice.key", project: P, step: "refused", reason: "This practice copy was changed." }));
    expect(refused.practice).toMatchObject({ stage: "blocked", block: "couldNotRun", why: "This practice copy was changed." });
    const page = go(started(), { type: "ui.practiceKeyWrite" }, { type: "ui.practiceKeyRefused", reason: "That command may only name the project folder you chose." });
    expect(page.practice!.stage).toBe("blocked");
  });
  test("a review of another project, or a review before the press, changes nothing", () => {
    const other = go(started(), { type: "ui.practiceKeyWrite" }, { ...STOP, project: "/Users/sam/my shop" });
    expect(other.practice).toMatchObject({ stage: "start", pretend: "writing" });
    const early = go(started(), STOP);
    expect(early.practice).toMatchObject({ stage: "start" });
    expect(early.practice!.pretend).toBeUndefined();
  });
  test("the other practices never follow these events", () => {
    const pr = { kind: "signup", stage: "start" as const, project: "/Users/sam/x" };
    for (const e of [{ type: "ui.practiceKeyWrite" }, { type: "ui.practiceKeyFix" }, STOP, ev({ type: "practice.key", project: "/Users/sam/x", step: "fixed", checkpoint: "cp_1", clean: true })]) expect(keyPracticeReduce(pr, e)).toBe(pr);
  });
  test("the fixed fix: done only when the key rule finds no key after it, with its safety copy and what changed; Undo brings the problem back", () => {
    let m = go(started(), { type: "ui.practiceKeyWrite" }, ev({ type: "practice.key", project: P, step: "wrote", written: true }), STOP);
    m = go(m, { type: "ui.practiceKeyFix" });
    expect(m.practice!.stage).toBe("fixing");
    const before = m.practice;
    m = go(m, ev({ type: "practice.key", project: P, step: "fixed", checkpoint: "cp_0043", changed: [{ file: ".env.local", kind: "added" }, { file: "pay.js", kind: "modified" }], clean: true }));
    expect(m.practice).toMatchObject({ stage: "done", checkpoint: "cp_0043", result: { checkpoint: "cp_0043", usdEstimate: 0, changed: [{ file: ".env.local", kind: "added" }, { file: "pay.js", kind: "modified" }] } });
    expect(markFor(before, m.practice)).toBe("done");
    // Undo of that safety copy: the key is back, so the problem is found again.
    m = go(m, ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_0043", safety: "cp_0044", recovered: 0, largeLeftAlone: [], leftAlone: [], yours: [] }));
    expect(m.practice).toMatchObject({ stage: "found", undone: true });
    expect(m.practice!.problem).toMatchObject({ file: "pay.js", line: 2 });
  });
  test("a fixed fix that left a key in the code is failed, never done (rule 14); a refusal while fixing keeps the problem, with why", () => {
    const base = go(started(), { type: "ui.practiceKeyWrite" }, ev({ type: "practice.key", project: P, step: "wrote", written: true }), STOP, { type: "ui.practiceKeyFix" });
    const dirty = go(base, ev({ type: "practice.key", project: P, step: "fixed", checkpoint: "cp_9", changed: [], clean: false }));
    expect(dirty.practice).toMatchObject({ stage: "failed", why: S.practiceKey.notClean });
    const refused = go(base, ev({ type: "practice.key", project: P, step: "refused", reason: "There is no key written into the code to move." }));
    expect(refused.practice).toMatchObject({ stage: "found", why: "There is no key written into the code to move." });
  });
});

describe("the page sends it only on a press, and Fix it never starts a model task here", () => {
  const card = read("./card.tsx");
  test("the pretend AI writes on the practice's button only, never when the copy opens", () => {
    expect(card).toContain('if (e.find === "review") { pressed(); dispatch({ type: "ui.practiceKeyWrite" }); void sendQuiet(practiceKey(project, "write"))');
    expect(card).toContain('if (practiceOf(pr.kind)?.find === "review") return;\n    practiceFind();');
  });
  test("Fix it, from the practice or the review's card in its copy, is the fixed move; the review card closes", () => {
    const fix = card.slice(card.indexOf("const practiceFix = (pr: Practice) => {"), card.indexOf("const resumedKey = useRef"));
    expect(fix).toContain('if (practiceOf(pr.kind)?.fix === "fixed") {');
    expect(fix).toContain('sendQuiet(practiceKey(pr.project, "fix"))');
    expect(fix.indexOf('practiceKey(pr.project, "fix")')).toBeLessThan(fix.indexOf("fixFound("));
    const onFix = card.slice(card.indexOf("    onFix: () => {"), card.indexOf("    onCancelFix:"));
    expect(onFix.indexOf("practiceFix(kp); return;")).toBeLessThan(onFix.indexOf("reviewFix(project, r.batch)"));
  });
  test("the panel says what the pretend AI did, stops it in words, and offers Copy for my AI and Fix it", () => {
    const panel = read("./practicePanel.tsx");
    expect(panel).toContain("{S.practiceKey.wrote} {S.practiceKey.looking}");
    expect(panel).toContain("<b>{S.practiceKey.stopped}</b>");
    expect(panel).toContain("{review && sendBack && <SendBack text={sendBack} label={S.fixRun.copyForAi} />}");
    expect(card).toContain('sendBack={entry.find === "review" && m.review ? sendBackCopy(m.review) : ""}');
  });
});

describe("the words", () => {
  const words = [...Object.values(S.practices.key), ...Object.values(S.practiceKey).map((w) => (typeof w === "function" ? w("pay.js", 2) : w))];
  test("the doer is the practice's pretend AI, never a real tool; no key to paste, no sign in, no cost; no praise", () => {
    for (const w of words) {
      expect(w).not.toMatch(/lovable|bolt|replit|cursor|claude code|chatgpt|copilot/i);
      expect(w).not.toMatch(/paste your|your key|api key|sign in|log in|cents?\b|\$\d/i);
      expect(w).not.toMatch(/great|awesome|well done|streak|congrat|amazing|nice/i);
      expect(w).not.toMatch(/[–—]/);
    }
    expect(S.practiceKey.wrote).toBe("The practice's pretend AI just changed a file.");
    expect(S.practiceKey.stopped).toBe(`${S.product} stopped it: a secret key is written into the code.`);
  });
});
