// M11 area 5 (Settings, the registry T16): pointing, talking and other apps, page side. Each setting's usual value keeps
// today's behaviour exactly, each edge of its range changes it, and the fixed parts (rule 22's guess ring, the cap on
// hold to talk, what may never be said, the apps never to read) hold for every value. Plain code and the source of the
// pages, so it runs without a screen.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { captionPlace, captionStyle, flightMs, GUESS_LOOK, guessWords, notSureWords, paceFactor, RING_MS, ringLook, ringMsOf } from "./pointer.ts";
import { afterMs, AFTER_MS, flightFor, leadMs, LEAD_MS, lineMs, planSteps, play, startTimes, type Target } from "./sequence.ts";
import { alsoSayLines, lineFor } from "./speech.ts";
import { initial, reduce, type Model } from "./model.ts";
import { appAnswersFrom, answerOp, forgetAllCount, needsConfirm, neverFrontOp } from "./appanswers.ts";
import { addCallApp, BUILT_IN_CALL_APPS, callAppRows, MAX_ADDED_CALL_APPS, toggleCallApp } from "./callapps.ts";
import { checkRegistry, defOf, validateKey } from "../../protocol/settings.ts";
import { problemWords, rowModel, valueWords } from "./settingsRows.ts";
import { S, PRODUCT } from "./strings.ts";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("How long a ring stays (point.ringSeconds)", () => {
  test("the time the shell sends is used, kept inside 5 to 30 seconds; nothing sent is the usual ten", () => {
    expect(ringMsOf(undefined)).toBe(RING_MS);
    expect(ringMsOf(null)).toBe(RING_MS);
    expect(ringMsOf("12000")).toBe(RING_MS);
    expect(ringMsOf(Number.NaN)).toBe(RING_MS);
    expect(ringMsOf(10_000)).toBe(10_000);
    expect(ringMsOf(5_000)).toBe(5_000);
    expect(ringMsOf(30_000)).toBe(30_000);
    expect(ringMsOf(1_000)).toBe(5_000);
    expect(ringMsOf(3_600_000)).toBe(30_000);
  });
  test("the overlay uses the time sent with each ring, so it and the shell's watch come from the same setting", () => {
    const overlay = src("./overlay.ts");
    expect(overlay).toContain("setTimeout(clear, ringMsOf(p.ringMs))");
    expect(overlay).not.toContain("setTimeout(clear, RING_MS)");
    expect(src("../src-tauri/src/main.rs")).toContain('"ringMs": ring');
  });
});

