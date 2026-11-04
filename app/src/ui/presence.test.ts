// What comes and goes leaves on its exit (M66 fix 9): a menu, a sheet and a toast stay in the page, marked leaving, until
// their exit has played, then go; a new show during the exit takes them back; with reduced motion they go at once.
import { describe, expect, test } from "bun:test";
import { Presence, leaveThen, type PresenceState } from "./partsLogic.ts";

/** A clock the test moves by hand. */
function clock() {
  let now = 0, n = 0;
  const due = new Map<number, { at: number; f: () => void }>();
  return {
    set: (f: () => void, ms: number) => { due.set(++n, { at: now + ms, f }); return n; },
    clear: (t: unknown) => { due.delete(t as number); },
    run: (ms: number) => { now += ms; for (const [k, d] of [...due]) if (d.at <= now) { due.delete(k); d.f(); } },
    waiting: () => due.size,
  };
}

describe("presence", () => {
  test("told to go, it stays marked leaving for its exit, then goes", () => {
    const c = clock(), seen: PresenceState[] = [];
    const p = new Presence(true, c, (s) => seen.push(s));
    p.set(false, 100);
    expect(p.state).toEqual({ mounted: true, leaving: true });
    c.run(99);
    expect(p.state.mounted).toBe(true);
    c.run(1);
    expect(p.state).toEqual({ mounted: false, leaving: false });
    expect(seen).toEqual([{ mounted: true, leaving: true }, { mounted: false, leaving: false }]);
  });
  test("shown again while it leaves, it is back at once and the exit never ends it", () => {
    const c = clock();
    const p = new Presence(true, c, () => {});
    p.set(false, 180);
    c.run(90);
    p.set(true, 180);
    expect(p.state).toEqual({ mounted: true, leaving: false });
    expect(c.waiting()).toBe(0);
    c.run(500);
    expect(p.state.mounted).toBe(true);
  });
  test("with reduced motion (no exit time) it goes at once", () => {
    const c = clock();
    const p = new Presence(true, c, () => {});
    p.set(false, 0);
    expect(p.state).toEqual({ mounted: false, leaving: false });
    expect(c.waiting()).toBe(0);
  });
  test("closing twice, or closing what never showed, starts nothing", () => {
    const c = clock(), seen: PresenceState[] = [];
    const p = new Presence(false, c, (s) => seen.push(s));
    p.set(false, 100);
    expect(seen).toEqual([]);
    p.set(true, 100); p.set(false, 100); p.set(false, 100);
    expect(c.waiting()).toBe(1);
  });
  test("stop: a part taken away during its exit tells nobody later", () => {
    const c = clock(), seen: PresenceState[] = [];
    const p = new Presence(true, c, (s) => seen.push(s));
    p.set(false, 100);
    p.stop();
    c.run(200);
    expect(seen).toEqual([{ mounted: true, leaving: true }]);
  });
  test("leaveThen: marks it leaving and tells its owner after the exit, or at once with none", () => {
    const c = clock(), marks: boolean[] = [];
    let told = 0;
    leaveThen((on) => marks.push(on), 140, () => told++, c.set);
    expect([marks, told]).toEqual([[true], 0]);
    c.run(140);
    expect(told).toBe(1);
    leaveThen((on) => marks.push(on), 0, () => told++, c.set);
    expect([marks, told]).toEqual([[true], 2]);
  });
});
