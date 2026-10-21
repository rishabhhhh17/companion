// Undo that leaves the person's own files alone: the plain words, the second confirmed press, and the model (runner/src/checkpoints.ts, T06).
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { undoPutBack } from "./commands.ts";
import { initial, reduce, type Model } from "./model.ts";
import { S } from "./strings.ts";
import { fileNames, undoneExcept } from "./undoWords.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const undone = (yours: string[]) => run([ev({ type: "ui.undoAsked", checkpoint: "cp_3" }), ev({ type: "ui.undoSent" }),
  ev({ type: "checkpoint.restored", project: "p", checkpoint: "cp_3", safety: "cp_9", recovered: [], largeLeftAlone: [], leftAlone: [], yours })]);

describe("the words", () => {
  test("two files, as the founder wrote it", () => {
    expect(undoneExcept(["a.js", "b.css"])).toBe("Undone, except 2 files you changed yourself: a.js, b.css. They were left as you have them.");
  });
  test("one file reads right", () => {
    expect(undoneExcept(["a.js"])).toBe("Undone, except 1 file you changed yourself: a.js. It was left as you have it.");
  });
  test("many files name the first few and count the rest", () => {
    expect(fileNames(["a", "b", "c", "d", "e", "f", "g"])).toBe("a, b, c, d, e and 2 more");
  });
  test("the confirm lines say what is true for each setting, in plain words", () => {
    for (const t of [S.undoSure, S.undoKeeps, S.undoReplaces, S.undoPutBackSure]) { expect(t).not.toMatch(/—|–/); }
    expect(S.undoKeeps).toMatch(/left as you have them/);
    expect(S.undoReplaces).toMatch(/recovery folder/);
    expect(S.undoReplaces).toMatch(/plan was paused/);
  });
});

describe("Put those back too", () => {
  test("the command is valid protocol and always carries the yes", () => {
    const c = undoPutBack("/p", "cp_3");
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "checkpoint.putBack", project: "/p", checkpoint: "cp_3", confirm: true });
    expect(parseCommand(JSON.stringify({ ...c, confirm: false })).ok).toBe(false);
    expect(parseCommand(serialize(undoPutBack("/p", "cp_3", ["a.js"]))).ok).toBe(true);
  });
  test("an Undo that kept files remembers them, and offers the second press only then", () => {
    expect(undone(["a.js", "b.css"]).undo).toMatchObject({ stage: "done", yours: ["a.js", "b.css"] });
    expect(undone([]).undo?.yours).toBeUndefined();
    expect(reduce(undone([]), { type: "ui.putBackAsked" } as never).undo?.putBack).toBeUndefined();
  });
  test("asking only asks; nothing is sent until the second yes, and Leave them takes it back", () => {
    const asked = reduce(undone(["a.js"]), { type: "ui.putBackAsked" } as never);
    expect(asked.undo?.putBack).toBe("confirm");
    expect(reduce(asked, { type: "ui.putBackCancelled" } as never).undo?.putBack).toBeUndefined();
    expect(reduce(undone(["a.js"]), { type: "ui.putBackSent" } as never).undo?.putBack).toBeUndefined();   // not without asking first
  });
  test("done clears the list; a refusal says why and keeps the list", () => {
    const working = reduce(reduce(undone(["a.js", "b.css"]), { type: "ui.putBackAsked" } as never), { type: "ui.putBackSent" } as never);
    expect(working.undo?.putBack).toBe("working");
    const ok = reduce(working, ev({ type: "checkpoint.putBackDone", project: "p", checkpoint: "cp_3", ok: true, putBack: ["a.js", "b.css"], skipped: [] }) as never);
    expect(ok.undo).toMatchObject({ putBack: "done", yours: [] });
    const no = reduce(working, ev({ type: "checkpoint.putBackDone", project: "p", checkpoint: "cp_3", ok: false, putBack: [], skipped: [], reason: "Something is still working on this project." }) as never);
    expect(no.undo).toMatchObject({ putBack: "failed", putBackNote: "Something is still working on this project.", yours: ["a.js", "b.css"] });
    const some = reduce(working, ev({ type: "checkpoint.putBackDone", project: "p", checkpoint: "cp_3", ok: true, putBack: ["a.js"], skipped: ["b.css"] }) as never);
    expect(some.undo?.yours).toEqual(["b.css"]);
  });
  test("an answer for another undo point is ignored", () => {
    const working = reduce(reduce(undone(["a.js"]), { type: "ui.putBackAsked" } as never), { type: "ui.putBackSent" } as never);
    expect(reduce(working, ev({ type: "checkpoint.putBackDone", project: "p", checkpoint: "cp_other", ok: true, putBack: ["a.js"], skipped: [] }) as never).undo?.putBack).toBe("working");
  });
});