describe("Ring colour (point.colour) and Ring lettering (point.lettering)", () => {
  test("the usual colour is the brand lime (M28; stored as orange), and a guess keeps its dashed look in every colour", () => {
    expect(ringLook("orange", true)).toEqual({ stroke: "#E9ECF1", width: 4, dash: "", halo: null });
    expect(GUESS_LOOK).toEqual({ stroke: "#ffb020", width: 3, dash: "8 6", halo: null });
    for (const c of ["orange", "red", "yellow", "blue", "highContrast", "pink", undefined]) expect(ringLook(c, false), String(c)).toEqual(GUESS_LOOK);
    // The area's colours, red among them; the usual one keeps its stored name so nobody's choice changes.
    expect(defOf("point.colour")!.options).toEqual(["orange", "red", "yellow", "blue", "highContrast"]);
    expect(defOf("point.colour")!.default).toBe("orange");
  });
  test("every other colour is solid, different from the guess and from the green of a correct click", () => {
    const solid = ["orange", "red", "yellow", "blue", "highContrast"].map((c) => ringLook(c, true));
    expect(new Set(solid.map((l) => l.stroke)).size).toBe(5);
    for (const l of solid) {
      expect(l.dash).toBe("");
      expect(l.stroke).not.toBe(GUESS_LOOK.stroke);
      expect(l.stroke.toLowerCase()).not.toBe("#1e8a4c");
    }
    expect(ringLook("highContrast", true).halo).toBe("#000000");
    expect(ringLook("nonsense", true)).toEqual(ringLook("orange", true));
  });
  test("plain lettering at the usual text size is today's caption exactly; handwriting and bigger text are bigger", () => {
    // M46: plain words in the Mac's own system face; handwriting stays a choice.
    expect(captionStyle("plain", "standard")).toEqual({ font: '700 15px -apple-system, "SF Pro Text", system-ui, sans-serif', maxWidth: 300, reserveW: 320, reserveH: 60 });
    expect(captionStyle(undefined, undefined)).toEqual(captionStyle("plain", "standard"));
    const hand = captionStyle("handwritten", "standard");
    expect(hand.font).toContain("Bradley Hand");
    const sizes = ["standard", "large", "larger", "largest"].map((t) => captionStyle("plain", t));
    for (let i = 1; i < sizes.length; i++) {
      expect(parseInt(sizes[i].font.split(" ")[1])).toBeGreaterThan(parseInt(sizes[i - 1].font.split(" ")[1]));
      expect(sizes[i].maxWidth).toBeGreaterThan(sizes[i - 1].maxWidth);
      expect(sizes[i].reserveW).toBe(sizes[i].maxWidth + 20);   // the words still stay inside the window
      expect(sizes[i].reserveH).toBeGreaterThan(sizes[i - 1].reserveH);
    }
  });
  test("the caption stays inside the window it belongs to at every text size and lettering, and is today's in a wide one", () => {
    // Today, in a window wide enough: the same place and width as before (300 points, kept 320 from the right edge).
    const usual = captionStyle("plain", "standard");
    const wide = { x: 100, y: 50, w: 1200, h: 800 };
    expect(captionPlace(usual, wide, { cx: 400, cy: 300, rx: 40 }, 1)).toEqual({ left: 452, top: 282, maxWidth: 300 });
    expect(captionPlace(usual, wide, { cx: 1250, cy: 300, rx: 40 }, -1)).toEqual({ left: 898, top: 282, maxWidth: 300 });
    for (const lettering of ["plain", "handwritten"]) {
      for (const size of ["standard", "large", "larger", "largest"]) {
        const cs = captionStyle(lettering, size);
        for (const w of [160, 200, 260, 320, 400, 480, 1200]) {
          const box = { x: 500, y: 40, w, h: 600 };
          for (const cx of [box.x + 10, box.x + w / 2, box.x + w - 10]) {
            for (const side of [1, -1] as const) {
              const at = captionPlace(cs, box, { cx, cy: 300, rx: 30 }, side);
              const where = `${lettering} ${size} w=${w} cx=${cx} side=${side}`;
              expect(at.maxWidth, where).toBeLessThanOrEqual(cs.maxWidth);
              expect(at.left, where).toBeGreaterThanOrEqual(box.x + 8);
              // The room it keeps (its width and 20 points, as today) ends inside the window. A window under 158 points
              // wide still gets a caption 120 points wide.
              expect(at.left + at.maxWidth + 20, where).toBeLessThanOrEqual(box.x + box.w);
              expect(at.top, where).toBeGreaterThanOrEqual(box.y + 8);
            }
          }
        }
      }
    }
    const show = src("./overlay.ts");
    expect(show).toContain("captionPlace(cs, box, { cx, cy, rx }, side)");
    expect(show).toContain("cap.style.maxWidth = `${spot.maxWidth}px`");
  });
  test("the overlay draws the ring, the arrow and the marks with the chosen look, and the caption with the chosen lettering", () => {
    const overlay = src("./overlay.ts");
    const show = overlay.slice(overlay.indexOf("function show("), overlay.indexOf('void listen("overlay-point"'));
    expect(show).toContain('ringLook(setting("point.colour"), p.exact)');
    expect(show).toContain('captionStyle(setting("point.lettering"), setting("display.textSize"))');
    expect(show).not.toContain('"#ff9a2e"');
    expect(overlay).toContain('void listen("overlay-point", (e) => { const p = e.payload as Point & { settings?: unknown }; takeSnapshot(p.settings); show(p); });');
  });
});

describe(`When ${PRODUCT} is only guessing (point.guesses)`, () => {
  test("below the confidence line nothing is drawn whatever the setting, and a guess said in words says it is a guess", () => {
    const t = (confidence: number): Target => ({ x: 1, y: 1, targetText: "Save", caption: "Click Save", confidence });
    expect(planSteps([t(0.39)])[0].draw).toBe(false);
    expect(planSteps([t(0.4)])[0].draw).toBe(true);
    expect(guessWords("Save", "Click Save")).toContain("only guessing");
    expect(guessWords("Save", "Click Save")).toContain('"Save"');
    expect(guessWords("Save", "Click Save")).not.toBe(notSureWords("Save", "Click Save"));
  });
  test("the card says a step in words when the shell kept a guess back, and the answer carries on", () => {
    const card = src("./card.tsx");
    expect(card).toContain('if (out?.ok === false && out.why === "guess") { words({ ...s, text: guessWords(s.target.targetText, s.target.caption) }); return true; }');
  });
});

