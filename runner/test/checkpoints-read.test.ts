// Reading a file back from a saved version must never quietly give empty or cut off text. git can fail now and then on a
// busy Mac; text read that way used to be taken as the file's content, so the test guard could see a test file emptied
// (a check that failed for nothing) or miss one that a task deleted (a check that passed when it should not). Here a stand
// in git fails the next reads on purpose, and only the reads.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder } from "../src/proof/ladder.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-cpr-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };

// The stand in: while the count in COMPANION_TEST_GIT_FAILS's file is above zero, a cat-file fails (and the count goes down).
const realGit = Bun.which("git") ?? "/usr/bin/git";
const fake = realpathSync(mkdtempSync(join(tmpdir(), "companion-cpr-git-")));
const mark = join(fake, "fails");
const saved = { path: process.env.PATH, mark: process.env.COMPANION_TEST_GIT_FAILS };
beforeAll(() => {
  writeFileSync(join(fake, "git"), `#!/bin/sh\nfor a in "$@"; do if [ "$a" = "cat-file" ]; then n=$(cat "$COMPANION_TEST_GIT_FAILS" 2>/dev/null || echo 0); if [ "$n" -gt 0 ]; then echo $((n-1)) > "$COMPANION_TEST_GIT_FAILS"; echo "fatal: could not read that, try again" >&2; exit 128; fi; fi; done\nexec '${realGit}' "$@"\n`);
  chmodSync(join(fake, "git"), 0o755);
  writeFileSync(mark, "0");
  process.env.PATH = `${fake}:${process.env.PATH}`;
  process.env.COMPANION_TEST_GIT_FAILS = mark;
});
afterAll(() => {
  process.env.PATH = saved.path;
  if (saved.mark === undefined) delete process.env.COMPANION_TEST_GIT_FAILS; else process.env.COMPANION_TEST_GIT_FAILS = saved.mark;
  rmSync(fake, { recursive: true, force: true });
});
const failNext = (n: number) => writeFileSync(mark, String(n));

const TESTS = `const test = require('node:test');\ntest('one', () => {});\ntest('two', () => {});\n`;

describe("reading a saved version back", () => {
  test("a read that fails once is tried again, and gives the whole file", async () => {
    const dir = tmp(); put(dir, { "test/cart.test.js": TESTS, "notes.txt": "x" });
    const store = new CheckpointStore(tmp(), dir);
    const cp = await store.snapshot("saved");
    failNext(1);
    expect(await store.readFiles(cp.id, (p) => p.startsWith("test/"))).toEqual({ "test/cart.test.js": TESTS });
  });
  test("a file that cannot be read at all is an error, never empty text", async () => {
    const dir = tmp(); put(dir, { "test/cart.test.js": TESTS });
    const store = new CheckpointStore(tmp(), dir);
    const cp = await store.snapshot("saved");
    failNext(10);
    await expect(store.readFiles(cp.id, () => true)).rejects.toThrow(/test\/cart\.test\.js/);
    failNext(0);
  });
  test("a task that deleted a test file is still caught when the first read of it fails", async () => {
    const dir = tmp(); put(dir, { "test/cart.test.js": TESTS, "notes.txt": "x" });
    const store = new CheckpointStore(tmp(), dir);
    const before = await store.snapshot("before");
    rmSync(join(dir, "test/cart.test.js"));
    const after = await store.snapshot("after");
    failNext(1);
    const r = await runLadder({ project: dir, store, beforeId: before.id, afterId: after.id, onStep: () => {} });
    expect(r.verdict).toBe("failed");
    expect(r.failedAt?.rung).toBe("tests");
    expect(r.failedAt?.detail).toMatch(/Test file removed: test\/cart\.test\.js/);
  }, 30_000);
  test("an unchanged project is not called broken when a read fails once", async () => {
    const dir = tmp(); put(dir, { "test/cart.test.js": TESTS, "package.json": JSON.stringify({ name: "x", scripts: { lint: "true" } }) });
    const store = new CheckpointStore(tmp(), dir);
    const cp = await store.snapshot("now");
    failNext(1);
    const r = await runLadder({ project: dir, store, beforeId: cp.id, afterId: cp.id, onStep: () => {}, noInstall: true });
    expect(r.failedAt?.detail ?? "").not.toMatch(/removed|fewer tests|packages are not installed/);
    expect(r.verdict).not.toBe("failed");
  }, 30_000);
});
