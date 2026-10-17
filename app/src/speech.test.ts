import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { askedByVoice, lineAnswers, lineFor, newReply, repliesIn, repliesOn, speakWhen, speechOn, spokenNote, VOICE_ASK_MS } from "./speech.ts";
import { initial, type Model } from "./model.ts";
import { S } from "./strings.ts";

const walk = (o: Record<string, unknown> = {}) => ({ id: "w1", index: 0, variant: "main", stage: "step", say: "Open settings.", ...o }) as never;

describe("what is said", () => {
  test("it is off unless turned on (and without storage it is off)", () => { expect(speechOn()).toBe(false); });
  test("a lesson step says its words, once per step and variant", () => {
    expect(lineFor({ walk: walk(), showme: null })).toEqual({ key: "walk:w1:0:main", text: "Open settings." });
    expect(lineFor({ walk: walk({ index: 1 }), showme: null })?.key).toBe("walk:w1:1:main");
    expect(lineFor({ walk: walk({ variant: "instead" }), showme: null })?.key).toBe("walk:w1:0:instead");
  });
  test("asking 'did that work' keeps the step's key, so the step is not said twice", () => {
    expect(lineFor({ walk: walk({ stage: "asking" }), showme: null })?.key).toBe("walk:w1:0:main");
  });
  test("after a pause, the step is said with the question, under its own key", () => {
    expect(lineFor({ walk: walk({ stage: "already" }), showme: null })).toEqual({ key: "walk:w1:0:already", text: "Open settings. Did you already do this?" });
  });
  test("help, done say something; stopped is silent", () => {
    expect(lineFor({ walk: walk({ stage: "help", note: "I could not tell." }), showme: null })?.text).toBe("I could not tell.");
    expect(lineFor({ walk: walk({ stage: "done" }), showme: null })?.text).toContain("All done");
    expect(lineFor({ walk: walk({ stage: "stopped", note: "Stopped." }), showme: null })).toBeNull();
  });
  test("while a lesson is on, the ring's caption is not also said", () => {
    expect(lineFor({ walk: walk(), showme: { stage: "pointing", message: "Click here", req: "sm_1" } })?.text).toBe("Open settings.");
  });
  test("a ring says its caption; a guess says it is a guess", () => {
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Click Save.", req: "sm_1" } })?.text).toBe("Click Save.");
    expect(lineFor({ walk: null, showme: { stage: "pointing_roughly", message: "Click Save.", req: "sm_1" } })?.text).toBe("I think it is here. Click Save.");
  });
  test("not being sure, a missing permission and an error are said in words; chatter is not", () => {
    for (const stage of ["not_sure", "needs_permission", "error", "window_changed"]) expect(lineFor({ walk: null, showme: { stage, message: "Words." } })?.text).toBe("Words.");
    for (const stage of ["looking", "thinking", "your_turn_done", "done_for_you", "your_turn_miss"]) expect(lineFor({ walk: null, showme: { stage, message: "x" } })).toBeNull();
    expect(lineFor({ walk: null, showme: null })).toBeNull();
  });
});