describe("Pace of step by step pointing (point.pace)", () => {
  test("normal is today's timing exactly", () => {
    expect(paceFactor("normal")).toBe(1);
    expect(paceFactor(undefined)).toBe(1);
    expect(paceFactor("warp")).toBe(1);
    expect(leadMs("normal")).toBe(LEAD_MS);
    expect(afterMs("normal")).toBe(AFTER_MS);
    for (const text of ["Click Save", "Type your email in the box up there and press Next"]) {
      for (const speaking of [true, false]) expect(lineMs(text, speaking, 1, "normal")).toBe(lineMs(text, speaking, 1));
    }
    expect(flightMs(800, "normal")).toBe(flightMs(800));
  });
  test("slower is half as long again, faster three quarters, and a spoken line is never cut short", () => {
    expect(paceFactor("slower")).toBe(1.5);
    expect(paceFactor("faster")).toBe(0.75);
    expect(leadMs("slower")).toBe(1350);
    expect(leadMs("faster")).toBe(675);
    expect(afterMs("slower")).toBe(525);
    const t = "Type your email in the box up there";
    expect(lineMs(t, false, 1, "slower")).toBe(Math.round(lineMs(t, false, 1) * 1.5));
    expect(lineMs(t, false, 1, "faster")).toBe(Math.round(lineMs(t, false, 1) * 0.75));
    expect(lineMs(t, true, 1, "slower")).toBeGreaterThan(lineMs(t, true, 1));
    expect(lineMs(t, true, 1, "faster")).toBe(lineMs(t, true, 1));   // the voice still needs its time
    expect(lineMs(t, true, 0.5, "faster")).toBe(lineMs(t, true, 0.5));   // still scaled by the voice speed
    expect(flightMs(800, "slower")).toBe(flightMs(800) * 1.5);
    expect(flightMs(800, "faster")).toBe(flightMs(800) * 0.75);
  });
  test("each step waits the paced lead in, line and pause", () => {
    const tg = (caption: string): Target => ({ x: 1, y: 1, targetText: "", caption, confidence: 0.9 });
    const s = planSteps([tg("First line"), tg("Second"), tg("Third")]);
    expect(startTimes(s, false, 1, "normal")).toEqual(startTimes(s, false));
    const slow = startTimes(s, false, 1, "slower");
    expect(slow[1]).toBe(leadMs("slower") + lineMs("First line", false, 1, "slower") + afterMs("slower"));
    const waits: number[] = [];
    const timers = { set: (f: () => void, ms: number) => { waits.push(ms); f(); return 0; }, clear: () => {} };
    play(s, { aim: async () => true, words: () => {} }, false, timers, 1, "faster");
    return new Promise<void>((done) => setTimeout(() => {
      expect(waits[0]).toBe(leadMs("faster") + lineMs("First line", false, 1, "faster") + afterMs("faster"));
      done();
    }, 10));
  });
  test("the card plays and says the steps at the chosen pace, and the overlay flies at it", () => {
    const card = src("./card.tsx");
    expect(card).toContain('const pace = setting("point.pace");');
    expect(card).toContain('flyMs: flightFor(s.total, setting("point.fly"), pace), fadeMs: lineMs(s.text, speaking, speed, pace),');
    // M46: a flight time only for a step of several with Fly to the place first on; otherwise none, and the lead in stays a pause.
    expect(flightFor(3, true, "slower")).toBe(leadMs("slower"));
    expect(flightFor(1, true)).toBeNull();
    for (const off of [false, undefined, null, "true"]) expect(flightFor(3, off)).toBeNull();
    expect(card).toContain("player.current.start(steps, { aim, words }, speaking, speed, pace);");
    expect(src("./overlay.ts")).toContain('flightMs(dist, setting("point.pace"))');
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Here", req: "r", step: 1, of: 2 } }, undefined, "slower")?.delayMs).toBe(leadMs("slower"));
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Here", req: "r", step: 1, of: 2 } })?.delayMs).toBe(LEAD_MS);
  });
});

