// What a case is expected to cost, from token counts and the published prices. ESTIMATES, written before any real run:
// the token profiles below are guesses from the size of each set's prompts and Claude Code's usual tool loop, and the first
// paid run replaces them with measured numbers (each results file records the real tokens and cost per case).
// Run `bun run evals/lib/prices.ts` to print the table that evals/README.md carries (a test checks the two match).

/** Dollars per million tokens: input, output, and a cache read. Input written to the cache costs 1.25 times input. */
export const PRICES: Record<string, { in: number; out: number; cacheRead: number; note?: string }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, note: "cache read assumed at the usual tenth of input" },
  "claude-haiku-4-5-20251001": { in: 1, out: 5, cacheRead: 0.1, note: "cache read assumed at the usual tenth of input" },
};
export const CACHE_WRITE = 1.25;

/** fresh: plain input; written: input written to the cache; cacheRead: input read from it; out: output (thinking included). */
export type Profile = { fresh: number; written: number; cacheRead: number; out: number };

const rate = (model: string) => {
  const r = PRICES[model];
  if (!r) throw new Error(`No price for ${model}. Add it to evals/lib/prices.ts first.`);
  return r;
};
export function estimateUsd(model: string, p: Profile): number {
  const r = rate(model);
  return (p.fresh * r.in + p.written * r.in * CACHE_WRITE + p.cacheRead * r.cacheRead + p.out * r.out) / 1_000_000;
}
/** The worst case: nothing is read from the cache, so every input token is paid in full. */
export function uncachedUsd(model: string, p: Profile): number {
  const r = rate(model);
  return ((p.fresh + p.written + p.cacheRead) * r.in + p.out * r.out) / 1_000_000;
}

// Per case token profiles (estimates). An agent turn re-reads the conversation so far: about 20,000 tokens of Claude
// Code's own instructions and tools, then the project files and tool output it has seen.
export const PROFILES: { set: string; what: string; model: string; cases: number; profile: Profile }[] = [
  // About 12 turns, 22,000 tokens read per turn (3,000 of them new), 700 written per turn (thinking counts as output).
  { set: "fix-projects", what: "a fix task (Sonnet 5.5, the app's default)", model: "claude-sonnet-5-5", cases: 25, profile: { fresh: 0, written: 36_000, cacheRead: 228_000, out: 8_400 } },
  { set: "fix-projects", what: "the same on Opus 5.5", model: "claude-opus-5-5", cases: 12, profile: { fresh: 0, written: 36_000, cacheRead: 228_000, out: 8_400 } },
  { set: "fix-projects", what: "the same on Haiku 5.5", model: "claude-haiku-5-5", cases: 25, profile: { fresh: 0, written: 36_000, cacheRead: 228_000, out: 8_400 } },
  // Built to need two approaches: about 24 turns, 6 checks.
  { set: "loop-breaker", what: "a task that must break a loop (Sonnet 5.5)", model: "claude-sonnet-5-5", cases: 5, profile: { fresh: 0, written: 70_000, cacheRead: 600_000, out: 17_000 } },
  // One turn: the review prompt and a small diff in, a short JSON answer out (Opus 5.5 always thinks, at medium effort).
  { set: "review-catch", what: "one second model review (Opus 5.5)", model: "claude-opus-5-5", cases: 10, profile: { fresh: 2_500, written: 0, cacheRead: 0, out: 2_000 } },
  // One fast lane call: the change and the instructions in, two lines and a question out.
  { set: "explain", what: "one explanation (Haiku 4.5, the app's default)", model: "claude-haiku-4-5-20251001", cases: 24, profile: { fresh: 2_000, written: 0, cacheRead: 0, out: 250 } },
  { set: "explain", what: "one explanation (Haiku 5.5, which thinks by default)", model: "claude-haiku-5-5", cases: 24, profile: { fresh: 2_000, written: 0, cacheRead: 0, out: 800 } },
  { set: "explain", what: "grading one explanation (Sonnet 5.5)", model: "claude-sonnet-5-5", cases: 24, profile: { fresh: 2_500, written: 0, cacheRead: 0, out: 1_000 } },
  // One picture of 1280 by 800 (about 1,400 tokens) plus the instructions, a short answer out.
  { set: "show-me-how", what: "one pointing ask (Sonnet 5.5)", model: "claude-sonnet-5-5", cases: 40, profile: { fresh: 3_500, written: 0, cacheRead: 0, out: 1_000 } },
  { set: "show-me-how", what: "one pointing ask (Haiku 5.5)", model: "claude-haiku-5-5", cases: 40, profile: { fresh: 3_500, written: 0, cacheRead: 0, out: 800 } },
  // The everyday set: the same, plus the tutor's words (about 150 tokens).
  { set: "show-me-how", what: "one everyday pointing ask, as a tutor (Sonnet 5.5)", model: "claude-sonnet-5-5", cases: 40, profile: { fresh: 3_650, written: 0, cacheRead: 0, out: 1_000 } },
  { set: "show-me-how", what: "one everyday pointing ask, as a tutor (Haiku 5.5)", model: "claude-haiku-5-5", cases: 40, profile: { fresh: 3_650, written: 0, cacheRead: 0, out: 800 } },
];

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** The table in evals/README.md: per case with the cache, per case without it, and the whole set. */
export function costTable(): string {
  const rows = PROFILES.map((r) => {
    const one = estimateUsd(r.model, r.profile), worst = uncachedUsd(r.model, r.profile);
    return `| ${r.set} | ${r.what} | ${usd(one)} | ${usd(worst)} | ${r.cases} | ${usd(one * r.cases)} |`;
  });
  return ["| Set | One case | With the cache | Without it | Cases | Whole set |", "|---|---|---|---|---|---|", ...rows].join("\n");
}

if (import.meta.main) console.log(costTable());
