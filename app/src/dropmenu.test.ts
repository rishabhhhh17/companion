// F19, drop a file on the companion: the menu's state, its keys, its ring and its words. The shell decides what a file
// may get and runs the tools (convert.rs); this is only what the page shows and how a person moves through it.
import { describe, expect, test } from "bun:test";
import { EMPTY, actionWords, dropReduce, jobFrom, jobLine, keyMove, madeOf, menuFrom, parseTime, refusedLine, ringSpots, trimFrom, type DropState } from "./dropmenu.ts";
import { S } from "./strings.ts";

const menu = (over: Record<string, unknown> = {}) => ({ id: 7, names: ["photo.png"], kind: "image", actions: ["toJpeg", "toHeic", "resize"], refused: null, at: "dock", ...over });
const opened = (): DropState => dropReduce(EMPTY, { type: "menu", menu: menuFrom(menu()) });

describe("what the shell sends is checked before it is shown", () => {
  test("a menu needs a number, names and known actions", () => {
    expect(menuFrom(menu())).toEqual({ id: 7, names: ["photo.png"], kind: "image", actions: ["toJpeg", "toHeic", "resize"], refused: null, at: "dock" });
    expect(menuFrom(null)).toBeNull();
    expect(menuFrom({ ...menu(), id: "7" })).toBeNull();
    expect(menuFrom({ ...menu(), at: "elsewhere" })).toBeNull();
    // An action this page has no words for is left out, never shown as a bare code.
    expect(menuFrom(menu({ actions: ["toJpeg", "launchMissiles"] }))?.actions).toEqual(["toJpeg"]);
  });
  test("a job says how far it got, what it made, or why it stopped", () => {
    expect(jobFrom({ id: 7, phase: "running", done: 1, of: 3, percent: null })).toEqual({ id: 7, phase: "running", done: 1, of: 3, percent: null });
    expect(jobFrom({ id: 7, phase: "done", made: [{ name: "photo (converted).jpg", i: 0 }] })).toEqual({ id: 7, phase: "done", made: [{ name: "photo (converted).jpg", i: 0 }], why: null, skipped: 0 });
    expect(jobFrom({ id: 7, phase: "failed", why: "toolFailed", made: [] })?.phase).toBe("failed");
    expect(jobFrom({ id: 7, phase: "exploded" })).toBeNull();
  });
  test("a job stopped part way still names what it made, and a finished one how many it left as they were", () => {
    const made = [{ name: "a (converted).heic", i: 0 }];
    expect(jobFrom({ id: 7, phase: "stopped", made })).toEqual({ id: 7, phase: "stopped", made });
    expect(jobFrom({ id: 7, phase: "stopped" })).toEqual({ id: 7, phase: "stopped", made: [] });
    expect(jobFrom({ id: 7, phase: "done", made, skipped: 2 })).toEqual({ id: 7, phase: "done", made, why: null, skipped: 2 });
    expect(jobFrom({ id: 7, phase: "done", made, skipped: -1 })).toMatchObject({ skipped: 0 });
  });
  test("Show in Finder is offered for what was made, also when the job was stopped or failed part way", () => {
    const made = [{ name: "a (converted).heic", i: 0 }, { name: "b (converted).heic", i: 1 }];
    expect(madeOf({ id: 7, phase: "stopped", made })).toEqual(made);
    expect(madeOf({ id: 7, phase: "failed", why: "noPlace", made })).toEqual(made);
    expect(madeOf({ id: 7, phase: "done", made, why: null, skipped: 0 })).toEqual(made);
    expect(madeOf({ id: 7, phase: "running", done: 1, of: 5, percent: null })).toEqual([]);
  });
});

