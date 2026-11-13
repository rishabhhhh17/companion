// M85 (research feature 4): "Not what you asked for" and "Said one thing, ran another". The research's cases: C2 (CC
// #23067, files outside the task scope changed), H1 (HN 48920537, guest users nobody planned), H3 and A19 (the Cursor forum,
// 4 Sep 2026: "Reverting the Agent Home dashboard work from this conversation", then `git checkout HEAD --` on 7 files).
// Plain rules only; every folder is a temporary fixture and nothing runs.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { driftFlags, namedIn, notAsked, saidOther } from "../src/review/drift.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const proj = () => { const d = mkdtempSync(join(tmpdir(), "companion-test-m85-drift-")); made.push(d); return d; };

describe("Not what you asked for", () => {
  test("the files a request names", () => {
    expect(namedIn("Fix the rounding in src/price.js and the README.md please")).toEqual(["src/price.js", "readme.md"]);
    expect(namedIn("Make the header blue")).toEqual([]);
    expect(namedIn("see https://example.com/a.js and e.g. v1.2.3")).toEqual([]);
    expect(namedIn("only touch components/")).toEqual(["components"]);
  });
  test("a request that names its file, and a change beyond it, is flagged with the files", () => {
    const f = notAsked("Fix the rounding in src/price.js", ["src/price.js", "src/auth.js", "package-lock.json"]);
    expect(f?.kind).toBe("not_asked");
    expect(f?.say).toContain("src/auth.js");
    expect(f?.say).not.toContain("package-lock.json");
  });
  test("the named file, its test and files in a named folder are what was asked", () => {
    expect(notAsked("Fix the rounding in src/price.js", ["src/price.js", "test/price.test.js"])).toBeNull();
    expect(notAsked("Tidy everything in components/", ["components/a.tsx", "components/b/c.tsx"])).toBeNull();
  });
  test("a request that names no file says nothing either way (C2 needs a scope to compare)", () => {
    expect(notAsked("Make the header blue", ["src/a.css", "src/b.tsx", "src/c.ts"])).toBeNull();
  });
  test("a file the request said to leave alone, changed anyway (C2)", () => {
    const f = notAsked("Make the header blue, but don't touch models/ at all", ["src/header.css", "models/user.py"]);
    expect(f?.say).toContain("leave models alone");
    expect(f?.say).toContain("models/user.py");
    expect(notAsked("Leave auth.js alone and fix the menu", ["src/menu.js"])).toBeNull();
  });
  test("many extra files are counted, not all listed", () => {
    expect(notAsked("fix a.js", ["a.js", "b.js", "c.js", "d.js", "e.js", "f.js"])?.say).toContain("and 2 more");
  });
});

describe("Said one thing, ran another", () => {
  test("H3 and A19: undo only this conversation's work, then git checkout HEAD --", () => {
    const f = saidOther([{ said: "Reverting the Agent Home dashboard work from this conversation.", command: "git checkout HEAD -- src/a.tsx src/b.tsx" }], proj());
    expect(f?.kind).toBe("said_other");
    expect(f?.say).toContain("git checkout HEAD -- src/a.tsx src/b.tsx");
    expect(f?.say).toContain("last commit");
  });
  test("only my changes, then git reset --hard or git stash", () => {
    expect(saidOther([{ said: "I'll undo only my own changes.", command: "git reset --hard" }], proj())?.say).toContain("git reset --hard");
    expect(saidOther([{ said: "Rolling back just my edits", command: "git stash" }], proj())?.say).toContain("git stash");
  });
  test("an undo that stays narrow is fine", () => {
    expect(saidOther([{ said: "Reverting only my changes to the header.", command: "git diff src/header.css" }], proj())).toBeNull();
    expect(saidOther([{ said: "Reverting the work from this conversation.", command: "git restore --staged src/a.ts" }], proj())).toBeNull();
  });
  test("read only, then a write", () => {
    expect(saidOther([{ said: "I'll just look at the config, read-only.", command: "sed -i '' 's/a/b/' config.js" }], proj())?.say).toContain("would not change anything");
    expect(saidOther([{ said: "I'll just read the logs.", command: "cat logs/app.log | tail" }], proj())).toBeNull();
  });
  test("won't delete, then rm", () => {
    expect(saidOther([{ said: "I won't delete anything, just moving on.", command: "rm -rf build" }], proj())?.say).toContain("would not delete");
  });
  test("a dry run said, a live command run for real", () => {
    expect(saidOther([{ said: "Let me do a dry run of the migration first.", command: "npx prisma migrate deploy" }], proj())?.say).toContain("for real");
    expect(saidOther([{ said: "Let me do a dry run first.", command: "terraform plan" }], proj())).toBeNull();
    expect(saidOther([{ said: "A dry run first.", command: "supabase db push --dry-run" }], proj())).toBeNull();
  });
  test("only on this Mac said, a live system reached", () => {
    expect(saidOther([{ said: "I'll reset the local database only.", command: "supabase db reset --linked" }], proj())?.say).toContain("live system");
    expect(saidOther([{ said: "I'll reset the local database only.", command: "supabase db reset" }], proj())).toBeNull();
  });
  test("words with no promise say nothing", () => {
    expect(saidOther([{ said: "Running the tests now.", command: "git reset --hard" }], proj())).toBeNull();
    expect(saidOther([{ said: "", command: "rm -rf x" }], proj())).toBeNull();
  });
});

test("both flags together, at most one of each, words clipped and redacted", () => {
  const flags = driftFlags({ request: "fix src/a.js", changed: ["src/a.js", "src/b.js"], steps: [{ said: "Undoing only my changes", command: "git checkout -- ." }, { said: "Undoing only my changes", command: "git reset --hard" }], project: proj() });
  expect(flags.map((f) => f.kind)).toEqual(["not_asked", "said_other"]);
  expect(flags.every((f) => f.say.length <= 400)).toBe(true);
  const key = driftFlags({ request: "fix a.js", changed: ["a.js"], steps: [{ said: "I won't delete anything", command: "rm -rf x # sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }], project: proj() });
  expect(key[0].say).not.toContain("AAAAAAAAAAAAAAAAAAAAAAAA");
});
