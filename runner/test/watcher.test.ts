// Noticing that the person changed a project file while the agent is thinking. Needs no permission and never sees keystrokes.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectWatcher } from "../src/watcher.ts";

const made: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-wt-"))); made.push(d); mkdirSync(join(d, "src")); mkdirSync(join(d, "node_modules")); mkdirSync(join(d, ".git")); return d; };
function watch(dir: string) {
  const seen: string[] = [];
  const w = new ProjectWatcher(dir, (p) => seen.push(p));
  w.start(); stops.push(() => w.stop());
  return { w, seen };
}
const settle = () => Bun.sleep(700);

describe("the project watcher", () => {
  test("a change the agent did not make is reported, with the file's name", async () => {
    const d = tmp(); const { seen } = watch(d);
    await Bun.sleep(100);
    writeFileSync(join(d, "src/app.js"), "hand edit");
    await settle();
    expect(seen).toEqual(["src/app.js"]);
  });
  test("it is reported within a second", async () => {
    const d = tmp(); const { seen } = watch(d);
    await Bun.sleep(100);
    const t0 = Date.now(); writeFileSync(join(d, "a.txt"), "x");
    while (!seen.length && Date.now() - t0 < 3000) await Bun.sleep(10);
    expect(seen.length).toBe(1);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  test("changes while the agent runs a tool are the agent's own and are ignored", async () => {
    const d = tmp(); const { w, seen } = watch(d);
    await Bun.sleep(100);
    w.begin("t1"); writeFileSync(join(d, "made-by-agent.txt"), "x"); await Bun.sleep(100); w.end("t1");
    await settle();
    expect(seen).toEqual([]);
  });
  test("a change just after the tool ends is still the agent's (file events arrive a little late)", async () => {
    const d = tmp(); const { w, seen } = watch(d);
    await Bun.sleep(100);
    w.begin("t1"); w.end("t1"); writeFileSync(join(d, "late.txt"), "x");
    await settle();
    expect(seen).toEqual([]);
  });
  test("a change well after the tool ended is the person's", async () => {
    const d = tmp(); const { w, seen } = watch(d);
    await Bun.sleep(100);
    w.begin("t1"); w.end("t1");
    await Bun.sleep(900);
    writeFileSync(join(d, "later.txt"), "x");
    await settle();
    expect(seen).toEqual(["later.txt"]);
  });
  test("two tools at once: the agent is busy until both end", async () => {
    const d = tmp(); const { w, seen } = watch(d);
    await Bun.sleep(100);
    w.begin("a"); w.begin("b"); w.end("a");
    writeFileSync(join(d, "x.txt"), "x"); await settle();
    expect(seen).toEqual([]);
    w.end("b");
  });
  test("folders that tools churn are ignored: node_modules, .git, build output", async () => {
    const d = tmp(); mkdirSync(join(d, "dist")); const { seen } = watch(d);
    await Bun.sleep(100);
    writeFileSync(join(d, "node_modules/x.js"), "x"); writeFileSync(join(d, ".git/HEAD"), "x"); writeFileSync(join(d, "dist/out.js"), "x"); writeFileSync(join(d, ".DS_Store"), "x");
    await settle();
    expect(seen).toEqual([]);
  });
  test("many quick changes to one file are reported once", async () => {
    const d = tmp(); const { seen } = watch(d);
    await Bun.sleep(100);
    for (let i = 0; i < 5; i++) { writeFileSync(join(d, "a.txt"), String(i)); await Bun.sleep(20); }
    await settle();
    expect(seen).toEqual(["a.txt"]);
  });
  test("after stop it reports nothing", async () => {
    const d = tmp(); const { w, seen } = watch(d);
    await Bun.sleep(100); w.stop();
    writeFileSync(join(d, "a.txt"), "x"); await settle();
    expect(seen).toEqual([]);
  });
  test("a tool that never reports back does not blind the watcher forever", async () => {
    const d = tmp(); const seen: string[] = [];
    const w = new ProjectWatcher(d, (p) => seen.push(p), { maxBusyMs: 300 }); w.start(); stops.push(() => w.stop());
    await Bun.sleep(100);
    w.begin("stuck");
    await Bun.sleep(900);
    writeFileSync(join(d, "a.txt"), "x"); await settle();
    expect(seen).toEqual(["a.txt"]);
  });
});
