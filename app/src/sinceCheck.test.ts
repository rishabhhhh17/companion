// Must fix 11 (review of 4 Nov): Home never says the project works over code nobody checked. The engine says whether the
// project changed since the version its last passed check ran on (tasks.list sinceCheck); a safe review whose checks did not
// run keeps leading; and a fix sent from a review says it is starting.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { homeStatus, notchStatusLine, reviewLead } from "./homeHero.ts";
import type { ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

const P = "/Users/me/test-shop";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = { ...initial(), folder: P }) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const row = { id: 1, label: "add a sign up page", status: "done", usd: 0.05, startedAt: new Date(Date.now() - 600_000).toISOString(), endedAt: new Date(Date.now() - 300_000).toISOString(), checkpoint: "cp_1", changed: 1, proof: "passed" };
const list = (sinceCheck?: string, project = P) => ev({ type: "tasks.list", project, tasks: [row], ...(sinceCheck ? { sinceCheck } : {}) });

describe("Home after the files changed since the last proven check", () => {
  test("a proven project that is the same as checked still works", () => {
    const s = homeStatus(run([list("same")]), P, Date.now());
    expect(s.kind).toBe("works");
    expect(s.verdict.headline).toBe(S.home.works("test-shop"));
  });
  test("once it changed, Home says so, with no tick, and Check my project is the main button", () => {
    const s = homeStatus(run([list("changed")]), P, Date.now());
    expect(s.kind).toBe("changed");
    expect(s.verdict.headline).toBe(S.home.changedSince("test-shop"));
    expect(S.home.changedSince("test-shop")).toBe("test-shop changed since its last check");
    expect(s.verdict.icon).not.toBe("tick");
    expect(s.verdict.proven).toBe(false);
    expect(s.main).toBe("check");
    expect(notchStatusLine(s, P)).toBe(S.home.notchChanged("test-shop"));
    expect(notchStatusLine(s, P)).not.toMatch(/works/);
  });
  test("an older engine, or one that cannot tell, changes nothing", () => {
    expect(homeStatus(run([list()]), P, Date.now()).kind).toBe("works");
  });
  test("another folder's answer is never this one's", () => {
    expect(homeStatus(run([list("changed", "/Users/me/other")]), P, Date.now()).kind).toBe("works");
  });
  test("a new result clears the old answer until the engine says again", () => {
    const m = run([list("changed"), ev({ type: "checkpoint.created", project: P, agent: "a", checkpoint: "cp_2", label: "Before: x", files: 1, skipped: [] }),
      ev({ type: "receipt", agent: "a", checkpoint: "cp_2", changed: [{ file: "a.js", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0.01, proof: "passed", ended: "done" })]);
    expect(m.sinceCheck).toBeUndefined();
    expect(homeStatus(m, P, Date.now()).kind).toBe("works");
  });
  test("the page asks again when it comes back to the front and when new changes wait for a review", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("[project, m.receipt, m.review?.batch]");
    expect(card).toMatch(/addEventListener\("focus", again\)[\s\S]{0,80}listTasks|listTasks[\s\S]{0,200}addEventListener\("focus"/);
  });
  // Review of M56: Home is a non activating panel (rule 9), so "focus" may never fire when the person comes back from their
  // editor. It also asks each time Home opens, and when the pointer comes onto it, at most once every few seconds.
  test("the page also asks when Home opens and when the pointer comes onto it, never more than once every few seconds", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const block = card.split("const SINCE_ASK_MS")[1]?.split("}, [project]);")[0] ?? "";
    expect(block).toContain("listTasks(project)");
    const opened = card.slice(card.indexOf('listen("opened"'));
    expect(opened.slice(0, opened.indexOf("}, []);"))).toContain("if (here) void sendQuiet(listTasks(here));");
    expect(block).toContain('addEventListener("pointerenter", again)');
    expect(block).toContain("SINCE_ASK_MS");
    expect(card).toMatch(/const SINCE_ASK_MS = \d{4};/);
    expect(block).toContain("if (t - last < SINCE_ASK_MS) return;");
  });
});

describe("review leads that used to fall back to an old works line", () => {
  const rc = (o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_0123456789", stage: "reviewed", files: [], count: 2, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
  const result = (checks: string) => ({ rating: "safe", touches: [], summary: "", notes: [], reasons: [], checks, sendBack: "", lane: "cheap", usdEstimate: 0 }) as never;
  test("a safe quick look whose checks did not run keeps leading, and says nothing is proven", () => {
    for (const checks of ["not_run", "unknown"]) {
      const l = reviewLead(rc({ result: result(checks) }), P)!;
      expect(l.headline).toBe(S.review.rating.safe);
      expect(l.line).toBe(S.review.safeUnchecked);
      expect(l.main).toBeNull();
    }
    expect(S.review.safeUnchecked).not.toMatch(/works|proven to work/i);
  });
  test("a safe review whose checks passed does not lead", () => {
    expect(reviewLead(rc({ result: result("passed") }), P)).toBeNull();
  });
  test("a fix sent from the review says it is starting", () => {
    const l = reviewLead(rc({ result: { ...(result("not_run") as object), rating: "stop" } as never, fix: "sent" }), P)!;
    expect(l.headline).toBe(S.review.fixStarting);
    expect(S.review.fixStarting).toBe("Starting the fix");
    expect(l.main).toBeNull();
  });
});
