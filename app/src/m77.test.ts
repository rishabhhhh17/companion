// M77, the safety net (docs/milestones/M77-safety-net.md): the pages' side. The saved copy's row with Undo, the notch's
// amber mark and line while Claude Code waits, the three untold lines (never more), the week's count only above zero and
// never praise, the Settings rows for the two more hooks, and where the new settings live.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REVIEW_REASONS, type ReviewReasonKind } from "../../protocol/index.ts";
import { initial, reduce, type Model } from "./model.ts";
import { islandLine, islandWings, need } from "./home.ts";
import { nowRows } from "./homeRest.ts";
import { doneAsk, doneStateFrom, hookLabel } from "./doneSignal.ts";
import { FINDING_LEVEL, findingParts } from "./findingShape.ts";
import { caughtOf, caughtParts, savedRowLook, savedRowsOf, thisWeekLine, untoldLines, untoldOf } from "./safetyNet.ts";
import { reviewReduce } from "./review.ts";
import { placeOf } from "./settingsPages.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const ev = (m: Model, e: Record<string, unknown>) => reduce(m, { v: 1, id: "e", ...e } as never);
const NO_DASH = /—|–/;
const PRAISE = /\b(streak|great|well done|congrat|nice work|keep it up|amazing|awesome|proud)\b/i;
const up = (): Model => ({ ...initial(), runnerUp: true, folder: "/Users/x/site" });

describe("Claude is waiting for you", () => {
  test("the waiting event sets the mark, names the project in the line, and clears on waiting false", () => {
    let m = ev(up(), { type: "hook.waiting", project: "/Users/x/site", waiting: true, message: "Claude needs your permission" });
    expect(m.claudeWaiting).toEqual({ project: "/Users/x/site", message: "Claude needs your permission" });
    expect(islandWings(m)).toEqual({ state: "needsYou", mark: "amber" });
    expect(need(m)?.why).toBe("Claude is waiting for you in site");
    expect(islandLine(m)).toContain("Claude is waiting for you in site");
    // A clear for another project changes nothing; the right one clears the mark.
    expect(ev(m, { type: "hook.waiting", project: "/Users/x/other", waiting: false }).claudeWaiting).toEqual(m.claudeWaiting);
    m = ev(m, { type: "hook.waiting", project: "/Users/x/site", waiting: false });
    expect(m.claudeWaiting).toBeNull();
    expect(islandWings(m)).toBeNull();
  });
  test("the message is cut to 120 characters and the question itself never travels here; no dash anywhere", () => {
    const m = ev(up(), { type: "hook.waiting", project: "/p", waiting: true, message: "x".repeat(300) });
    expect(m.claudeWaiting?.message?.length).toBe(120);
    for (const t of [S.guard.waitingWhy("site"), S.guard.waitingLine, S.guard.savedNotice]) expect(t).not.toMatch(NO_DASH);
  });
  test("a saved copy is said once as a notice and in the notch for a few seconds, in honest words", () => {
    const m = ev(up(), { type: "guard.saved", project: "/p", checkpoint: "cp_0005", command: "git reset --hard" });
    expect(m.notice).toBe(S.guard.savedNotice);
    expect(m.notice).not.toMatch(/Claude did|your AI did/);
    expect(islandLine(m, { now: m.guardSaved!.at + 1000 })).toBe(S.guard.savedNotice);
    expect(islandLine(m, { now: m.guardSaved!.at + 11_000 })).not.toBe(S.guard.savedNotice);
    // Something that needs the person comes first.
    const w = ev(m, { type: "hook.waiting", project: "/p", waiting: true });
    expect(islandLine(w, { now: m.guardSaved!.at + 1000 })).toContain("Claude is waiting for you");
  });
});

