// Area 3 of the settings plan on the pages: Start every task off the record, how long "Remembered" stays with Undo, and
// when Where was I is shown, as plain code (memorySettings.ts), and the places in Home that read them. Explain after a
// task is the engine's own: its state comes from the engine's event, and the Memory tab no longer has a copy of it.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PAGE_STORAGE_MARK } from "../../protocol/settings.ts";
import { _resetForTests, engineEvent, notHeard, setting, takeSnapshot } from "./settingsStore.ts";
import { offBoxAfter, offRecordAtStart, recapDue, toastMs } from "./memorySettings.ts";
import { settingsFor, DEFAULT_ANSWERS } from "./onboarding.ts";
import { S } from "./strings.ts";
import { DRAFT_KEY, draftToKeep, putBack } from "./askbox.ts";
import { askResearch, diagnose } from "./commands.ts";
import { initial, reduce } from "./model.ts";
import { researchCopy } from "./copytext.ts";
import { parseCommand, parseEvent, serialize } from "../../protocol/index.ts";

afterEach(() => { _resetForTests(); });
const snap = (values: Record<string, unknown>) => takeSnapshot({ values, usual: {}, project: "", migrated: [PAGE_STORAGE_MARK], problems: [], changed: [] });
const MIN = 60_000, HOUR = 60 * MIN;
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");

describe("Start every task off the record (task.offRecordByDefault)", () => {
  test("usual: the box starts unticked, as today", () => {
    expect(offRecordAtStart()).toBe(false);
  });
  test("on: the box starts ticked", () => {
    snap({ "task.offRecordByDefault": true });
    expect(offRecordAtStart()).toBe(true);
    snap({});
    expect(offRecordAtStart()).toBe(false);
  });
  test("Home ticks the box from the setting, and ticks it again after each send", () => {
    expect(card).toContain('const offDefault = useSetting("task.offRecordByDefault") === true;');
    expect(card).toContain('useEffect(() => { setOff((ticked) => offBoxAfter(ticked, box.current?.value ?? "", offDefault)); }, [offDefault]);');
    // After a task, a plan or a question is sent (each empties the box), the box goes back to the setting, never simply
    // unticked. Rescue leaves the words in the box, so it goes back only the way the setting changing does. The fourth is
    // a request sent to a new folder (startNew), which empties the box too.
    expect(card).not.toContain("setOff(false)");
    expect(card.match(/setOff\(offRecordAtStart\(\)\)/g)?.length).toBe(4);
    expect(card.match(/setOff\(\(ticked\) => offBoxAfter\(ticked, box\.current\?\.value \?\? ""/g)?.length).toBe(2);
  });
  test("the setting going off never unticks a box with words in it, so words typed off the record are never kept", () => {
    // The Settings tab is inside Home, so the ask box keeps its words while the person turns the setting off there. Reset
    // all, Reset this section, Undo, and a settings file that could not be read (the usual values) do the same.
    const kept = new Map<string, string>();
    // What Home does with the draft (card.tsx keepDraft): only through draftToKeep, with the box as it is.
    const keepDraft = (text: string, ticked: boolean) => { const d = draftToKeep(text, ticked); if (d === null) kept.delete(DRAFT_KEY); else kept.set(DRAFT_KEY, d); };
    snap({ "task.offRecordByDefault": true });
    let ticked = offBoxAfter(false, "");
    expect(ticked).toBe(true);
    const words = "plans for Sam's surprise party";
    keepDraft(words, ticked);                       // typed while ticked: nothing kept
    for (const usual of [{}, { "task.offRecordByDefault": false }]) {
      snap(usual);                                  // turned off, or back to the usual value
      const was = ticked;
      ticked = offBoxAfter(ticked, words);
      expect(ticked).toBe(true);
      if (ticked !== was) keepDraft(words, ticked);  // Home keeps the draft again only when the box changes
      expect(kept.has(DRAFT_KEY)).toBe(false);
    }
    // Only an empty box goes back to unticked, and the person can still untick it by hand.
    expect(offBoxAfter(true, "")).toBe(false);
    expect(offBoxAfter(true, "  \n ")).toBe(false);
    // Turning the setting on ticks the box whatever is in it: the safe way.
    snap({ "task.offRecordByDefault": true });
    expect(offBoxAfter(false, words)).toBe(true);
    snap({});
    expect(offBoxAfter(false, words)).toBe(false);
  });
  test("words put back after a refusal come back with the box as they were sent", () => {
    // With the setting on, a person who unticked the box for one request gets it back unticked, not quietly ticked.
    const at = card.indexOf("const putBackSent = () => {");
    const body = card.slice(at, card.indexOf("};", at));
    expect(body).toContain("if (r.text !== undefined) { offNow.current = !!r.off; setOff(!!r.off); setBox(r.text); }");
    expect(body.indexOf("setOff(!!r.off)")).toBeLessThan(body.indexOf("setBox(r.text)"));   // never kept before the box is set
    expect(putBack({ prompt: "add a page", attached: [], off: false }, { text: "", attached: [] }).off).toBe(false);
    expect(putBack({ prompt: "add a page", attached: [], off: true }, { text: "", attached: [] }).off).toBe(true);
  });
});

describe("Rescue and Look up go off the record with the box too", () => {
  // The box sits under Start, Plan, Rescue and Look up, so it covers all four (with the setting on it is the normal state).
  test("the commands carry it only when the box is ticked", () => {
    for (const c of [diagnose("/p", true), askResearch("/p", "How do I take payments?", true)!]) {
      expect((c as any).offTheRecord, c.type).toBe(true);
      expect(parseCommand(serialize(c)).ok, c.type).toBe(true);
    }
    for (const c of [diagnose("/p"), askResearch("/p", "How do I take payments?")!, diagnose("/p", false), askResearch("/p", "q", false)!]) expect("offTheRecord" in c, c.type).toBe(false);
  });
  test("Home sends the box with them", () => {
    const rescue = card.slice(card.indexOf("const rescue = () => {"), card.indexOf("// When the improved text is ready"));
    expect(rescue).toContain("void send(diagnose(project, off));");
    expect(rescue).toContain('setOff((ticked) => offBoxAfter(ticked, box.current?.value ?? ""));');
    const research = card.slice(card.indexOf("const research = () => {"), card.indexOf("const plan = () => {"));
    expect(research).toContain('const c = askResearch(project, box.current?.value ?? "", off);');
    expect(research).toContain("setOff(offRecordAtStart());");
  });
  test("off the record, Look up files no notes, and the card says so", () => {
    const e = { v: 1, id: "e", type: "research.done", agent: "a", title: "Taking payments", answer: "Use a hosted checkout page.", notes: [{ text: "Checkout is hosted.", source: "https://docs.stripe.com/payments/checkout" }] };
    expect(parseEvent(JSON.stringify(e)).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...e, file: 7 })).ok).toBe(false);
    const r = reduce(initial(), e as never).research!;
    expect(r.file).toBeUndefined();
    expect(researchCopy(r)).toBe(["Taking payments", "Use a hosted checkout page.", `${S.researchNotes}:`, "- Checkout is hosted. (https://docs.stripe.com/payments/checkout)", S.researchNotFiled].join("\n"));
    expect(S.researchNotFiled).toMatch(/off the record/i);
    const panel = card.slice(card.indexOf('{show("research") && m.research && ('), card.indexOf("</section>", card.indexOf('{show("research") && m.research && (')));
    expect(panel).toContain("{m.research.file ? `${S.researchFiled} ${m.research.file}` : S.researchNotFiled}");
  });
});