describe("How long Draw it for me stays (drawIt.seconds)", () => {
  test("the page fades the picture after the time the shell sends, never its own number, and keeps one until it is closed", () => {
    const overlay = src("./overlay.ts");
    const draw = overlay.slice(overlay.indexOf("function drawDiagram("), overlay.indexOf('void listen("overlay-diagram"'));
    expect(draw).toContain("if (ms !== null) timer = setTimeout(");
    expect(draw).not.toContain("15_000");
    expect(overlay).toContain("drawDiagram(p.diagram, p.dockX, diagramMsOf(p.ms))");
  });
  test("Home says how long it stays", () => {
    expect(S.drawShown).toBe("The picture is on your screen for a few seconds.");
    expect(S.drawShownUntilClosed).toContain("Close");
    expect(src("./card.tsx")).toContain('setting("drawIt.seconds") === "untilClosed" ? S.drawShownUntilClosed : S.drawShown');
  });
});

describe("Also say out loud (speak.alsoSay)", () => {
  const m = (o: Partial<Model>): Model => ({ ...initial(), ...o });
  test("nothing more is said unless chosen: the usual list is empty, as today", () => {
    expect(defOf("speak.alsoSay")!.default).toEqual([]);
    expect(alsoSayLines(m({ approvals: [{ id: "a1" } as never] }), "/p", [])).toEqual([]);
  });
  test("when something needs you: a question to answer, the loop card, a pause or a plan, in fixed words", () => {
    const items = ["needsYou"];
    expect(alsoSayLines(m({ approvals: [{ id: "a1", tool: "Bash", input: { command: "rm -rf secret-token-sk-ant-xyz" } } as never] }), "/p", items)).toEqual([{ key: "needs:approval:a1", text: S.alsoSay.needsYou.approval }]);
    expect(alsoSayLines(m({ stuck: { index: 2, title: "Fix tests" } as never }), "/p", items)[0].text).toBe(S.alsoSay.needsYou.stuck);
    expect(alsoSayLines(m({ paused: { reason: "files_changed" } as never }), "/p", items)[0].text).toBe(S.alsoSay.needsYou.paused);
    expect(alsoSayLines(m({ plan: { agent: "drive", steps: [] } as never }), "/p", items)[0].text).toBe(S.alsoSay.needsYou.plan);
    // Show me and lessons already speak for themselves.
    expect(alsoSayLines(m({ showme: { stage: "pointing", message: "x" } as never }), "/p", items)).toEqual([]);
    // Never the content of what needs you: only fixed words, so nothing secret looking can be said.
    for (const w of Object.values(S.alsoSay.needsYou)) expect(w).not.toMatch(/sk-|token|rm /);
  });
  // The page's own model, fed the events agent.ts sends at the end of a task: the receipt, then the agent's state.
  const ev = (type: string, o: Record<string, unknown> = {}) => ({ v: 1, id: `e${Math.random()}`, type, ...o }) as never;
  const started = (cp = "cp_0003", agent = "a1") => reduce(initial(), ev("checkpoint.created", { project: "/p", agent, checkpoint: cp, label: "Before: fix it", files: 1, skipped: [] }));
  const receipt = (proof: string, cp = "cp_0003", agent = "a1", extra: Record<string, unknown> = {}) => ev("receipt", { agent, checkpoint: cp, changed: [], commands: 0, notUndoable: [], proof, usdEstimate: 0, ...extra });
  const state = (s: string, agent = "a1") => ev("agent.state", { agent, state: s });
  const say = (m: Model) => alsoSayLines(m, "/p", ["taskDone"]);
  // Every proof a receipt can carry, read from the protocol itself, so a new one fails here until it has its words.
  const proto = src("../../protocol/index.ts");
  const proofs = [...(/"receipt":.*?oneOf\("proof", \[([^\]]*)\]\)/.exec(proto)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  test("when a task finished: what its proof really says, for every proof a receipt can carry, never passed for a skipped check", () => {
    expect(proofs).toEqual(["passed", "partial", "failed", "skipped"]);
    const words: Record<string, string> = { passed: S.alsoSay.taskDone.passed, partial: S.alsoSay.taskDone.gaps, failed: S.alsoSay.taskDone.failed, skipped: S.alsoSay.taskDone.none };
    for (const p of proofs) {
      expect(words[p], p).toBeDefined();
      const m = reduce(reduce(started(), receipt(p)), state("done"));
      expect(say(m), p).toEqual([{ key: "receipt:/p:cp_0003", text: words[p] }]);
    }
    expect(S.alsoSay.taskDone.gaps).not.toMatch(/passed/i);
    expect(S.alsoSay.taskDone.none).not.toMatch(/passed|working/i);
  });
  test("nothing is said until the task has really ended, and nothing for a task that was stopped", () => {
    const got = reduce(started(), receipt("passed"));
    expect(say(got), "the receipt alone: the agent has not said how it ended").toEqual([]);
    for (const p of proofs) expect(say(reduce(reduce(started(), receipt(p)), state("idle"))), `${p}: stopped`).toEqual([]);
  });
  test("after Stop everything nothing is said, not even for the stopped task's receipt", () => {
    let m = reduce(started(), ev("app.stop_everything"));
    expect(say(m)).toEqual([]);
    m = reduce(m, receipt("skipped"));
    expect(say(m)).toEqual([]);
    m = reduce(m, state("idle"));
    expect(say(m)).toEqual([]);
    // A task that had already been said is not said again either: Stop everything clears what it was waiting on.
    const done = reduce(reduce(started(), receipt("passed")), state("done"));
    expect(say(reduce(done, ev("app.stop_everything")))).toEqual([]);
  });
  test("a task that stopped on an error is never called done", () => {
    for (const p of ["skipped", "partial", "passed"]) {
      const m = reduce(reduce(started(), receipt(p)), state("error"));
      expect(say(m), p).toEqual([{ key: "receipt:/p:cp_0003", text: S.alsoSay.taskDone.stopped }]);
    }
    const failed = reduce(reduce(started(), receipt("failed")), state("error"));
    expect(say(failed)).toEqual([{ key: "receipt:/p:cp_0003", text: S.alsoSay.taskDone.failed }]);
    for (const w of [S.alsoSay.taskDone.stopped, S.alsoSay.taskDone.failed, S.alsoSay.taskDone.planStopped]) expect(w).not.toMatch(/\bdone\b|passed/i);
  });
  test("a plan is one task to the person: its steps say nothing, and the plan says one line when it ends", () => {
    let m = reduce(initial(), ev("drive.step", { agent: "a1", index: 1, total: 2, title: "One", status: "started" }));
    m = reduce(m, ev("checkpoint.created", { project: "/p", agent: "a1", checkpoint: "cp_0007", label: "Before: one", files: 1, skipped: [] }));
    m = reduce(reduce(m, receipt("passed", "cp_0007", "a1", { inPlan: true })), state("done"));
    expect(say(m), "a step").toEqual([]);
    m = reduce(m, ev("drive.step", { agent: "a1", index: 1, total: 2, title: "One", status: "done" }));
    expect(say(m)).toEqual([]);
    const finished = reduce(m, ev("drive.done", { agent: "a1", status: "done", completed: 2, total: 2, usdEstimate: 0 }));
    expect(say(finished).map((l) => l.text)).toEqual([S.alsoSay.taskDone.planDone]);
    expect(S.alsoSay.taskDone.planDone).not.toMatch(/\bdone\b|passed|proven/i);
    const short = reduce(m, ev("drive.done", { agent: "a1", status: "error_max_turns", completed: 1, total: 2, usdEstimate: 0 }));
    expect(say(short).map((l) => l.text)).toEqual([S.alsoSay.taskDone.planStopped]);
    expect(say(reduce(m, ev("drive.done", { agent: "a1", status: "interrupted", completed: 1, total: 2, usdEstimate: 0 })))).toEqual([]);
    expect(say(reduce(finished, ev("app.stop_everything")))).toEqual([]);
    // A task asked for after the plan is its own task again.
    let next = reduce(finished, ev("checkpoint.created", { project: "/p", agent: "a1", checkpoint: "cp_0009", label: "Before: more", files: 1, skipped: [] }));
    next = reduce(reduce(next, receipt("passed", "cp_0009")), state("done"));
    expect(say(next).map((l) => l.text)).toContain(S.alsoSay.taskDone.passed);
  });
  test("only with Speak to me on, once per thing, never twice with Answer out loud, and the Mac side still refuses secrets and calls", () => {
    const card = src("./card.tsx");
    expect(card).toContain('const also = alsoSayLines(m, project, (setting("speak.alsoSay") as string[] | undefined) ?? []);');
    expect(card).toContain("if (!speechOn()) { for (const l of also) alsoSaid.current.add(l.key); return; }");
    expect(card).toContain("alsoSaid.current.add(r.key);   // said whole as the answer: not again as a short line");
    const main = src("../src-tauri/src/main.rs");
    const speak = main.slice(main.indexOf("fn speak(app: AppHandle"), main.indexOf("// ---------- Voice settings"));
    expect(speak).toContain("speak::prepare(&text)");
    expect(speak).toContain("if quiet()");
  });
  test("the lesson's last line comes from strings.ts", () => {
    expect(lineFor({ walk: { id: "w", index: 0, variant: "main", stage: "done", say: "" }, showme: null })?.text).toBe(S.lessonDone);
    expect(src("./speech.ts")).not.toContain("All done. Every step is finished.");
  });
});

describe("Apps Prompt help and the error explainer may read (ph.appAnswers)", () => {
  test("the answers are read from what the shell shows, in name order, never the built in ones", () => {
    const rows = appAnswersFrom({ apps: { "com.b.notes": "never", "com.a.chat": "always", "com.c.mail": "ask", "com.d.odd": "sometimes" } }, { "com.a.chat": "Chat", "com.b.notes": "Notes" });
    expect(rows).toEqual([{ id: "com.a.chat", name: "Chat", answer: "always" }, { id: "com.c.mail", name: "com.c.mail", answer: "ask" }, { id: "com.b.notes", name: "Notes", answer: "never" }]);
    expect(appAnswersFrom(null, {})).toEqual([]);
    expect(appAnswersFrom({ apps: 5 }, {})).toEqual([]);
  });
  test("loosening a never asks first; anything stricter does not", () => {
    expect(needsConfirm("never", "always")).toBe(true);
    expect(needsConfirm("never", "ask")).toBe(true);
    expect(needsConfirm("never", "forget")).toBe(true);
    expect(needsConfirm("always", "never")).toBe(false);
    expect(needsConfirm("ask", "always")).toBe(false);
    expect(answerOp("com.a.chat", "ask", false)).toEqual({ op: "answer", app: "com.a.chat", answer: "ask", confirmed: false });
    expect(answerOp("com.a.chat", "forget", true)).toEqual({ op: "forget", app: "com.a.chat", confirmed: true });
    expect(forgetAllCount([{ id: "a", name: "a", answer: "always" }, { id: "b", name: "b", answer: "never" }, { id: "c", name: "c", answer: "ask" }])).toBe(2);
  });
  test("it is protective: never reset from its row, a section or everything", () => {
    const d = defOf("ph.appAnswers")!;
    expect(d.protective).toBe(true);
    expect(rowModel(d, { apps: { "com.a.chat": "always" } }, { apps: {} }, "").canReset).toBe(false);
  });
  test("the editor changes answers only through settings_set, and Add the app in front is done by the shell", () => {
    const page = src("./settingsPage.tsx");
    const editor = page.slice(page.indexOf("function AppAnswers("), page.indexOf("// end AppAnswers"));
    expect(editor).toContain('changeSetting("ph.appAnswers", answerOp(');
    // Add the app in front to never read names the app first and changes only that one (the shell checks it is still in
    // front), and the note names it.
    expect(editor).toContain('invoke("front_app")');
    expect(editor).toContain("S.appAnswers.neverFrontSure(");
    expect(editor).toContain('changeSetting("ph.appAnswers", neverFrontOp(f.id)), S.appAnswers.neverFrontDone(f.name)');
    expect(editor).not.toContain('{ op: "neverFront" }');
    expect(neverFrontOp("com.notes.app")).toEqual({ op: "neverFront", app: "com.notes.app" });
    expect(S.appAnswers.neverFrontDone("Notes")).toContain("Notes");
    expect(S.appAnswers.neverFrontSure("Notes")).toContain("Notes");
    expect(problemWords("frontChanged")).toBe(S.setProblem.frontChanged);
    expect(editor).toContain('changeSetting("ph.appAnswers", { op: "forgetAll" })');
    expect(editor).not.toContain("localStorage");
    // A summary row whose Edit opens a sheet with the editor (the spec, 3.5).
    expect(page).toContain('if (d.key === "ph.appAnswers") {');
    expect(page).toContain("<Sheet title={wordsOf(d.key).label} dirty={false} instant onSave={close} onClose={close}><AppAnswers />");
  });
});

describe("Apps that count as a call (calls.apps)", () => {
  test("the built in apps are exactly the shell's seven, in its order, and the usual value is all of them", () => {
    const rs = src("../src-tauri/src/presentation.rs");
    const ids = [...rs.split("pub const CALL_APPS")[1].split("];")[0].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(BUILT_IN_CALL_APPS.map((a) => a.id)).toEqual(ids);
    expect(defOf("calls.apps")!.default).toEqual(ids);
    for (const a of BUILT_IN_CALL_APPS) expect(a.name.length).toBeGreaterThan(0);
  });
  test("turning a built in one off and on again puts the list back exactly as it was", () => {
    const usual = defOf("calls.apps")!.default as string[];
    const off = toggleCallApp(usual, "us.zoom.xos", false);
    expect(off).not.toContain("us.zoom.xos");
    expect(toggleCallApp(off, "us.zoom.xos", true)).toEqual(usual);
    expect(toggleCallApp([...usual, "com.example.calls"], "com.apple.FaceTime", false)).toEqual([...usual.filter((x) => x !== "com.apple.FaceTime"), "com.example.calls"]);
  });
  test(`adding the app in front: up to 20, never twice, never ${PRODUCT}, and only its id is kept`, () => {
    const usual = defOf("calls.apps")!.default as string[];
    expect(addCallApp(usual, "com.example.calls")).toEqual({ ok: true, list: [...usual, "com.example.calls"] });
    expect(addCallApp(usual, "US.ZOOM.XOS")).toEqual({ ok: false, why: "already" });
    expect(addCallApp(usual, "dev.companion.app")).toEqual({ ok: false, why: "ownApp" });
    let list = usual;
    for (let i = 0; i < MAX_ADDED_CALL_APPS; i++) { const r = addCallApp(list, `com.example.app${i}`); expect(r.ok).toBe(true); if (r.ok) list = r.list; }
    expect(addCallApp(list, "com.example.one.more")).toEqual({ ok: false, why: "full" });
    const rows = callAppRows(list, { "com.example.app0": "First" });
    expect(rows.builtIn.every((r) => r.on)).toBe(true);
    expect(rows.added[0]).toEqual({ id: "com.example.app0", name: "First" });
    expect(rows.added).toHaveLength(MAX_ADDED_CALL_APPS);
  });
  test("only app ids are ever kept: anything else is refused by the setting's own rules, in plain words", () => {
    expect(defOf("calls.apps")!.item).toEqual({ maxLength: 200, shape: "appId" });
    expect(validateKey("calls.apps", ["us.zoom.xos", "Zoom me when my boss calls"])).toEqual({ ok: false, reason: "notAppId" });
    expect(validateKey("calls.apps", ["Cisco-Systems.Spark", " com.example.calls "])).toEqual({ ok: true, value: ["Cisco-Systems.Spark", "com.example.calls"] });
    expect(problemWords("notAppId")).toBe(S.setProblem.notAppId);
    expect(S.setProblem.notAppId).toContain("Add the app in front");
    // A list's item shape must be one the rules know (the same check as settings.rs).
    const one = (shape: string) => checkRegistry({ version: 1, sections: ["sharing"], settings: [{ key: "calls.test", section: "sharing", kind: "list", default: [], maxItems: 3, item: { maxLength: 20, shape } as never, scope: "app", applies: ["shell"], store: "settings", live: true }] });
    expect(one("appId")).toEqual([]);
    expect(one("email").length).toBeGreaterThan(0);
  });
  test("its row says the usual value in words, and the page uses its own control and the shell's Add the app in front", () => {
    const d = defOf("calls.apps")!;
    expect(valueWords(d, d.default)).toBe(S.set["calls.apps"].usual);
    const page = src("./settingsPage.tsx");
    expect(page).toContain('if (d.key === "calls.apps") {');
    expect(page).toContain("<CallApps value={list} disabled={off}");
    expect(page).toContain('invoke("front_app")');
  });
});

describe("a list from a fixed set shows its words", () => {
  test("Also say out loud shows each item's words, and None when empty", () => {
    const d = defOf("speak.alsoSay")!;
    expect(valueWords(d, ["taskDone"])).toBe(S.set["speak.alsoSay"].options.taskDone);
    expect(valueWords(d, [])).toBe(S.setNone);
    // Each item is a child row with its own switch (the founder, 31 Oct: never squashed round toggles).
    expect(src("./settingsPage.tsx")).toContain("d.kind === \"list\" && d.allowedItems");
    expect(src("./settingsPage.tsx")).toContain(": <AllowedList d={d} value={list} disabled={off} onChange={change} />)");
  });
});
