// The sandbox backstop check (runner/scripts/real-sandbox.ts) spends the founder's key, so it is only run with --spend by
// the founder. Here, for free: its plan and its dry run, which must spend nothing and touch nothing in the home folder, and
// the older real Claude scripts, which are retired and must refuse to start anything. No Claude starts; the one Keychain
// look up asks for a throwaway companion-test- item that does not exist.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { SANDBOX_CASES } from "../scripts/real-sandbox.ts";

const run = (script: string, args: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "../scripts", script), ...args], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
};
const nokey = () => ({ COMPANION_KEYCHAIN_SERVICE: `companion-test-nonexistent-${Math.random().toString(36).slice(2)}` });

describe("the sandbox backstop check", () => {
  test("two small cases, each with its own stop and time limit, estimated well under a dollar", () => {
    expect(SANDBOX_CASES.map((c) => c.name)).toEqual(["sandbox-files", "sandbox-network"]);
    for (const c of SANDBOX_CASES) { expect(c.estimateUsd).toBeLessThanOrEqual(c.capUsd!); expect(c.capUsd!).toBeLessThanOrEqual(0.3); expect(c.timeoutS!).toBeGreaterThan(0); }
    expect(SANDBOX_CASES.reduce((a, c) => a + c.estimateUsd, 0)).toBeLessThan(0.5);
  });
  test("with no options it is a dry run: the plan, nothing sent, nothing spent", () => {
    const r = run("real-sandbox.ts", [], nokey());
    expect(r.code).toBe(0);
    for (const c of SANDBOX_CASES) expect(r.out).toContain(c.name);
    expect(r.out).toMatch(/nothing was sent and nothing was spent/i);
    expect(r.out).not.toMatch(/=== /);
  });
  test("--spend with no key in the Keychain item: nothing runs", () => {
    const env = nokey();
    const r = run("real-sandbox.ts", ["--spend"], env);
    expect(r.code).toBe(2);
    expect(r.out).toContain(env.COMPANION_KEYCHAIN_SERVICE);
    expect(r.out).not.toMatch(/=== /);
  });
});

describe("the older real Claude scripts are retired", () => {
  for (const [script, instead] of [["real-run.ts", "smoke-real.ts"], ["e2e-plan.ts", "real-verify.ts"], ["real-sandbox-net.ts", "real-sandbox.ts"]] as const) {
    test(`${script} starts nothing and says what to use instead`, () => {
      const r = run(script, [], nokey());
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/retired/i);
      expect(r.out).toContain(instead);
    });
  }
});
