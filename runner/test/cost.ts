// Staying fast, measured so that a busy Mac cannot fail it (the same method as app/src-tauri/src/fuzz.rs). A number of
// seconds on the clock says as much about the other programs running as about this code, so nothing here is compared
// with them. Instead:
// - Work is timed by this program's own processor time (process.cpuUsage), which leaves out the time it waits while other
//   programs run.
// - Each piece is run often enough per timing to last a few milliseconds, the pieces compared are timed in turn several
//   times, and each one's fastest timing counts: load only ever adds time.
// - What is checked is a ratio of two such times: the work on a bigger input against the work on a smaller one (does it
//   grow faster than it should for its size?), or the work against a reference of known cost (has it become many times
//   dearer than it is today?). Either side slowed by the Mac slows the other alike.
// - A check over its limit is measured again, and fails only when it is over every time: a pathological slowdown is slow
//   every time, a moment of bad luck is not.
// One run that must simply never hang (random input, one huge input) is bounded by processor time too (noHang).

const ROUNDS = 5;
const MIN_SAMPLE_MS = 3;
const TRIES = 3;

/** This program's processor time so far, in milliseconds. */
export const cpuMs = (): number => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };

/** f must finish within `ms` of processor time: a hang (an endless loop, a pattern that tries again from every place)
 *  uses processor time, a busy Mac does not add any. */
export function noHang<T>(f: () => T, ms = 1500, what = "it"): T {
  const t = cpuMs();
  const out = f();
  const used = cpuMs() - t;
  if (used >= ms) throw new Error(`${what} used ${used.toFixed(0)} ms of processor time, over the ${ms} ms it may`);
  return out;
}

/** Milliseconds of processor time one run of each piece takes: each is run often enough per timing to last at least
 *  MIN_SAMPLE_MS, the pieces are timed in turn ROUNDS times, and each one's fastest timing counts. */
export function perCall(runs: (() => unknown)[]): number[] {
  const reps = runs.map((f) => { const t = cpuMs(); f(); const once = Math.max(cpuMs() - t, 0.001); return Math.min(100_000, Math.max(1, Math.ceil(MIN_SAMPLE_MS / once))); });
  const best = runs.map(() => Infinity);
  for (let r = 0; r < ROUNDS; r++) {
    runs.forEach((f, i) => {
      const t = cpuMs();
      for (let k = 0; k < reps[i]; k++) f();
      best[i] = Math.min(best[i], (cpuMs() - t) / reps[i]);
    });
  }
  return best;
}

/** A ratio of two timings must stay at most `most`: measured up to TRIES times, and over the limit only if over every time. */
export function ratioAtMost(what: string, most: number, measure: () => [number, string]): string {
  const seen: string[] = [];
  for (let i = 0; i < TRIES; i++) {
    const [ratio, how] = measure();
    if (ratio <= most) return how;
    seen.push(how);
  }
  throw new Error(`${what}: over the limit of ${most} every time it was measured: ${seen.join("; ")}`);
}

/** Making the input `factor` times bigger may make the work at most `most` times dearer. Work that grows in step with its
 *  input is `factor` times dearer, work that grows with the square of it `factor * factor` times, so a limit between the
 *  two catches anything that grows faster than it should. */
export function growsGently(what: string, factor: number, most: number, small: () => unknown, big: () => unknown): string {
  return ratioAtMost(what, most, () => {
    const [s, b] = perCall([small, big]);
    const grew = b / Math.max(s, 1e-6);
    return [grew, `${factor} times the input took ${grew.toFixed(1)} times as long (${b.toFixed(3)} ms against ${s.toFixed(3)} ms)`];
  });
}

/** A reference of known cost, the same kind of work as reading text: a plain edit distance between two fixed lines of
 *  code, worked out in full, ten times. */
export function reference(): number {
  const a = "export default function App() { const [count, setCount] = useState(0);";
  const b = "return <button onClick={() => setCount(count + 1)}>Count {count}</button>";
  let total = 0;
  for (let k = 0; k < 10; k++) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
      prev = cur;
    }
    total += prev[b.length];
  }
  return total;
}

/** The work may cost at most `most` references: a limit a few times above what it costs today, so ordinary changes pass
 *  and a pathological one (a pattern built again for every line, a search inside a search, a cap taken away) does not. */
export function costsAtMost(what: string, most: number, work: () => unknown): string {
  return ratioAtMost(what, most, () => {
    const [r, w] = perCall([reference, work]);
    const cost = w / Math.max(r, 1e-6);
    return [cost, `${cost.toFixed(1)} references (${w.toFixed(3)} ms against ${r.toFixed(4)} ms)`];
  });
}