describe("the menu reducer", () => {
  test("a drop opens the menu on its first action, with nothing running", () => {
    const s = opened();
    expect(s.menu?.id).toBe(7);
    expect(s.focus).toBe(0);
    expect(s.trim).toBe(false);
    expect(s.job).toBeNull();
  });
  test("the arrows go round the ring both ways, Home and End go to the ends", () => {
    let s = opened();
    s = dropReduce(s, { type: "move", to: "prev" });
    expect(s.focus).toBe(2);
    s = dropReduce(s, { type: "move", to: "next" });
    expect(s.focus).toBe(0);
    s = dropReduce(s, { type: "move", to: "last" });
    expect(s.focus).toBe(2);
    s = dropReduce(s, { type: "move", to: "first" });
    expect(s.focus).toBe(0);
  });
  test("a press or VoiceOver landing on a choice makes it the current one, never past the ends", () => {
    expect(dropReduce(opened(), { type: "focus", i: 2 }).focus).toBe(2);
    expect(dropReduce(opened(), { type: "focus", i: 9 }).focus).toBe(0);
    expect(dropReduce(opened(), { type: "focus", i: -1 }).focus).toBe(0);
  });
  test("a new drop replaces the old menu and starts again at the top", () => {
    let s = dropReduce(opened(), { type: "move", to: "next" });
    s = dropReduce(s, { type: "menu", menu: menuFrom(menu({ id: 8, actions: ["split"] , kind: "pdf" })) });
    expect([s.menu?.id, s.focus]).toEqual([8, 0]);
  });
  test("Trim opens its two times; Back closes them", () => {
    let s = dropReduce(EMPTY, { type: "menu", menu: menuFrom(menu({ kind: "video", actions: ["toMp4", "trim"] })) });
    s = dropReduce(s, { type: "trim", open: true });
    expect(s.trim).toBe(true);
    s = dropReduce(s, { type: "trim", open: false });
    expect(s.trim).toBe(false);
  });
  test("job news for another drop is ignored", () => {
    const s = dropReduce(opened(), { type: "job", job: jobFrom({ id: 6, phase: "running", done: 0, of: 1, percent: null }) });
    expect(s.job).toBeNull();
  });
  test("while a job runs the menu cannot be closed (Stop ends it); once it is done it can", () => {
    let s = dropReduce(opened(), { type: "job", job: jobFrom({ id: 7, phase: "running", done: 0, of: 1, percent: 10 }) });
    expect(dropReduce(s, { type: "close" }).menu?.id).toBe(7);
    s = dropReduce(s, { type: "job", job: jobFrom({ id: 7, phase: "done", made: [{ name: "photo (converted).jpg", i: 0 }] }) });
    expect(dropReduce(s, { type: "close" })).toEqual({ ...EMPTY });
  });
  test("a drag over the window lights the character, and leaving puts it back", () => {
    let s = dropReduce(EMPTY, { type: "hover", over: true });
    expect(s.hover).toBe(true);
    s = dropReduce(s, { type: "hover", over: false });
    expect(s.hover).toBe(false);
    // A drop ends the hover.
    s = dropReduce(dropReduce(EMPTY, { type: "hover", over: true }), { type: "menu", menu: menuFrom(menu()) });
    expect(s.hover).toBe(false);
  });
  test("the shell closing the menu closes it here too", () => {
    expect(dropReduce(opened(), { type: "menu", menu: null }).menu).toBeNull();
  });
});

describe("keys", () => {
  test("arrows move, Home and End jump, Escape closes, Enter and Space choose", () => {
    expect(keyMove("ArrowRight")).toBe("next");
    expect(keyMove("ArrowDown")).toBe("next");
    expect(keyMove("ArrowLeft")).toBe("prev");
    expect(keyMove("ArrowUp")).toBe("prev");
    expect(keyMove("Home")).toBe("first");
    expect(keyMove("End")).toBe("last");
    expect(keyMove("Escape")).toBe("close");
    expect(keyMove("Enter")).toBe("pick");
    expect(keyMove(" ")).toBe("pick");
    expect(keyMove("a")).toBeNull();
  });
});

describe("the ring", () => {
  test("the first action is at the top and the rest go round clockwise, evenly", () => {
    const spots = ringSpots(4, 50);
    expect(spots[0]).toEqual({ x: 0, y: -50 });
    expect(spots[1]).toEqual({ x: 50, y: 0 });
    expect(spots[2]).toEqual({ x: 0, y: 50 });
    expect(spots[3]).toEqual({ x: -50, y: 0 });
    expect(ringSpots(0, 50)).toEqual([]);
  });
});

