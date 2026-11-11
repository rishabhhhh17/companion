// M15 wave 2: a failure from Squibby's own machinery on a press is one plain sentence; the raw words go to the log.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { failLine } from "./failwords.ts";
import { plainError, initial, reduce } from "./model.ts";
import { S } from "./strings.ts";
import { shellSource } from "../dom/sourceText.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("a failure on a press reads in plain words", () => {
  test("a sentence the shell wrote for a person is shown as it is", () => {
    expect(failLine("Finder could not be opened.", "finder")).toBe("Finder could not be opened.");
    expect(failLine("The Keychain did not accept the key. Try again.", "key")).toBe("The Keychain did not accept the key. Try again.");
  });
  test("a code, an OS error or a path becomes the sentence for what was being done", () => {
    expect(failLine("notOffered", "practice")).toBe(S.fail.practice);
    expect(failLine("could not save it (Permission denied (os error 13))", "picture")).toBe(S.fail.picture);
    expect(failLine(new Error("ENOENT: /Users/me/Downloads"), "logs")).toBe(S.fail.logs);
    for (const w of Object.values(S.fail)) expect(w).toMatch(/^[A-Z][^\n]+\.$/);
  });
  test("no page shows String(e) for these presses any more", () => {
    const sites: [string, RegExp][] = [
      ["./onboarding.tsx", /save_api_key[^\n]*\.catch\(\(e\) => setKeyNote\(String\(e\)\)\)/],
      ["./card.tsx", /save_share_card[^\n]*\.catch\(\(e\) => setShared\(String\(e\)\)\)/],
      ["./card.tsx", /copy_link[^\n]*\.catch\(\(e\) => setShared\(String\(e\)\)\)/],
      ["./card.tsx", /use_project[^\n]*\.catch\(\(e\) => setFolderNote\(String\(e\)\)\)/],
      ["./madePanel.tsx", /reveal_made[^\n]*\.catch\(\(e\) => setNote\(String\(e\)\)\)/],
      ["./settingsPage.tsx", /remove_all_practices[^\n]*\.catch\(\(e\) => setPracticeSaid\(String\(e\)\)\)/],
      ["./settingsPage.tsx", /\.catch\(\(e\) => setExported\(String\(e\)\)\)/],
    ];
    for (const [f, re] of sites) expect(read(f), `${f} ${re}`).not.toMatch(re);
    // The raw words reach the log through the shell, which writes them as failure_detail.
    const main = shellSource();
    expect(main).toMatch(/fn note_failure\(kind: String, detail: String\)/);
    expect(main).toMatch(/[ ,]note_failure[,\]]/);
  });
});

describe("the engine's failures on the page", () => {
  test("an unknown reason is one plain sentence, never the raw words", () => {
    expect(plainError("engine error: boom")).toBe(S.somethingWrong);
    expect(plainError("TypeError: undefined is not an object at /a/b.ts:4:5")).toBe(S.somethingWrong);
    expect(S.somethingWrong).not.toMatch(/engine/i);
  });
  test("the helper stopping says so plainly and its coming back clears only that", () => {
    const down = reduce(initial(), { type: "app.runner_down" });
    expect(down.error).toBe(S.helperStopped);
    expect(S.helperStopped).not.toMatch(/engine/i);
    const said = reduce(initial(), { type: "app.runner_down", reason: "Squibby could not start the helper that runs Claude. Quit and open Squibby again." });
    expect(said.error).toBe("Squibby could not start the helper that runs Claude. Quit and open Squibby again.");
    expect(reduce(said, { type: "runner.hello" }).error).toBeNull();
    const other = { ...reduce(down, { type: "runner.hello" }), error: "Pick a folder first." };
    expect(reduce(other, { type: "runner.hello" }).error).toBe("Pick a folder first.");
  });
  test("a practice fix that the engine failed is told by what failed, not by matching words", () => {
    expect(read("./model.ts")).toContain('String(e.failed ?? "").startsWith("agent.")');
  });
});
