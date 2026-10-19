// The practice stuck moments that ship with the app (app/sample): each is broken in one common way on purpose. Companion's
// own checks must fail where the practice catalog says (app/sample/practices.json), and the small fix a person would make
// must make them pass. Needs Node, which Companion requires anyway. Nothing here reaches the network.
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { inspectProject } from "../src/proof/intake.ts";
import { rlsGate } from "../src/ship/rls.ts";
import { lessonsFromProject, SETTINGS_LESSON } from "../src/lessongen.ts";
import { projectChecker } from "../src/walk.ts";

const SAMPLES = join(import.meta.dir, "../../app/sample");
const EXPECTED: Record<string, { file?: string; line?: number; about?: string }> = Object.fromEntries((JSON.parse(readFileSync(join(SAMPLES, "practices.json"), "utf8")) as { practices: { folder: string; expect: { file?: string; line?: number; about?: string } }[] }).practices.map((p) => [p.folder, p.expect]));
const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-practice-"))); made.push(d); return d; };
const copy = (name: string) => { const p = tmp(); cpSync(join(SAMPLES, name), p, { recursive: true }); return p; };
const edit = (p: string, f: string, from: string, to: string) => { const t = readFileSync(join(p, f), "utf8"); expect(t).toContain(from); writeFileSync(join(p, f), t.replace(from, to)); };

async function check(project: string) {
  const store = new CheckpointStore(tmp(), project);
  const a = await store.snapshot("before");
  return runLadder({ project, store, beforeId: a.id, afterId: a.id, limits: { testMs: 30_000, startMs: 15_000, browserMs: 20_000 } });
}

// The one change a person would make, for each project the tests can check.
const FIXES: Record<string, (p: string) => void> = {
  "stuck-setting": (p) => writeFileSync(join(p, ".env.local"), "SHOP_NAME=Sam's Plants\n"),
  "stuck-route": (p) => edit(p, "index.html", 'href="/prices"', 'href="/pricing"'),
  "stuck-import": (p) => edit(p, "server.js", 'require("./lib/format-price")', 'require("./lib/money")'),
};

describe("the practice stuck moments", () => {
  for (const name of Object.keys(FIXES)) {
    test(`${name}: the checks fail at the tests, in the place the eval expects`, async () => {
      const r = await check(copy(name));
      expect(r.verdict).toBe("failed");
      expect(r.failedAt?.rung).toBe("tests");
      expect(r.failedAt?.problem).toMatchObject({ kind: "line", file: EXPECTED[name].file, line: EXPECTED[name].line });
      expect((r.failedAt?.problem as { message: string }).message.toLowerCase()).toContain(EXPECTED[name].about!.toLowerCase());
    }, 120_000);
    test(`${name}: the small fix makes the tests pass`, async () => {
      const p = copy(name); FIXES[name](p);
      const r = await check(p);
      expect(r.steps.find((s) => s.rung === "tests")?.status).toBe("passed");
      expect(r.verdict).not.toBe("failed");
    }, 120_000);
  }

  test("stuck-setting: About this project names the missing setting, and the lesson made from it proves the fix", async () => {
    const p = copy("stuck-setting");
    expect(inspectProject(p).env.missing).toEqual(["SHOP_NAME"]);
    const l = lessonsFromProject(p, () => undefined).find((x) => x.id === SETTINGS_LESSON)!;
    expect(l.steps.map((s) => s.check)).toEqual([{ kind: "file_exists", path: ".env.local" }, { kind: "env_name", name: "SHOP_NAME" }, { kind: "ask" }]);
    const c = projectChecker(p);
    expect(await c(l.steps[1].check)).toBe(false);
    FIXES["stuck-setting"](p);
    expect(await c(l.steps[0].check)).toBe(true);
    expect(await c(l.steps[1].check)).toBe(true);
  });

  test("stuck-open-table: the database access check blocks it, and turning on row level security with a rule clears that", async () => {
    const p = copy("stuck-open-table");
    expect(await rlsGate({ project: p })).toMatchObject({ status: "blocked", findings: ["notes"] });
    writeFileSync(join(p, "supabase/migrations/20261003090000_protect_notes.sql"),
      "alter table public.notes enable row level security;\ncreate policy \"Each person reads their own notes\" on public.notes for select to authenticated using ((select auth.uid()) = user_id);\n");
    const g = await rlsGate({ project: p });
    expect(g.status).not.toBe("blocked");   // the live database still cannot be checked from here, so it asks the person to confirm
  });

  test("each holds only the exercise: no packages to install and no hidden files (the app's copy may leave those out)", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)).map((x) => `${n}/${x}`) : [n]);
    for (const name of readdirSync(SAMPLES).filter((n) => statSync(join(SAMPLES, n)).isDirectory())) {
      const pkg = JSON.parse(readFileSync(join(SAMPLES, name, "package.json"), "utf8"));
      expect(pkg.dependencies ?? {}, name).toEqual({}); expect(pkg.devDependencies ?? {}, name).toEqual({});
      for (const f of walk(join(SAMPLES, name))) expect(f.split("/").some((part) => part.startsWith(".")), `${name}/${f}`).toBe(false);
    }
  });
});
