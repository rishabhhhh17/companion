// M100: the cost measuring script. Each fixture fails before its one fix and passes after it; the stand in run proves the
// measuring end to end; a real run refuses without the server's address and the sign in token, and spends nothing.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { FIXTURES, MAX_TOTAL_USD, makeFixture, measureOne, nextFixBudget, standInServer } from "../scripts/measure-fixes.ts";
import { HARD_CAP_USD } from "../src/engine/messages-loop/loop.ts";
import { boxReady, nestedSandbox } from "../src/proof/box.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-m100m-"))); made.push(d); return d; };
const runTest = (dir: string) => spawnSync(process.execPath, ["test.js"], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH ?? "" } }).status;

describe("the ten fixture projects", () => {
  test("ten, each with its own name, each failing until its one fix and passing after", () => {
    expect(FIXTURES.length).toBe(10);
    expect(new Set(FIXTURES.map((f) => f.id)).size).toBe(10);
    const root = tmp();
    for (const f of FIXTURES) {
      const dir = makeFixture(root, f);
      expect(runTest(dir), `${f.id} before`).not.toBe(0);
      const file = join(dir, f.file), src = readFileSync(file, "utf8");
      expect(src.split(f.from).length - 1, `${f.id} has its text once`).toBe(1);
      writeFileSync(file, src.replace(f.from, f.to));
      expect(runTest(dir), `${f.id} after`).toBe(0);
    }
  });
});

describe("a real run refuses before anything is spent", () => {
  const script = join(import.meta.dir, "..", "scripts", "measure-fixes.ts");
  test("without the server's address", () => {
    const r = spawnSync(process.execPath, [script, "--spend"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: tmp() } });
    if (/safety box/.test(r.stderr)) return;   // not a Mac with a box: it stops before anything else, which is also nothing spent
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Nothing was spent/);
  });
  test("with an address that is not https", () => {
    const r = spawnSync(process.execPath, [script, "--spend", "--base", "http://usage.example.com"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: tmp() } });
    if (/safety box/.test(r.stderr)) return;
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Nothing was spent/);
  });
});

const real = boxReady() && !(await nestedSandbox());
describe.if(real)("the stand in run, end to end", () => {
  test("a fixture is fixed through the real runner and the real box, and proven by its own test", async () => {
    const f = FIXTURES.find((x) => x.id === "adult")!;
    const s = standInServer([f]);
    try {
      const m = await measureOne(f, tmp(), { base: s.url, token: "cmp_" + "x".repeat(30), model: "claude-sonnet-5-5" });
      expect(m).toMatchObject({ id: "adult", proven: true, requests: 4, ended: "done" });
      expect(m.costUsd).toBeGreaterThan(0);
    } finally { s.stop(); }
  });
});

describe("M100 review: the whole run never passes MAX_TOTAL_USD", () => {
  test("each fix's budget is what is left of the run, at most the loop's cap; nothing starts once too little is left", () => {
    expect(nextFixBudget(0)).toBe(HARD_CAP_USD);
    expect(nextFixBudget(MAX_TOTAL_USD - 0.5)).toBeCloseTo(0.5, 9);
    expect(nextFixBudget(MAX_TOTAL_USD)).toBe(0);
    expect(nextFixBudget(MAX_TOTAL_USD + 3)).toBe(0);
    // Ten fixes that each spend all they are given still end at or under the run's limit.
    let spent = 0;
    for (let i = 0; i < 10; i++) { const b = nextFixBudget(spent); if (b <= 0) break; spent += b; }
    expect(spent).toBeLessThanOrEqual(MAX_TOTAL_USD + 1e-9);
  });
  test("the script's words use the product's name from names.ts, never a hard coded one", () => {
    const src = readFileSync(join(import.meta.dir, "..", "scripts", "measure-fixes.ts"), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**"));
    expect(code.filter((l) => /["`'][^"`']*Squibby/.test(l))).toEqual([]);
  });
});
