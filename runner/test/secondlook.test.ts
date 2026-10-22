import { describe, expect, test } from "bun:test";
import { MAX_CHECKED_CHARS, recompute, secondLook, SECOND_LOOK_SYSTEM } from "../src/secondlook.ts";
import type { FastLike } from "../src/lanes.ts";

// Second Look (M14): select any AI answer, press a key, and it says what is solid, what to check, and what it cannot tell.
// The maths is redone by code, never guessed; the model looks at the rest; it never says "solid" when the maths found a slip.
const sig = () => new AbortController().signal;
const model = (reply: string | (() => never), seen: { text: string; system?: string }[] = []): FastLike => ({
  run: async (req) => { seen.push({ text: req.text, system: req.system }); if (typeof reply === "function") reply(); return { text: reply as string, costUsd: 0.004 }; },
});
const SOLID = JSON.stringify({ verdict: "solid", items: [], checked: ["The steps follow from each other"], cantTell: [] });

describe("redoing the maths, with no model", () => {
  test("a sum, a product, a difference and a division that are wrong are caught, with the right answer", () => {
    const r = recompute("So 120 × 4 = 460 units, and 300 + 250 = 500. Then 90 - 25 = 65 and 100 / 8 = 12.5.");
    expect(r.map((i) => i.claim)).toEqual(["120 × 4 = 460", "300 + 250 = 500"]);
    expect(r[0].issue).toMatch(/480/);
    expect(r[1].issue).toMatch(/550/);
    expect(r.every((i) => i.kind === "number" && i.by === "recomputed")).toBe(true);
  });
  test("money, commas and decimals are read the way people write them", () => {
    expect(recompute("Revenue: $1,200 x 12 = $14,400 a year.")).toEqual([]);
    expect(recompute("Revenue: $1,200 x 12 = $14,000 a year.")[0].issue).toMatch(/14,400/);
    expect(recompute("₹2,500 * 3 = ₹7,500")).toEqual([]);
  });
  test("a percentage change that does not match its numbers is caught", () => {
    expect(recompute("Sales went from 200 to 260, a 30% increase.")).toEqual([]);
    const r = recompute("Sales went from 200 to 260, a 40% increase.");
    expect(r[0].issue).toMatch(/30%/);
    expect(recompute("Costs fell from 80 to 60, a 25% decrease.")).toEqual([]);
  });
  test("a table whose total row does not add up is caught; one that adds up is not", () => {
    const good = "| Item | Cost |\n|---|---|\n| Rent | 1,000 |\n| Food | 400 |\n| **Total** | **1,400** |";
    const bad = good.replace("**1,400**", "**1,500**");
    expect(recompute(good)).toEqual([]);
    const r = recompute(bad);
    expect(r).toHaveLength(1);
    expect(r[0].claim).toMatch(/Total/);
    expect(r[0].issue).toMatch(/1,400/);
  });
  test("things that only look like sums are left alone (no false alarms)", () => {
    for (const t of ["Call 555-1234 = office", "The date is 2026-10-22.", "Use x = 5 and y = 7.", "Version 1.2 = stable", "a = b + c", "10 / 2 = 5", "0.1 + 0.2 = 0.3", "Score: 3-2 = win"]) expect(recompute(t), t).toEqual([]);
  });
});