describe("the saved copy's row in History", () => {
  test("rows keep to the protocol, come with tasks.list, and offer Undo only while nothing runs", () => {
    const rows = savedRowsOf([{ id: 3, at: "2026-11-10T09:00:00.000Z", checkpoint: "cp_0005", command: "git reset --hard", undone: false }, { id: "x" }, { id: 4, at: "bad", checkpoint: "cp_1", command: "x", undone: false }]);
    expect(rows).toHaveLength(1);
    const m = ev(up(), { type: "tasks.list", project: "/p", tasks: [], saved: [{ id: 3, at: "2026-11-10T09:00:00.000Z", checkpoint: "cp_0005", command: "git reset --hard", undone: false }] });
    expect(m.savedRows).toEqual(rows);
    const l = savedRowLook(rows[0], { running: false, undoing: false });
    expect(l.title).toBe("Before Claude ran git reset --hard");
    expect(l.undo).toBe(true);
    expect(savedRowLook(rows[0], { running: true, undoing: false }).undo).toBe(false);
    expect(savedRowLook({ ...rows[0], undone: true }, { running: false, undoing: false })).toMatchObject({ undo: false, line: S.guard.savedUsed });
    // The row's words never say what the command did to the person (honest: the command is named, nothing more).
    expect(l.title).not.toMatch(/wiped|destroyed/);
  });
  test("a command with a key in it is redacted on the page too", () => {
    const rows = savedRowsOf([{ id: 1, at: "2026-11-10T09:00:00.000Z", checkpoint: "cp_1", command: "curl -H 'Authorization: Bearer sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789abcdefghij'", undone: false }]);
    expect(rows[0].command).not.toContain("abcdefghijklmnop");
  });
});

describe("the week's count", () => {
  test("nothing caught means no line and no row; above zero one line of counts, in a fixed order, never praise", () => {
    expect(caughtOf({ since: "2026-11-03T00:00:00.000Z", falseDones: 0, keys: 0, weakened: 0, saved: 0, undone: 0 })).toBeNull();
    expect(thisWeekLine(null)).toBe("");
    const c = caughtOf({ since: "2026-11-03T00:00:00.000Z", falseDones: 2, keys: 1, weakened: 0, saved: 1, undone: 3 })!;
    expect(caughtParts(c)).toEqual(["2 dones that were not done", "1 key in code", "1 saved copy used", "3 Undos"]);
    const line = thisWeekLine(c);
    expect(line).toBe("This week: 2 dones that were not done, 1 key in code, 1 saved copy used, 3 Undos.");
    expect(line).not.toMatch(PRAISE);
    expect(thisWeekLine(c, false)).toBe("");
    const rows = nowRows({ fix: null, since: [], practice: false, undo: false, now: Date.now(), caught: c });
    expect(rows[0]).toMatchObject({ id: "caught", title: S.guard.caughtTitle, act: "look" });
    expect(rows[0].line).not.toMatch(PRAISE);
    expect(nowRows({ fix: null, since: [], practice: false, undo: false, now: Date.now(), caught: null }).some((r) => r.id === "caught")).toBe(false);
    // Through the model: a count of nothing is dropped.
    expect(ev(up(), { type: "tasks.list", project: "/p", tasks: [], caught: { since: "x", falseDones: 0, keys: 0, weakened: 0, saved: 0, undone: 0 } }).caught).toBeNull();
    expect(ev(up(), { type: "tasks.list", project: "/p", tasks: [], caught: { since: "x", falseDones: 1, keys: 0, weakened: 0, saved: 0, undone: 0 } }).caught?.falseDones).toBe(1);
  });
  test("the words of the count never say streak or praise anywhere in the strings", () => {
    const words = JSON.stringify(S.guard);
    expect(words).not.toMatch(/streak/i);
    expect(words).not.toMatch(NO_DASH);
  });
});