describe("trim times", () => {
  test("seconds, minutes and seconds, or hours too", () => {
    expect(parseTime("90")).toBe(90);
    expect(parseTime("1:30")).toBe(90);
    expect(parseTime("1:02:03")).toBe(3723);
    expect(parseTime(" 2.5 ")).toBe(2.5);
    expect(parseTime("")).toBeNull();
    expect(parseTime("1:75")).toBeNull();
    expect(parseTime("-3")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
  test("the end must come after the start", () => {
    expect(trimFrom("0:05", "0:20")).toEqual({ start: 5, end: 20 });
    expect(trimFrom("0:20", "0:05")).toBeNull();
    expect(trimFrom("", "0:05")).toEqual({ start: 0, end: 5 });
    expect(trimFrom("x", "0:05")).toBeNull();
  });
});

describe("words", () => {
  test("every action the shell can offer has a short name and a full one", () => {
    for (const id of ["toPng", "toJpeg", "toHeic", "toTiff", "toWebp", "resize", "compress", "merge", "split", "pdfCompress", "pagesToImages", "toPdf", "toText", "toDocx", "toRtf", "toHtml", "toM4a", "toWav", "toAiff", "toMp4", "toMov", "soundOnly", "trim"]) {
      const w = actionWords(id);
      expect(w?.short, id).toBeTruthy();
      expect(w?.label, id).toBeTruthy();
    }
    expect(actionWords("nope")).toBeNull();
  });
  test("progress, results and problems are said in plain words, never as codes", () => {
    expect(jobLine({ id: 1, phase: "running", done: 0, of: 1, percent: 40 })).toBe(S.drop.working(40));
    expect(jobLine({ id: 1, phase: "running", done: 1, of: 3, percent: null })).toBe(S.drop.workingOf(2, 3));
    expect(jobLine({ id: 1, phase: "done", made: [{ name: "a (converted).png", i: 0 }], why: null, skipped: 0 })).toBe(S.drop.made("a (converted).png"));
    expect(jobLine({ id: 1, phase: "stopped", made: [] })).toBe(S.drop.stopped);
    expect(jobLine({ id: 1, phase: "failed", why: "toolFailed", made: [] })).toBe(S.drop.why.toolFailed);
    expect(jobLine({ id: 1, phase: "failed", why: "somethingNew", made: [] })).toBe(S.drop.why.other);
    // Stopped after some were made: it says so, and does not claim nothing was kept.
    const two = [{ name: "a (converted).heic", i: 0 }, { name: "b (converted).heic", i: 1 }];
    expect(jobLine({ id: 1, phase: "stopped", made: two })).toBe(S.drop.stoppedMade(2));
    expect(S.drop.stoppedMade(2)).toContain("2");
    expect(S.drop.stoppedMade(1)).not.toBe(S.drop.stopped);
    // Files left as they were are said, after what was made.
    expect(jobLine({ id: 1, phase: "done", made: two, why: null, skipped: 1 })).toBe(`${S.drop.madeMany(2)} ${S.drop.skipped(1)}`);
    expect(S.drop.skipped(3)).toContain("3");
    // A compress that would not have been smaller, and a file already in the format asked for, have their own words.
    expect(jobLine({ id: 1, phase: "failed", why: "notSmaller", made: [] })).toBe(S.drop.why.notSmaller);
    expect(S.drop.why.notSmaller).not.toBe(S.drop.why.other);
    expect(jobLine({ id: 1, phase: "failed", why: "alreadyThat", made: [] })).toBe(S.drop.why.alreadyThat);
    expect(S.drop.why.alreadyThat).not.toBe(S.drop.why.other);
    expect(refusedLine("mixed")).toBe(S.drop.refused.mixed);
    expect(refusedLine("whatever")).toBe(S.drop.refused.unknownKind);
  });
  test("no em dashes in anything a person reads here", () => {
    expect(JSON.stringify(S.drop)).not.toContain("—");
  });
});
