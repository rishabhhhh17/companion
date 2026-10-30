import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { askedByVoice, followVoiceShowMe, lineAnswers, lineByVoice, lineFor, newReply, repliesIn, repliesOn, speakWhen, speechOn, spokenNote, voiceShowMe, VOICE_ASK_MS, type VoiceQuestion } from "./speech.ts";
import { initial, reduce, type Model } from "./model.ts";
import { KEYS_START, setKeysNow, type Keys } from "./keys.ts";
import { S, PRODUCT } from "./strings.ts";

const walk = (o: Record<string, unknown> = {}) => ({ id: "w1", index: 0, variant: "main", stage: "step", say: "Open settings.", ...o }) as never;

describe("what is said", () => {
  test("it is off unless turned on (and without storage it is off)", () => { expect(speechOn()).toBe(false); });
  test("a lesson step says its words, once per step and variant", () => {
    expect(lineFor({ walk: walk(), showme: null })).toEqual({ key: "walk:w1:0:main", text: "Open settings." });
    expect(lineFor({ walk: walk({ index: 1 }), showme: null })?.key).toBe("walk:w1:1:main");
    expect(lineFor({ walk: walk({ variant: "instead" }), showme: null })?.key).toBe("walk:w1:0:instead");
  });
  test("a lesson names the keys in use when it is said, not when it arrived", () => {
    const say = `Press Control, Option, Command and F in ${PRODUCT}.`;
    const moved: Keys = { using: { ...KEYS_START.using, problem: "control-option-command-p" }, picked: { ...KEYS_START.picked, problem: "control-option-command-p" } };
    expect(lineFor({ walk: walk({ say }), showme: null }, moved)?.text).toBe(`Press Control, Option, Command and P in ${PRODUCT}.`);
    expect(lineFor({ walk: walk({ say, stage: "already" }), showme: null }, moved)?.text).toBe(`Press Control, Option, Command and P in ${PRODUCT}. ${S.lessonAlready}`);
    expect(lineFor({ walk: walk({ stage: "help", note: say }), showme: null }, moved)?.text).toBe(`Press Control, Option, Command and P in ${PRODUCT}.`);
    // By default the keys in use now, so a change in Settings is said from then on, under the same key (not said twice).
    setKeysNow(moved);
    try { expect(lineFor({ walk: walk({ say }), showme: null })).toEqual({ key: "walk:w1:0:main", text: `Press Control, Option, Command and P in ${PRODUCT}.` }); }
    finally { setKeysNow(KEYS_START); }
    // A job without keys: never keys that do not work, and where to pick others.
    const off = lineFor({ walk: walk({ say }), showme: null }, { ...moved, using: { ...moved.using, problem: null } })?.text ?? "";
    expect(off).not.toContain("Control, Option, Command and F");
    expect(off).toContain(S.keyHintOff.replace("{job}", "Point at the problem"));
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
  test("a Show me line answers the Show me request it names; a lesson's line answers no question, so it is never said whole", () => {
    const show = lineFor({ walk: null, showme: { stage: "pointing", message: "Click Save.", req: "sm_1" } })!;
    expect(lineAnswers(show.key)).toEqual({ kind: "showme", req: "sm_1" });
    const lesson = lineFor({ walk: walk(), showme: null })!;
    expect(lineAnswers(lesson.key)).toBeNull();
    // Right after a question asked by voice, with only Answer out loud on, a lesson step is not said at all.
    const asked = { kind: "showme", at: 1000, req: "sm_1" } as const;
    expect(speakWhen({ speech: false, replies: true, byVoice: lineByVoice(asked, lesson.key, 2000) })).toEqual({ say: false, whole: false });
    expect(speakWhen({ speech: false, replies: true, byVoice: lineByVoice(asked, show.key, 2000) })).toEqual({ say: true, whole: true });
  });
  const m = (o: Partial<Model>): Model => ({ ...initial(), ...o });
  test("the answers on the card: a research answer and a finished task's result, each under its own key and kind", () => {
    const r = repliesIn(m({ research: { title: "Which host", answer: "Vercel fits this project best.", notes: [], file: ".companion/research/a.md" } } as never), "/p");
    expect(r).toEqual([{ key: "research:/p:.companion/research/a.md", text: "Vercel fits this project best.", kind: "research" }]);
    const done = repliesIn(m({ receipt: { proof: "passed", checkpoint: "cp_0007", changed: [], commands: 0, notUndoable: [], usdEstimate: 0 } } as never), "/p");
    expect(done).toEqual([{ key: "receipt:/p:cp_0007", text: "Fixed and proven.", kind: "task" }]);
    // A rescue is started by its button, never by voice, so it is not an answer to say.
    expect(repliesIn(m({ rescue: { summary: "The site builds.", works: [], broken: "x", evidence: [] } } as never), "/p")).toEqual([]);
    expect(repliesIn(m({}), "/p")).toEqual([]);
  });
  test("the reply after a limit stop names the limit (M45)", () => {
    const r = repliesIn(m({ receipt: { proof: "skipped", checkpoint: "cp_0009", changed: [{ file: "a.js", kind: "modified" }], commands: 1, notUndoable: [], usdEstimate: 3, end: "limit", limit: "spending" } } as never), "/p");
    expect(r[0].text).toBe(`${S.verdict.limit.spending}. ${S.verdict.limitChanged}`);
    expect(r[0].key).toBe("receipt:/p:cp_0009");
  });
  // Found in the M11 audit (A65): an answer asked off the record has no file, so every such answer had the same key and only
  // the first was ever said, though the next ones were asked by voice too.
  test("each research answer has its own key, off the record too", () => {
    const run = (events: Record<string, unknown>[]) => events.reduce<Model>((x, e) => reduce(x, e as never), initial());
    const answer = (t: string) => ({ v: 1, id: "e", type: "research.done", agent: "builder-1", title: t, answer: `${t} answer.`, notes: [] });
    const first = run([answer("Login")]), second = run([answer("Login"), answer("Payments")]);
    const seen = new Set(repliesIn(first, "/p").map((r) => r.key));
    expect(newReply(repliesIn(second, "/p"), seen)?.text).toBe("Payments answer.");
  });
  test("a new answer is found even when an older one is still on the card", () => {
    const research = { title: "Which host", answer: "Vercel.", notes: [], file: ".companion/research/r.md" };
    const before = repliesIn(m({ research } as never), "/p");
    const seen = new Set(before.map((x) => x.key));
    expect(newReply(before, seen)).toBeNull();
    // The task asked by voice finishes while the old research answer is still shown: its result is the new answer.
    const after = repliesIn(m({ research, receipt: { proof: "passed", checkpoint: "cp_0008", changed: [], commands: 0, notUndoable: [], usdEstimate: 0 } } as never), "/p");
    expect(newReply(after, seen)).toEqual({ key: "receipt:/p:cp_0008", text: "Fixed and proven.", kind: "task" });
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
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const calls = (card + "\n" + page).split("\n").filter((l) => l.includes('invoke("speak"'));
    // The card's own lines and replies go through sayIt; the Settings sample is the only other call (voicesettings.test.ts).
    expect(calls.length).toBe(2);
    expect(card.split("\n").filter((l) => l.includes('invoke("speak"')).length).toBe(1);
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

// Found in review, 18 Oct 2026: with Speak to me off and Answer out loud on, any Show me line counted as the answer to a
// Show me asked by voice, for ten minutes. Point at the problem's line, the "type what you want to find" hint and a window
// that changed were said whole, sounds nobody asked for. A Show me asked by voice now counts only its own request's lines.
describe("a Show me asked by voice counts only its own answer", () => {
  const asked: VoiceQuestion = { kind: "showme", at: 1000 };
  const thinking = (req: string) => ({ type: "app.showme", stage: "thinking", message: "Finding it", req });
  const show = (stage: string, req?: string, more: Record<string, unknown> = {}) => ({ stage, message: "Click Save.", ...(req ? { req } : {}), ...more });
  // What is said with Speak to me off and Answer out loud on (null: the card has no line for it).
  const said = (q: VoiceQuestion, s: ReturnType<typeof show>, now = 2000) => {
    const line = lineFor({ walk: null, showme: s as never });
    return line ? speakWhen({ speech: false, replies: true, byVoice: lineByVoice(q, line.key, now) }) : null;
  };
  const quiet = { say: false, whole: false }, whole = { say: true, whole: true };
  const mine = followVoiceShowMe(asked, thinking("sm_7"));

  test("it takes the request its Finding it names, and that answer's lines are said whole", () => {
    expect(mine).toEqual({ kind: "showme", at: 1000, req: "sm_7" });
    expect(said(mine, show("pointing", "sm_7"))).toEqual(whole);
    expect(said(mine, show("pointing_roughly", "sm_7", { step: 1, of: 2 }))).toEqual(whole);
    expect(said(mine, show("not_sure", "sm_7", { step: 2, of: 2 }))).toEqual(whole);   // a step said in words
    expect(voiceShowMe(mine, "sm_7", 2000)).toBe(true);
  });
  test("then Point at the problem, the empty box hint and a window that changed are not said", () => {
    expect(said(mine, show("pointing"))).toEqual(quiet);   // Point at the problem's ring carries no Show me request
    expect(said(mine, show("pointing_roughly"))).toEqual(quiet);
    expect(said(mine, show("error"))).toEqual(quiet);   // Show me pressed with an empty box
    expect(said(mine, show("window_changed"))).toEqual(quiet);
    // With Speak to me on they are said as short lines, as before.
    const line = lineFor({ walk: null, showme: show("pointing") as never })!;
    expect(speakWhen({ speech: true, replies: true, byVoice: lineByVoice(mine, line.key, 2000) })).toEqual({ say: true, whole: false });
  });
  test("before its request is known no Show me line counts, and another request never does", () => {
    expect(said(asked, show("pointing", "sm_7"))).toEqual(quiet);
    expect(said(mine, show("pointing", "sm_8"))).toEqual(quiet);
    expect(voiceShowMe(asked, "sm_7", 2000)).toBe(false);
    expect(voiceShowMe(mine, "sm_8", 2000)).toBe(false);
    expect(voiceShowMe(mine, "sm_7", 1000 + VOICE_ASK_MS)).toBe(false);   // ten minutes at most
  });
  test("another Show me taking the pointer ends it (a typed one, a lesson's step)", () => {
    expect(followVoiceShowMe(mine, thinking("sm_8"))).toBeNull();
    expect(followVoiceShowMe(mine, thinking("sm_7"))).toEqual(mine);   // its own Finding it again changes nothing
  });
  test("it ends when its answer ends: the click, Do it for me, an error, a missing permission, a window that changed", () => {
    for (const stage of ["your_turn_done", "done_for_you", "error", "needs_permission", "window_changed"]) expect(followVoiceShowMe(mine, { type: "app.showme", stage })).toBeNull();
    expect(followVoiceShowMe(asked, { type: "app.showme", stage: "error" })).toBeNull();   // a password box was active: nothing was looked at
    expect(followVoiceShowMe(mine, { type: "assist.error", req: "sm_7" })).toBeNull();   // it could not find it
    expect(followVoiceShowMe(mine, { type: "assist.error", req: "ph_1" })).toEqual(mine);   // Prompt help's, not this one's
  });
  test("its own steps, a miss and the pointer going away before a step said in words do not end it", () => {
    // The last step said in words clears the pointer first ("done"), then its words come: they are still its answer.
    for (const stage of ["looking", "pointing", "pointing_roughly", "your_turn_miss", "done"]) expect(followVoiceShowMe(mine, { type: "app.showme", stage, req: "sm_7" })).toEqual(mine);
    for (const odd of [null, undefined, 5, "x", {}]) expect(followVoiceShowMe(mine, odd)).toEqual(mine);
  });
  test("a question of another kind is left alone", () => {
    const task: VoiceQuestion = { kind: "task", at: 1000 };
    expect(followVoiceShowMe(task, { type: "app.showme", stage: "error" })).toEqual(task);
    expect(followVoiceShowMe(task, thinking("sm_9"))).toEqual(task);
    expect(followVoiceShowMe(null, thinking("sm_9"))).toBeNull();
  });
  test("the card follows Show me's events, times a voice Show me as spoken, and every pressed flow ends a voice question", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("voiceAsked.current = followVoiceShowMe(voiceAsked.current, ev)");
    expect(card).toContain("const answersVoice = (key: string) => lineByVoice(voiceAsked.current, key, Date.now());");
    // The answer's timing: spoken when either switch says it will be, at the picked speed.
    const point = card.slice(card.indexOf('if (ev.type !== "assist.point"'), card.indexOf("player.current.start(steps"));
    expect(point).toContain("const speaking = speakWhen({ speech: speechOn(), replies: repliesOn(), byVoice: voiceShowMe(voiceAsked.current, req, Date.now()) }).say;");
    expect(point).toContain("const speed = spokenSpeed();");
    expect(point).toContain("lineMs(s.text, speaking, speed, pace)");   // and at the chosen pace (pointtalk.test.ts)
    expect(card).toContain("player.current.start(steps, { aim, words }, speaking, speed, pace);");
    expect(card).not.toMatch(/const speaking = speechOn\(\)/);
    // Pressed, not asked by voice: the hero key, Find the problem, Do it for me, Show me with an empty box, rescue, a lesson.
    const findKey = card.slice(card.indexOf("latest.current.find = (payload: unknown) => {"), card.indexOf("const findFromHome ="));   // the key and the Find the problem chip
    expect(findKey).toContain("pressed();");
    for (const l of card.split("\n").filter((x) => x.includes('invoke("do_it_for_me")') || x.includes("send(findProblem(project))") || x.includes("message: S.showMeHint"))) expect(l).toContain("pressed();");
    expect(card.slice(card.indexOf("const rescue = () => {"), card.indexOf("const rescue = () => {") + 200)).toContain("pressed();");
    expect(card.slice(card.indexOf("const beginLesson = "), card.indexOf("const beginLesson = ") + 300)).toContain("pressed();");
  });
});

// Found in review, 18 Oct 2026: a reply's key was its checkpoint alone, and checkpoints are numbered per project (each
// project's shadow history starts again at cp_0001). After the practice fix ended with cp_0001, the first task asked by
// voice in the person's own project also ended with cp_0001, so its answer was never said, and the question stayed open
// for ten minutes for the next pressed flow's answer. Research notes are named per project too.
describe("answers in another project", () => {
  const m = (o: Partial<Model>): Model => ({ ...initial(), ...o });
  const receipt = (checkpoint: string) => ({ proof: "passed", checkpoint, changed: [], commands: 0, notUndoable: [], usdEstimate: 0 });
  test("the first receipt in another project is a new answer, though its checkpoint has the same number", () => {
    const seen = new Set(repliesIn(m({ receipt: receipt("cp_0001") } as never), "/Users/me/practice").map((x) => x.key));
    const mine = repliesIn(m({ receipt: receipt("cp_0001") } as never), "/Users/me/shop");
    expect(newReply(mine, seen)).toEqual({ key: "receipt:/Users/me/shop:cp_0001", text: "Fixed and proven.", kind: "task" });
    // The same answer in the same project is still said only once.
    for (const x of mine) seen.add(x.key);
    expect(newReply(repliesIn(m({ receipt: receipt("cp_0001") } as never), "/Users/me/shop"), seen)).toBeNull();
  });
  test("a research note with the same name in another project is a new answer", () => {
    const research = { title: "Which host", answer: "Vercel.", notes: [], file: ".companion/research/2026-10-18-which-host.md" };
    const seen = new Set(repliesIn(m({ research } as never), "/a").map((x) => x.key));
    expect(newReply(repliesIn(m({ research } as never), "/b"), seen)?.kind).toBe("research");
  });
  test("the card keys answers by its project, forgets them and any open voice question when the project changes", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const effect = card.slice(card.indexOf("const seenReplies ="), card.indexOf("}, [replyKeys]);"));
    expect(effect).toContain("repliesIn(m, project).map((r) => r.key)");
    expect(effect).toContain("const all = repliesIn(m, project);");
    expect(card).not.toMatch(/repliesIn\(m\)/);
    const changed = card.slice(card.indexOf("// Another project:"), card.indexOf("// Another project:") + 500);
    expect(changed).toContain('listen("project-changed"');
    expect(changed).toContain("seenReplies.current.clear();");
    expect(changed).toContain("voiceAsked.current = null;");
  });
  test("a typed follow up, Try again, the error explainer's Fix it and Let me try the next one are pressed, not asked by voice", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const followUp = card.slice(card.indexOf("<FollowUpBox project={project}"), card.indexOf("<FollowUpBox project={project}") + 400);
    expect(followUp).toContain("onSent={followSent}");
    // Typed words and Try again are pressed; only words hold to talk put in the box count as asked by voice.
    const sent = card.slice(card.indexOf("const followSent = "), card.indexOf("\n", card.indexOf("const followSent = ")));
    expect(sent).toMatch(/if \(words && followFromVoice\.current\) voiceAsked\.current = \{ kind: "task", at: Date\.now\(\) \}; else pressed\(\);/);
    const box = card.slice(card.indexOf("function FollowUpBox("), card.indexOf("function ExplainBox("));
    expect(box).toContain("onSent(false); void send(retryTask(project)).catch(onRefused);");
    expect(card).toMatch(/setText=\{\(t\) => \{ setFollowText\(t\); if \(!t\) followFromVoice\.current = false; \}\}/);
    const fix = card.split("\n").find((l) => l.includes("send(fixError("))!;
    expect(fix).toContain("pressed();");
    expect(card.slice(card.indexOf("const tryTheNextOne = "), card.indexOf("const tryTheNextOne = ") + 200)).toContain("pressed();");
  });
});