describe("How long \"Remembered\" stays, with Undo (memory.toastSeconds)", () => {
  test("usual: ten seconds, as today", () => {
    expect(toastMs()).toBe(10_000);
  });
  test("each choice, and until it is closed", () => {
    expect([toastMs("5"), toastMs("10"), toastMs("20"), toastMs("60")]).toEqual([5_000, 10_000, 20_000, 60_000]);
    expect(toastMs("untilClosed")).toBeNull();
    for (const bad of ["15", 10, null, undefined, "forever"]) expect(toastMs(bad as never), String(bad)).toBe(10_000);
    snap({ "memory.toastSeconds": "60" });
    expect(toastMs()).toBe(60_000);
  });
  test("Home waits for the setting, and with until closed there is a Close button and no timer", () => {
    const at = card.indexOf("// The \"remembered\" toast");
    const effect = card.slice(at, card.indexOf("}, [m.toast?.lines.length]);", at));
    expect(effect).toContain("const ms = toastMs();");
    expect(effect).toContain("if (ms === null) return;");
    expect(effect).toContain("setTimeout(() => dispatch({ type: \"ui.toastClear\" }), ms)");
    expect(effect).not.toContain("10000");
    const panel = card.slice(card.indexOf('{show("toast") && m.toast && ('), card.indexOf('{show("memory") && !project'));
    expect(panel).toContain('{toastMs() === null && <button className="btn" type="button" onClick={() => dispatch({ type: "ui.toastClear" })}>{S.memoryClose}</button>}');
  });
});

