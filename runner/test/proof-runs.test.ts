// M69, Fix it and proof: each check rung says which commands it ran and their exit codes, so the receipt's proof ticks can
// show "npm run build · exit 0" from what really ran. Commands, the server and the browser are stand ins: nothing real runs.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder, type LadderOptions, type StepUpdate } from "../src/proof/ladder.ts";
import type { BrowserResult } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-pr-"))); made.push(d); return d; };
const res = (o: Partial<RunResult> = {}): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const okBrowser = async (url: string): Promise<BrowserResult> => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 });
const okServer: NonNullable<LadderOptions["server"]> = async () => ({ ok: true, url: "http://127.0.0.1:1/", port: 1, stop: async () => {} });
const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: "x", scripts });

async function ladder(scripts: Record<string, string>, run: (c: string) => Promise<RunResult>) {
  const dir = tmp();
  for (const [p, c] of Object.entries({ "package.json": pkg(scripts), "node_modules/.keep": "", "package-lock.json": "{}" })) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); }
  const store = new CheckpointStore(tmp(), dir);
  const s = await store.snapshot("as it is");
  const told: StepUpdate[] = [];
  const result = await runLadder({ project: dir, store, beforeId: s.id, afterId: s.id, run: run as never, browser: okBrowser as never, server: okServer, limits: { startMs: 5000, browserMs: 5000 }, onStep: (u) => told.push(u) });
  return { result, told };
}

describe("a check rung names the commands it ran and their exit codes (M69)", () => {
  test("passed build and tests: each command with exit 0, on the result and on the live step", async () => {
    const { result, told } = await ladder({ build: "vite build", test: "vitest run" }, async () => res());
    const checks = result.steps.find((s) => s.rung === "checks")!, tests = result.steps.find((s) => s.rung === "tests")!;
    expect(checks.status).toBe("passed");
    expect(checks.runs).toEqual([{ command: "npm run build", exit: 0 }]);
    expect(tests.runs).toEqual([{ command: "npm run test", exit: 0 }]);
    expect(told.find((u) => u.rung === "checks" && u.status === "passed")?.runs).toEqual([{ command: "npm run build", exit: 0 }]);
    // A rung with no command of its own says none.
    expect(result.steps.find((s) => s.rung === "start")?.runs).toBeUndefined();
    expect(told.filter((u) => u.status === "running").every((u) => u.runs === undefined)).toBe(true);
  });
  test("a failed test run carries its real exit code", async () => {
    const { result } = await ladder({ test: "vitest run" }, async (c) => (/run test/.test(c) ? res({ code: 1, stdout: "1 failed" }) : res()));
    const tests = result.steps.find((s) => s.rung === "tests")!;
    expect(tests.status).toBe("failed");
    expect(tests.runs).toEqual([{ command: "npm run test", exit: 1 }]);
  });
  test("a run that was stopped or timed out has no exit code to show", async () => {
    const { result } = await ladder({ test: "vitest run" }, async (c) => (/run test/.test(c) ? res({ code: null, timedOut: true }) : res()));
    expect(result.steps.find((s) => s.rung === "tests")?.runs).toBeUndefined();
  });
});
