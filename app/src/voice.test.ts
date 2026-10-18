import { describe, expect, test } from "bun:test";
import { characterWords, initial, reduce, visualState, type Model } from "./model.ts";
import { S } from "./strings.ts";

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

describe("the microphone in use, in one plain line", () => {
  test("a picked microphone that is not connected: the default listens, said once as a notice", () => {
    const m = run([{ type: "app.voice", stage: "listening", message: "Listening.", micMissing: "AirPods Pro", micUsing: "MacBook Pro Microphone" }]);
    expect(m.notice).toBe(S.micUsingDefault("AirPods Pro", "MacBook Pro Microphone"));
    expect(m.voice?.stage).toBe("listening");
    expect(run([{ type: "app.voice", stage: "listening", message: "Listening." }]).notice).toBeNull();
  });
  test("another microphone took over while talking, or the one in use went away: said, and the words are still kept", () => {
    const m = run([{ type: "app.voice", stage: "heard", message: "", text: "deploy it", micSwitched: "MacBook Pro Microphone" }]);
    expect(m.notice).toBe(S.micSwitched("MacBook Pro Microphone"));
    expect(m.voice?.text).toBe("deploy it");
    expect(run([{ type: "app.voice", stage: "silent", message: "x", micLost: true }]).notice).toBe(S.micLost);
    // Another one took over and then went away too: the line says it went away, never that the other one listened.
    expect(run([{ type: "app.voice", stage: "heard", message: "", text: "deploy", micSwitched: "MacBook Pro Microphone", micLost: true }]).notice).toBe(S.micLost);
  });
  test("odd values are ignored, never shown", () => {
    expect(run([{ type: "app.voice", stage: "listening", message: "x", micMissing: 5, micSwitched: {} }]).notice).toBeNull();
  });
});

describe("what the character looks like", () => {
  test("listening, looking at the screen, understanding and pointing each look different from ready", () => {
    expect(visualState(run([{ type: "app.voice", stage: "listening", message: "" }]))).toBe("listening");
    expect(visualState(run([{ type: "app.showme", stage: "looking", message: "" }]))).toBe("checking");
    expect(visualState(run([{ type: "app.voice", stage: "transcribing", message: "" }]))).toBe("thinking");
    expect(visualState(run([{ type: "app.showme", stage: "pointing", message: "" }]))).toBe("needsYou");
    expect(visualState(initial())).toBe("idle");
  });
  test("when nothing special is happening it follows the agents", () => {
    expect(visualState(run([{ type: "agent.state", agent: "a", state: "working" }]))).toBe("working");
  });
});
