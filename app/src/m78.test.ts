// M78, memory that is never lost (docs/milestones/M78-memory.md): the pages' side. The start block shown exactly as the
// engine sends it, each line with its source and Forget (a house rule goes to Settings instead), the Settings row of the
// start hook with its card, export and restore (a restore asks first and carries the yes), the never lost words only with
// both rows on the page, and no word about saving tokens anywhere.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { doneAsk, doneStateFrom, hookLabel } from "./doneSignal.ts";
import { exportCount, exportName, restoredFrom, restoredWords, START_SETTINGS, startFrom, startView } from "./memoryStart.ts";
import { addDoneSignal, removeDoneSignal, restoreMemory } from "./commands.ts";
import { placeOf } from "./settingsPages.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const ev = (m: Model, e: Record<string, unknown>) => reduce(m, { v: 1, id: "e", ...e } as never);
const NO_DASH = /—|–/;
const fixture = (id: string) => JSON.parse(read("../../protocol/fixtures/events.jsonl").split("\n").find((l) => l.includes(`"id":"${id}"`))!);

describe("the start block on the Memory page", () => {
  test("the engine's block reaches the page as it was sent", () => {
    const e = fixture("m78e1");
    const m = ev({ ...initial(), folder: "/Users/x/site" }, { ...e, project: "/Users/x/site" });
    expect(m.memory?.start?.text).toBe(e.start.text);
    expect(m.memory?.start?.lines.length).toBe(3);
    // An older engine sends no block: the page says it is not set up, never a made up block.
    const old = ev({ ...initial(), folder: "/Users/x/site" }, { type: "memory.state", project: "/Users/x/site", paused: false, projectLines: [], profileLines: [], problems: [] });
    expect(old.memory?.start).toBeNull();
    expect(startView(null)).toMatchObject({ setUp: true, rows: [], line: S.m78.startOff });
  });
  test("each line keeps its source; a memory line offers Forget, a house rule offers Change in Settings", () => {
    const v = startView(startFrom(fixture("m78e1").start));
    expect(v.rows.map((r) => [r.kind, r.action, r.source])).toEqual([["rule", "change", "your house rules"], ["decision", "forget", 'you said "we decided"'], ["failed", "forget", "a fix that was not proven"]]);
    // M79: the block carries no search line any more (the memory lab), so the page does not say Claude can search.
    expect(v.setUp).toBe(false); expect(v.search).toBe(false); expect(v.line).toBe(S.m78.startOn);
    expect(startView({ ...startFrom(fixture("m78e1").start)!, text: `${fixture("m78e1").start.text}More notes: run x\n` }).search).toBe(true);
    expect(placeOf(START_SETTINGS.rules)).not.toBeNull();
    expect(placeOf(START_SETTINGS.hook)).toMatchObject({ page: "fixing", group: "fixing.done" });
  });
  test("a block that is not set up says so and offers Set up in Settings", () => {
    const v = startView({ hook: false, text: "", lines: [] });
    expect(v).toMatchObject({ setUp: true, empty: true, line: S.m78.startOff });
  });
  test("anything that is not a block is dropped", () => {
    expect(startFrom({ hook: "yes", text: "", lines: [] })).toBeNull();
    expect(startFrom({ hook: true, text: "x", lines: [{ kind: "weird", text: "a", source: "b", date: "" }] })!.lines).toEqual([]);
  });
  test("the part sits at the top of the Memory page, before the lists, and shows the block exactly in a details", () => {
    const card = read("./card.tsx"), part = read("./memoryStart.tsx");
    expect(card.indexOf("<StartBlockPart")).toBeGreaterThan(0);
    expect(card.indexOf("<StartBlockPart")).toBeLessThan(card.indexOf('<MemoryList title={S.screens.aboutProject'));
    expect(part).toContain("<pre tabIndex={0} aria-label={S.m78.startAsSeen}>{start.text}</pre>");
  });
});

