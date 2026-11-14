// M89: the usage runway in the pages (runway.ts), jobs saved for after the reset, and updates that install while the person
// is away (updates.ts quietInstallOk). Research feature 5: complaints F1 to F9 (research-1113/user-needs.md), the loudest
// group found. Only what Claude really reported is shown (runner/test/m89-runway-spike.test.ts): the plan's own numbers, or a
// request turned away just now.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { LIMIT_HIT_MS, jobTitle, resetOrWait, resetWords, runwayFrom, runwayMark, runwayNow, savedFrom, savedRows, savedStartOutcome, warnBeforeJob, warnLine, warnTitle, type Runway } from "./runway.ts";
import { whenWords } from "./notchQuick.ts";
import { initial, reduce } from "./model.ts";
import { quietInstallOk, updatedWords } from "./updates.ts";
import { saveJob, listSavedJobs, dropSavedJob } from "./commands.ts";
import { parseCommand } from "../../protocol/index.ts";
import { S } from "./strings.ts";

const fx = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const NOW = Date.UTC(2026, 10, 14, 13, 0);
const NO_DASH = /[—–]/;
const plan = (o: Partial<Runway>): Runway => ({ state: "ok", source: "plan", at: NOW, ...o });

describe("a reading, as the pages keep it", () => {
  test("the protocol's fixtures are read, with when they arrived; anything else is nothing", () => {
    expect(runwayFrom(fx("m89e1"), NOW)).toEqual({ state: "near", source: "plan", usedPct: 91, resetsAt: "2026-11-14T15:40:00.000Z", window: "five_hour", at: NOW });
    expect(runwayFrom(fx("m89e3"), NOW)).toEqual({ state: "out", source: "limit_hit", retryInS: 30, at: NOW });
    expect(runwayFrom({ type: "usage.runway", state: "panic", source: "plan" }, NOW)).toBeNull();
    expect(runwayFrom({ type: "cost.update" }, NOW)).toBeNull();
  });
  test("a reading ends when its window resets; a limit hit with no reset counts for a few minutes only", () => {
    const r = runwayFrom(fx("m89e1"), NOW)!;
    expect(runwayNow(r, NOW)).toBe(r);
    expect(runwayNow(r, Date.parse("2026-11-14T15:40:00.000Z"))).toBeNull();
    const hit = runwayFrom(fx("m89e3"), NOW)!;
    expect(runwayNow(hit, NOW + LIMIT_HIT_MS - 1)).toBe(hit);
    expect(runwayNow(hit, NOW + LIMIT_HIT_MS + 1)).toBeNull();
    // Claude said it waits longer than a few minutes: as long as it said.
    expect(runwayNow({ ...hit, retryInS: 900 }, NOW + LIMIT_HIT_MS + 1)).not.toBeNull();
  });
  test("the model keeps the last reading whatever the project (the limit is the person's) and the saved jobs per project", () => {
    let m = reduce(initial(), fx("m89e1"));
    expect(m.runway).toMatchObject({ state: "near", usedPct: 91 });
    m = reduce(m, fx("m89e4"));
    expect(m.savedJobs).toEqual({ project: "p_9f2c", jobs: fx("m89e4").jobs });
    m = reduce(m, fx("m89e5"));
    expect(m.savedJobs?.jobs).toEqual([]);
  });
});

