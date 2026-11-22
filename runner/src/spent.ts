// Hunt 20 Nov 2026: what a light request the API took had likely cost when it then ended badly (Stop, an error part way,
// an answer that said nothing). Carried on the error, so the caller books it against the daily limit instead of nothing.
const COST = Symbol.for("squibby.costUsd");
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The error, marked with what its request had likely cost (nothing is marked for 0 or a bad number). */
export function withCost(e: unknown, usd: number): Error {
  const err = e instanceof Error ? e : new Error(String(e));
  if (Number.isFinite(usd) && usd > 0) (err as unknown as Record<symbol, number>)[COST] = round(usd);
  return err;
}

/** What a failed light request had cost, or 0 when nothing reached the model. */
export function spentOf(e: unknown): number {
  const v = e && typeof e === "object" ? (e as Record<symbol, unknown>)[COST] : 0;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}
