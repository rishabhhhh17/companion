// The safety hook waits for the person's answer to an approval card. If the SDK gave up on the hook first, the tool would
// fall through to the normal permission flow without our answer. So the hook's own time limit is set, and it is longer
// than an approval card lives (an unanswered card counts as no, and that no reaches the SDK in time).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVAL_TIMEOUT_MS, MAX_APPROVAL_WAIT_MS, ScriptedEngine } from "../src/engine.ts";
import { defOf } from "../../protocol/settings.ts";
import { buildSdkOptions, HOOK_TIMEOUT_SECONDS } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-hook-${l}-`))); made.push(d); return d; };
const base = { project: "/p", model: "m", budgetUsd: 3, claudeBinary: "/x/claude", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal };

describe("the safety hook's time limit", () => {
  const o: any = buildSdkOptions(base);
  test("is set explicitly on the before-tool hook, in seconds", () => {
    expect(typeof o.hooks.PreToolUse[0].timeout).toBe("number");
    expect(o.hooks.PreToolUse[0].timeout).toBe(HOOK_TIMEOUT_SECONDS);
  });
  test("is longer than an approval card lives, with room to spare", () => {
    expect(HOOK_TIMEOUT_SECONDS * 1000).toBeGreaterThan(APPROVAL_TIMEOUT_MS);
    expect(HOOK_TIMEOUT_SECONDS * 1000 - APPROVAL_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
  test("is set from the longest wait the setting allows (How long a question waits), so a changed wait can never outlive it", () => {
    const d = defOf("approval.waitMinutes")!;
    expect(MAX_APPROVAL_WAIT_MS).toBe((d.max as number) * 60_000);
    expect(HOOK_TIMEOUT_SECONDS * 1000 - MAX_APPROVAL_WAIT_MS).toBeGreaterThanOrEqual(60_000);
    // Every value the setting accepts is inside the hook's limit.
    for (let m = d.min as number; m <= (d.max as number); m += d.step as number) expect(m * 60_000, String(m)).toBeLessThan(HOOK_TIMEOUT_SECONDS * 1000);
  });
  // [verify] Nobody has seen Claude Code honour a hook time limit longer than the 32 minutes relied on since before the
  // setting. Until a real run shows a hook still waiting past 32 minutes is honoured (T05, the real run checklist), the
  // setting can only shorten the wait, and the hook's limit stays exactly what it was.
  test("stays at 32 minutes: the longest wait is 30 minutes until a real run proves a longer hook limit is honoured", () => {
    expect(defOf("approval.waitMinutes")!.max).toBe(30);
    expect(MAX_APPROVAL_WAIT_MS).toBe(APPROVAL_TIMEOUT_MS);
    expect(HOOK_TIMEOUT_SECONDS).toBe(32 * 60);
  });
  test("an approval card lives 30 minutes by default, and says so", async () => {
    expect(APPROVAL_TIMEOUT_MS).toBe(30 * 60_000);
    const events: Event[] = [];
    const now = new Date("2026-10-16T10:00:00Z");
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command: "git push" } }, costUsd: 0 }]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), now: () => now });
    const done = runner.handle({ v: 1, id: "c", type: "agent.start", project: tmp("p"), agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
    const end = Date.now() + 3000;
    while (!events.some((e) => e.type === "approval.request") && Date.now() < end) await new Promise((r) => setTimeout(r, 5));
    const req = events.find((e) => e.type === "approval.request") as any;
    expect(Date.parse(req.expiresAt) - now.getTime()).toBe(APPROVAL_TIMEOUT_MS);
    await runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "test" });
    await done;
  });
});
