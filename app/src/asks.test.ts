// HeyClicky v1.0.53 parity (M11), the page side of two engine changes. A task that ends on a question to the person ends as
// "needs you": its last words are on the receipt, Home opens on Now with the question, and the follow up box is where to
// answer (no Try again, no Stop for a task that has ended). And Claude out of reach (a dropped connection, or Claude busy)
// is said in plain words with Try again, never as a problem with the project or the key.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AGENT } from "./commands.ts";
import { canFollowUp, canRetry, driveWords, historyWords, initial, plainError, receiptSaid, reduce, waitsForAnswer, type Model } from "./model.ts";
import { need } from "./home.ts";
import { statusGroup } from "./history.ts";
import { alsoSayLines } from "./speech.ts";
import { S } from "./strings.ts";

const P = "/Users/me/site";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const begin = [ev({ type: "checkpoint.created", project: P, agent: AGENT, checkpoint: "cp_1", label: "Before: make signup work", files: 3, skipped: [] }), ev({ type: "agent.state", agent: AGENT, state: "working" })];
const receipt = (extra: Record<string, unknown> = {}) => ev({ type: "receipt", agent: AGENT, checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0.02, ...extra });
const state = (s: string) => ev({ type: "agent.state", agent: AGENT, state: s });
const QUESTION = "SUPABASE_URL is not set. What is your Supabase project address? You can copy it from the Supabase dashboard.";
const asked = run([...begin, receipt({ said: QUESTION, asks: true }), state("needsYou")]);
const reported = run([...begin, receipt({ said: "I fixed the null check. The tests pass now.", proof: "passed", changed: [{ file: "a.js", kind: "modified" }] }), state("done")]);

describe("the agent's last words on the receipt", () => {
  test("a question is shown as one, with where to answer", () => {
    const w = receiptSaid(asked)!;
    expect(w.words).toBe(QUESTION);
    expect(w.lead).toBe(S.receiptAsks);
    expect(w.help).toBe(S.receiptAnswerHelp);
  });
  test("a question after work that is done and checked is shown as one, without saying the task needs you", () => {
    const w = receiptSaid(run([...begin, receipt({ said: "I fixed it. Do you also want a test for it?", asks: true, proof: "passed", changed: [{ file: "a.js", kind: "modified" }] }), state("done")]))!;
    expect(w.lead).toBe(S.receiptAsksToo);
    expect(w.help).toBe(S.receiptAnswerHelp);
  });
  test("a plain report is shown as what it said", () => {
    const w = receiptSaid(reported)!;
    expect(w.lead).toBe(S.receiptSaid);
    expect(w.help).toBeUndefined();
  });
  test("no words, no line; a secret that slipped through is hidden again, and very long words are cut", () => {
    expect(receiptSaid(run([...begin, receipt(), state("done")]))).toBeNull();
    expect(receiptSaid(run([...begin, receipt({ said: "Your key sk_live_abcdefghijklmnopqrstuvwx is set. Is that right?", asks: true }), state("needsYou")]))!.words).not.toContain("sk_live_abcdefghijklmnopqrstuvwx");
    expect(Array.from(receiptSaid(run([...begin, receipt({ said: "word ".repeat(400) }), state("done")]))!.words).length).toBeLessThanOrEqual(600);
  });
  test("Home shows the line, under the receipt's heading", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/receiptSaid\(m\)/);
  });
});

describe("a task that asks needs you, and is answered in the follow up box", () => {
  test("it is waiting for an answer, not working", () => {
    expect(waitsForAnswer(asked)).toBe(true);
    expect(waitsForAnswer(reported)).toBe(false);
    expect(waitsForAnswer(run([...begin, state("needsYou")]))).toBe(false);
  });
  test("the follow up box is there for the answer; Try again is not", () => {
    expect(canFollowUp(asked, P)).toBe(true);
    expect(canRetry(asked, P)).toBe(false);
    expect(S.followUpAnswer.length).toBeGreaterThan(10);
  });
  test("while an approval card or another question waits, the box waits too", () => {
    const withCard = run([ev({ type: "approval.request", approval: "ap_1", agent: AGENT, checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "git push sends your work to a remote", expiresAt: "2999-01-01T00:00:00Z" })], asked);
    expect(waitsForAnswer(withCard)).toBe(false);
    expect(canFollowUp(withCard, P)).toBe(false);
  });
  test("Home opens on Now with it, as a question", () => {
    const n = need(asked)!;
    expect(n.tab).toBe("now");
    expect(n.question).toBe(true);
    expect(n.why).toBe(S.receiptAsks);
  });
  test("an undo puts the files back, and the question goes with them", () => {
    const undone = run([ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] })], asked);
    expect(waitsForAnswer(undone)).toBe(false);
  });
  test("the card neither shows Stop nor hides the ask box for a task that has ended on a question", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/const working = .*!waitsForAnswer\(m\)/);
  });
  test("with Speak to me saying when something needs me, it says a question waits, in fixed words only", () => {
    expect(alsoSayLines(asked, P, ["needsYou"])).toEqual([{ key: "needs:asks:cp_1", text: S.alsoSay.needsYou.asks }]);
    expect(alsoSayLines(asked, P, [])).toEqual([]);
  });
  test("What I did and a plan's end say it in plain words", () => {
    expect(historyWords({ status: "needs_you", proof: "skipped" })).toBe(S.historyNeedsYou);
    expect(statusGroup("needs_you")).toBe("not_done");
    const d = run([ev({ type: "drive.done", agent: AGENT, status: "needs_you", completed: 1, total: 3, usdEstimate: 0.1 })]);
    expect(driveWords(d)).toMatch(new RegExp(S.driveNeedsYou));
  });
});

describe("Claude out of reach", () => {
  test("a dropped connection says what happened and what to do, never blaming the project or the key", () => {
    for (const r of ["no_connection: Companion could not reach Claude (API Error: Connection error.)", "engine error: no_connection: Companion could not reach Claude (fetch failed)"]) {
      const w = plainError(r);
      expect(w).toBe(S.noConnection);
      expect(w).toMatch(/Try again/);
      expect(w).not.toMatch(/key|project|Something went wrong/i);
    }
  });
  test("a busy Claude says so the same way", () => {
    const w = plainError("claude_busy: Claude is busy or having trouble right now (API Error: 529 Overloaded)");
    expect(w).toBe(S.claudeBusy);
    expect(w).toMatch(/Try again/);
    expect(w).not.toMatch(/key|project/i);
  });
  test("the task can be tried again", () => {
    const m = run([...begin, ev({ type: "protocol.error", agent: AGENT, reason: "no_connection: Companion could not reach Claude (x)" }), receipt(), state("error")]);
    expect(m.error).toBe(S.noConnection);
    expect(canRetry(m, P)).toBe(true);
  });
  test("What I did and a plan's end say it too", () => {
    expect(historyWords({ status: "no_connection", proof: null })).toBe(S.historyNoConnection);
    expect(historyWords({ status: "claude_busy", proof: null })).toBe(S.historyClaudeBusy);
    expect(statusGroup("no_connection")).toBe("stopped");
    expect(statusGroup("claude_busy")).toBe("stopped");
    const d = run([ev({ type: "drive.done", agent: AGENT, status: "no_connection", completed: 0, total: 2, usdEstimate: 0 })]);
    expect(driveWords(d)).toMatch(new RegExp(S.driveNoConnection));
  });
});
