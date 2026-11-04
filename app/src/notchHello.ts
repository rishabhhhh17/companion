// M68 step 2b, the notch has presence (the founder, 4 Nov 2026: "there is still no notch like how HeyClicky has, like hey
// Rishabh or something"). Plain decisions, tested in notchHello.test.ts; island.tsx and islandPanel.tsx only draw them.
//
// - The wings at rest: on a real notch, with Show wings at rest on (island.wings), the notch keeps small wings: the Visor's
//   lights on the left, and on the right one short word ("3 changes") or a tick after a proof, nothing when there is
//   nothing. Work, a question, listening and a fresh result use the island's live wings (home.ts islandWings) instead.
// - The hello: when the app starts, when the Mac wakes, or when the person comes back after more than an hour away, the
//   notch widens for about 3 seconds with the Visor and one line: "Hey <name>" (or "Hi there") and at most one plain fact.
//   Only on a real notch (never the pill in the menu bar or the edge line). At most once an hour, never while a call app is
//   in front (rule 7, the shell's presentation check: it sees only which app is in front, so a share from a call that is
//   behind another app is not noticed; sharing.hide is what keeps the panel out of the shared picture), never while the
//   island page is hidden, never over Home or a question, never with Say hello in the notch off (island.hello). It never takes focus (rule 9), makes no sound,
//   and keeps only the time it last said hello. The name is only what the person typed (you.name); the Mac's account name
//   is never read.
import type { CharacterState, Model } from "./model.ts";
import { homeStatus } from "./homeHero.ts";
import { S } from "./strings.ts";

/** How long the hello shows. */
export const HELLO_SHOW_MS = 3000;
/** At most one hello in this long, whatever the reason. */
export const HELLO_GAP_MS = 60 * 60_000;
/** Away for longer than this: coming back says hello. */
export const AWAY_MS = 60 * 60_000;
/** A page timer that fires this much later than asked means the Mac slept (a busy page is late by far less). */
export const SLEPT_GAP_MS = 60_000;
/** How often the page looks at the clock to notice a wake. */
export const WAKE_TICK_MS = 15_000;
/** Where the page keeps the time it last said hello (the island page's own storage; a number only). */
export const LAST_HELLO_KEY = "companion.notchHello";
/** The longest name kept (you.name's maxLength in protocol/settings.json). */
export const YOU_MAX = 24;

export type HelloWhy = "start" | "wake" | "back";
/** `last`: when the last hello showed (null: never). `quiet`: the shell's presentation check says a call app is in front
 *  (main.rs quiet_now). `asking`: a question or a result already has the panel under the notch. `kind`: the island's shape
 *  (only a real notch says hello). `hidden`: the island page is not on screen. `awayMs`: for a return, how long the person
 *  was away. */
export type HelloCheck = { why: HelloWhy; now: number; last: number | null; on: boolean; quiet: boolean; homeOpen: boolean; asking: boolean;
  kind: "notch" | "pill" | "edge"; hidden: boolean; awayMs?: number };

export function helloDue(c: HelloCheck): boolean {
  if (!c.on || c.quiet || c.homeOpen || c.asking || c.hidden || c.kind !== "notch") return false;
  // At most once an hour. A clock set back (last in the future) never blocks it for good.
  if (c.last !== null && c.now >= c.last && c.now - c.last < HELLO_GAP_MS) return false;
  if (c.why === "back") return (c.awayMs ?? 0) > AWAY_MS;
  return true;
}

/** One hello at a time. `attempt` asks helloDue, then the shell's presentation check (`quiet`), then helloDue again with the
 *  kept time read afresh, so two tries in flight never both pass. The time of a hello that was decided is kept in memory
 *  at once, so a storage that fails never lifts the hourly limit; it is written to storage (`shown`) only once the panel
 *  has actually opened. `check` builds the check for a given last time, with the page's state at that moment. */
export function helloGate(store: { read: () => number | null; write: (t: number) => void }) {
  let busy = false;
  let mem: number | null = null;
  const last = (): number | null => {
    const kept = store.read();
    return kept === null ? mem : mem === null ? kept : Math.max(kept, mem);
  };
  return {
    async attempt(check: (last: number | null) => HelloCheck, quiet: () => Promise<boolean>): Promise<boolean> {
      if (busy || !helloDue(check(last()))) return false;
      busy = true;
      try {
        const q = await quiet();
        const c = check(last());
        if (!helloDue({ ...c, quiet: q })) return false;
        mem = c.now;
        return true;
      } finally {
        busy = false;
      }
    },
    shown(t: number) {
      mem = mem === null ? t : Math.max(mem, t);
      store.write(t);
    },
  };
}

/** How long the Mac slept, from a timer that asked to fire `every` ms after `prev` and fired at `now`: 0 when it was not
 *  late by SLEPT_GAP_MS or more (a busy page), or when the clock went back. */
export function wokeAfter(prev: number, now: number, every: number): number {
  const gap = now - prev;
  return gap - every >= SLEPT_GAP_MS ? gap : 0;
}

/** The time kept for the last hello, read safely. */
export function lastHelloFrom(v: string | null): number | null {
  const n = v === null || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The name the person typed, as one short line. Anything that is not text is no name. */
export function cleanName(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, YOU_MAX).trim();
}

const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";

/** One plain fact for the hello, the most useful first, or null when there is nothing true to say: questions waiting,
 *  changes waiting to be reviewed, a problem the last check found, or that everything checked is fine. */
export function helloFact(m: Model, now: number): string | null {
  if (!m.runnerUp) return null;
  if (m.approvals.length > 0) return S.hello.questions(m.approvals.length);
  const project = m.task?.project ?? m.folder ?? "";
  const name = nameOf(project);
  if (!name) return null;
  const rv = m.review;
  if (rv && rv.stage !== "reviewed" && rv.count > 0) return S.hello.changes(name, rv.count);
  const s = homeStatus(m, project, now);
  if (s.kind === "failing") return S.home.failing(name);
  if (s.kind === "works") return S.hello.allFine;
  return null;
}

/** The hello's one line: the greeting, and the fact after it. `say` is the whole of it in words, for VoiceOver. */
export function helloLine(name: string, fact: string | null): { greet: string; fact: string | null; say: string } {
  const n = cleanName(name);
  const greet = n ? S.hello.hey(n) : S.hello.hiThere;
  return { greet, fact, say: fact ? `${greet}. ${fact}.` : `${greet}.` };
}

/** What the wings show at rest, or null for the bare notch. `state`: the Visor's lights (idle, or off with the engine
 *  down). `word`: one short count on the right. `tick`: a proof stands (the project works since its last check). */
export type RestWings = { state: CharacterState; word: string | null; tick: boolean };
/** The state the band at rest draws: a proven project's tick shows the smile beside it (M68 step 3), so the lights and the
 *  tick never disagree; otherwise the resting lights. */
export const restWingState = (r: RestWings): CharacterState => (r.tick ? "done" : r.state);
export function restWings(m: Model, now: number, o: { on: boolean; kind: "notch" | "pill" | "edge" }): RestWings | null {
  if (!o.on || o.kind !== "notch") return null;
  if (!m.runnerUp) return { state: "off", word: null, tick: false };
  const rv = m.review;
  if (rv && rv.stage !== "reviewed" && rv.count > 0) return { state: "idle", word: S.hello.changesShort(rv.count), tick: false };
  const project = m.task?.project ?? m.folder ?? "";
  const works = !!nameOf(project) && homeStatus(m, project, now).kind === "works";
  return { state: "idle", word: null, tick: works };
}