describe("the whole check", () => {
  test("a maths slip makes the verdict 'check' even when the model says it is solid", async () => {
    const r = await secondLook("Your budget: 120 × 4 = 460.", model(SOLID), sig());
    expect(r.verdict).toBe("check");
    expect(r.items[0].by).toBe("recomputed");
  });
  test("the model's own findings are kept, each with what to verify; at most six", async () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ kind: "citation", claim: `Smith v. Jones ${i}`, issue: "I could not confirm this case exists", verify: "Search the court's records for it" }));
    const r = await secondLook("See Smith v. Jones.", model(JSON.stringify({ verdict: "check", items, checked: [], cantTell: [] })), sig());
    expect(r.verdict).toBe("check");
    expect(r.items).toHaveLength(6);
    expect(r.items[0]).toMatchObject({ kind: "citation", by: "model", verify: expect.stringMatching(/court/) });
  });
  test("'solid' only with nothing to check and something actually checked; otherwise it says it cannot tell", async () => {
    expect((await secondLook("The sky is blue.", model(SOLID), sig())).verdict).toBe("solid");
    const empty = JSON.stringify({ verdict: "solid", items: [], checked: [], cantTell: [] });
    expect((await secondLook("The sky is blue.", model(empty), sig())).verdict).toBe("cant_tell");
    const cant = JSON.stringify({ verdict: "cant_tell", items: [], checked: [], cantTell: ["Whether this law changed this year"] });
    const r = await secondLook("The law says X.", model(cant), sig());
    expect(r.verdict).toBe("cant_tell");
    expect(r.cantTell).toEqual(["Whether this law changed this year"]);
  });
  test("an unreadable model answer: the maths findings still stand; with none, it fails in plain words", async () => {
    const r = await secondLook("120 × 4 = 460", model("not json at all"), sig());
    expect(r.verdict).toBe("check");
    expect(r.cantTell.join(" ")).toMatch(/could not be checked/i);
    await expect(secondLook("The sky is blue.", model("not json at all"), sig())).rejects.toThrow(/could not check/i);
  });
  test("a failed request with maths findings still shows them; without, the failure is passed on", async () => {
    const boom = () => { throw new Error("no_connection: Companion could not reach Claude (x)"); };
    const r = await secondLook("120 × 4 = 460", model(boom as never), sig());
    expect(r.items).toHaveLength(1);
    await expect(secondLook("The sky is blue.", model(boom as never), sig())).rejects.toThrow(/no_connection/);
  });
  test("secrets are hidden before anything is sent; the request uses Second Look's own instructions", async () => {
    const seen: { text: string; system?: string }[] = [];
    await secondLook("Use the key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 to call it.", model(SOLID, seen), sig());
    expect(seen[0].text).not.toContain("sk-ant-api03-abcdefghij");
    expect(seen[0].system).toBe(SECOND_LOOK_SYSTEM);
  });
  test("nothing selected is refused before anything is sent; a very long answer is cut and says so", async () => {
    const seen: { text: string }[] = [];
    await expect(secondLook("   ", model(SOLID, seen), sig())).rejects.toThrow(/Select an answer/);
    expect(seen.length).toBe(0);
    const r = await secondLook("word ".repeat(MAX_CHECKED_CHARS), model(SOLID, seen), sig());
    expect(seen[0].text.length).toBeLessThan(MAX_CHECKED_CHARS + 2000);
    expect(r.cantTell.join(" ")).toMatch(/only the first part/i);
    expect(r.verdict).not.toBe("solid");
  });
  test("the instructions ask for honesty: never fake certainty, say what cannot be checked, plain words, no searching claimed", () => {
    expect(SECOND_LOOK_SYSTEM).toMatch(/never/i);
    expect(SECOND_LOOK_SYSTEM).toMatch(/cant_tell/);
    expect(SECOND_LOOK_SYSTEM).toMatch(/plain words/i);
    expect(SECOND_LOOK_SYSTEM).toMatch(/cannot search|did not search|without searching/i);
  });
});

describe("false alarms (the real run flagged 3 of 15 clean answers)", () => {
  const flagged = (issue: string) => JSON.stringify({ verdict: "check", items: [{ kind: "number", claim: "30 + 45 + 75 = 150", issue, verify: "Add them up" }], checked: [], cantTell: [] });
  test("a finding that says in its own words that the claim holds is dropped, and the answer is solid", async () => {
    for (const issue of [
      "The sum is wrong. 30 + 45 + 75 = 150 is correct, so on recheck the addition holds.",
      "No error found here.",
      "On a second look this is correct and the total matches the rows.",
      "The listed items add up, so the total matches the rows.",
    ]) {
      const r = await secondLook("Three orders of $30, $45 and $75 add up to $150.", model(flagged(issue)), sig());
      expect(r.items, issue).toEqual([]);
      expect(r.verdict, issue).toBe("solid");
    }
  });
  test("a real problem that happens to use the word correct is kept", async () => {
    const r = await secondLook("x", model(flagged("The correct total is 160, not 150.")), sig());
    expect(r.items.length).toBe(1);
    expect(r.verdict).toBe("check");
  });
  test("a real caveat that uses the word holds is kept", async () => {
    const r = await secondLook("x", model(flagged("This only holds for small orders; a big order is priced differently.")), sig());
    expect(r.items.length).toBe(1);
  });
  test("the instructions say a missing unit or a general but safe answer is not a problem, and not to list what you then find sound", () => {
    expect(SECOND_LOOK_SYSTEM).toMatch(/missing (unit|detail)/i);
    expect(SECOND_LOOK_SYSTEM).toMatch(/never list/i);
  });
});

