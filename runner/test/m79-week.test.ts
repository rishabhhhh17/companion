// M79: the weekly summary, counted from real rows of the last seven days only (reviews, what was caught, fixes proven,
// Undos, copies saved before destructive commands) and the decisions Claude Code is told (memory). On a press only: it is
// a command and an event, never pushed. Temporary folders only; no model.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { NEVER_GATED } from "../src/plan.ts";
import { parseCommand, parseEvent } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-test-m79w-"))); made.push(d); return d; };
const NOW = new Date("2026-11-11T10:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const fixtureLines = (f: string) => readFileSync(new URL(`../../protocol/fixtures/${f}`, import.meta.url), "utf8").split("\n").filter((l) => l.trim());

function rig() {
  const d = tmp(), project = join(d, "shop");
  mkdirSync(project);
  const log = new TaskLog(join(d, "tasks.db"));
  const review = (at: string, kinds: string[], count = 2, checks: "passed" | "failed" | "not_run" = "passed") => log.addReview({ project, batch: `rv_${Math.random()}`, at, files: ["a.ts"], count, rating: "worth_a_look", touches: [], checks, summary: "x", kinds });
  return { d, project, log, review };
}

describe("the week's counts", () => {
  test("only rows of the last seven days count, each kind once per review", () => {
    const { project, log, review } = rig();
    review(ago(1), ["secret_in_code"], 3);
    review(ago(2), ["weakened_check", "package_critical"], 4);
    review(ago(3), ["package_high", "house_rule"], 1, "failed");
    review(ago(3), [], 5);
    review(ago(9), ["secret_in_code", "package_high"], 50);   // too old
    // Fixes: proven with a change, proven with no change (fixed nothing), failed, and an old one.
    const t = (startedAt: string, proof: string, changed: number) => { const id = log.start({ project, agent: "a", mode: "drive", label: "Fix it", startedAt, checkpoint: `cp_${Math.random().toString(16).slice(2)}` }); log.finish(id, "done", 0, startedAt, { checkpoint: `cp_${Math.random().toString(16).slice(2)}`, changed, proof }); return id; };
    t(ago(1), "passed", 2); t(ago(2), "passed", 1); t(ago(2), "passed", 0); t(ago(2), "failed", 3); t(ago(10), "passed", 4);
    // Saved copies before destructive commands.
    log.saved({ project, label: "Before Claude ran: rm -rf dist", checkpoint: "cp_0000000000000001", at: ago(1) });
    log.saved({ project, label: "Before Claude ran: git reset --hard", checkpoint: "cp_0000000000000002", at: ago(12) });
    const w = log.week(project, NOW);
    expect(w).toEqual({
      since: ago(7), until: NOW.toISOString(), reviews: 4, files: 13,
      caught: { keys: 1, weakened: 1, falseDones: 1, packages: 2 },
      proven: 2, undone: 0, saved: 1, savedUsed: 0, againstRules: 1,
    });
  });
  test("an empty week is all zeros, never a made up number", () => {
    const { project, log } = rig();
    expect(log.week(project, NOW)).toEqual({ since: ago(7), until: NOW.toISOString(), reviews: 0, files: 0, caught: { keys: 0, weakened: 0, falseDones: 0, packages: 0 }, proven: 0, undone: 0, saved: 0, savedUsed: 0, againstRules: 0 });
  });
});

describe("week.show", () => {
  test("the engine answers with the counts and the decisions and house rules Claude Code is told, and the event keeps to the protocol", async () => {
    const { d, project, log, review } = rig();
    review(ago(1), ["secret_in_code"]);
    mkdirSync(join(project, ".companion"), { recursive: true });
    writeFileSync(join(project, ".companion", "rules.txt"), "never edit pricing.txt\n");
    const m = new MemoryStore({ project, profileDir: d });
    m.add("project", "Decided: payments go through Stripe, because the client already has an account", "you wrote it", new Date(2026, 10, 2));
    m.add("project", "Built with React", "package.json", new Date(2026, 10, 2));
    const events: Record<string, any>[] = [];
    const runner = new AgentRunner({ shadowRoot: join(d, "shadow"), engine: new ScriptedEngine([]), log, memoryDir: d, emit: (e: unknown) => events.push(e as never), now: () => NOW } as never);
    await runner.handle({ v: 1, id: "w", type: "week.show", project } as never);
    const e = events.find((x) => x.type === "week.summary")!;
    expect(e.week.reviews).toBe(1);
    expect(e.week.caught.keys).toBe(1);
    expect(e.week.decisions).toEqual(["House rule: never edit pricing.txt", "Decided: payments go through Stripe, because the client already has an account"]);
    const p = parseEvent(JSON.stringify({ v: 1, id: "x", ...e }));
    expect(p.ok, p.ok ? "" : p.error).toBe(true);
  });
  test("never gated, and the shared fixtures parse", () => {
    expect((NEVER_GATED as readonly string[]).includes("week.show")).toBe(true);
    const c = fixtureLines("commands.jsonl").filter((l) => l.includes('"type":"week.show"'));
    expect(c.length).toBe(1);
    for (const l of c) expect(parseCommand(l).ok).toBe(true);
    const ev = fixtureLines("events.jsonl").filter((l) => l.includes('"type":"week.summary"'));
    expect(ev.length).toBe(2);
    for (const l of ev) expect(parseEvent(l).ok).toBe(true);
    // A count that is not a whole number, or too many decisions, is refused.
    const bad = JSON.parse(ev[0]); bad.week.reviews = -1;
    expect(parseEvent(JSON.stringify(bad)).ok).toBe(false);
    const many = JSON.parse(ev[0]); many.week.decisions = Array.from({ length: 11 }, (_, i) => `Decided: ${i}`);
    expect(parseEvent(JSON.stringify(many)).ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"w","type":"week.show"}').ok).toBe(false);
  });
});
