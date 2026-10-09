import { describe, expect, test } from "bun:test";
import { characterWords, initial, reduce, type Model } from "./model.ts";

const run = (events: Record<string, unknown>[], from: Model = initial()): Model => events.reduce<Model>((m, e) => reduce(m, e), from);

describe("hold to talk in the pages", () => {
  test("listening and understanding are shown on the character", () => {
    expect(characterWords(run([{ type: "app.voice", stage: "listening", message: "Listening" }]))).toBe("Listening");
    expect(characterWords(run([{ type: "app.voice", stage: "transcribing", message: "x" }]))).toBe("Understanding you");
  });
  test("the download shows how far it is", () => {
    const m = run([{ type: "app.voice", stage: "downloading", message: "Downloading", percent: 42 }]);
    expect(m.voice).toMatchObject({ stage: "downloading", percent: 42 });
  });
  test("a quick tap that heard nothing clears the panel", () => {
    expect(run([{ type: "app.voice", stage: "listening", message: "x" }, { type: "app.voice", stage: "idle", message: "" }]).voice).toBeNull();
  });
  test("what was heard is kept for the box, and the panel can be closed", () => {
    const m = run([{ type: "app.voice", stage: "heard", message: "", text: "how do I deploy" }]);
    expect(m.voice!.text).toBe("how do I deploy");
    expect(run([{ type: "ui.voiceClosed" }], m).voice).toBeNull();
  });
});
