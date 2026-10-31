// Review of 31 Oct 2026: the install runs with the internet (net "open") whenever the packages are missing, and package
// managers run code named in their own settings files during an install (.npmrc's script-shell and node-options,
// .pnpmfile.cjs, .yarnrc.yml's yarnPath and plugins, .yarnrc's yarn-path, bunfig.toml). Those were not part of what the
// person says yes to running, so a task could add one, remove node_modules and have its own code run with the internet and
// no card. Now each of them is part of the run fingerprint (approvedruns.ts), read from the project folder as it is too,
// so one git ignores is not missed. Commands, the server and the browser are stand ins: nothing real runs.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder, type LadderOptions } from "../src/proof/ladder.ts";
import { memoryApprovals, readRunFiles, runPrint } from "../src/proof/approvedruns.ts";
import { liveFiles } from "../src/proof/livefiles.ts";
import type { BrowserResult } from "../src/proof/browser.ts";
import type { RunOptions, RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-aic-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); } };
const res = (o: Partial<RunResult> = {}): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const okBrowser = async (url: string): Promise<BrowserResult> => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 });
const okServer: NonNullable<LadderOptions["server"]> = async () => ({ ok: true, url: "http://127.0.0.1:1/", port: 1, stop: async () => {} });
const pkg = JSON.stringify({ name: "x", scripts: { build: "vite build", test: "vitest", prepare: "echo prepared" }, dependencies: { zod: "4" } });

async function addThenCheck(base: Record<string, string>, added: Record<string, string>, remove: string[] = []) {
  const dir = tmp();
  put(dir, base);
  const store = new CheckpointStore(tmp(), dir);
  const b = await store.snapshot("before");
  const approvals = memoryApprovals();
  approvals.add(runPrint({ ...(await readRunFiles(store, b.id)), ...(await readRunFiles(liveFiles(dir), "live")) }));
  put(dir, added);
  for (const r of remove) rmSync(join(dir, r), { recursive: true, force: true });
  const a = await store.snapshot("after");
  const asked: unknown[][] = [], ran: [string, string | undefined][] = [];
  const result = await runLadder({ project: dir, store, beforeId: b.id, afterId: a.id, approvals, box: true,
    askScripts: async (...x: unknown[]) => { asked.push(x); return false; },
    run: (async (c: string, ro: RunOptions) => { ran.push([c, ro.box?.net]); return res(); }) as never, browser: okBrowser as never, server: okServer, limits: { startMs: 5000, browserMs: 5000 } });
  return { asked, ran, result };
}

const INSTALL_CONFIG: Record<string, string> = {
  ".npmrc": "script-shell=./x.sh\n",
  ".yarnrc": "yarn-path \"./x.js\"\n",
  ".yarnrc.yml": "yarnPath: .yarn/releases/yarn-4.cjs\n",
  ".pnpmfile.cjs": "module.exports = { hooks: {} };\n",
  "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
  "bunfig.toml": "preload = ['./x.ts']\n",
  ".yarn/releases/yarn-4.cjs": "console.log('a yarn of its own')\n",
  ".yarn/plugins/plugin.cjs": "module.exports = {};\n",
};

describe("a package manager's own settings are part of what the person says yes to running", () => {
  for (const [file, text] of Object.entries(INSTALL_CONFIG)) {
    test(`a task that adds ${file} and removes the packages is asked about before the install runs`, async () => {
      const r = await addThenCheck({ "package.json": pkg, "package-lock.json": "{}", "node_modules/.keep": "" }, { [file]: text, "x.sh": "#!/bin/sh\n" }, ["node_modules"]);
      expect(r.asked.length).toBe(1);
      expect(r.ran).toEqual([]);
    });
  }
  test("a change to one that was already there is asked about too", async () => {
    const r = await addThenCheck({ "package.json": pkg, "package-lock.json": "{}", ".npmrc": "save-exact=true\n" }, { ".npmrc": "save-exact=true\nnode-options=--require ./x.js\n" }, ["node_modules"]);
    expect(r.asked.length).toBe(1);
    expect(r.ran).toEqual([]);
  });
  test("one that git ignores (an .npmrc often is) is read from the project folder, so it is not missed", async () => {
    const r = await addThenCheck({ "package.json": pkg, "package-lock.json": "{}", ".gitignore": ".npmrc\nnode_modules\n" }, { ".npmrc": "script-shell=./x.sh\n" });
    expect(r.asked.length).toBe(1);
    expect(r.ran).toEqual([]);
  });
  test("one that did not change asks nothing, and the install still runs", async () => {
    const r = await addThenCheck({ "package.json": pkg, "package-lock.json": "{}", ".npmrc": "save-exact=true\n", "node_modules/.keep": "" }, { "src/app.js": "export const x = 1;\n" }, ["node_modules"]);
    expect(r.asked).toEqual([]);
    expect(r.ran.map((x) => x[0])).toContain("npm install");
  });
  test("a project with none of them keeps the very fingerprint it had, so nobody is asked again", () => {
    expect(runPrint({ "package.json": JSON.stringify({ name: "x", scripts: { test: "vitest" }, dependencies: { zod: "4" } }), "package-lock.json": "{}" })).toBe("8fd0e946620b3ac6e651677b0a2d09e10b2e113bbf2b876aa853b98bb20d71f6");
    expect(runPrint({})).toBe("adbed87c930ea2ef052d1b6b700ea2f5c35111035d4ed0a2eccb06a072d4630b");
    expect(runPrint({ "package.json": JSON.stringify({ name: "x" }), "go.mod": "module x\n" })).toBe("29494db1387cfc3776ddb2e78e52053629b7b4e4b8c0bb24742074c7879aeb40");
  });
  test("the watch reads them from the folder as it is, the same way", async () => {
    const dir = tmp();
    put(dir, { "package.json": pkg, ".npmrc": "a=1\n", ".yarn/releases/y.cjs": "x" });
    const files = await readRunFiles(liveFiles(dir), "live");
    expect(files[".npmrc"]).toBe("a=1\n");
    expect(files[".yarn/releases/y.cjs"]).toMatch(/^blob:/);
  });
});
