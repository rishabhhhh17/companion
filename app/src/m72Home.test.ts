// M72 (make it work): the walkthrough's Home items. Plain code first, then the page's source where only its shape can be
// checked without a screen (the shots in the M72 report show each one drawn).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type HistoryItem } from "./model.ts";
import { homeStatus, notchStatusLine } from "./homeHero.ts";
import { lastFix, nowRows } from "./homeRest.ts";
import { failedCheckWords, S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/my-shop";
const NOW = Date.parse("2026-11-06T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const item = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 8, label: "Check my project", status: "done", usd: 0, startedAt: ago(0.6), endedAt: ago(0.5), checkpoint: "cp_9", changed: 0, proof: "failed", ...o });

describe("item 12: a failed check says what failed", () => {
  test("the rung of the check that failed is named in plain words; unknown keeps the old words", () => {
    expect(failedCheckWords("tests")).toBe("The tests failed");
    expect(failedCheckWords("checks")).toBe("The build check failed");
    expect(failedCheckWords(undefined)).toBe("A check failed");
    expect(failedCheckWords("nonsense")).toBe("A check failed");
  });
  test("Home's status and the notch name it from the task log", () => {
    const m = { ...initial(), history: [item({ failedCheck: "tests" })] };
    const s = homeStatus(m, P, NOW);
    expect(s.kind).toBe("failing");
    expect(s.sub).toStartWith("The tests failed ");
    expect(notchStatusLine(s, P)).toContain("The tests failed");
  });
  test("the Now row's tick names it too, and a check that changed nothing never offers Undo", () => {
    const f = lastFix([item({ failedCheck: "browser" })], NOW)!;
    expect(f.ticks[0].words).toBe("The browser check failed");
    const rows = nowRows({ fix: f, since: [], practice: false, undo: false, now: NOW });
    expect(rows[0].action).toBeNull();
  });
});

import { reviewReduce, type ReviewCard } from "./review.ts";
import { reviewHead } from "./reviewHead.ts";
import { readinessOf } from "./findingShape.ts";

describe("item 2: the review verdict", () => {
  const files = [{ file: "src/pay.ts", kind: "modified" }, { file: "src/cart.ts", kind: "modified" }, { file: "src/app.ts", kind: "added" }];
  const r = [{ type: "review.batch", project: P, batch: "rv_4f2a9c01de", files, count: 3, capped: false, secretFiles: [], auto: false },
    { type: "review.result", project: P, batch: "rv_4f2a9c01de", ok: true, rating: "worth_a_look", touches: ["payments"], summary: "Changed the pay page.", notes: [],
      reasons: [{ kind: "touches_risky", file: "src/pay.ts", line: 12, say: "Sign in, payments or data changed." }, { kind: "removed_still_used", file: "src/cart.ts", line: 4, say: "cart.ts still uses it." }],
      files, count: 3, capped: false, secretFiles: [], checks: "not_run", sendBack: "x", lane: "cheap", usdEstimate: 0 }]
    .reduce<ReviewCard | null>((c, e) => reviewReduce(c, e as { type: string }), null);
  test("the tag's count and the readiness line count the same things (never 1 of 2 beside Check these 3 things)", () => {
    const h = reviewHead(r)!, ready = readinessOf(r);
    expect(h.tag).toContain(S.homeNow.of(1, ready.n));
  });
  test("the decision buttons come right under the headline, before the evidence; the summary is said", () => {
    const card = read("./reviewCard.tsx");
    const lead = card.slice(card.indexOf("function ReviewLeadView"), card.indexOf("function ReviewPlainView"));
    expect(lead.indexOf('className="row result-actions rv-actions"')).toBeLessThan(lead.indexOf("<ReadinessLine"));
    expect(lead.indexOf('className="row result-actions rv-actions"')).toBeLessThan(lead.indexOf("<CodePoint"));
    expect(lead).toContain('className="line muted rv-summary"');
  });
});

describe("item 3: after Stop, Undo what it did is in the lead", () => {
  test("the lead draws it as the main button, Carry on secondary, and the receipt does not draw it again", () => {
    const card = read("./card.tsx");
    expect(card).toContain('const stoppedUndo = !compact && !setup && !!m.receipt && receiptVerdict(m)?.kind === "stopped" && undoCan(m, project);');
    expect(card).toContain("{stoppedUndo && <Button {...{ id: undoId }} kind=\"primary\" size=\"lg\"");
    expect(card).toContain("(stoppedUndo ? null : undoMain())");
  });
});

describe("item 12: Fix it answers at once with no found problem on screen", () => {
  test("Home's Fix it over a failed check shows Starting the fix at once, and a refusal puts it back", () => {
    const card = read("./card.tsx");
    expect(card).toContain('dispatch({ type: "ui.taskSent", words: S.review.fixStarting }); void send(diagnose(here)).catch((e) => { dispatch({ type: "ui.taskSendFailed" });');
  });
});

import { needMainFor, needMainWords } from "./homeHero.ts";
import { initial as fresh } from "./model.ts";

describe("item 4: the key practice's words and buttons agree", () => {
  const key = { ...fresh(), practice: { project: P, kind: "key", stage: "start" } } as never;
  test("Now's lead for a practice not started names the practice's own action (the key practice: let the pretend AI change a file)", () => {
    const need = { key: `practice:${P}:start`, tab: "learn", why: S.practiceTitle } as never;
    expect(needMainFor(key, need, P)).toBe("practiceStart");
    expect(needMainWords(key, "practiceStart")).toBe(S.practiceKey.go);
  });
  test("a found key practice offers Fix it on Now too (its fix is the practice's own move)", () => {
    const found = { ...fresh(), practice: { project: P, kind: "key", stage: "found" } } as never;
    expect(needMainFor(found, { key: `practice:${P}:found`, tab: "learn", why: "" } as never, P)).toBe("practiceFix");
  });
  test("the found card always has Copy for my AI, which its words name (from the review, or the place when the review is gone)", () => {
    const card = read("./card.tsx");
    expect(card).toContain('sendBack={entry.find === "review" ? (m.review ? sendBackCopy(m.review) : practiceKeyCopy(pr.problem)) : ""}');
    expect(S.practices.key.foundMore).toContain(S.fixRun.copyForAi);
  });
  test("the lead's headline drops the Practice tag without matching English in logic", () => {
    const card = read("./card.tsx");
    expect(card).not.toContain("replace(/^practice:");
    expect(card).toContain("S.practiceLeadTitle");
  });
});

describe("items 5 and 6: a practice answers where it was pressed, and says which try it is on", () => {
  const learn = read("./practicePanel.tsx"), card = read("./card.tsx");
  test("Start shows Opening the practice at once, where it was pressed, until the copy is ready", () => {
    expect(card).toContain("setPracticeOpening(id)");
    expect(learn).toContain("opening === lead.entry.id");
    expect(learn).toContain("S.practiceOpening");
  });
  test("the practice card says Trying again (2 of 3) while its fix tries again, as Now does", () => {
    expect(learn).toContain('{retry && <div className="line" role="status">{retry}</div>}');
    expect(card).toContain("retry={m.task ? jobStep(m,");
  });
  test("the leftover busy line is not drawn under the practice that is itself the work in progress", () => {
    expect(learn).toContain("{busy && !openId && <p className=\"page-caption\">{S.practiceBusy}</p>}");
  });
  test("item 16: the key practice's last step says what was checked (the review again), not that the checks pass", () => {
    expect(learn).toContain("S.practiceKey.doneSay");
    expect(S.practiceKey.doneSay).not.toContain("passes");
  });
});
