// The practice project that ships with Companion: it has one thing wrong on purpose (the page sends signups to
// /api/signup, the server listens at /api/register). Companion's own checks must find it, point at the failing check,
// and pass once it is fixed. Needs Node, which Companion requires anyway.
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { browserInstalled } from "../src/proof/browser.ts";
import { runLadder } from "../src/proof/ladder.ts";

const SAMPLE = join(import.meta.dir, "../../app/sample/stuck-signup");
const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-sample-"))); made.push(d); return d; };

async function check(project: string) {
  const store = new CheckpointStore(tmp(), project);
  const a = await store.snapshot("before");
  return runLadder({ project, store, beforeId: a.id, afterId: a.id, limits: { testMs: 30_000, startMs: 15_000, browserMs: 20_000 } });
}

describe("the practice project", () => {
  test("it is broken on purpose: the checks fail at the test, and the place is the failing check", async () => {
    const p = tmp(); cpSync(SAMPLE, p, { recursive: true });
    const r = await check(p);
    expect(r.verdict).toBe("failed");
    expect(r.failedAt?.rung).toBe("tests");
    expect(r.failedAt?.problem).toMatchObject({ kind: "line", file: "test/signup.test.js", lineText: "assert.strictEqual(res.status, 200, `Pressing Join sends the email to ${address}, which answered ${res.status}`);", message: "Pressing Join sends the email to /api/signup, which answered 404" });
  }, 120000);
  test("the one line fix makes every check pass, the page too", async () => {
    const p = tmp(); cpSync(SAMPLE, p, { recursive: true });
    const f = join(p, "public/signup.js");
    writeFileSync(f, readFileSync(f, "utf8").replace("/api/signup", "/api/register"));
    const r = await check(p);
    expect(r.steps.find((s) => s.rung === "tests")?.status).toBe("passed");
    if (browserInstalled()) { expect(r.verdict).toBe("passed"); expect(r.steps.find((s) => s.rung === "browser")?.status).toBe("passed"); }
    else expect(["passed", "passed_with_gaps"]).toContain(r.verdict);
  }, 120000);
  test("it needs no packages installed and holds nothing that is not part of the exercise", () => {
    const pkg = JSON.parse(readFileSync(join(SAMPLE, "package.json"), "utf8"));
    expect(pkg.dependencies ?? {}).toEqual({}); expect(pkg.devDependencies ?? {}).toEqual({});
    expect(readFileSync(join(SAMPLE, "public/signup.js"), "utf8")).toContain('"/api/signup"');   // the bug is there until the person fixes it
  });
});
