// Must fix 28 (M59): the one Stop registry. Everything long running in the engine (a task, a check, a capture, a download,
// a timer, a wait for the person) is registered here by name with how to stop it, and Stop everything (agent.interruptAll),
// the engine closing and a group switched off all go through this one list. Before, the same list was kept by hand in
// main.ts (twice), agent.ts and groups.ts, and the copies already differed (rule 11).
//
// STOP_PARTS names every part that must be registered: a test (interrupts.test.ts) starts one job of each kind and checks
// Stop everything ends it, and another checks main.ts registers every name. Adding a long running thing means adding its
// row here, so it cannot be forgotten.

/** What a part is, for the person reading a stop: a task works for them, a check looks, a wait waits for them. */
export type StopKind = "task" | "check" | "capture" | "download" | "timer" | "wait" | "hook" | "lesson" | "answer";

/** Every part that Stop everything ends, in the order it is stopped. */
export const STOP_PARTS = [
  // AgentRunner (agent.ts): each is one of its own lists of running work.
  { name: "tasks", kind: "task", what: "tasks and Rescue, Research and Ship runs (their sessions), and approvals waiting" },
  { name: "drives", kind: "task", what: "Drive plans: the step running and the plan's waits" },
  { name: "finds", kind: "check", what: "Point at the problem and the first check" },
  { name: "findWaits", kind: "wait", what: "a check waiting for the project to be free" },
  { name: "installs", kind: "download", what: "package installs and clones the person started" },
  { name: "pictures", kind: "capture", what: "visual receipts (screenshots of the app being built)" },
  { name: "watchRuns", kind: "check", what: "a watch's check running inside the runner" },
  { name: "costPauses", kind: "wait", what: "M75: the cost pause waiting for Keep going, Stop or Undo" },
  { name: "signInWaits", kind: "wait", what: "M75: the sign in handover waiting for the person (and its window)" },
  // The engine's other services (main.ts).
  { name: "walks", kind: "lesson", what: "lessons (Show me how walkthroughs) in progress" },
  { name: "browser", kind: "download", what: "the hidden browser's one time download" },
  { name: "warm", kind: "timer", what: "the zero cost warm up reading the Claude binary" },
  { name: "watches", kind: "check", what: "watch routines' checks (the schedule stays)" },
  { name: "review", kind: "check", what: "a review and its checks, and a batch waiting for the quiet time" },
  { name: "assist", kind: "answer", what: "Prompt help, the error explainer, Second Look and Show me answers" },
  { name: "guard", kind: "wait", what: "M77: a guard request waiting for its snapshot, and the Claude is waiting marks and their timers" },
  { name: "doneSignals", kind: "hook", what: "M75 and M78: the done and start hooks' folder (closed when the engine closes)" },
] as const satisfies readonly { name: string; kind: StopKind; what: string }[];

export type StopName = (typeof STOP_PARTS)[number]["name"];
export const STOP_NAMES: readonly StopName[] = STOP_PARTS.map((p) => p.name);

/** A group (or a tool with its own switch) switched off, as groups.ts names them for what they stop. */
export type StopGroup = "flow" | "guide" | "prompt" | "secondLook" | "drawIt";

export type Part = {
  /** Ends what this part is running now. Never throws out of the registry. */
  stop: () => unknown;
  /** What to end when one of these groups is switched off (only the group's own work). */
  groups?: Partial<Record<StopGroup, () => unknown>>;
  /** The engine closing: what to close after the stop (a folder watched, a schedule). */
  close?: () => unknown;
};

export class Interrupts {
  private parts = new Map<StopName, Part>();
  /** Registers a part under its name; a second registration under the same name replaces the first. */
  register(name: StopName, part: Part): () => void {
    this.parts.set(name, part);
    return () => { if (this.parts.get(name) === part) this.parts.delete(name); };
  }
  registered(): StopName[] { return STOP_NAMES.filter((n) => this.parts.has(n)); }
  /** The names in STOP_PARTS that nothing registered (the engine's own check at start, and the tests). */
  missing(): StopName[] { return STOP_NAMES.filter((n) => !this.parts.has(n)); }

  /** Stop everything (rule 11): every part, in order. One part that throws never keeps the others running. Resolves once
   *  every stop that returned a promise settled; returns the names stopped. */
  async stopEverything(): Promise<StopName[]> {
    const done: StopName[] = [], waits: Promise<unknown>[] = [];
    for (const name of STOP_NAMES) {
      const p = this.parts.get(name);
      if (!p) continue;
      try { const r = p.stop(); if (r && typeof (r as Promise<unknown>).then === "function") waits.push((r as Promise<unknown>).catch(() => undefined)); } catch { /* the next part still stops */ }
      done.push(name);
    }
    await Promise.allSettled(waits);
    return done;
  }

  /** A group switched off: each part ends only that group's own work. The order of the groups does not matter. */
  stopGroups(groups: readonly StopGroup[]): string[] {
    const done: string[] = [];
    for (const name of STOP_NAMES) {
      const p = this.parts.get(name);
      for (const g of groups) {
        const f = p?.groups?.[g];
        if (!f) continue;
        try { const r = f(); if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => undefined); } catch { /* the next part still stops */ }
        done.push(`${name}:${g}`);
      }
    }
    return done;
  }

  /** The engine is closing: everything stops, then each part closes what it watches. */
  async shutdown(): Promise<StopName[]> {
    const done = await this.stopEverything();
    for (const name of STOP_NAMES) { try { this.parts.get(name)?.close?.(); } catch { /* the next part still closes */ } }
    return done;
  }
}
