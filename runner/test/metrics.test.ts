// Beta numbers: counts only, kept on this Mac, off unless the person turned them on. Never any content.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Metrics, NOTES } from "../src/metrics.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-metrics-"))); made.push(d); return d; };
let day = "2026-10-12T10:00:00Z";
const mk = (dir = tmp()) => ({ dir, m: new Metrics(join(dir, "metrics.json"), () => new Date(day)) });
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o }) as never;

describe("beta numbers", () => {
  test("they are off until the person turns them on, and nothing is written while off", () => {
    const { dir, m } = mk();
    m.observe(ev({ type: "walk.done", walk: "w", project: "/secret/project", lesson: "k", title: "T", steps: 3 }));
    expect(m.summary().enabled).toBe(false);
    expect(existsSync(join(dir, "metrics.json"))).toBe(false);
  });
  test("turned on, events become counts per day", () => {
    const { m } = mk(); m.setEnabled(true);
    m.observe(ev({ type: "walk.step", walk: "w", project: "p", lesson: "k", title: "T", index: 0, total: 3, variant: "main", say: "s", find: "f", ask: true }));
    m.observe(ev({ type: "walk.step", walk: "w", project: "p", lesson: "k", title: "T", index: 1, total: 3, variant: "instead", say: "s", find: "f", ask: false }));
    m.observe(ev({ type: "walk.help", walk: "w", say: "words" }));
    m.observe(ev({ type: "walk.done", walk: "w", project: "p", lesson: "k", title: "T", steps: 3 }));
    m.observe(ev({ type: "walk.stopped", walk: "w", reason: "r" }));
    m.observe(ev({ type: "proof.result", agent: "a", verdict: "passed", steps: [], tries: 1 }));
    m.observe(ev({ type: "proof.result", agent: "a", verdict: "failed", steps: [], tries: 1 }));
    m.observe(ev({ type: "diagram.ready", project: "p", made: true }));
    expect(m.summary().days["2026-10-12"]).toEqual({ walk_step: 2, walk_other_way: 1, walk_help: 1, walk_done: 1, walk_stopped: 1, proof_passed: 1, proof_failed: 1, diagram_made: 1 });
  });
  test("'did you already do this?' after a pause is not counted as a step shown (the step comes again if the answer is no)", () => {
    const { m } = mk(); m.setEnabled(true);
    m.observe(ev({ type: "walk.step", walk: "w", project: "p", lesson: "k", title: "T", index: 1, total: 3, variant: "main", say: "s", find: "f", ask: true, already: true }));
    m.observe(ev({ type: "walk.step", walk: "w", project: "p", lesson: "k", title: "T", index: 1, total: 3, variant: "main", say: "s", find: "f", ask: true }));
    expect(m.summary().days["2026-10-12"]).toEqual({ walk_step: 1 });
  });
  test("a command counts the start of a lesson", () => {
    const { m } = mk(); m.setEnabled(true);
    m.observeCommand(ev({ type: "walk.start", project: "/p", lesson: "k" }));
    m.observeCommand(ev({ type: "agent.start", project: "/p", prompt: "secret words" }));
    expect(m.summary().days["2026-10-12"]).toEqual({ walk_started: 1 });
  });
  test("only the fixed list of notes is accepted from the app", () => {
    const { m } = mk(); m.setEnabled(true);
    expect(NOTES).toContain("session");
    expect(m.note("session")).toBe(true);
    expect(m.note("my password is hunter2")).toBe(false);
    expect(m.summary().days["2026-10-12"]).toEqual({ session: 1 });
  });
  test("the file holds counts and day names only: no words, paths or ids", () => {
    const { dir, m } = mk(); m.setEnabled(true);
    m.observe(ev({ type: "walk.done", walk: "w-secret-id", project: "/Users/me/secret-project", lesson: "private-lesson", title: "My private title", steps: 3 }));
    m.observe(ev({ type: "walk.help", walk: "w", say: "hunter2 appears on screen" }));
    const text = readFileSync(join(dir, "metrics.json"), "utf8");
    for (const bad of ["secret", "private", "hunter2", "/Users", "w-secret-id"]) expect(text).not.toContain(bad);
  });
  test("it survives a restart, and turning it off stops counting but keeps the numbers until deleted", () => {
    const { dir, m } = mk(); m.setEnabled(true); m.note("session");
    const again = new Metrics(join(dir, "metrics.json"), () => new Date(day));
    expect(again.summary().enabled).toBe(true);
    again.setEnabled(false); again.note("session");
    expect(again.summary().days["2026-10-12"].session).toBe(1);
    again.erase();
    expect(again.summary().days).toEqual({}); expect(existsSync(join(dir, "metrics.json"))).toBe(false);   // it was off, so nothing is left
  });
  test("erasing while on keeps it on, across a restart", () => {
    const { dir, m } = mk(); m.setEnabled(true); m.note("session"); m.erase();
    expect(m.summary()).toMatchObject({ enabled: true, days: {} });
    expect(new Metrics(join(dir, "metrics.json"), () => new Date(day)).summary()).toMatchObject({ enabled: true, days: {} });
  });
  test("a day is the person's own day", () => {
    const { m } = mk(); m.setEnabled(true);
    day = "2026-10-12T12:00:00"; m.note("session");   // local noon: the same day everywhere
    expect(Object.keys(m.summary().days)).toEqual(["2026-10-12"]);
    day = "2026-10-12T10:00:00Z";
  });
  test("a broken counter never breaks the event it watches", () => {
    const { m } = mk(); m.setEnabled(true);
    expect(() => m.observe(null as never)).not.toThrow();
    expect(() => m.observeCommand(null as never)).not.toThrow();
  });
  test("a rate never goes above 100 percent (a lesson begun before counting was turned on)", () => {
    const { m } = mk(); m.setEnabled(true); m.note("walk_done"); m.note("walk_done"); m.note("walk_started");
    expect(m.summary().rates.walkCompletion).toBe(1);
  });
  test("a damaged file is simply empty and off", () => {
    const dir = tmp(); require("node:fs").writeFileSync(join(dir, "metrics.json"), "{nope");
    const m = new Metrics(join(dir, "metrics.json"), () => new Date(day));
    expect(m.summary()).toMatchObject({ enabled: false, days: {} });
  });
  test("old days are dropped after about four months", () => {
    const { m } = mk(); m.setEnabled(true);
    day = "2026-05-01T10:00:00Z"; m.note("session");
    day = "2026-10-12T10:00:00Z"; m.note("session");
    expect(Object.keys(m.summary().days)).toEqual(["2026-10-12"]);
  });
  test("the summary works out the rates the beta plan asks for", () => {
    const { m } = mk(); m.setEnabled(true);
    for (const n of ["walk_started", "walk_started", "walk_started", "walk_started", "walk_done", "walk_done", "walk_done", "walk_stopped", "walk_step", "walk_step", "walk_step", "walk_step", "walk_other_way", "soft_ring_corrected", "anywhere_use", "builder_use", "builder_use", "builder_use", "proof_passed", "proof_passed", "proof_passed", "proof_failed"]) m.note(n);
    const s = m.summary();
    expect(s.rates).toEqual({ walkCompletion: 0.75, stepSuccess: 0.75, anywhereShare: 0.25, proofPass: 0.75, softRingCorrections: 1 });
    expect(s.totals.walk_done).toBe(3);
  });
  test("rates are null, not zero, when there is nothing to divide by", () => {
    const { m } = mk(); m.setEnabled(true);
    expect(m.summary().rates).toEqual({ walkCompletion: null, stepSuccess: null, anywhereShare: null, proofPass: null, softRingCorrections: 0 });
  });
});