describe("the warning before a big job", () => {
  test("near or out as Claude said, or the share used at or above the chosen mark; off never warns", () => {
    expect(warnBeforeJob(plan({ state: "near" }), NOW, "80")).toBe(true);
    expect(warnBeforeJob(plan({ state: "out" }), NOW, "90")).toBe(true);
    expect(warnBeforeJob(plan({ usedPct: 79 }), NOW, "80")).toBe(false);
    expect(warnBeforeJob(plan({ usedPct: 80 }), NOW, "80")).toBe(true);
    expect(warnBeforeJob(plan({ usedPct: 75 }), NOW, "70")).toBe(true);
    expect(warnBeforeJob(plan({ usedPct: 85 }), NOW, "90")).toBe(false);
    expect(warnBeforeJob(plan({ state: "out" }), NOW, "off")).toBe(false);
    // An unknown value reads as the usual 80.
    expect(warnBeforeJob(plan({ usedPct: 80 }), NOW, "lots")).toBe(true);
  });
  test("nothing reported, or a reading that has reset: no warning (nothing is guessed)", () => {
    expect(warnBeforeJob(null, NOW, "70")).toBe(false);
    expect(warnBeforeJob(plan({ state: "out", resetsAt: new Date(NOW - 1000).toISOString() }), NOW, "70")).toBe(false);
  });
  test("a request turned away just now warns, with its own title", () => {
    const hit = runwayFrom(fx("m89e3"), NOW)!;
    expect(warnBeforeJob(hit, NOW, "80")).toBe(true);
    expect(warnTitle(hit, NOW)).toBe(S.m89.warn.titleHit);
    expect(warnTitle(plan({ state: "out" }), NOW)).toBe(S.m89.warn.titleOut);
    expect(warnTitle(plan({ state: "near" }), NOW)).toBe(S.m89.warn.title);
  });
});

describe("the notch's small ring", () => {
  const reset = (iso?: string) => (iso ? "at 3:40 pm" : "");
  test("the share used and when it resets; amber once close (the plan said so, or 80% or more)", () => {
    expect(runwayMark(plan({ usedPct: 40, resetsAt: "2026-11-14T15:40:00.000Z" }), NOW, true, reset)).toEqual({ level: "ok", fill: 0.4, short: S.m89.runway.used(40), say: "The Claude limit is 40% used. It resets at 3:40 pm." });
    expect(runwayMark(plan({ usedPct: 82 }), NOW, true, reset)?.level).toBe("near");
    expect(runwayMark(plan({ state: "near", usedPct: 60 }), NOW, true, reset)?.level).toBe("near");
    expect(runwayMark(plan({ state: "out", usedPct: 100, resetsAt: "2026-11-14T15:40:00.000Z" }), NOW, true, reset)).toMatchObject({ level: "out", fill: 1, say: "The Claude limit is reached. It resets at 3:40 pm." });
  });
  test("a request turned away: a full amber ring, 'Limit', and what to do", () => {
    expect(runwayMark(runwayFrom(fx("m89e3"), NOW), NOW, true, reset)).toEqual({ level: "out", fill: 1, short: S.m89.runway.outShort, say: S.m89.runway.sayHit });
  });
  test("nothing to show: switched off, nothing reported, or 'allowed' with no number", () => {
    expect(runwayMark(plan({ usedPct: 40 }), NOW, false, reset)).toBeNull();
    expect(runwayMark(null, NOW, true, reset)).toBeNull();
    expect(runwayMark(plan({}), NOW, true, reset)).toBeNull();
  });
  test("the reset in words: today, tomorrow, or the day", () => {
    const clock = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const day = () => "Fri";
    const at = (h: number, dayOffset = 0) => { const d = new Date(NOW); d.setDate(d.getDate() + dayOffset); d.setHours(h, 5, 0, 0); return d.toISOString(); };
    expect(resetWords(at(23), NOW, clock, day)).toBe("at 23:05");
    expect(resetWords(at(9, 1), NOW, clock, day)).toBe("tomorrow at 9:05");
    expect(resetWords(at(9, 3), NOW, clock, day)).toBe("on Fri at 9:05");
    expect(resetWords(undefined, NOW)).toBe("");
  });
  test("the M89 review: the ring's short text says it is the Claude limit, never a bare percent", () => {
    expect(S.m89.runway.used(42)).toMatch(/Claude/);
    expect(S.m89.runway.used(42)).toMatch(/42%/);
    expect(S.m89.runway.used(42)).not.toBe("42%");
    expect(S.m89.runway.outShort).toMatch(/reached/i);
  });
  test("the M89 review: the reset's clock looks like every other time on Home ('9:12 am')", () => {
    const at = new Date(NOW); at.setHours(15, 40, 0, 0);
    const words = resetWords(at.toISOString(), NOW);
    expect(words).toBe(`at ${whenWords(at.toISOString(), at.getTime())}`);
    expect(words).toMatch(/^at \d{1,2}:\d{2} (am|pm)$/);
  });
});

