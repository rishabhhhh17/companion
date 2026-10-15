// The daily spending limit row in Settings: what today's spend is against the limit, and changing the limit.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { setSpendingLimit, showSpending } from "./commands.ts";
import { initial, reduce, type Model } from "./model.ts";
import { limitFromText, spendingLine } from "./settings.ts";
import { S } from "./strings.ts";

const run = (events: Record<string, unknown>[], from: Model = initial()): Model => events.reduce<Model>((m, e) => reduce(m, e), from);
const state = (extra: Record<string, unknown> = {}) => ({ type: "spending.state", project: "/p", limitUsd: 10, spentUsd: 0.42, minUsd: 1, maxUsd: 500, ...extra });

describe("the commands are valid protocol", () => {
  test("show and set", () => {
    expect(parseCommand(serialize(showSpending("/p"))).ok).toBe(true);
    expect(parseCommand(serialize(setSpendingLimit("/p", 25))).ok).toBe(true);
    expect((setSpendingLimit("/p", 25) as any).limitUsd).toBe(25);
  });
});

describe("the reducer", () => {
  test("starts with nothing known", () => expect(initial().spending).toBeNull());
  test("keeps what the engine said", () => {
    expect(run([state()]).spending).toEqual({ project: "/p", limitUsd: 10, spentUsd: 0.42, minUsd: 1, maxUsd: 500 });
  });
  test("a refusal is kept with the unchanged limit, and the next answer clears it", () => {
    const refused = run([state({ problem: "The daily limit must be between 1 and 500 dollars." })]);
    expect(refused.spending).toMatchObject({ limitUsd: 10, problem: "The daily limit must be between 1 and 500 dollars." });
    expect(run([state({ limitUsd: 25 })], refused).spending).toEqual({ project: "/p", limitUsd: 25, spentUsd: 0.42, minUsd: 1, maxUsd: 500 });
  });
  test("an answer with damaged numbers is ignored", () => {
    expect(run([state({ limitUsd: "lots" })]).spending).toBeNull();
    expect(run([state({ spentUsd: -1 })]).spending).toBeNull();
  });
  test("a different folder forgets the old project's spending", () => {
    expect(run([state(), { type: "ui.projectChanged", project: "/q" }]).spending).toBeNull();
  });
});

describe("in plain words", () => {
  test("today's spend against the limit, labelled an estimate", () => {
    expect(spendingLine({ project: "/p", limitUsd: 10, spentUsd: 0.42, minUsd: 1, maxUsd: 500 })).toBe("Today this project has used about $0.42 of its $10 a day.");
    expect(spendingLine({ project: "/p", limitUsd: 12.5, spentUsd: 0, minUsd: 1, maxUsd: 500 })).toBe("Today this project has used about $0.00 of its $12.50 a day.");
  });
  test("at or over the limit it says new work waits until tomorrow", () => {
    expect(spendingLine({ project: "/p", limitUsd: 10, spentUsd: 10.2, minUsd: 1, maxUsd: 500 })).toBe("Today this project has used about $10.20 of its $10 a day. New work waits until tomorrow, or raise the limit.");
  });
  test("the words for the row are plain and have no dashes", () => {
    for (const k of ["spendingTitle", "spendingHelp", "spendingLabel", "spendingSave", "spendingNoProject", "spendingRange"] as const) {
      expect(typeof S[k]).toBe("string");
      expect(/[–—]/.test(S[k])).toBe(false);
    }
  });
});

describe("reading what the person typed", () => {
  test("a whole or decimal amount within the bounds", () => {
    expect(limitFromText("25", 1, 500)).toBe(25);
    expect(limitFromText(" 12.50 ", 1, 500)).toBe(12.5);
    expect(limitFromText("$40", 1, 500)).toBe(40);
    expect(limitFromText("1", 1, 500)).toBe(1);
    expect(limitFromText("500", 1, 500)).toBe(500);
  });
  test("anything else is not an amount", () => {
    for (const t of ["", "  ", "abc", "0.5", "501", "1e3", "-5", "12.345", "10,5", "Infinity", "NaN", "0x20"]) expect(limitFromText(t, 1, 500), t).toBeNull();
  });
});
