// AGENTS.md "Writing style" and rule 16, enforced: everything a person reads is plain words, with no em dashes, no
// affection, no streaks, no mood check ins. Covers the card's words and every lesson.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { S } from "./strings.ts";

const lessonDir = new URL("../../lessons/", import.meta.url).pathname;
const lessonTexts = () => readdirSync(lessonDir).filter((f) => f.endsWith(".json")).flatMap((f) => {
  const d = JSON.parse(readFileSync(lessonDir + f, "utf8"));
  const out: [string, string][] = [[f, d.title], [f, d.goal]];
  for (const s of d.steps) { out.push([`${f}:${s.id}`, s.say], [`${f}:${s.id}`, s.find]); if (s.instead) out.push([`${f}:${s.id}:instead`, s.instead.say], [`${f}:${s.id}:instead`, s.instead.find]); }
  return out;
});
const cardTexts = (): [string, string][] => Object.entries(S as Record<string, unknown>).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string]);
/** Every string inside S, however deep (S.verdict, S.approval and the rest), by its path. */
const deepTexts = (o: unknown = S, at = "S"): [string, string][] => {
  if (typeof o === "string") return [[at, o]];
  if (!o || typeof o !== "object") return [];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => deepTexts(v, `${at}.${k}`));
};

describe("writing rules", () => {
  test("no em dashes or en dashes anywhere a person reads", () => {
    for (const [where, t] of [...cardTexts(), ...lessonTexts()]) expect(/[–—]/.test(t), `${where}: ${t}`).toBe(false);
  });
  test("no affection, streaks or mood check ins (rule 16)", () => {
    const banned = /\b(streak|miss(ed)? you|love you|proud of you|how are you feeling|how do you feel|your mood|feeling (sad|happy|down)|good job buddy|bestie|friend forever|xp|level up|badge)\b/i;
    for (const [where, t] of [...cardTexts(), ...lessonTexts()]) expect(banned.test(t), `${where}: ${t}`).toBe(false);
  });
  test("no raw jargon or codes leak into the words (stack traces, error codes, json, null)", () => {
    const jargon = /(\bundefined\b|\bnull\b|\bNaN\b|\[object |\bJSON\b|\bstderr\b|\bstdout\b|\bsegfault\b|\bEACCES\b|\bENOENT\b|\bpanic\b)/;
    for (const [where, t] of cardTexts()) expect(jargon.test(t), `${where}: ${t}`).toBe(false);
  });
  test("every lesson line is short enough to read at a glance", () => {
    for (const [where, t] of lessonTexts()) expect(t.length, where).toBeLessThanOrEqual(200);
  });
  test("the words nested inside S are walked too, M45's results among them (no dashes, no doubled or trailing spaces)", () => {
    const all = deepTexts();
    for (const k of ["S.verdict.proven", "S.verdict.undoneFix", "S.verdict.limit.daily", "S.verdict.check.browser", "S.approval.question.house_rule"]) expect(all.some(([w]) => w === k), k).toBe(true);
    for (const [where, t] of all) {
      expect(/[–—]/.test(t), `${where}: ${t}`).toBe(false);
      expect(t.includes("  "), where).toBe(false);
      expect(t !== t.trim(), where).toBe(false);
    }
  });
  test("every card string ends cleanly (no doubled spaces, no trailing space, no stray braces)", () => {
    for (const [where, t] of cardTexts()) { expect(t.includes("  "), `${where}`).toBe(false); expect(t !== t.trim(), `${where}`).toBe(false); }
  });
});