describe("the M89 review: a limit hit on the API key route has no reset from Claude", () => {
  const hit = (o: Partial<Runway> = {}): Runway => ({ state: "out", source: "limit_hit", at: NOW, ...o });
  test("a job saved now waits until the end of the wait: a few minutes, or as long as Claude said", () => {
    expect(resetOrWait(hit())).toBe(new Date(NOW + LIMIT_HIT_MS).toISOString());
    expect(resetOrWait(hit({ retryInS: 30 }))).toBe(new Date(NOW + LIMIT_HIT_MS).toISOString());
    expect(resetOrWait(hit({ retryInS: 900 }))).toBe(new Date(NOW + 900_000).toISOString());
    expect(resetOrWait(hit({ resetsAt: "2026-11-14T15:40:00.000Z" }))).toBe("2026-11-14T15:40:00.000Z");
    expect(resetOrWait(plan({ state: "near", resetsAt: "2026-11-14T15:40:00.000Z" }))).toBe("2026-11-14T15:40:00.000Z");
    expect(resetOrWait(plan({ state: "near" }))).toBeUndefined();
    expect(resetOrWait(null)).toBeUndefined();
  });
  test("saved that way, its row waits too: never 'Ready to start' while Claude is turning requests away", () => {
    const rows = savedRows([{ id: "sj_1", kind: "job", prompt: "Add a form", savedAt: new Date(NOW).toISOString(), resetsAt: resetOrWait(runwayFrom(fx("m89e3"), NOW)) }], NOW + 1000);
    expect(rows[0].ready).toBe(false);
    expect(rows[0].line).not.toBe(S.m89.saved.ready);
    expect(rows[0].line.startsWith(S.m89.saved.waits(""))).toBe(true);
  });
});

describe("the M89 review: the warning names the job and the reset", () => {
  const reset = (iso?: string) => (iso ? "at 3:40 pm" : "");
  test("the job by its words, Rescue by name", () => {
    expect(jobTitle("job", "Add a contact form\n to the home page")).toBe("Add a contact form to the home page");
    expect(jobTitle("rescue", "")).toBe(S.m89.saved.rescue);
  });
  test("close: when it resets; reached: says it is reached, not that it may be; turned away: the wait", () => {
    const near = warnLine(plan({ state: "near", usedPct: 91, resetsAt: "2026-11-14T15:40:00.000Z" }), NOW, false, reset);
    expect(near).toContain("at 3:40 pm");
    const out = warnLine(plan({ state: "out", usedPct: 100, resetsAt: "2026-11-14T15:40:00.000Z" }), NOW, false, reset);
    expect(out).toContain("at 3:40 pm");
    expect(out).not.toContain("when the limit is reached");
    const hitLine = warnLine(runwayFrom(fx("m89e3"), NOW), NOW, false, reset);
    expect(hitLine).toBe(S.m89.warn.hit("at 3:40 pm"));
    expect(hitLine).not.toContain("when the limit is reached");
    expect(warnLine(plan({ state: "near" }), NOW, true, reset)).toBe(S.m89.warn.offRecord);
    for (const t of [near, out, hitLine, warnLine(plan({ state: "near" }), NOW, false, () => "")]) expect(t).not.toMatch(NO_DASH);
  });
});

describe("the M89 review: a saved job leaves the list only once it really started", () => {
  const A = "builder-1";
  test("Hand Squibby the job: its before snapshot; Rescue: the agent at work; a refusal or the engine stopping keeps it", () => {
    expect(savedStartOutcome({ type: "checkpoint.created", agent: A }, "job", A)).toBe("started");
    expect(savedStartOutcome({ type: "protocol.error", agent: A }, "job", A)).toBe("refused");
    expect(savedStartOutcome({ type: "agent.state", agent: A, state: "checking" }, "rescue", A)).toBe("started");
    expect(savedStartOutcome({ type: "agent.state", agent: A, state: "thinking" }, "rescue", A)).toBe("started");
    expect(savedStartOutcome({ type: "protocol.error", agent: A }, "rescue", A)).toBe("refused");
    expect(savedStartOutcome({ type: "app.runner_down" }, "rescue", A)).toBe("refused");
    expect(savedStartOutcome({ type: "agent.state", agent: A, state: "idle" }, "rescue", A)).toBe("refused");
    expect(savedStartOutcome({ type: "agent.state", agent: "other", state: "checking" }, "rescue", A)).toBeNull();
    expect(savedStartOutcome({ type: "usage.runway" }, "job", A)).toBeNull();
  });
});

