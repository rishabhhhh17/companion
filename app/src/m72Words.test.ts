// M72 (make it work), the walkthrough's word items: one product name (item 7), one story on who pays (item 8, F29), the odd
// words (item 14), one name per action (item 15), and an explained "stop sharing" row (item 10).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S, PRODUCT } from "./strings.ts";
import { characterName } from "./companion.ts";
import { mainKeys, moreKeys, type PageId } from "./settingsPages.ts";
import { keyRows } from "./settings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
/** Every word a user can read in strings.ts: string values, and what each function says for sample arguments. */
function words(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "function") { try { const r = (v as (...a: unknown[]) => unknown)("x", "y", "z"); if (typeof r === "string") out.push(r); } catch { /* not a plain sentence */ } }
  else if (v && typeof v === "object") for (const x of Object.values(v)) words(x, out);
  return out;
}

describe("item 7: one product name", () => {
  test("no word a user reads names Flowflow: Squibby is the product, the water character is the water character", () => {
    const bad = words(S).filter((w) => /flowflow/i.test(w));
    expect(bad).toEqual([]);
  });
  test("the character's own name, when none is set, is the product's", () => {
    expect(characterName("")).toBe(PRODUCT);
    expect(characterName("Bob")).toBe("Bob");
    expect(read("./onboarding.tsx")).not.toContain("NAMES.character");
  });
});

describe("item 8: Settings tells one story on who pays (F29)", () => {
  const PAGES: PageId[] = ["account", "general", "look", "fixing", "flowflow", "keys", "privacy", "about"];
  const keys = [...new Set(PAGES.flatMap((p) => [...mainKeys(p), ...moreKeys(p)]))];
  const YOU_PAY = /your (own )?(claude|key)\b|small (extra )?cost|costs? (a little|more|less)|extra cost|cost on your|of your claude/i;
  test("no setting a customer sees says the person pays for the AI", () => {
    const set = S.set as Record<string, { label?: string; help?: string } | undefined>;
    const short = S.short as Record<string, string | undefined>;
    const bad = keys.filter((k) => YOU_PAY.test(`${set[k]?.help ?? ""} ${short[k] ?? ""}`));
    expect(bad).toEqual([]);
  });
  test("the Account page's own line says Squibby pays", () => {
    expect(S.setGroupFoot["account.plan"]).toContain(`${PRODUCT} pays`);
  });
});

describe("item 14: the odd words", () => {
  test("the step status says Doing it, not Now", () => {
    expect(S.practiceThread.state.now).not.toBe("Now");
  });
  test("Character's follow option says what each choice does", () => {
    const f = S.set["character.follow" as keyof typeof S.set] as { options: Record<string, string> };
    expect(Object.values(f.options).every((w) => w.split(" ").length >= 2)).toBe(true);
  });
  test("Reset all names nothing it could not read, and the pictures line is plain", () => {
    expect(JSON.stringify(S)).not.toContain("could not read them yet");
    expect(S.setResetAllSure("x")).not.toContain("allows");
  });
  test("no Any let go", () => {
    expect(JSON.stringify(S)).not.toMatch(/Any let go/i);
  });
});

describe("item 15: one name per action", () => {
  test("the key is called Check my project everywhere: the first run and Settings, Keys and voice", () => {
    expect(S.screens.welcomeKey).toBe(S.keyJobs.problem);
    const row = keyRows({ using: {}, picked: {} } as never).find((r) => r.job === "problem");
    expect(row?.name).toBe(S.keyJobs.problem);
  });
  test("the hover panel's button over a failed check says Fix it, as Home does, and does what Home's Fix it does", () => {
    expect(S.notch.quick.fix).toBe(S.review.fix);
    expect(JSON.stringify(S)).not.toContain("Find and fix the problem");
    expect(read("./card.tsx")).toContain('if (t.do === "find") { if (homeStatus(nowModel.current, project, Date.now()).kind === "failing") fixKnown(); else findFromHome(); }');
  });
});

describe("item 10: Stop sharing these notes is explained", () => {
  test("the row says what the other AI tools are and what Remove does", () => {
    expect(S.agentsRemoveHelp.length).toBeGreaterThan(40);
    expect(S.agentsRemoveHelp).toMatch(/AGENTS\.md|CLAUDE\.md|file/i);
  });
});
