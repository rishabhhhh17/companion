// Must fix 5: helpers that keep one slow test from turning the next one red.
//  - waitFor fails, and says what it waited for and for how long, instead of returning quietly and letting the test go on
//    to a confusing assertion (or hang until Bun's own limit).
//  - Runners: the engines a test made, so afterEach can stop them and wait for them before deleting their folders. A test
//    that timed out keeps running in the background otherwise, and writes into the next test's folders or its own deleted ones.

/** Waits until `cond` holds. Fails with `what` and the time waited when it does not within `ms`. */
export async function waitFor(what: string, cond: () => boolean, ms = 10_000, every = 10): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

type Handles = { handle(cmd: never): Promise<void> };

/** The runners a test file made, and the commands still running on them. */
export class Runners {
  private all = new Set<Handles>();
  private running = new Set<Promise<unknown>>();
  /** Keeps `r`: every command it is given is followed until it ends. Returns the same runner. */
  track<R extends Handles>(r: R): R {
    const handle = r.handle.bind(r) as (cmd: never) => Promise<void>;
    (r as { handle: (cmd: never) => Promise<void> }).handle = (cmd: never) => {
      const p = handle(cmd);
      this.running.add(p);
      p.then(() => this.running.delete(p), () => this.running.delete(p));
      return p;
    };
    this.all.add(r);
    return r;
  }
  /** How many commands are still running (for a test of this helper). */
  get busy(): number { return this.running.size; }
  /** Stop everything on every runner (Stop everything, as the app sends it), then wait up to `ms` for what was running to
   *  end. Returns whether everything ended in time. The runners are forgotten either way. */
  async stopAll(ms = 10_000): Promise<boolean> {
    const runners = [...this.all];
    this.all.clear();
    for (const r of runners) { try { await r.handle({ v: 1, id: "test-cleanup", type: "agent.interruptAll", reason: "test cleanup" } as never); } catch { /* a runner that cannot stop is waited for below */ } }
    const left = [...this.running];
    if (!left.length) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ended = await Promise.race([Promise.allSettled(left).then(() => true), new Promise<boolean>((r) => { timer = setTimeout(() => r(false), ms); })]);
    clearTimeout(timer);
    return ended;
  }
}
