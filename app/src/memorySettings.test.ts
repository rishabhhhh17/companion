// Area 3 of the settings plan on the pages: Start every task off the record, how long "Remembered" stays with Undo, and
// when Where was I is shown, as plain code (memorySettings.ts), and the places in Home that read them. Explain after a
// task is the engine's own: its state comes from the engine's event, and the Memory tab no longer has a copy of it.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PAGE_STORAGE_MARK } from "../../protocol/settings.ts";
import { _resetForTests, engineEvent, notHeard, setting, takeSnapshot } from "./settingsStore.ts";
import { offRecordAtStart, recapDue, toastMs } from "./memorySettings.ts";
import { settingsFor, DEFAULT_ANSWERS } from "./onboarding.ts";
import { S } from "./strings.ts";

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
    expect(card).toContain("useEffect(() => { setOff(offDefault); }, [offDefault]);");
    // After a task or a plan is sent, the box goes back to the setting, never simply unticked.
    expect(card).not.toContain("setOff(false)");
    expect(card.match(/setOff\(offRecordAtStart\(\)\)/g)?.length).toBe(2);
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

describe("Show Where was I after a break of (recap.after)", () => {
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
    snap({ "recap.after": "off" });
    expect(recapDue(now - 5 * HOUR, now)).toBe(false);
  });
  test("Home asks for Where was I only when it is due, for the folder chosen now", () => {
    // The listener is set up once, when Home first draws (before the folder is known), so it reads the folder as it is
    // when Home opens. Reading the one from the first draw meant Where was I was never asked for (found while building this).
    const at = card.indexOf('const off = listen("opened"');
    const opened = card.slice(at, card.indexOf("}, []);", at));
    expect(opened).toContain("const here = projectRef.current;");
    expect(opened).toContain("if (last && here && recapDue(last, Date.now())) void send(askRecap(here, new Date(last).toISOString()));");
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
    expect(S.set["memory.recallLength"].help).toMatch(/costs more/i);
    expect(S.set["explain.after"].help).toMatch(/costs less/i);
    for (const w of ["memory", "Explain", "pictures", "Your turn", "conversation"]) expect(S.set["task.offRecordByDefault"].help, w).toContain(w);
  });
});