describe("what the changes did not tell you", () => {
  test("at most three lines: beyond the usual files, skipped, left broken; nothing when there is nothing to tell", () => {
    expect(untoldLines({ beyond: [], beyondMore: 0, todos: 0, checks: "passed" })).toEqual([]);
    const lines = untoldLines({ beyond: ["src/pay.test.ts", ".github/workflows/ci.yml"], beyondMore: 2, todos: 1, checks: "failed" });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Also changed, beyond the usual files: src/pay.test.ts, .github/workflows/ci.yml and 2 more.");
    expect(lines[1]).toBe("Skipped: 1 TODO or not implemented line was added.");
    expect(lines[2]).toBe(S.guard.untold.broken);
    expect(untoldLines({ beyond: [], beyondMore: 0, todos: 2, checks: "not_run" })).toEqual([S.guard.untold.skippedBoth(2)]);
    expect(untoldLines({ beyond: [], beyondMore: 0, todos: 0, checks: "unknown" })).toEqual([S.guard.untold.skippedChecks]);
    for (const l of lines) { expect(l).not.toMatch(/Claude|your AI/); expect(l).not.toMatch(NO_DASH); }
    expect(untoldOf({ beyond: "nope" })).toBeUndefined();
    expect(untoldOf({ beyond: ["a", "b", "c", "d", "e", "f"], beyondMore: -1, todos: "x", checks: "passed" })).toEqual({ beyond: ["a", "b", "c", "d", "e"], beyondMore: 0, todos: 0, checks: "passed" });
  });
  test("the review card keeps untold from review.result, and the new reason kinds have their fixed words", () => {
    const fixtures = read("../../protocol/fixtures/events.jsonl").split("\n").filter((l) => l.includes('"id":"m77e6"'));
    expect(fixtures).toHaveLength(1);
    const e = JSON.parse(fixtures[0]);
    const card = reviewReduce(reviewReduce(null, { v: 1, id: "b", type: "review.batch", project: "p_9f2c", batch: e.batch, files: e.files, count: 2, capped: false, secretFiles: [], auto: false } as never), e as never);
    expect(card?.result?.untold).toEqual(e.untold);
    expect(untoldLines(card?.result?.untold)).toHaveLength(2);
    for (const k of ["weakened_check", "claimed_passed"] as const) {
      expect(REVIEW_REASONS).toContain(k);
      expect(FINDING_LEVEL[k]).toBe("must");
      const p = findingParts(k, "x");
      expect(p.wrong.length).toBeGreaterThan(0); expect(p.how.length).toBeGreaterThan(0);
      expect(JSON.stringify(p)).not.toMatch(/Claude did|your AI did/);
    }
    // Every kind the protocol knows has a level and its words (so the card never meets one it cannot shape).
    for (const k of REVIEW_REASONS as readonly ReviewReasonKind[]) { expect(FINDING_LEVEL[k], k).toBeTruthy(); expect(S.homeNow.reviewHead[k], k).toBeTruthy(); expect(S.finding.howFor[k], k).toBeTruthy(); }
  });
});

describe("the Settings rows for the two more hooks", () => {
  test("rows carry their hook (an older engine's rows mean done), each with its own card words and one press Remove", () => {
    const st = doneStateFrom({ type: "donesignal.state", project: "/p", tools: [
      { tool: "claude", on: false, file: ".claude/settings.local.json", adds: "{}", creates: true },
      { tool: "claude", hook: "guard", on: false, file: ".claude/settings.local.json", adds: '{"hooks":{"PreToolUse":[]}}', creates: true },
      { tool: "claude", hook: "waiting", on: true, file: ".claude/settings.local.json", adds: "{}", creates: false },
      { tool: "claude", hook: "nope", on: true, file: "x", adds: "{}", creates: false },
    ] }, "/p")!;
    expect(st.tools.map((t) => t.hook)).toEqual(["done", "guard", "waiting"]);
    expect(hookLabel(st.tools[0]!)).toEqual({ label: "Claude Code", line: null });
    expect(hookLabel(st.tools[1]!).label).toBe(S.doneSignal.hookTitle.guard);
    expect(hookLabel(st.tools[2]!).line).toContain("amber");
    const g = doneAsk(st.tools[1]!);
    expect(g.title).toBe(S.doneSignal.askTitleFor.guard);
    expect(g.what).toBe('{"hooks":{"PreToolUse":[]}}');
    expect(g.notes.join(" ")).toContain("always runs");
    expect(doneAsk(st.tools[2]!).title).toBe(S.doneSignal.askTitleFor.waiting);
    for (const t of [S.doneSignal.hookTitle.guard, S.doneSignal.hookTitle.waiting, S.doneSignal.hookLine.guard, S.doneSignal.hookLine.waiting, S.doneSignal.askWhatFor.guard, S.doneSignal.askWhatFor.waiting]) expect(t).not.toMatch(NO_DASH);
  });
  test("the page sends the hook with add and remove, only when it is not the done signal", () => {
    const src = read("./commands.ts");
    expect(src).toContain('type: "donesignal.add", project, tool, confirm: true, ...(hook !== "done" ? { hook } : {})');
    expect(src).toContain('type: "donesignal.remove", project, tool, ...(hook !== "done" ? { hook } : {})');
  });
});

describe("where the new settings live", () => {
  test("each has exactly one place, with a safe default the registry test pins", () => {
    expect(placeOf("review.weakenedChecks")).toMatchObject({ topic: "more.fixing.review" });
    expect(placeOf("notch.waitingMinutes")).toMatchObject({ topic: "more.general.notch" });
    expect(placeOf("history.thisWeek")).toMatchObject({ topic: "more.general.home" });
    const set = S.set as Record<string, { label: string; help: string }>, short = S.short as Record<string, string>;
    for (const k of ["review.weakenedChecks", "notch.waitingMinutes", "history.thisWeek"]) { expect(set[k], k).toBeTruthy(); expect(short[k], k).toBeTruthy(); expect(set[k].help).not.toMatch(NO_DASH); }
  });
});
