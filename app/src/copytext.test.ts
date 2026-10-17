import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { aboutCopy, ehCopy, explainCopy, receiptCopy, recapCopy, rescueCopy, researchCopy } from "./copytext.ts";
import { S } from "./strings.ts";

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
      S.proven,
      "1 action was not done: git push",
      `3 ${S.commands} · ${S.cost}: 4 cents`,
    ]);
  });
  test("a receipt that changed nothing says so", () => {
    const m = run([{ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0 }]);
    expect(receiptCopy(m, "/p").split("\n")[1]).toBe(S.nothingChanged);
    expect(receiptCopy(initial(), "/p")).toBe("");
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
  test("the card offers Copy on why it was done, where you left off, and what the project is", () => {
    for (const f of ["explainCopy(e)", "recapCopy(m.recap)", "aboutCopy(m.about)"]) expect(card, f).toContain(`<CopyButton text={${f}}`);
  });
});
