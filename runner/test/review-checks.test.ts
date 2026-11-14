// M52 (F30): the project's own checks for a review of another tool's changes (agent.ts checkForReview). Unlike a watch's
// check they include the browser check (T07, F14, rule 14), and a press of Review them is the person's yes to running the
// project's scripts in the safety box; a review that runs by itself (automatic) runs only what they already allowed. Stand
// ins for the ladder, no network, temporary fixture folders.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { runPrint } from "../src/proof/approvedruns.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-rc-${l}-`))); made.push(d); return d; };
const step = (rung: string, status: string, detail: string) => ({ rung, label: rung, status, detail, ms: 1 }) as LadderResult["steps"][number];
const withBrowser: LadderResult = { verdict: "passed", steps: [step("checks", "passed", "build passed."), step("start", "passed", "It started."), step("browser", "passed", "The page opened.")] };
const noPage: LadderResult = { verdict: "passed", steps: [step("checks", "passed", "build passed."), step("start", "skipped", "There is nothing to open in a browser."), step("browser", "skipped", "There is nothing to open in a browser.")] };

function setup(o: { ladder?: LadderResult; approve?: boolean } = {}) {
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", scripts: { build: "true" } }));
  const calls: any[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), settings: new RunnerSettings(), emit: () => {}, proof: async (opts: any) => { calls.push(opts); return o.ladder ?? withBrowser; } });
  if (o.approve) (runner as any).approvals(project).add(runPrint({ "package.json": readFileSync(join(project, "package.json"), "utf8") }));
  return { project, runner, calls, run: (asked: boolean, ac = new AbortController()) => runner.checkForReview(project, ac.signal, { asked }) };
}

describe("the checks of a review", () => {
  test("they include the browser check, never install anything, and say when the page opened", async () => {
    const s = setup({ approve: true });
    const r = await s.run(true);
    expect(s.calls[0].noServer).toBeFalsy();
    expect(s.calls[0].noInstall).toBe(true);
    // M86 changed this on purpose: a review's check also says each rung and how it ended, for Watch what changed (no exit
    // code here: this stand in ladder ran no command).
    const runs = [{ label: "The build and checks", rung: "checks", status: "passed" }, { label: "Starting the app", rung: "start", status: "passed" }, { label: "The browser check", rung: "browser", status: "passed" }] as { label: string; rung: string; status: "passed" | "failed" | "skipped" }[];
    expect(r).toEqual({ outcome: "ok", reason: "All of the project's own checks passed, and the page opened in a browser.", runs });
    const n = setup({ approve: true, ladder: noPage });
    expect(await n.run(true)).toEqual({ outcome: "ok", reason: "The project's own checks passed. The browser check did not run: there is nothing to open in a browser.", runs: [runs[0], { ...runs[1], status: "skipped" as const }, { ...runs[2], status: "skipped" as const }] });
  });
  test("a press of Review them runs a project nobody allowed yet, in the safety box only", async () => {
    const s = setup({ approve: false });
    expect(await s.run(true)).toMatchObject({ outcome: "ok" });
    expect(s.calls).toHaveLength(1);
    const ask = s.calls[0].askScripts as (byTask: boolean, unboxed?: boolean) => Promise<boolean>;
    expect(await ask(false)).toBe(true);
    expect(await ask(true, true)).toBe(false);   // outside the box it is never a yes
  });
  test("a review that runs by itself runs only what the person allowed, and says so in a review's words", async () => {
    const s = setup({ approve: false });
    const r = await s.run(false);
    expect(s.calls).toHaveLength(0);
    expect(r).toMatchObject({ outcome: "unknown" });
    expect((r as any).reason).toMatch(/not been allowed to run this project's scripts/);
    expect((r as any).reason).toMatch(/Review them/);
    expect((r as any).reason).not.toMatch(/watch/i);
    const a = setup({ approve: true });
    expect(await a.run(false)).toMatchObject({ outcome: "ok" });
    expect(a.calls[0].askScripts).toBeUndefined();
    expect(a.calls[0].noServer).toBeFalsy();
  });
  test("a stop says nothing about the project", async () => {
    const s = setup({ approve: true, ladder: { verdict: "cancelled", steps: [] } });
    expect(await s.run(true)).toBeNull();
  });
});
