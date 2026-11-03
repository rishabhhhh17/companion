// M57 honest words (review finding, 4 Nov 2026): Squibby cannot tell another tool's edits from the person's own. So the
// review's model is never told an AI made the change, and a summary, note or concern from the model that still says an AI
// or a named tool made, fixed or broke it has that sentence taken out before it reaches the card or History.
// No real model runs here: the answers are written by hand.
import { describe, expect, test } from "bun:test";
import { parseWords, WORDS_SYSTEM, wordsRequest } from "../src/review/words.ts";

const CREDIT = /\b(AI|assistant|agent|Claude|Cursor|Codex|Copilot)\b[^.]{0,30}\b(made|changed|did|fixed|broke|wrote)\b/i;

describe("honest words: the model is never told who made the change", () => {
  test("neither the system line nor the request says an AI or another tool made it", () => {
    const req = wordsRequest({ files: [{ file: "src/pricing.tsx", kind: "modified" }], count: 1, touches: ["payments"], reasons: [], diff: "-$9\n+$19", checks: "not run" });
    for (const t of [WORDS_SYSTEM, req.system, req.text]) {
      expect(t).not.toMatch(/another AI tool|AI coding tool|an AI tool|your AI/i);
      expect(t).not.toMatch(CREDIT);
    }
  });
  test("the model is told nobody can know who made it, and never to say so", () => {
    const req = wordsRequest({ files: [{ file: "a.ts", kind: "added" }], count: 1, touches: [], reasons: [], diff: "+x", checks: "not run" });
    expect(req.system + req.text).toMatch(/cannot (be )?(known|know|tell)/i);
    expect(req.text).toMatch(/never say who made/i);
  });
});

describe("honest words: what the model writes", () => {
  const answer = (o: Record<string, unknown>) => JSON.stringify({ notes: [], concern: false, ...o });
  test("a summary that credits the AI loses that sentence and keeps the rest", () => {
    const w = parseWords(answer({ summary: "Your AI tool changed the price shown on the page. The price is now $19 a month." }));
    expect(w?.summary).toBe("The price is now $19 a month.");
  });
  test("a summary that is only credit or blame is dropped, so the rules' own words are used", () => {
    expect(parseWords(answer({ summary: "The AI fixed the sign in page." }))).toBeNull();
    expect(parseWords(answer({ summary: "Claude Code broke the checkout." }))).toBeNull();
    expect(parseWords(answer({ summary: "Another AI tool made these changes." }))).toBeNull();
  });
  test("notes and the concern sentence are cleaned the same way", () => {
    const w = parseWords(answer({ summary: "The checkout page changed.", notes: ["Cursor removed the tax line. Check the total.", "The AI did this on purpose."], concern: true, concernSay: "Your AI broke the total." }));
    expect(w?.notes).toEqual(["Check the total."]);
    expect(w?.concern).toBe(true);
    expect(w?.concernSay).toBeUndefined();
  });
  test("a product feature named AI is not taken for credit", () => {
    const w = parseWords(answer({ summary: "The AI chat page now loads the newest messages first." }));
    expect(w?.summary).toBe("The AI chat page now loads the newest messages first.");
  });
});
