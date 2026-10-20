// HeyClicky v1.0.53 parity (M11), the page side of two engine changes. A task that ends on a question to the person ends as
// "needs you": its last words are on the receipt, Home opens on Now with the question, and the follow up box is where to
// answer (no Try again, no Stop for a task that has ended). And Claude out of reach (a dropped connection, or Claude busy)
// is said in plain words with Try again, never as a problem with the project or the key.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AGENT } from "./commands.ts";
import { canFollowUp, canRetry, cardWorking, driveWords, historyWords, initial, plainError, receiptSaid, reduce, waitsForAnswer, type Model } from "./model.ts";
import { islandLine, need } from "./home.ts";
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
    const w = receiptSaid(run([...begin, receipt({ said: "I fixed it. Which email address should the welcome email come from?", asks: true, proof: "passed", changed: [{ file: "a.js", kind: "modified" }] }), state("done")]))!;
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
  // The engine sends no new state after an undo, so the page puts the agent back to ready itself: otherwise the card would
  // look busy (Stop, no Start row, no follow up box) and the island would say it needs you with nothing waiting.
  test("after Undo nothing waits: the card is not working, the Start row shows and the island says Ready", () => {
    const undone = run([ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] })], asked);
    expect(cardWorking(undone)).toBe(false);
    expect(undone.character).toBe("idle");
    expect(undone.agents[AGENT]).toBe("idle");
    expect(need(undone)).toBeNull();
    expect(islandLine(undone)).toBe(S.islandReady);
  });
  test("after which task broke it took that task back, the same", () => {
    const working: Model = { ...asked, bisect: { stage: "done", undo: "safe", task: { label: "make signup work", at: "2026-10-19T10:00:00Z", checkpoint: "cp_1" }, undoStage: "working" } };
    const undone = run([ev({ type: "bisect.undone", project: P, checkpoint: "cp_1", ok: true, reverted: ["a.js"] })], working);
    expect(undone.receipt?.undone).toBe(true);
    expect(cardWorking(undone)).toBe(false);
    expect(islandLine(undone)).toBe(S.islandReady);
  });
  test("an undo leaves an agent that waits for something else as it is", () => {
    const withCard = run([ev({ type: "approval.request", approval: "ap_1", agent: AGENT, checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "git push sends your work to a remote", expiresAt: "2999-01-01T00:00:00Z" })], asked);
    const undone = run([ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] })], withCard);
    expect(undone.agents[AGENT]).toBe("needsYou");
  });
  test("while a task works, the card is working; once it waits for an answer, it is not", () => {
    expect(cardWorking(run([...begin]))).toBe(true);
    expect(cardWorking(asked)).toBe(false);
    expect(cardWorking(reported)).toBe(false);
  });
  test("the card reads whether it is working from the model", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/const working = cardWorking\(m\)/);
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
  test("in a flow with no Try again (planning, Rescue, Research), it says ask again instead", () => {
    const w = plainError("engine error: no_connection (ask again): Companion could not reach Claude (fetch failed)");
    expect(w).toBe(S.noConnectionAsk);
    expect(w).toMatch(/ask again/);
    expect(w).not.toMatch(/Try again/);
    expect(plainError("engine error: claude_busy (ask again): Claude is busy or having trouble right now (529)")).toBe(S.claudeBusyAsk);
    expect(S.claudeBusyAsk).not.toMatch(/Try again/);
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

// A failed request of another kind (reach.ts stoppedMessage): said plainly, never with Claude Code's own text (which names its
// own /login), and Try again only where it can help.
describe("a failed request is said in plain words", () => {
  const reason = (kind: string, raw: string, ask = false) => `engine error: claude_stopped:${kind}${ask ? " (ask again)" : ""}: Claude stopped (${raw})`;
  test("a refused key: check it in Settings; no /login, no Try again", () => {
    const w = plainError(reason("authentication_failed", "Invalid API key · Please run /login"));
    expect(w).toMatch(/Settings/);
    expect(w).not.toMatch(/\/login|Try again|Something went wrong|Invalid API key/);
  });
  test("no credit: add some in the Anthropic Console; no Try again", () => {
    const w = plainError(reason("billing_error", "Credit balance is too low"));
    expect(w).toMatch(/console\.anthropic\.com/);
    expect(w).not.toMatch(/Try again|Credit balance/);
  });
  test("too many requests: wait a minute, then Try again, or ask again where there is none", () => {
    expect(plainError(reason("rate_limit", "API Error: Request rejected (429)"))).toMatch(/Wait a minute, then press Try again\./);
    const ask = plainError(reason("rate_limit", "API Error: Request rejected (429)", true));
    expect(ask).toMatch(/ask again/);
    expect(ask).not.toMatch(/Try again/);
  });
  test("a reply cut at its output limit: ask for a smaller part", () => {
    const w = plainError(reason("max_output_tokens", "API Error: Claude's response exceeded the 32000 output token maximum"));
    expect(w).toMatch(/cut off/);
    expect(w).not.toMatch(/CLAUDE_CODE|output token/);
  });
  test("every kind the pinned SDK names gets a plain line, and one it does not know gets a plain one too", () => {
    for (const kind of ["authentication_failed", "oauth_org_not_allowed", "account_on_hold", "verification_required", "billing_error", "rate_limit", "invalid_request", "model_not_found", "max_output_tokens", "cloud_credential_error", "unknown", "something_new"]) {
      for (const ask of [false, true]) {
        const w = plainError(reason(kind, "Raw words · Please run /doctor", ask));
        expect(w, kind).toMatch(/^[A-Z][^\n]{10,320}[.]$/);
        expect(w, kind).not.toMatch(/\/doctor|Raw words|Something went wrong|claude_stopped/);
        if (ask) expect(w, kind).not.toMatch(/Try again/);
      }
    }
  });
});

describe("Claude out of reach in the lanes and the explainers", () => {
  test("Prompt help says it plainly, with nothing to paste back", () => {
    const m = run([ev({ type: "assist.error", req: "ph_1", reason: "no_connection (ask again): Companion could not reach Claude (API Error: Connection error.)" })]);
    expect(m.ph).toMatchObject({ stage: "error", message: S.noConnectionAsk });
  });
  test("Show me says it plainly, never that it could not find it", () => {
    const m = run([ev({ type: "assist.error", req: "sm_1", reason: "claude_busy (ask again): Claude is busy or having trouble right now (529)" })], { ...initial(), showme: { stage: "thinking", req: "sm_1" } as never });
    expect(m.showme).toMatchObject({ stage: "error", message: S.claudeBusyAsk });
  });
  test("the error explainer and Draw it for me say it plainly", () => {
    const e = run([ev({ type: "app.explain_error", stage: "thinking", req: "eh_1" }), ev({ type: "error.explained", req: "eh_1", ok: false, sentences: [], excerpt: "x", evidence: "x", usdEstimate: 0, reason: "no_connection (ask again): Companion could not reach Claude (x)" })]);
    expect(e.eh?.reason).toBe(S.noConnectionAsk);
    const d = run([ev({ type: "ui.diagramAsked", ask: "d1", project: P }), ev({ type: "diagram.ready", project: P, ask: "d1", made: false, reason: "claude_stopped:authentication_failed (ask again): Claude stopped (Invalid API key)" })]);
    expect(d.diagram?.reason).toBe(plainError("claude_stopped:authentication_failed (ask again): x"));
    expect(d.diagram?.reason).not.toMatch(/Invalid API key/);
  });
  // Found in the M11 audit (A49): an older Show me request that failed after it was ended (Esc, closing Home, a newer
  // question) was shown as a Prompt help error.
  test("an old Show me request's error is never shown as Prompt help's, or on a newer Show me", () => {
    const newer = { ...initial(), showme: { stage: "thinking", message: "", req: "sm_2" } } as Model;
    const old = run([ev({ type: "assist.error", req: "sm_1", reason: "No clear target was found" })], newer);
    expect(old.ph).toBeNull();
    expect(old.showme?.stage).toBe("thinking");
    expect(run([ev({ type: "assist.error", req: "sm_1", reason: "No clear target was found" })]).ph).toBeNull();
    // Its own, or a picture of one of its screens, still says it.
    expect(run([ev({ type: "assist.error", req: "sm_2", reason: "No clear target was found" })], newer).showme?.stage).toBe("error");
    expect(run([ev({ type: "assist.error", req: "sm_2-s2", reason: "The screenshot was not usable" })], newer).showme).toMatchObject({ stage: "error", message: "The screenshot was not usable" });
  });
  test("a reason that is not Claude's is shown as before", () => {
    const m = run([ev({ type: "assist.error", req: "ph_1", reason: "The improved version came out much longer than yours, so I left yours alone." })]);
    expect(m.ph?.message).toBe("The improved version came out much longer than yours, so I left yours alone.");
  });
});
