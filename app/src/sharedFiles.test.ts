// The shared files row in the Memory tab (M14): the words, what the shell's answer means, and the one command the button sends.
// The shell's own check (is the open project directly inside the folder for all of them, and the state of the two files) is
// tested in app/src-tauri/src/sharedfiles.rs; the answers are the shared cases in protocol/fixtures/shared-files.jsonl.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addSharedFilesCommand, sharedFrom, sharedRow, type Shared } from "./sharedFiles.ts";
import { answerAgents } from "./commands.ts";
import { PRODUCT, S } from "./strings.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const CASES = read("../../protocol/fixtures/shared-files.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { name: string; state: string });

describe("the answers the shell sends, shared with its tests", () => {
  test("every shared case is read as it is, and all four states have a case", () => {
    expect(CASES.map((c) => c.state).sort()).toEqual(["added", "no", "offer", "own"]);
    for (const c of CASES) expect(sharedFrom({ state: c.state }), c.name).toBe(c.state as Shared);
  });
  test("an answer that is not one of the four is not read, so no row is drawn and nothing is offered", () => {
    for (const bad of [undefined, null, 5, "offer", [], {}, { state: "" }, { state: "yes" }, { state: "Offer" }, { state: 1 }, { state: null }]) expect(sharedFrom(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("the row", () => {
  test("nothing is drawn when it is not a made folder or the answer was not read", () => {
    expect(sharedRow("no", false)).toBeNull();
    expect(sharedRow(null, false)).toBeNull();
    expect(sharedRow(null, true)).toBeNull();
  });
  test("a made folder with neither file says what the two files are for and offers one button, Add them", () => {
    const r = sharedRow("offer", false)!;
    expect(r.button).toBe("Add them");
    expect(r.text).toContain("AGENTS.md and CLAUDE.md");
    expect(r.text).toContain("other AI coding tools");
    expect(r.text).toContain("about the project");
  });
  test("after Add them was pressed the button is gone, and it says plainly the files come when there are notes to put in them", () => {
    const r = sharedRow("offer", true)!;
    expect(r.button).toBeNull();
    expect(r.text).toContain("as soon as");
    expect(r.text).toContain(PRODUCT);
    expect(r.text).not.toMatch(/^Added/);
  });
  test("once the files are there it says Added and never offers again, whether or not it was pressed in this visit", () => {
    for (const asked of [false, true]) {
      const r = sharedRow("added", asked)!;
      expect(r.text.startsWith("Added.")).toBe(true);
      expect(r.button).toBeNull();
    }
  });
  test("a person's own file is named, left alone, and nothing is offered", () => {
    for (const asked of [false, true]) {
      const r = sharedRow("own", asked)!;
      expect(r.text).toContain("own AGENTS.md or CLAUDE.md");
      expect(r.text).toContain("leaves");
      expect(r.button).toBeNull();
    }
  });
  test("the words are plain: no jargon, no em dashes, and they come from the strings file", () => {
    const words = [S.sharedFiles.offer, S.sharedFiles.add, S.sharedFiles.saved, S.sharedFiles.added, S.sharedFiles.own].join(" ");
    expect(words).not.toMatch(/—|\bAPI\b|\bsidecar\b|\bprotocol\b|\bmemory\.agents\b|\bblock\b/i);
    expect(S.sharedFiles.add).toBe("Add them");
  });
});

describe("the button's command", () => {
  test("it is the same command the existing question card sends for a yes, for the project open", () => {
    const a = addSharedFilesCommand("/Users/sam/Squibby makes/Website");
    const b = answerAgents("/Users/sam/Squibby makes/Website", "yes");
    expect({ ...a, id: "" }).toEqual({ ...b, id: "" });
    expect(a).toMatchObject({ v: 1, type: "memory.agents", answer: "yes", project: "/Users/sam/Squibby makes/Website" });
  });
});

describe("where it is drawn", () => {
  const card = read("./card.tsx"), row = read("./sharedFilesRow.tsx");
  test("the Memory tab draws the row from the shell's answer, and the page sends the shell no folder", () => {
    expect(card).toContain("<SharedFilesRow");
    expect(row).toContain('invoke("shared_files_state")');
    expect(row).not.toMatch(/invoke\("shared_files_state",/);
    expect(row).toContain("addSharedFilesCommand(");
  });
});