describe("answers said out loud for a question asked by voice (off by default, T13)", () => {
  test("it is off unless turned on (and without storage it is off)", () => { expect(repliesOn()).toBe(false); });
  test("Speak to me says short lines; Answer out loud says the whole short answer, only for a question asked by voice", () => {
    expect(speakWhen({ speech: false, replies: false, byVoice: true })).toEqual({ say: false, whole: false });
    expect(speakWhen({ speech: true, replies: false, byVoice: true })).toEqual({ say: true, whole: false });
    expect(speakWhen({ speech: false, replies: true, byVoice: true })).toEqual({ say: true, whole: true });
    expect(speakWhen({ speech: true, replies: true, byVoice: true })).toEqual({ say: true, whole: true });
    expect(speakWhen({ speech: false, replies: true, byVoice: false })).toEqual({ say: false, whole: false }, );
    expect(speakWhen({ speech: true, replies: true, byVoice: false })).toEqual({ say: true, whole: false });
  });
  test("a question counts as asked by voice for ten minutes after it was sent, and only for its own kind of answer", () => {
    const q = { kind: "task", at: 1000 } as const;
    expect(askedByVoice(null, "task", 1000)).toBe(false);
    expect(askedByVoice(q, "task", 1000 + VOICE_ASK_MS - 1)).toBe(true);
    expect(askedByVoice(q, "task", 1000 + VOICE_ASK_MS)).toBe(false);
    expect(askedByVoice({ kind: "task", at: 5000 }, "task", 4000)).toBe(false);
    // A task asked by voice does not make a research answer, a Show me line or a lesson count as its answer.
    expect(askedByVoice(q, "research", 2000)).toBe(false);
    expect(askedByVoice(q, "showme", 2000)).toBe(false);
    expect(askedByVoice({ kind: "showme", at: 1000 }, "showme", 2000)).toBe(true);
  });
  test("a Show me line answers a Show me question; a lesson's line answers no question, so it is never said whole", () => {
    const show = lineFor({ walk: null, showme: { stage: "pointing", message: "Click Save.", req: "sm_1" } })!;
    expect(lineAnswers(show.key)).toBe("showme");
    const lesson = lineFor({ walk: walk(), showme: null })!;
    expect(lineAnswers(lesson.key)).toBeNull();
    // Right after a question asked by voice, with only Answer out loud on, a lesson step is not said at all.
    const asked = { kind: "showme", at: 1000 } as const;
    const byVoice = (key: string) => { const k = lineAnswers(key); return k !== null && askedByVoice(asked, k, 2000); };
    expect(speakWhen({ speech: false, replies: true, byVoice: byVoice(lesson.key) })).toEqual({ say: false, whole: false });
    expect(speakWhen({ speech: false, replies: true, byVoice: byVoice(show.key) })).toEqual({ say: true, whole: true });
  });
  const m = (o: Partial<Model>): Model => ({ ...initial(), ...o });
  test("the answers on the card: a research answer and a finished task's result, each under its own key and kind", () => {
    const r = repliesIn(m({ research: { title: "Which host", answer: "Vercel fits this project best.", notes: [], file: "/p/.companion/research/a.md" } } as never));
    expect(r).toEqual([{ key: "research:/p/.companion/research/a.md", text: "Vercel fits this project best.", kind: "research" }]);
    const done = repliesIn(m({ receipt: { proof: "passed", checkpoint: "cp_0007", changed: [], commands: 0, notUndoable: [], usdEstimate: 0 } } as never));
    expect(done).toEqual([{ key: "receipt:cp_0007", text: S.proven, kind: "task" }]);
    // A rescue is started by its button, never by voice, so it is not an answer to say.
    expect(repliesIn(m({ rescue: { summary: "The site builds.", works: [], broken: "x", evidence: [] } } as never))).toEqual([]);
    expect(repliesIn(m({}))).toEqual([]);
  });
  test("a new answer is found even when an older one is still on the card", () => {
    const research = { title: "Which host", answer: "Vercel.", notes: [], file: "/p/r.md" };
    const before = repliesIn(m({ research } as never));
    const seen = new Set(before.map((x) => x.key));
    expect(newReply(before, seen)).toBeNull();
    // The task asked by voice finishes while the old research answer is still shown: its result is the new answer.
    const after = repliesIn(m({ research, receipt: { proof: "passed", checkpoint: "cp_0008", changed: [], commands: 0, notUndoable: [], usdEstimate: 0 } } as never));
    expect(newReply(after, seen)).toEqual({ key: "receipt:cp_0008", text: S.proven, kind: "task" });
    expect(newReply([], seen)).toBeNull();
  });
  test("when the sound is off nothing is said, and the card says so once", () => {
    expect(spokenNote({ said: false, why: "sound", sound: "muted", tell: true })).toBe(S.soundOffSaid);
    expect(spokenNote({ said: false, why: "sound", sound: "zero", tell: true })).toBe(S.soundOffSaid);
    expect(spokenNote({ said: false, why: "sound", sound: "muted", tell: false })).toBeNull();
    expect(spokenNote({ said: true })).toBeNull();
    for (const odd of [null, undefined, "x", 5, { tell: true }]) expect(spokenNote(odd)).toBeNull();
  });
  test("the card speaks through one place that knows both settings, passes whole answers on, and turns a sound note into a notice", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const calls = card.split("\n").filter((l) => l.includes('invoke("speak"'));
    // The card's own lines and replies go through sayIt; the Settings sample is the only other call (voicesettings.test.ts).
    expect(calls.length).toBe(2);
    const say = card.slice(card.indexOf("const sayIt ="), card.indexOf("\n", card.indexOf("const sayIt =")));
    expect(say).toContain('invoke("speak", { text, whole, rest: S.speakRest })');
    expect(say).toContain("spokenNote(");
    expect(card).toContain("speakWhen({ speech: speechOn(), replies: repliesOn(), byVoice: answersVoice(spoken.key) })");
    // The reply is the new answer of the kind the person asked for by voice, said once.
    const effect = card.slice(card.indexOf("const replyKeys ="), card.indexOf("}, [replyKeys]);"));
    expect(effect).toContain("newReply(all, seenReplies.current)");
    expect(effect).toContain("askedByVoice(voiceAsked.current, r.kind, Date.now())");
    expect(effect).toContain("voiceAsked.current = null");
  });
});
