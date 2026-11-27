// M123: did it do what you asked. The receipt's promises, as the engine sent them (runner/src/review/promises.ts), checked
// before they reach the card: known results only, plain words clipped and keys hidden, at most five.
import { redact } from "../../runner/src/redact.ts";

export type AskedResult = "kept" | "not_kept" | "could_not_check";
export type AskedPromise = { say: string; result: AskedResult; why?: string; image?: string };
/** slice 4: the largest picture kept (the engine sends at most this much, promises.ts MAX_FRAME). */
export const MAX_FRAME = 700_000;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const RESULTS: readonly AskedResult[] = ["kept", "not_kept", "could_not_check"];

export function promisesOf(v: unknown): { promises?: AskedPromise[] } {
  if (!Array.isArray(v)) return {};
  const out = v.filter((p): p is AskedPromise => !!p && typeof p === "object" && typeof p.say === "string" && p.say.trim().length > 0 && RESULTS.includes(p.result))
    .slice(0, 5).map((p) => ({ say: redact(p.say).slice(0, 140), result: p.result, ...(typeof p.why === "string" && p.why ? { why: redact(p.why).slice(0, 200) } : {}),
      ...(typeof p.image === "string" && p.image.length <= MAX_FRAME && B64.test(p.image) ? { image: p.image } : {}) }));
  return out.length ? { promises: out } : {};
}

/** How many promises the hidden browser found broken. Could not check never counts either way. */
export const notKeptOf = (ps: readonly AskedPromise[] | undefined): number => (ps ?? []).filter((p) => p.result === "not_kept").length;
