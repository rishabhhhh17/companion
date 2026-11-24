// Tokenization reduction (docs/milestones + the M121 follow on): the pure helpers that keep a conversation's context
// small before it goes to the model, so the same task does not pay for every old turn it has ever had.
// Tests first: the trim keeps what must stay and never invents words.
import { describe, expect, test } from "bun:test";
import { roughTokens, totalTokens, trimHistory, type ReduceableMessage } from "../src/tokenReduce.ts";

const turn = (role: "user" | "assistant", words: number): ReduceableMessage => ({ role, content: "w".repeat(words * 4) });

describe("token reduction: rough count", () => {
  test("counts roughly four characters a token", () => {
    expect(roughTokens("")).toBe(0);
    expect(roughTokens("abcd")).toBe(1);
    expect(roughTokens("abcde")).toBe(2);
  });
});

describe("token reduction: the whole context", () => {
  test("adds the system prompt and each turn", () => {
    expect(totalTokens([turn("user", 10), turn("assistant", 5)], "sys")).toBe(roughTokens("sys") + roughTokens("w".repeat(40)) + roughTokens("w".repeat(20)));
  });
});

describe("token reduction: trimming history", () => {
  test("keeps the newest turns when the old ones push past the cap", () => {
    const messages = [turn("user", 10), turn("assistant", 10), turn("user", 10), turn("assistant", 10), turn("user", 10), turn("assistant", 10)];
    const kept = trimHistory(messages, 4, 25);
    expect(kept).toHaveLength(2);
    expect(kept[0]!.content.length).toBe(40);
    expect(kept[0]!.role).toBe("user");
  });

  // The 24 Nov review: the Messages API needs the first turn to be the person's, so a trimmed list never starts with an
  // assistant turn.
  test("never starts with an assistant turn", () => {
    const messages = [turn("user", 10), turn("assistant", 10), turn("user", 10), turn("assistant", 10), turn("user", 10), turn("assistant", 10)];
    for (const keep of [1, 2, 3, 4, 5, 6]) for (const cap of [10, 25, 50, 1000]) {
      const kept = trimHistory(messages, keep, cap);
      if (kept.length) expect(kept[0]!.role).toBe("user");
    }
    expect(trimHistory(messages, 3, 1000).map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(trimHistory([turn("user", 2), turn("assistant", 2)], 1, 1000)).toEqual([]);
  });

  test("keeps every turn when the context fits", () => {
    const messages = [turn("user", 2), turn("assistant", 2)];
    expect(trimHistory(messages, 3, 1000)).toHaveLength(2);
  });

  test("never drops below the newest turn it keeps", () => {
    const messages = [turn("user", 40), turn("assistant", 40), turn("user", 40)];
    expect(trimHistory(messages, 1, 100)).toHaveLength(1);
    expect(trimHistory(messages, 1, 100)[0]!.role).toBe("user");
  });
});
