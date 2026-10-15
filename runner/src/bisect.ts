// Which task broke it? Companion keeps a saved version of the project before and after every task (checkpoints.ts, never
// the person's git). When a check fails now, earlier versions are checked one at a time, in a private copy (agent.ts does
// the copying), and a binary search finds the first task after which the same check fails. This file is the search
// itself, in plain code with no git and no checks, so it can be tested on its own.
import type { LadderResult, Rung } from "./proof/ladder.ts";
import type { TaskRow } from "./tasklog.ts";

/** At most this many checks in one search, the check of the project as it is now included. Each uses the ladder's own time limits. */
export const MAX_RUNS = 6;
/** The most recent tasks one search looks through: with the check of now and one check between two tasks, they fit in MAX_RUNS. */
export const WINDOW = 14;

export type Verdict = "good" | "bad" | "skip" | "cancelled";

/** How a check of an earlier version stands against the step that fails now. A version that failed at an earlier step never
 *  got that far, so it says nothing either way ("skip"). A step that was not there yet (no tests then) cannot have failed. */
export function classify(res: LadderResult | null, target: Rung): Verdict {
  if (!res) return "skip";
  if (res.verdict === "cancelled") return "cancelled";
  const at = res.steps.find((s) => s.rung === target);
  if (at?.status === "failed") return "bad";
  if (at) return "good";
  return res.verdict === "failed" ? "skip" : "good";
}

/** One task that changed the project: the saved version from before it and the last one saved after it. */
export type TaskPoint = { id: number; label: string; at: string; before: string; after: string };

const num = (id: string) => (/^cp_\d+$/.test(id) ? Number(id.slice(3)) : NaN);

/** The tasks that changed this project, oldest first. `rows` is the task log (any order), `checkpoints` the saved versions.
 *  A task's after version is the last "After:" version saved before the next task started; without one it is left out. */
export function taskPoints(rows: TaskRow[], checkpoints: { id: string; label: string }[]): TaskPoint[] {
  const cps = checkpoints.map((c) => ({ ...c, n: num(c.id) })).filter((c) => Number.isFinite(c.n)).sort((a, b) => a.n - b.n);
  const known = new Set(cps.map((c) => c.id));
  const starts = rows.filter((r) => r.checkpoint && known.has(r.checkpoint)).map((r) => num(r.checkpoint!)).sort((a, b) => a - b);
  const out: TaskPoint[] = [];
  for (const r of rows) {
    if (!r.checkpoint || !known.has(r.checkpoint) || r.changed === 0) continue;
    const b = num(r.checkpoint);
    const next = starts.find((s) => s > b) ?? Infinity;
    const after = cps.filter((c) => c.n > b && c.n < next && c.label.startsWith("After: ")).at(-1);
    if (after) out.push({ id: r.id, label: r.label, at: r.startedAt, before: r.checkpoint, after: after.id });
  }
  return out.sort((a, b) => num(a.before) - num(b.before));
}

export type Outcome =
  | { kind: "found"; task: TaskPoint }
  | { kind: "already_failing"; oldest: TaskPoint }
  | { kind: "after_last_task"; last: TaskPoint }
  | { kind: "outside_change"; earlier: TaskPoint; later: TaskPoint }
  | { kind: "unsure"; earlier?: TaskPoint; later?: TaskPoint }
  | { kind: "cancelled" };

export type SearchOptions = {
  points: TaskPoint[];
  /** The version saved just now, which is known to fail. */
  nowId: string;
  probe: (checkpoint: string, at: { side: "before" | "after"; label: string }) => Promise<Verdict>;
  /** Do two saved versions hold different files? (Something changed between two tasks that no task did.) */
  differs: (a: string, b: string) => Promise<boolean>;
  maxProbes: number;
};

/**
 * Binary search for the first version that fails. Version 0 is before the oldest task, version k is after task k, and the
 * version now (after the newest task, n + 1) is known to fail. Versions that cannot be checked that far are stepped round.
 * When the answer falls between two tasks with changes in between that no task made, the version before the later task
 * decides whether that task or the change before it broke it. Runs out of checks, or has only unclear answers: unsure.
 */
export async function findFirstBad(o: SearchOptions): Promise<{ outcome: Outcome; probes: number }> {
  const p = o.points, n = p.length;
  let probes = 0;
  const at = (i: number) => (i === 0 ? { cp: p[0].before, side: "before" as const, label: p[0].label } : { cp: p[i - 1].after, side: "after" as const, label: p[i - 1].label });
  let lo = 0, hi = n + 1;
  const skipped = new Set<number>();
  while (lo < hi) {
    const open: number[] = [];
    for (let i = lo; i < hi; i++) if (!skipped.has(i)) open.push(i);
    if (open.length === 0 || probes >= o.maxProbes) break;
    const mid = open[Math.floor((open.length - 1) / 2)];
    const s = at(mid);
    const v = await o.probe(s.cp, { side: s.side, label: s.label });
    probes++;
    if (v === "cancelled") return { outcome: { kind: "cancelled" }, probes };
    if (v === "bad") hi = mid;
    else if (v === "good") lo = mid + 1;
    else skipped.add(mid);
  }
  // The first failing version is somewhere from lo to hi: the task after the last good version, up to the first bad one's.
  if (lo < hi || n === 0) return { outcome: { kind: "unsure", ...(n ? { earlier: p[Math.max(lo, 1) - 1], later: p[Math.min(hi, n) - 1] } : {}) }, probes };
  const first = hi;
  if (first === 0) return { outcome: { kind: "already_failing", oldest: p[0] }, probes };
  if (first === n + 1) {
    // Passing after the last task but failing now with the very same files means the check itself gives different answers.
    if (!(await o.differs(p[n - 1].after, o.nowId))) return { outcome: { kind: "unsure", earlier: p[n - 1] }, probes };
    return { outcome: { kind: "after_last_task", last: p[n - 1] }, probes };
  }
  const task = p[first - 1];
  if (first >= 2 && (await o.differs(p[first - 2].after, task.before))) {
    const earlier = p[first - 2];
    if (probes >= o.maxProbes) return { outcome: { kind: "unsure", earlier, later: task }, probes };
    const v = await o.probe(task.before, { side: "before", label: task.label });
    probes++;
    if (v === "cancelled") return { outcome: { kind: "cancelled" }, probes };
    if (v === "bad") return { outcome: { kind: "outside_change", earlier, later: task }, probes };
    if (v === "skip") return { outcome: { kind: "unsure", earlier, later: task }, probes };
  }
  return { outcome: { kind: "found", task }, probes };
}
