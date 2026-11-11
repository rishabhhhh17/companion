import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, receiptHeading, reduce, type Model } from "./model.ts";
import { aboutCopy, copyable, ehCopy, explainCopy, MAX_COPY, receiptCopy, recapCopy, rescueCopy, researchCopy } from "./copytext.ts";
import { S } from "./strings.ts";
import { shellSource } from "../dom/sourceText.ts";

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, { v: 1, id: "e", ...e } as never), from);
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";

describe("Copy on replies and receipts", () => {
  test("a receipt copies as the lines it shows: what changed, the proof, what was not done, the cost", () => {
    const m = run([
      { type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: "Before: add a page", files: 3, skipped: [] },
      { type: "agent.tool", agent: "a", tool: "Bash", summary: "git push", toolUseId: "t1", undoable: false, outcome: "blocked" },
      { type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "src/page.js", kind: "added" }, { file: "src/app.js", kind: "modified" }], commands: 3, notUndoable: ["data.db: over 2 MiB"], proof: "passed", usdEstimate: 0.04 },
    ]);
    const t = receiptCopy(m, "/p");
    expect(t.split("\n")).toEqual([
      S.receiptTitle,
      `${S.added}: src/page.js`,
      `${S.modified}: src/app.js`,
      `${S.cannotUndo}: data.db: over 2 MiB`,
      "Fixed and proven.",
      "1 action was not done: git push",
      `3 ${S.commands} · ${S.cost}: 4 cents`,
    ]);
  });
  test("a receipt that changed nothing says so", () => {
    const m = run([{ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0 }]);
    expect(receiptCopy(m, "/p").split("\n")[1]).toBe(S.nothingChanged);
    expect(receiptCopy(initial(), "/p")).toBe("");
  });
  test("a plain question is answered under Answer, a task that changed files under What changed (finding N)", () => {
    const rec = (o: Record<string, unknown>) => run([{ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0, ...o }]);
    const answered = rec({ said: "It is a button that opens the menu." });
    expect(receiptHeading(answered.receipt)).toBe(S.answerTitle);
    expect(S.answerTitle).toBe("Answer");
    expect(receiptCopy(answered, "/p").split("\n")[0]).toBe("Answer");
    const changed = rec({ said: "Done.", changed: [{ file: "src/page.js", kind: "added" }] });
    expect(receiptHeading(changed.receipt)).toBe(S.receiptTitle);
    expect(receiptCopy(changed, "/p").split("\n")[0]).toBe("What changed");
    // Nothing changed and nothing was said (a stopped or failed task): there is no answer, so the usual heading stays.
    expect(receiptHeading(rec({}).receipt)).toBe(S.receiptTitle);
    expect(receiptHeading(null)).toBe(S.receiptTitle);
    expect(card).toContain("receiptHeading(m.receipt)");
  });
  test("a research answer copies with its notes and where each came from", () => {
    const t = researchCopy({ title: "Taking payments", answer: "Use Stripe Checkout.", notes: [{ text: "Checkout hosts the page.", source: "https://docs.stripe.com/checkout" }], file: "notes/payments.md" });
    expect(t).toBe(["Taking payments", "Use Stripe Checkout.", `${S.researchNotes}:`, "- Checkout hosts the page. (https://docs.stripe.com/checkout)", `${S.researchFiled} notes/payments.md`].join("\n"));
  });
  test("what Rescue found copies as shown", () => {
    const t = rescueCopy({ summary: "The form posts nowhere.", works: ["the page loads"], broken: "the Join button", evidence: [{ label: "Tests", status: "failed", detail: "1 failed" }] });
    expect(t).toBe([S.rescueTitle, "The form posts nowhere.", `${S.rescueWorks}: the page loads`, `${S.rescueBroken}: the Join button`, `${S.rescueChecks}:`, "Tests: failed 1 failed"].join("\n"));
  });
  test("an explained error copies its sentences", () => {
    const m: Model = { ...initial(), eh: { stage: "ready", req: "r", sentences: ["A name is used before it is made.", "Make it first."], where: { kind: "line", file: "src/a.ts", line: 4, lineText: "x", message: "m", from: "tsc" } as never } };
    expect(ehCopy(m)).toBe(["A name is used before it is made.", "Make it first.", S.ehWhere("src/a.ts", 4)].join("\n"));
    expect(ehCopy(initial())).toBe("");
  });
  test("nothing copied ever carries something that looks like a key, even if it reached the card", () => {
    expect(researchCopy({ title: "t", answer: `Use ${KEY} here.`, notes: [], file: "f" })).not.toContain(KEY);
    expect(rescueCopy({ summary: `password=${"hunter2hunter2"}`, works: [], broken: "x", evidence: [] })).not.toContain("hunter2hunter2");
    const m: Model = { ...initial(), eh: { stage: "ready", req: "r", sentences: [`The key ${KEY} is wrong.`] } };
    expect(ehCopy(m)).not.toContain(KEY);
  });
  test("the card offers Copy on the receipt, a research answer, what Rescue found and an explained error", () => {
    for (const f of ["receiptCopy(m, project)", "researchCopy(m.research)", "rescueCopy(m.rescue)", "ehCopy(m)"]) expect(card, f).toContain(`<CopyButton text={${f}}`);
  });
  test("why it was done copies its points, and the question with its choices", () => {
    expect(explainCopy({ checkpoint: "cp_1", bullets: ["The form had no address to send to.", "I gave it one."] })).toBe([S.explainTitle, "- The form had no address to send to.", "- I gave it one."].join("\n"));
    const q = explainCopy({ checkpoint: "cp_1", bullets: ["One."], question: { text: "Where does the form send?", options: ["To /join", "Nowhere"], correct: 0 } });
    expect(q.split("\n").slice(-3)).toEqual([`${S.explainCheck}: Where does the form send?`, "- To /join", "- Nowhere"]);
    expect(explainCopy({ checkpoint: "cp_1", bullets: [`Used ${KEY}.`] })).not.toContain(KEY);
  });
  test("where you left off, and what the project is, copy as shown", () => {
    expect(recapCopy({ lines: ["You fixed the signup page.", "The tests pass."] })).toBe([S.recapTitle, "You fixed the signup page.", "The tests pass."].join("\n"));
    expect(aboutCopy({ project: "/p", about: "A small shop made with Next.js.", origin: "", needsInstall: false, installCommand: null, missing: [], missingCount: 0, example: null, notes: ["It uses Stripe."] })).toBe([S.aboutTitle, "A small shop made with Next.js.", "It uses Stripe."].join("\n"));
  });
  test("Copy puts the text on the Mac's clipboard itself, falls back to the page's clipboard, and says so when both fail", () => {
    const btn = card.slice(card.indexOf("function CopyButton("), card.indexOf("function ResearchNote("));
    // The page makes the Mac side's own check first, so its clipboard is used only for text the Mac side would have taken:
    // a refusal there (a terminal control in model output, text too long) is never undone by the fallback.
    expect(btn).toMatch(/const ok = copyable\(text\);\s*if \(ok === null\) \{ setState\("failed"\); return; \}/);
    expect(btn).toMatch(/invoke\("copy_text", \{ text: ok \}\)\.catch\(\(\) => navigator\.clipboard\?\.writeText\(ok\)/);
    expect(btn.indexOf("copyable(text)")).toBeLessThan(btn.indexOf("invoke(\"copy_text\""));
    expect(btn).not.toMatch(/writeText\(text\)/);
    expect(btn).toContain('setState("failed")');
    expect(btn).toMatch(/onClick=\{copy\}/);
    // Only from Home, and the Mac side checks the text (share.rs copyable).
    const shell = shellSource();
    const cmd = shell.slice(shell.indexOf("fn copy_text("), shell.indexOf("fn copy_text(") + 600);
    expect(cmd).toContain('window.label() != "card"');
    expect(cmd).toContain("share::copyable(");
    expect(shell).toMatch(/generate_handler!\[[^\]]*\bcopy_text\b/);
  });
  test("the card offers Copy on why it was done, where you left off, and what the project is", () => {
    for (const f of ["explainCopy(e)", "recapCopy(m.recap)", "aboutCopy(m.about)"]) expect(card, f).toContain(`<CopyButton text={${f}}`);
  });
});