describe("jobs saved for after the reset", () => {
  test("the rows: a job by its words, Rescue by name; ready once its reset has passed", () => {
    const jobs = fx("m89e4").jobs;
    const rows = savedRows(jobs, NOW, () => "at 3:40 pm");
    expect(rows.map((r) => [r.title, r.ready, r.line])).toEqual([["Add a contact form to the home page", false, "Starts best at 3:40 pm"], [S.m89.saved.rescue, true, S.m89.saved.ready]]);
    expect(savedRows(jobs, Date.parse("2026-11-14T15:41:00.000Z"))[0].ready).toBe(true);
    expect(savedRows([{ id: "sj_1", kind: "job", prompt: "x".repeat(200), savedAt: "2026-11-14T13:00:00.000Z" }], NOW)[0].title.length).toBe(90);
  });
  test("only this project's list is taken", () => {
    expect(savedFrom(fx("m89e4"), "p_9f2c")?.length).toBe(2);
    expect(savedFrom(fx("m89e4"), "/other")).toBeNull();
  });
  test("the commands fit the protocol; the words are cut at the most kept", () => {
    for (const c of [saveJob("/p", "job", "Add a contact form", "2026-11-14T15:40:00.000Z"), saveJob("/p", "rescue", ""), listSavedJobs("/p"), dropSavedJob("/p", "sj_4")]) expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
    expect((saveJob("/p", "job", "y".repeat(5000)) as { prompt: string }).prompt.length).toBe(4000);
  });
});

describe("updates that install while the person is away", () => {
  const rest = { character: "idle", approvals: [] };
  test("only with the switch on and nothing running, listening or understanding speech", () => {
    expect(quietInstallOk(rest, true)).toBe(true);
    expect(quietInstallOk(rest, undefined)).toBe(true);
    expect(quietInstallOk(rest, false)).toBe(false);
    expect(quietInstallOk({ ...rest, character: "working" }, true)).toBe(false);
    expect(quietInstallOk({ ...rest, approvals: [{}] }, true)).toBe(false);
    expect(quietInstallOk({ ...rest, shipFlow: { stage: "deploying" } }, true)).toBe(false);
    expect(quietInstallOk({ ...rest, voice: { stage: "listening" } }, true)).toBe(false);
    expect(quietInstallOk({ ...rest, voice: { stage: "downloading" } }, true)).toBe(false);
    expect(quietInstallOk({ ...rest, voice: { stage: "idle" } }, true)).toBe(true);
  });
  test("the note after: the version it went to, or plain words; nothing for anything else", () => {
    expect(updatedWords({ version: "1.4.0" })).toBe(S.m89.updated("1.4.0"));
    expect(updatedWords({ updated: true })).toBe(S.m89.updatedPlain);
    expect(updatedWords(null)).toBeNull();
    expect(updatedWords({ version: "<script>" })).toBeNull();
  });
});

describe("the words", () => {
  test("plain, no dashes", () => {
    const all = [S.m89.warn.title, S.m89.warn.titleOut, S.m89.warn.titleHit, S.m89.warn.job("at 3 pm"), S.m89.warn.out("at 3 pm"), S.m89.warn.hit("at 3 pm"), S.m89.warn.offRecord, S.m89.saved.title, S.m89.saved.savedNote, S.m89.runway.sayHit, S.m89.runway.say(40, "at 3 pm"), S.m89.updated("1.0.0"), S.m89.updatedPlain];
    for (const t of all) expect(t).not.toMatch(NO_DASH);
  });
});
