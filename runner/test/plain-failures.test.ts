// M15 wave 2: one plain sentence for every failure from Squibby's own machinery (the undo point, the helper, the checks, the
// server), with the raw detail kept for the log and never shown. The reason a person reads is plain; the detail rides along
// in its own field, which the shell takes off the event and writes to the log (app/src-tauri/src/runner.rs take_detail).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { failKind, failure, FAIL_WORDS, plainFailure } from "../src/plainfail.ts";
import { PRODUCT } from "../src/names.ts";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

describe("a failure from Squibby's own machinery is one plain sentence", () => {
  test("each known kind is found from the raw detail", () => {
    expect(failKind("git add -A failed: fatal: Unable to create '/x/.git/index.lock': File exists.")).toBe("undoPoint");
    expect(failKind("could not create the shadow store: permission denied")).toBe("undoPoint");
    expect(failKind("Unknown checkpoint: cp_12")).toBe("undoGone");
    expect(failKind("spawn /x/claude ENOENT")).toBe("helperStart");
    expect(failKind("Prompt help and Show me how are not available in this mode")).toBe("notHere");
    expect(failKind("TypeError: Cannot read properties of undefined (reading 'x')")).toBe("other");
  });
  test("the sentence never carries the raw detail or a machine word", () => {
    const raws = ["git add -A failed: fatal: index.lock exists", "Unknown checkpoint: cp_9", "could not create the shadow store: EACCES", "spawn claude ENOENT",
      "TypeError: x is undefined at /Users/me/app/agent.ts:12", "something with exit code 1 and stderr"];
    for (const raw of raws) {
      const s = plainFailure(raw);
      expect(s, raw).not.toContain(raw);
      expect(s, raw).not.toMatch(/\b(git|exit code|stderr|checkpoint|shadow store|engine|hook|SDK|agent\.start|ENOENT|TypeError|undefined)\b/i);
      expect(s, raw).toMatch(/^[A-Z][^\n]+[.!?]$/);
    }
    for (const w of Object.values(FAIL_WORDS)) expect(w).not.toMatch(/\bthe engine\b/i);
    expect(FAIL_WORDS.other).toContain(PRODUCT);
  });
  test("a reason already written for a person, and the codes the page translates, are kept as they are", () => {
    expect(plainFailure("Another task is already running in this project. Wait for it, or press Stop.")).toBe("Another task is already running in this project. Wait for it, or press Stop.");
    for (const code of ["no_connection", "claude_busy", "claude_stopped:billing", "daily_limit: this project", "error_max_budget_usd", "Not connected: Vercel", "unknown approval a1"]) expect(plainFailure(code)).toBe(code);
  });
  test("the event says the plain sentence, names what failed, and keeps the raw detail apart (secrets hidden, short)", () => {
    const e = failure(new Error("git commit failed: token sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 in config"), "agent.start");
    expect(e.reason).toBe(FAIL_WORDS.undoPoint);
    expect(e.failed).toBe("agent.start");
    expect(e.detail).toContain("git commit failed");
    expect(e.detail).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789");
    expect(failure("x".repeat(2000)).detail.length).toBeLessThanOrEqual(400);
    // Putting files back (Undo) says so, not "could not save an undo point".
    expect(failure(new Error("git read-tree failed: bad object"), "checkpoint.restore").reason).toBe(FAIL_WORDS.undoRestore);
  });
});

describe("the engine's own catch alls use it", () => {
  test("main.ts never sends 'could not handle' or 'not available in this mode' as the reason", () => {
    const main = src("main.ts");
    expect(main).not.toMatch(/reason: `could not handle/);
    expect(main).not.toContain('reason: "Prompt help and Show me how are not available in this mode"');
    expect(main).toContain("say({ type: \"protocol.error\", ...failure(e, cmd.type) })");
  });
  test("a weakened check is said plainly to the person, and the model still gets its sentence", () => {
    const ladder = src("proof/ladder.ts");
    expect(ladder).toContain("WEAKENED_SUMMARY");
    expect(ladder).toMatch(/forModel: [^\n]*Please fix the real problem instead of weakening the check\./);
  });
});