describe("what Copy may put on the clipboard", () => {
  // The same rule the Mac side uses (share.rs copyable), so the page's own clipboard, used when the Mac side cannot be
  // reached, never takes what the Mac side would refuse.
  const share = readFileSync(new URL("../src-tauri/src/share.rs", import.meta.url), "utf8");
  test("the cap is the Mac side's", () => {
    const rust = share.match(/pub const MAX_COPY: usize = ([\d_]+);/);
    expect(rust).not.toBeNull();
    expect(Number(rust![1].replace(/_/g, ""))).toBe(MAX_COPY);
  });
  test("plain lines with new lines and tabs, up to the cap, counted in characters", () => {
    expect(copyable("What changed\nAdded: src/page.js\n\t3 commands")).toBe("What changed\nAdded: src/page.js\n\t3 commands");
    expect(copyable("é".repeat(MAX_COPY))).toBe("é".repeat(MAX_COPY));
    expect(copyable("🙂".repeat(MAX_COPY))).toBe("🙂".repeat(MAX_COPY));
  });
  test("Windows line ends become plain new lines, so they still copy", () => {
    expect(copyable("one\r\ntwo\rthree")).toBe("one\ntwo\nthree");
  });
  test("refused: nothing, only spaces, too long, and any control character but a new line or a tab", () => {
    expect(copyable("")).toBeNull();
    expect(copyable("  \n ")).toBeNull();
    expect(copyable("a".repeat(MAX_COPY + 1))).toBeNull();
    for (const c of ["\u0000", "\u0007", "\u0008", "\u000b", "\u000c", "\u001b", "\u007f", "\u0085", "\u009b"]) expect(copyable(`a${c}[31mb`), JSON.stringify(c)).toBeNull();
  });
  test("refuses exactly what the Mac side's own tests refuse", () => {
    const at = share.indexOf("fn copy_takes_only_plain_text_of_a_sensible_length");
    expect(at).toBeGreaterThan(0);
    const mod = share.slice(at, share.indexOf("#[test]", at));
    expect(mod).toContain('copyable("a\\u{1b}[31mb"), None');
    expect(mod).toContain('copyable("a\\u{0}b"), None');
    expect(copyable("a\u001b[31mb")).toBeNull();
    expect(copyable("a\u0000b")).toBeNull();
  });
});

describe("M45: the copied receipt tells the truth", () => {
  const done = [
    { type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: "Before: add a page", files: 3, skipped: [] },
    { type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "src/page.js", kind: "added" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0, ended: "done" },
  ];
  test("the copied receipt after Undo says Undone", () => {
    const m = run([...done, { type: "checkpoint.restored", project: "/p", checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] }]);
    const t = receiptCopy(m, "/p");
    expect(t).toContain(`${S.verdict.undone}. ${S.verdict.undoneFix}`);
    expect(t).not.toMatch(/proven/i);
  });
  test("zero cost says No cost", () => {
    const t = receiptCopy(run(done), "/p");
    expect(t.split("\n").at(-1)).toBe(`1 ${S.commands} · ${S.noCost}`);
    expect(t).not.toContain("free so far");
  });
  test("a receipt that changed nothing still says how it ended", () => {
    const m = run([{ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0, ended: "stopped" }]);
    expect(receiptCopy(m, "/p")).toContain(`${S.verdict.stopped}. ${S.verdict.stoppedNothing}`);
  });
});
