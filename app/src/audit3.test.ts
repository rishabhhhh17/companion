// Audit round 3 (24 Oct 2026): each test here failed against the code as it was, then the smallest fix made it pass.
import { describe, expect, test } from "bun:test";
import { baseName } from "../../runner/src/attach.ts";
import { addFiles, type FileLike } from "./attachfiles.ts";
import { sizeWords } from "./made.ts";
import { S } from "./strings.ts";

const HIDDEN_ODD = new RegExp("[\\u061c\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\u200b-\\u200f\\u{e0000}-\\u{e007f}]", "u");
const broken = (name: string): FileLike => ({ name, size: 10, type: "", arrayBuffer: async () => { throw new Error("gone"); } });

describe("a file name is shown and sent clean, whatever it holds", () => {
  test("text direction marks, line separators and invisible tag characters are taken out of a name", () => {
    expect(baseName("a؜b.txt")).toBe("ab.txt");           // Arabic letter mark: changes the direction of what is next to it
    expect(baseName("a b.txt")).toBe("ab.txt");           // line separator
    expect(baseName("report\u{e0049}\u{e0067}.txt")).toBe("report.txt");   // tag characters show as nothing but are read by a model
    expect(baseName("x‮gpj.txt")).toBe("xgpj.txt");
  });
  test("a file that cannot be read is named by its clean name in the note, never by the raw one", async () => {
    const r = await addFiles([], [broken("/Users/me/Desktop/‮notes؜.txt")]);
    expect(r.notes.length).toBe(1);
    expect(r.notes[0]).not.toMatch(HIDDEN_ODD);
    expect(r.notes[0]).not.toContain("/Users/me");
    expect(r.notes[0]).toBe(S.attachUnreadable("notes.txt"));
  });
  test("the file past the most per drop is named by its clean name too", async () => {
    const many = Array.from({ length: 21 }, (_, i) => broken(i === 20 ? "/tmp/‮extra.txt" : `f${i}.txt`));
    const r = await addFiles([], many);
    const last = r.notes[r.notes.length - 1];
    expect(last).not.toMatch(HIDDEN_ODD);
    expect(last).not.toContain("/tmp");
  });
});

describe("a size that stopped early is never said to be a megabyte or more when it is not", () => {
  test("a small count that stopped early (a part could not be looked into) says the size was not counted", () => {
    expect(sizeWords(0, true)).toBe(S.made.sizeUnknown);
    expect(sizeWords(2048, true)).toBe(S.made.sizeUnknown);
    expect(sizeWords(734_003_200, true)).toBe("At least about 734 MB");   // a big count is still said, as at least
  });
});
