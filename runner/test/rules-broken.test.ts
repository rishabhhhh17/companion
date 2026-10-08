import { describe, expect, test } from "bun:test";
import { parseReview } from "../src/proof/review.ts";

describe("review answers fail closed", () => {
  test("approve with concerns is treated as changes needed", () => {
    expect(parseReview('{"verdict":"approve","concerns":["the button does nothing"]}')).toEqual({ verdict: "changes", concerns: ["the button does nothing"] });
  });
  test("a plain approve is still an approve", () => {
    expect(parseReview('{"verdict":"approve","concerns":[]}')?.verdict).toBe("approve");
  });
});
