// The settings registry (protocol/settings.json, T16): one list of every setting, read by the shell, the pages and the
// engine. These check the list itself and the one set of rules for what a value may be. The same cases file is run by the
// shell's own tests (app/src-tauri/src/settings.rs), so the shell and these rules agree on every case in it.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkRegistry, defaultOf, defOf, fromPageStorage, MIGRATION_MAPS, REGISTRY, looksSecret, validate, validateKey, type Def, type Registry } from "../../protocol/settings.ts";

const cases = readFileSync(new URL("../../protocol/fixtures/settings-cases.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
// Area 1 (spending and how work runs), each with exactly today's behaviour as its usual value.
const AREA_1: Record<string, unknown> = {
  "budget.task": 3, "budget.plan": 5, "budget.rescue": 5, "budget.research": 2,
  "model.work": "recommended", "model.rescue": "careful", "model.quick": "recommended",
  "work.tries": 3, "work.askOnAnyFailure": false, "drive.maxSteps": 12, "work.tryAgain": "carry_on", "approval.waitMinutes": 30,
  // HeyClicky v1.0.53 parity: a task that ends on a question stops and waits (on, as built), and tasks may search the web (on,
  // as before; each search is paid on the person's key, so the fix eval decides whether it stays on).
  "work.stopOnQuestion": true, "work.webSearch": true,
  // Undo never replaces a file the person changed themselves (T06), unless they turn it off.
  "undo.protectMyEdits": true,
};

describe("the shipped list of settings", () => {
  test("it is valid: every default passes its own rules, ranges and steps fit, options are unique, sections and stores exist", () => {
    expect(checkRegistry(REGISTRY)).toEqual([]);
  });
  test("sections are in page order and every setting names one of them", () => {
    // Groups of tools come first (F20, M12): the four switches are the first thing Settings shows.
    expect(REGISTRY.sections[0]).toBe("groups");
    // M19: Look and feel, right after Home and the character.
    expect(REGISTRY.sections).toEqual(["groups", "keys", "talking", "home", "look", "pointing", "spending", "work", "checks", "watch", "memory", "otherApps", "files", "sharing", "display", "updates", "numbers"]);
    for (const d of REGISTRY.settings) expect(REGISTRY.sections).toContain(d.section);
  });
  test("every setting the core registers is there, with today's behaviour as its usual value", () => {
    const want: Record<string, unknown> = {
      "talk.speak": false, "talk.speakReplies": false, "talk.autoSend": false, "character.comeTo": true, "sharing.hide": true, "calls.quiet": true,
      "showme.allScreens": false, "fun.reactions": true, "teach.yourTurn": true, "display.textSize": "standard", "updates.daily": true,
      "spend.dailyLimit": 10, "explain.mode": "reasonsAndQuestion", "memory.paused": false, "numbers.on": false, "work.maxTurns": 80, "keys.hotkeys": null, "talk.voice": null,
      ...AREA_1,
      // Area 2, checking your project (settings-checks-registry.test.ts).
      "rules.house": [], "check.mustSee": [], "check.press": "", "check.afterPress": "", "check.start": "auto", "check.skip": [], "check.time": "normal",
      "check.install": "ask", "check.pageSize": "desktop", "net.slow": false, "pictures.make": true, "pictures.keep": 200, "rescue.readDeployLog": true,
      // Area 3: memory, Explain and teaching (settings-memory.test.ts)
      "explain.after": "everyTask", "memory.learnFromFiles": true, "memory.learnFromWords": true, "memory.rememberGoals": true, "memory.tellClaude": true,
      "memory.recallLength": "normal", "task.offRecordByDefault": false, "memory.toastSeconds": "10", "where.after": "30min",
      // Area 4 (Home, the island and the character): each usual value is what the app does today.
      "island.show": true, "island.openForQuestions": true, "home.escStops": true, "island.showWork": true, "talk.captions": true,
      // M55, live progress: while a job works, the notch says its step in a word, with a thin line of the four steps under it.
      "island.showStep": true, "talk.dictate": false, "island.peekOnHover": true, "island.pointOpens": "home", "island.openDelay": 0.4, "island.closeDelay": 0.3, "island.display": "follow", "island.followDelay": 3,
      "home.closeOnClickAway": true, "home.goToNeeds": "goToIt", "home.size": "standard",
      // M55, adapts to you: Home's main action follows the kind of app in front, and the ways you press most come first in
      // More ways to ask. Both on, as the plan asks; the shell reads the first so that, off, it never reads the app in front.
      "home.followFrontApp": true, "home.usedOftenFirst": true,
      "character.edge": "right", "character.position": 50, "character.sameEverywhere": false, "character.motion": "followMac", "character.linger": 1.5, "character.overFullScreen": false, "character.live": true,
      // Peeking (27 Oct 2026, the founder asked for it on): it rests past the edge, and takes a curious peek now and then.
      "character.peek": true, "character.stick": true, "character.peekIdle": false, "character.dockWhen": "pushed",
      // Area 5: pointing, talking and other apps.
      "point.ringSeconds": 10, "point.yourTurnSeconds": 90, "point.colour": "orange", "point.lettering": "plain", "point.guesses": "softRing",
      "point.pace": "normal", "drawIt.on": false, "drawIt.seconds": "15", "talk.maxHold": "60", "showme.listen": true, "speak.alsoSay": [], "ph.style": "full", "ph.useProjectInfo": true,
      "ph.handBack": "paste", "ph.appAnswers": null, "secondLook.on": false, "secondLook.searches": 3, "pointat.editor": "editorInFront", "calls.apps": CALL_APPS,
      // The practice library: Point at the problem's Fix it looks deeper first (Rescue), as it always has.
      "point.fixWith": "rescue",
      // HeyClicky v1.0.53 parity, the shell and teaching side: each new behaviour is off, or as today, until turned on.
      "talk.followUpByPointing": false, "showme.askWorked": "everyStep", "showme.waitForPage": false, "teach.startWhereYouAre": false, "home.stepAside": false,
      // F19, drop a file on the companion: on, since the founder asked for it; results next to the original.
      "drop.on": true, "drop.imageFormat": "png", "drop.docFormat": "pdf", "drop.audioFormat": "m4a", "drop.videoFormat": "mp4",
      "drop.resizeTo": "1600", "drop.quality": "medium", "drop.sampleRate": "44100", "drop.saveTo": "nextTo",
      // M14, documents into the ask box: 50 KB of a document's text goes with a request (about 20 pages), never over the
      // 100 KB cap of one file.
      "attach.docLimit": "50",
      // Everyday stuck moments: the key works in any app. On by default, since it only ever acts on the person's own key
      // press; turned off, the key only checks the project, as before. The why is two reasons and a question, like Explain.
      "point.everyday": true, "point.everydayWhy": "reasonsAndQuestion",
      // Everyday apps: the tutor for everyday apps and short spoken steps are off until turned on, so every answer is as today.
      "showme.everydayTutor": false, "talk.shortSteps": false,
      // Groups of tools (F20, M12): every group on, the island names the working group, Home invites to tools not tried yet,
      // and nothing is tried at first (the list is set only by a real use).
      "flow.on": true, "guide.on": true, "voice.on": true, "files.on": false, "prompt.on": true, "groups.islandName": true, "groups.showUntried": true, "groups.tried": [], "groups.cutNotice": [],
      // F21: Watch routines are on (they only matter once a watch exists), a new watch is checked every 30 minutes, once a day at
      // 9, alerts are held back 22:00 to 07:00 only when the person turns quiet hours on, and Rescue may read a failed GitHub run.
      "watch.on": false, "watch.schedule": "30m", "watch.dailyHour": 9, "watch.quiet": false, "watch.quietFrom": 22, "watch.quietTo": 7, "rescue.readCiRun": true,
      // M52 (F30): every change another AI tool makes is reviewed when asked (a quiet dot says there are new changes), once
      // nothing has changed for 20 seconds. Automatic reviews each batch by itself; off does not watch the folder at all.
      "review.mode": "ask", "review.quietSeconds": 20,
      // M57: Automatic waits for a minute of quiet (a tool that pauses is not reviewed half way), and reviews are Normal:
      // everything is shown except the kinds the person said not to flag here.
      "review.autoQuietSeconds": 60, "review.strictness": "normal",
      // M57 features 1 and 5: the instant key warning is off until the founder says yes (the plan; it changes M52's "nothing runs until asked"), and
      // History keeps a review's row for 90 days.
      "review.keyWarning": false, "review.keepDays": "90",
      // F23, M14: something asked for with no project open gets a new folder in the home folder (newfolder.rs).
      "make.folder": "home",
      // M18: the character's name, chosen in the first run or Settings; empty is its own name.
      "character.name": "",
      // M19: make it yours.
      "look.water": "ocean", "look.theme": "black", "character.follow": "drop", "look.size": "usual", "sound.on": false, "sound.volume": "soft",
      "panel.showHello": false, "panel.showWork": true, "panel.showButtons": true, "panel.size": "usual",
      "point.style": "water", "point.dropSize": "usual", "point.caption": "lime",
      // M46 (F28): Flowflow holds still unless it has news, rests in Low Power Mode, and the Show me how ring lands at once.
      "character.lively": "lively", "character.restLowPower": true, "point.fly": false,
      // M55, the character reacts: it lifts when it needs you, dips when something fails, leans toward changes waiting and
      // (Gentle and Lively) looks at the ask box while you type. On, as the plan asks; How lively and less motion still rule.
      "character.reacts": true,
      // M51 (1 Nov 2026, the founder: the tall panel "looks so vertical"): Home is wide by default; tall stays a choice.
      "look.layout": "wide",
      // M51 step 3 (the founder: "as much customization as possible"): the graphite look is the usual theme (a saved "night"
      // still reads, as Graphite), with roomy spacing, coloured item icons, stamps on, the glossy button and soft corners.
      // 2 Nov 2026 (the founder, after showing friends: "too many colors, so it looks like an aquarium"): Black is the usual
      // theme, the list icons are plain, there is no light behind Home, and Calm is the usual colour. One blue accent.
      "look.density": "comfortable", "look.icons": "plain", "look.stamps": true, "look.gloss": "flat", "look.corners": "soft",
      "look.light": "off",
      "look.colour": "calm",
      // M65 (4 Nov 2026, the founder: the look is "too childish"): Instrument, the grown up look, is the usual; Friendly is
      // today's look, kept as a choice. The character matches the look unless one is picked: the faceless glass orb, or the
      // friendly one with its face, its bubbles and its water.
      "look.style": "instrument", "look.character": "match",
    };
    for (const [k, v] of Object.entries(want)) expect(defaultOf(k), k).toEqual(v);
    expect(REGISTRY.settings.map((d) => d.key).sort()).toEqual(Object.keys(want).sort());
  });
  test("M52: how often changes are reviewed, and how long the folder must be quiet first", () => {
    expect(defOf("review.mode")).toMatchObject({ section: "watch", kind: "choice", default: "ask", options: ["ask", "automatic", "off"], scope: "app", applies: ["runner", "pages"], store: "settings", live: true });
    expect(defOf("review.quietSeconds")).toMatchObject({ section: "watch", kind: "number", default: 20, min: 5, max: 120, step: 5, unit: "seconds", scope: "app", applies: ["runner"], store: "settings", live: true });
    expect(validate(defOf("review.quietSeconds")!, 3).ok).toBe(false);
    expect(validate(defOf("review.mode")!, "always").ok).toBe(false);
  });
  test("M57: how long Automatic waits, and how strict a review is", () => {
    expect(defOf("review.autoQuietSeconds")).toMatchObject({ section: "watch", kind: "number", default: 60, min: 20, max: 600, step: 10, unit: "seconds", scope: "app", applies: ["runner"], store: "settings", live: true });
    expect(validate(defOf("review.autoQuietSeconds")!, 10).ok).toBe(false);
    expect(defOf("review.strictness")).toMatchObject({ section: "watch", kind: "choice", default: "normal", options: ["quiet", "normal", "careful"], scope: "app", applies: ["runner"], store: "settings", live: true });
    expect(validate(defOf("review.strictness")!, "loud").ok).toBe(false);
  });
  test("M57: the instant key warning has its own switch, and History keeps review rows for a chosen number of days", () => {
    expect(defOf("review.keyWarning")).toMatchObject({ section: "watch", kind: "switch", default: false, scope: "app", applies: ["runner"], store: "settings", live: true });
    expect(validate(defOf("review.keyWarning")!, "yes").ok).toBe(false);
    expect(defOf("review.keepDays")).toMatchObject({ section: "watch", kind: "choice", default: "90", options: ["30", "90", "180", "365"], scope: "app", applies: ["runner"], store: "settings", live: true });
    expect(validate(defOf("review.keepDays")!, "forever").ok).toBe(false);
    expect(validate(defOf("review.keepDays")!, 90).ok).toBe(false);
  });
  test("the worked example: most turns in one task, read when a task starts, for the engine only", () => {
    expect(defOf("work.maxTurns")).toMatchObject({ kind: "number", min: 20, max: 200, step: 10, unit: "count", scope: "app", applies: ["runner"], store: "settings", live: false });
  });
  test("area 4: Home, the island and the character, with the ranges in the plan", () => {
    const sec = (k: string, n: number, min: number, max: number, step: number, unit: string) => expect(defOf(k), k).toMatchObject({ section: "home", kind: "number", default: n, min, max, step, unit, scope: "app", live: true });
    sec("island.openDelay", 0.4, 0.1, 1.5, 0.1, "seconds");
    sec("island.closeDelay", 0.3, 0.1, 1, 0.1, "seconds");
    sec("island.followDelay", 3, 1, 10, 1, "seconds");
    sec("character.position", 50, 0, 100, 5, "percent");
    sec("character.linger", 1.5, 0.5, 10, 0.5, "seconds");
    expect(defOf("island.display")!.options).toEqual(["follow", "builtIn", "main"]);
    // 2 Nov 2026 (the founder: pointing at the notch "needs to be open"): pointing opens Home itself, the usual, or the status line.
    expect(defOf("island.pointOpens")).toMatchObject({ section: "home", kind: "choice", default: "home", options: ["home", "status"], scope: "app", applies: ["shell"], store: "settings", live: true });
    expect(defOf("home.goToNeeds")!.options).toEqual(["goToIt", "markTab"]);
    expect(defOf("home.size")!.options).toEqual(["standard", "large"]);
    // M51: the layout, wide (the usual) or the tall panel. The shell sizes Home and keeps the character clear of it from it
    // (island.rs HomeSize::of), and the pages lay Home out by it.
    expect(defOf("look.layout")).toMatchObject({ section: "look", kind: "choice", default: "wide", options: ["wide", "tall"], scope: "app", applies: ["shell", "pages"], store: "settings", live: true });
    // M51 step 3: the theme keeps "night" as an option so a value saved before still checks out (it reads as Graphite), and
    // the five look choices reach the pages only, live, kept in settings.json.
    // 2 Nov 2026 (the founder: "so we gonna have white and black", then "too many colors, so it looks like an aquarium"):
    // Black is the usual theme and White keeps the stored value "paper"; plain icons, no light behind Home and Calm are the
    // usual look, each the first of its options.
    expect(defOf("look.theme")).toMatchObject({ section: "look", kind: "choice", default: "black", options: ["black", "paper", "graphite", "deep", "night"], applies: ["pages"], store: "settings", live: true });
    for (const [k, options] of [["look.density", ["comfortable", "compact"]], ["look.icons", ["plain", "colour"]], ["look.gloss", ["flat", "on"]], ["look.corners", ["soft", "crisp"]], ["look.light", ["off", "still", "moving"]], ["look.colour", ["calm", "vivid"]]] as const) {
      expect(defOf(k), k).toMatchObject({ section: "look", kind: "choice", default: options[0], options: [...options], scope: "app", applies: ["pages"], store: "settings", live: true });
    }
    expect(defOf("look.stamps")).toMatchObject({ section: "look", kind: "switch", default: true, scope: "app", applies: ["pages"], store: "settings", live: true });
    // M65: the look's style (Instrument, the usual, or Friendly, today's look) and the character in it, for the pages only.
    // A store saved before has neither key, so it reads the usual: Instrument, with the character matching it.
    expect(defOf("look.style")).toMatchObject({ section: "look", kind: "choice", default: "instrument", options: ["instrument", "friendly"], scope: "app", applies: ["pages"], store: "settings", live: true });
    expect(defOf("look.character")).toMatchObject({ section: "look", kind: "choice", default: "match", options: ["match", "orb", "friendly"], scope: "app", applies: ["pages"], store: "settings", live: true });
    expect(validate(defOf("look.style")!, "childish").ok).toBe(false);
    expect(validate(defOf("look.character")!, "friendly").ok).toBe(true);
    expect(defOf("look.style")!.from).toBeUndefined();
    expect(defOf("character.edge")!.options).toEqual(["left", "right", "top", "bottom"]);
    expect(defOf("character.motion")!.options).toEqual(["followMac", "less"]);
    // M46 (F28): How lively, in the order Settings shows the three choices; Still is the usual one.
    expect(defOf("character.lively")).toMatchObject({ section: "home", kind: "choice", default: "lively", options: ["still", "gentle", "lively"], applies: ["shell", "pages"], store: "settings", live: true });
    expect(defOf("character.restLowPower")).toMatchObject({ section: "home", kind: "switch", default: true, applies: ["shell", "pages"], store: "settings", live: true });
    expect(defOf("point.fly")).toMatchObject({ section: "pointing", kind: "switch", default: false, applies: ["shell", "pages"], store: "settings", live: true });
    expect(defOf("character.lively")!.from).toBeUndefined();
    // M55: the character's small moves are the pages' own (the shell never moves it for them), and nothing is migrated.
    expect(defOf("character.reacts")).toMatchObject({ section: "home", kind: "switch", default: true, scope: "app", applies: ["pages"], store: "settings", live: true });
    expect(defOf("character.reacts")!.from).toBeUndefined();
    // The character's place stays in dock.json (wrapped, T16), with Come to what it is about.
    for (const k of ["character.edge", "character.position", "character.sameEverywhere", "character.comeTo"]) expect(defOf(k)!.store, k).toBe("dock");
    // The shell applies every one; the pages read the two that change how Home itself behaves, and the motion.
    for (const k of ["island.show", "island.peekOnHover", "island.pointOpens", "island.openDelay", "island.closeDelay", "island.display", "island.followDelay", "home.size", "character.linger", "character.overFullScreen", "character.peek", "character.stick", "character.dockWhen", "character.peekIdle", "home.escStops"]) expect(defOf(k)!.applies, k).toEqual(["shell"]);
    expect(defOf("home.closeOnClickAway")!.applies).toEqual(["shell", "pages"]);
    expect(defOf("character.motion")!.applies).toEqual(["shell", "pages"]);
    expect(defOf("home.goToNeeds")!.applies).toEqual(["pages"]);
    // M55, adapts to you: the shell tells Home only the kind of app in front, and with the switch off reads nothing about it;
    // the order of More ways is the page's own.
    expect(defOf("home.followFrontApp")).toMatchObject({ section: "home", kind: "switch", default: true, scope: "app", applies: ["shell", "pages"], store: "settings", live: true });
    expect(defOf("home.usedOftenFirst")).toMatchObject({ section: "home", kind: "switch", default: true, scope: "app", applies: ["pages"], store: "settings", live: true });
    // The two with a fixed part say so under their rows.
    expect(defOf("island.show")!.floor).toBe("islandOff");
    expect(defOf("home.goToNeeds")!.floor).toBe("needsMarked");
    // None of them reaches the engine.
    for (const d of REGISTRY.settings.filter((x) => /^(island|home|character)\./.test(x.key))) expect(d.applies, d.key).not.toContain("runner");
  });
  test("area 1: the budgets, models, tries, plan steps, Try again and how long a question waits, with their ranges", () => {
    for (const k of ["budget.task", "budget.plan", "budget.rescue", "budget.research"]) expect(defOf(k), k).toMatchObject({ kind: "number", min: 0.5, max: 50, step: 0.5, unit: "dollars", scope: "app", applies: ["pages"], store: "settings", live: false, section: "spending", floor: "budgetDay" });
    expect(defOf("model.work")).toMatchObject({ kind: "choice", options: ["recommended", "careful"], applies: ["pages"], live: false });
    expect(defOf("model.rescue")).toMatchObject({ kind: "choice", options: ["careful", "recommended"], applies: ["pages"], live: false });
    expect(defOf("model.quick")).toMatchObject({ kind: "choice", options: ["fast", "recommended"], applies: ["runner"], live: true });
    expect(defOf("work.tries")).toMatchObject({ kind: "number", min: 1, max: 5, step: 1, unit: "count", applies: ["runner"], live: false });
    expect(defOf("work.askOnAnyFailure")).toMatchObject({ kind: "switch", applies: ["runner"], live: false });
    expect(defOf("drive.maxSteps")).toMatchObject({ kind: "number", min: 3, max: 20, step: 1, unit: "count", applies: ["runner"], live: false });
    // Left out on purpose (see the plan, area 1): "Pause a plan when I change the project myself" stays fixed at on.
    expect(defOf("drive.pauseOnMyEdits")).toBeUndefined();
    expect(defOf("work.tryAgain")).toMatchObject({ kind: "choice", options: ["carry_on", "fresh"], applies: ["runner"], live: false });
    // The top is 30 until a real run shows a hook still waiting past 32 minutes is honoured (T05): only shorter waits for now.
    expect(defOf("approval.waitMinutes")).toMatchObject({ kind: "number", min: 5, max: 30, step: 5, unit: "minutes", applies: ["runner"], live: true, floor: "noAnswerIsNo" });
    for (const k of Object.keys(AREA_1)) expect(defOf(k)!.scope, k).toBe("app");
  });
  test("the three settings the engine keeps itself are reached only through the engine", () => {
    for (const k of ["spend.dailyLimit", "explain.mode", "memory.paused", "numbers.on"]) expect(defOf(k)!.applies, k).toEqual(["runner"]);
  });
});

// The call apps the shell knows (presentation.rs CALL_APPS), read from its source so the usual list can never drift from it.
const CALL_APPS: string[] = [...readFileSync(new URL("../../app/src-tauri/src/presentation.rs", import.meta.url), "utf8").split("pub const CALL_APPS")[1].split("];")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

describe("area 5: pointing, talking and other apps keep their fixed parts", () => {
  test("hold to talk always has a cap: every choice is a number of seconds, none is longer than two minutes", () => {
    const d = defOf("talk.maxHold")!;
    expect(d.options).toEqual(["30", "60", "120"]);
    for (const o of d.options!) expect(Number(o) > 0 && Number(o) <= 120, o).toBe(true);
    for (const v of ["0", "none", "off", "never", ""]) expect(validateKey("talk.maxHold", v).ok, v).toBe(false);
  });
  test("a guess is never drawn solid: the only choices are the soft ring or words", () => {
    expect(defOf("point.guesses")!.options).toEqual(["softRing", "wordsOnly"]);
    for (const v of ["solid", "ring", "always"]) expect(validateKey("point.guesses", v).ok, v).toBe(false);
  });
  test("a ring that does not wait for a click stays 5 to 30 seconds, and nothing else", () => {
    expect(defOf("point.ringSeconds")).toMatchObject({ kind: "number", min: 5, max: 30, step: 1, unit: "seconds", default: 10 });
    expect(validateKey("point.ringSeconds", 0).ok).toBe(false);
    expect(validateKey("point.ringSeconds", 3600).ok).toBe(false);
  });
  test("the per app answers are protective: never in a section reset or Reset all, kept in prompt_help.json by the shell", () => {
    expect(defOf("ph.appAnswers")).toMatchObject({ kind: "custom", store: "promptHelpApps", protective: true, applies: ["shell"], default: null });
  });
  test("what may be said out loud is only from a fixed list, and the call apps start as the seven built in ones", () => {
    expect(defOf("speak.alsoSay")!.allowedItems).toEqual(["needsYou", "taskDone"]);
    expect(CALL_APPS.length).toBe(7);
    expect(defOf("calls.apps")).toMatchObject({ kind: "list", maxItems: 27 });
  });
  test("custom and protective stay narrow: no other store gets a custom editor, and only lists and the per app answers protect", () => {
    const base = (): Registry => JSON.parse(JSON.stringify(REGISTRY));
    const r = base();
    r.settings = r.settings.map((d) => (d.key === "point.colour" ? { ...d, protective: true } : d));
    expect(checkRegistry(r).join()).toContain("point.colour");
    const r3 = base();
    r3.settings = r3.settings.map((d) => (d.key === "ph.style" ? { ...d, store: "promptHelpApps" } as Def : d));
    expect(checkRegistry(r3).join()).toContain("ph.style");   // a plain setting can never use the per app answers' store
    const r4 = base();
    r4.settings = r4.settings.map((d) => (d.key === "ph.appAnswers" ? { ...d, store: "settings" } as Def : d));
    expect(checkRegistry(r4).join()).toContain("ph.appAnswers");   // and a custom one only the stores with their own editors
  });
});

describe("one set of rules for every value (the shared cases)", () => {
  test("every case gives the same answer and the same normalized value", () => {
    let n = 0;
    for (const c of cases) {
      if ("migrate" in c) continue;
      n++;
      const r = c.def ? validate(c.def as Def, c.value) : validateKey(c.key, c.value);
      const where = JSON.stringify(c);
      expect(r.ok, where).toBe(c.ok);
      if (r.ok) expect(r.value, where).toEqual(c.normalized);
      else expect(r.reason, where).toBe(c.reason);
    }
    expect(n).toBeGreaterThanOrEqual(3 * 5);
  });
  test("there are at least three cases for each kind: a valid one, a refused one and one that is tidied", () => {
    const byKind = new Map<string, { ok: number; no: number; tidied: number }>();
    for (const c of cases) {
      if ("migrate" in c) continue;
      const d: Def | undefined = c.def ?? defOf(c.key);
      const k = d?.kind ?? "unknown";
      const e = byKind.get(k) ?? { ok: 0, no: 0, tidied: 0 };
      if (c.ok) { e.ok++; if (JSON.stringify(c.normalized) !== JSON.stringify(c.value)) e.tidied++; } else e.no++;
      byKind.set(k, e);
    }
    for (const k of ["switch", "choice", "number", "text", "list"]) {
      const e = byKind.get(k)!;
      expect(e.ok + e.no, k).toBeGreaterThanOrEqual(3);
      expect(e.ok, k).toBeGreaterThan(0);
      expect(e.no, k).toBeGreaterThan(0);
    }
    for (const k of ["number", "text", "list"]) expect(byKind.get(k)!.tidied, k).toBeGreaterThan(0);
  });
  test("migration from page storage keeps exactly today's meaning of each stored word", () => {
    let n = 0;
    for (const c of cases) {
      if (!("migrate" in c)) continue;
      n++;
      const got = fromPageStorage(c.migrate, c.raw);
      if (c.absent) expect(got, JSON.stringify(c)).toBeUndefined();
      else expect(got, JSON.stringify(c)).toEqual(c.value);
    }
    expect(n).toBeGreaterThanOrEqual(15);
    expect(Object.keys(MIGRATION_MAPS).sort()).toEqual(["isOn", "isOne", "notOff", "notZero", "textSize"]);
  });
  test("a number between steps is put on the nearest step, and never past the top", () => {
    expect(validateKey("work.maxTurns", 199)).toEqual({ ok: true, value: 200 });
    expect(validateKey("spend.dailyLimit", 499.999)).toEqual({ ok: true, value: 500 });
    expect(validateKey("spend.dailyLimit", 19.99)).toEqual({ ok: true, value: 19.99 });
  });
  test("a value that looks like a key or a password is never kept", () => {
    for (const s of ["sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA", "ghp_abcdefghijklmnopqrstuvwxyz0123", "my password: hunter2hunter", "0123456789abcdef0123456789abcdef"]) expect(looksSecret(s), s).toBe(true);
    for (const s of ["Sign up", "Welcome back", "Save changes", "Total: 3 items"]) expect(looksSecret(s), s).toBe(false);
  });
});

describe("a broken list of settings is caught", () => {
  const base = (): Registry => JSON.parse(JSON.stringify(REGISTRY));
  const one = (patch: Partial<Def> & { key?: string }, kind?: string): string[] => {
    const r = base();
    const d = { ...(r.settings.find((x) => x.key === (kind ?? "work.maxTurns"))!), ...patch } as Def;
    r.settings = [...r.settings.filter((x) => x.key !== (kind ?? "work.maxTurns")), d];
    return checkRegistry(r);
  };
  test("a usual value outside its own range", () => expect(one({ default: 500 }).join()).toContain("work.maxTurns"));
  test("a range with nothing in it, or a step that does not fit", () => {
    expect(one({ min: 200, max: 20 }).length).toBeGreaterThan(0);
    expect(one({ step: 7 }).length).toBeGreaterThan(0);
    expect(one({ step: 0 }).length).toBeGreaterThan(0);
  });
  test("a choice with the same option twice, or a usual value that is not an option", () => {
    expect(one({ options: ["standard", "standard", "large"] }, "display.textSize").length).toBeGreaterThan(0);
    expect(one({ default: "giant" }, "display.textSize").length).toBeGreaterThan(0);
  });
  test("a section, a store, a kind or a reader that does not exist", () => {
    expect(one({ section: "nowhere" }).length).toBeGreaterThan(0);
    expect(one({ store: "cloud" as never }).length).toBeGreaterThan(0);
    expect(one({ kind: "slider" as never }).length).toBeGreaterThan(0);
    expect(one({ applies: ["phone" as never] }).length).toBeGreaterThan(0);
    expect(one({ applies: [] }).length).toBeGreaterThan(0);
  });
  test("a name that is not dotted lowerCamel, or used twice", () => {
    expect(one({ key: "Work.max_turns" }).length).toBeGreaterThan(0);
    const r = base(); r.settings.push({ ...r.settings[0] });
    expect(checkRegistry(r).length).toBeGreaterThan(0);
  });
  test("protective only for lists a person adds protections to, and never a plain setting as custom", () => {
    expect(one({ protective: true }).length).toBeGreaterThan(0);
    expect(one({ kind: "custom", default: null }).length).toBeGreaterThan(0);
  });
  test("a migration from a map that does not exist", () => {
    expect(one({ from: { pageStorage: { name: "companion.x", map: "maybe" as never } } }, "fun.reactions").length).toBeGreaterThan(0);
  });
  test("the engine's own stores only for settings the engine applies, for every project", () => {
    expect(one({ applies: ["pages"] }, "spend.dailyLimit").length).toBeGreaterThan(0);
    expect(one({ scope: "project" }, "explain.mode").length).toBeGreaterThan(0);
  });
});

describe("the engine inside the app has the registry", () => {
  test("every protocol file the engine imports is copied into the app by the staging script", () => {
    // The installed app's engine is a copy (app/scripts/stage-engine.sh): a protocol file it imports but the script leaves
    // out would stop the engine at launch while every test here passes.
    const src = new URL("../src/", import.meta.url).pathname;
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (f.endsWith(".ts")) files.push(f); } };
    walk(src);
    const needed = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/from "(?:\.\.\/)+protocol\/([\w.]+)"/g)) needed.add(m[1]);
    // And what those protocol files import themselves.
    for (const n of [...needed]) for (const m of readFileSync(new URL(`../../protocol/${n}`, import.meta.url), "utf8").matchAll(/from "\.\/([\w.]+)"/g)) needed.add(m[1]);
    expect([...needed].sort()).toEqual(expect.arrayContaining(["index.ts", "settings.json", "settings.ts"]));
    const stage = readFileSync(new URL("../../app/scripts/stage-engine.sh", import.meta.url), "utf8");
    const line = stage.split("\n").find((l) => l.startsWith("cp protocol/")) ?? "";
    for (const n of needed) expect(line, n).toContain(`protocol/${n}`);
  });
});
