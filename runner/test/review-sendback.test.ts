// M52: "Send back to my AI" is a ready message the person pastes into Claude Code or Codex, and Fix it is the same review
// turned into the engine's own task. Neither may ever carry a secret, whatever the review's words or the model said.
import { describe, expect, test } from "bun:test";
import { fixPrompt, sendBackText, type ReviewWords } from "../src/review/sendback.ts";
import { rate } from "../src/review/rate.ts";

const KEY = "sk_live_51HabcdefghijklmnopQRSTUV";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.abcdefghijklmnop";
const stopped = rate({ changes: [{ file: "src/pay.ts", kind: "modified" }, { file: "src/util.ts", kind: "deleted" }], touches: ["payments", "secrets"], secrets: [{ file: "src/pay.ts", line: 3 }],
  stillUsed: [{ file: "src/util.ts", by: "src/App.tsx", line: 2 }], secretFiles: [".env"], checks: "failed", checksNote: `Build did not pass: Invalid key ${KEY}`, count: 2, capped: false });
const words = (over: Partial<ReviewWords> = {}): ReviewWords => ({
  rating: stopped.rating, reasons: stopped.reasons, touches: ["payments", "secrets"], files: [{ file: "src/pay.ts", kind: "modified" }, { file: "src/util.ts", kind: "deleted" }], count: 2,
  summary: `The payment page now creates a Stripe session with the key ${KEY} written in.`, notes: [`Move ${JWT} into .env`, "Check the webhook still answers."], ...over,
});

describe("send back to my AI", () => {
  test("it says what changed, what it touches, the rating and each problem with its file and line, and asks for a fix with proof", () => {
    const t = sendBackText(words());
    expect(t).toContain("src/pay.ts");
    expect(t).toContain("line 3");
    expect(t).toContain("src/App.tsx");
    expect(t).toContain("payments");
    expect(t.toLowerCase()).toContain("stop");
    expect(t).toMatch(/build and tests/i);
  });
  test("no secret ever, even one the model wrote into its own words", () => {
    for (const t of [sendBackText(words()), fixPrompt(words())]) {
      expect(t).not.toContain(KEY);
      expect(t).not.toContain(JWT);
      expect(t).not.toMatch(/sk_live_[A-Za-z0-9]{10,}/);
    }
  });
  test("plain words: no long dash, no shouting, no markdown headings", () => {
    for (const t of [sendBackText(words()), fixPrompt(words())]) {
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/\b[A-Z]{4,}\b/);
      expect(t).not.toMatch(/^#/m);
    }
  });
  test("a safe change still makes a short, useful message", () => {
    const safe = rate({ changes: [{ file: "src/index.css", kind: "modified" }], touches: ["look_only"], secrets: [], stillUsed: [], secretFiles: [], checks: "passed", count: 1, capped: false });
    const t = sendBackText(words({ rating: safe.rating, reasons: safe.reasons, touches: ["look_only"], files: [{ file: "src/index.css", kind: "modified" }], count: 1, summary: "The buttons are rounder.", notes: [] }));
    expect(t).toContain("src/index.css");
    expect(t.length).toBeLessThan(1200);
  });
  test("a long list of files is cut, and says how many more there are", () => {
    const files = Array.from({ length: 80 }, (_, i) => ({ file: `src/f${i}.ts`, kind: "modified" as const }));
    const t = sendBackText(words({ files, count: 80 }));
    expect(t).toContain("and 60 more");
    expect(t).not.toContain("src/f79.ts");
  });
  test("Fix it asks the engine's own task to fix only the problems found, and to keep the person's other changes", () => {
    const p = fixPrompt(words());
    expect(p).toContain("src/pay.ts");
    expect(p).toMatch(/keep/i);
    expect(p).not.toContain(KEY);
  });
});