describe("Show Where was I after a break of (where.after)", () => {
  const now = new Date(2026, 9, 19, 9, 0).getTime();
  test("usual: after 30 minutes away, as today", () => {
    expect(recapDue(now - 30 * MIN, now)).toBe(true);
    expect(recapDue(now - 30 * MIN + 1, now)).toBe(false);
  });
  test("two hours", () => {
    expect(recapDue(now - 2 * HOUR, now, "2h")).toBe(true);
    expect(recapDue(now - 2 * HOUR + 1, now, "2h")).toBe(false);
    expect(recapDue(now - 31 * MIN, now, "2h")).toBe(false);
  });
  test("the next day: only when the last visit was before today began, however short the break", () => {
    const lateLastNight = new Date(2026, 9, 18, 23, 59).getTime(), justAfterMidnight = new Date(2026, 9, 19, 0, 1).getTime();
    expect(recapDue(lateLastNight, justAfterMidnight, "nextDay")).toBe(true);
    const earlyToday = new Date(2026, 9, 19, 0, 1).getTime(), lateToday = new Date(2026, 9, 19, 23, 59).getTime();
    expect(recapDue(earlyToday, lateToday, "nextDay")).toBe(false);
    expect(recapDue(new Date(2026, 9, 19, 0, 0).getTime(), lateToday, "nextDay")).toBe(false);
  });
  test("off: never", () => {
    expect(recapDue(now - 30 * 24 * HOUR, now, "off")).toBe(false);
  });
  test("never without a last visit, and a choice it does not know is the usual one", () => {
    expect(recapDue(0, now)).toBe(false);
    expect(recapDue(0, now, "nextDay")).toBe(false);
    expect(recapDue(now - 30 * MIN, now, "1h")).toBe(true);
    snap({ "where.after": "off" });
    expect(recapDue(now - 5 * HOUR, now)).toBe(false);
  });
  test("Home asks for Where was I only when it is due, for the folder chosen now", () => {
    // The listener is set up once, when Home first draws (before the folder is known), so it reads the folder as it is
    // when Home opens. Reading the one from the first draw meant Where was I was never asked for (found while building this).
    const at = card.indexOf('const off = listen("opened"');
    const opened = card.slice(at, card.indexOf("}, []);", at));
    expect(opened).toContain("const here = projectRef.current;");
    // Recaps are Pro (the payments spec, section 2): the older version is asked only on a plan that covers it, which is
    // every plan while payments are off (plan.ts proCovers), so with payments off this is exactly as before.
    expect(opened).toContain("if (last && here && recapDue(last, Date.now())) { if (toolOn(\"whereWasI\")) void sendQuiet(whereWasI(here, new Date(last).toISOString())); else if (proCovers(planNow())) void sendQuiet(askRecap(here, new Date(last).toISOString())); }");
    expect(opened).not.toMatch(/\bproject\b(?!Ref)/);
    expect(card).not.toContain("AWAY_MS");
  });
});

describe("Explain after a task (explain.mode) on the pages", () => {
  test("its value comes from the engine's own event, and is not known until then", () => {
    expect(setting("explain.mode")).toBe("reasonsAndQuestion");
    expect(notHeard("memory")).toEqual(["explain.mode", "memory.paused"]);
    engineEvent({ type: "explain.state", project: "/p", enabled: true, mode: "reasons" });
    expect(setting("explain.mode")).toBe("reasons");
    engineEvent({ type: "explain.state", project: "/p", enabled: false, mode: "off" });
    expect(setting("explain.mode")).toBe("off");
    expect(notHeard("memory")).toEqual(["memory.paused"]);
    // An event without a choice it knows changes nothing.
    expect(engineEvent({ type: "explain.state", project: "/p", enabled: true })).toBe(false);
    expect(engineEvent({ type: "explain.state", project: "/p", enabled: true, mode: "loud" })).toBe(false);
    expect(setting("explain.mode")).toBe("off");
  });
  test("the Memory tab has no copy of it any more: it lives in Settings only", () => {
    expect(card).not.toContain('changeSetting("explain');
    expect(card).not.toContain('useSetting("explain');
    expect(card).not.toContain("S.explainSetting");
  });
  test("the first run's answer still sets it: yes is reasons and a question (the usual), no is off", () => {
    expect(settingsFor({ ...DEFAULT_ANSWERS, explain: true })).toContainEqual(["explain.mode", "reasonsAndQuestion"]);
    expect(settingsFor({ ...DEFAULT_ANSWERS, explain: false })).toContainEqual(["explain.mode", "off"]);
  });
});

describe("the words", () => {
  test("Pause learning says plainly that it only stops new lines, and how to stop Claude being told them", () => {
    const pause = S.set["memory.paused"].help;
    expect(pause).toMatch(/new lines only/i);
    expect(pause).toContain(S.set["memory.tellClaude"].label);
  });
  test("the help lines say what costs more, and what off the record turns off", () => {
    expect(S.set["memory.recallLength"].help).toMatch(/slower/i);   // M72 (F29): Squibby pays, so it says what the person notices
    expect(S.set["explain.after"].help).toMatch(/fewer explanations/i);   // M72 (F29): Squibby pays
    for (const w of ["memory", "Explain", "pictures", "Your turn", "conversation"]) expect(S.set["task.offRecordByDefault"].help, w).toContain(w);
    // It names every button the box covers.
    for (const b of [S.start, S.planIt, S.rescueIt, S.researchIt]) expect(S.set["task.offRecordByDefault"].help, b).toContain(b);
  });
});