describe("the start hook in Settings", () => {
  test("its row and its card, with the exact entry shown before the yes", () => {
    const st = doneStateFrom(fixture("m78e4"), "p_9f2c")!;
    expect(st.tools).toEqual([expect.objectContaining({ tool: "claude", hook: "start", on: false })]);
    const row = st.tools[0];
    expect(hookLabel(row)).toEqual({ label: S.doneSignal.hookTitle.start, line: S.doneSignal.hookLine.start });
    const w = doneAsk(row);
    expect(w.title).toBe(S.doneSignal.askTitleFor.start);
    expect(w.what).toContain("SessionStart");
    expect(w.notes[0]).toBe(S.doneSignal.askWhatFor.start);
  });
  test("adding sends the yes, and both carry the hook", () => {
    expect(addDoneSignal("/p", "claude", "start")).toMatchObject({ type: "donesignal.add", confirm: true, hook: "start" });
    expect(removeDoneSignal("/p", "claude", "start")).toMatchObject({ type: "donesignal.remove", hook: "start" });
  });
});

describe("export and restore", () => {
  test("a restore always carries the yes", () => {
    expect(restoreMemory("/p", "x")).toMatchObject({ type: "memory.restore", project: "/p", text: "x", confirm: true });
  });
  test("the yes says how many lines the file holds, read the way the engine reads it", () => {
    const text = JSON.parse(read("../../protocol/fixtures/commands.jsonl").split("\n").find((l) => l.includes('"id":"m78c3"'))!).text;
    expect(exportCount(text)).toBe(2);
    expect(exportCount("# My notes\n- a\n")).toBeNull();
    expect(S.m78.restoreAsk(2)).toBe("Put back the 2 lines from this file? Nothing here is removed.");
    expect(S.m78.restoreAsk(1)).toBe("Put back the line from this file? Nothing here is removed.");
  });
  test("the answer in plain words, and a refused file says why", () => {
    expect(restoredWords(restoredFrom(fixture("m78e2"), "p_9f2c")!)).toBe("Put back 2 lines.");
    expect(restoredWords({ added: 1, skipped: 2, forgotten: 1, refused: 1 })).toBe("Put back 1 line. 2 were already here. 1 stays forgotten, as you asked. 1 was left out, because notes never keep that kind of line.");
    expect(restoredWords(restoredFrom(fixture("m78e3"), "p_9f2c")!)).toContain("not a notes export");
    expect(restoredFrom(fixture("m78e2"), "other")).toBeNull();
  });
  test("the save dialog offers the project's name and the date", () => {
    expect(exportName("mug-shop", new Date(2026, 10, 10))).toBe("mug-shop notes 2026-11-10");
  });
  test("both rows are on the Memory page, and the never lost words come only with them", () => {
    const card = read("./card.tsx"), part = read("./memoryStart.tsx");
    expect(card).toContain("<NotesBackupRows");
    expect(part).toContain('invoke("save_notes"'); expect(part).toContain('invoke("open_notes_file")');
    // The never lost words sit on the Export row, beside Restore, and nowhere else in the app's own code.
    expect(part).toContain("S.m78.neverLost");
    const elsewhere = ["./card.tsx", "./settingsPage.tsx", "./homeRest.tsx", "./onboarding.tsx"].filter((f) => read(f).includes("neverLost"));
    expect(elsewhere).toEqual([]);
    // The old text box with every note is gone: the export is a file now.
    expect(card).not.toContain('className="export"');
  });
});

describe("words", () => {
  test("plain, no dashes, and no claim about saving tokens or money anywhere", () => {
    const all = [...Object.values(S.m78).map((v) => (typeof v === "function" ? (v as (...a: never[]) => string)(...([2, "x"] as never[])) : String(v))), S.doneSignal.hookTitle.start, S.doneSignal.hookLine.start, S.doneSignal.askTitleFor.start, S.doneSignal.askWhatFor.start, S.set["memory.triedAndFailed"].label, S.set["memory.triedAndFailed"].help];
    for (const t of all) { expect(NO_DASH.test(t), t).toBe(false); expect(/token|cheaper|save money|saves money|cost less/i.test(t), t).toBe(false); }
    const strings = read("./strings.ts");
    expect(/(save|saves|saving|fewer|less) (you )?tokens/i.test(strings)).toBe(false);
  });
  test("the new setting lives with the other memory settings", () => {
    expect(placeOf("memory.triedAndFailed")).toMatchObject({ topic: "more.privacy.memory" });
  });
});
