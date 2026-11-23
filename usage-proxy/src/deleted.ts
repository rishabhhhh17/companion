// What is kept after "Delete my account" (M116 section 8): one small line keyed by an HMAC of the owner id (google:<sub>), so
// deleting and signing up again cannot reset this month's allowance. It holds no email, no name and no Google id: only the
// day and month it was written, what was spent in them, and the sign in nonces that were still good (so an ID token used just
// before the delete cannot be used again just after it). There is no trial, so there is no trial flag (founder, 19 Nov 2026).
// The line goes at `until` (deletedUntil): the end of that month, and never sooner than DELETED_MIN_KEEP_MS after the delete,
// so a checkout opened before the delete and paid after it is still known as a deleted account's (and flagged for a refund).
// The same HMAC, after DELETED_PREFIX, replaces the owner id on the owner's suspension log lines, so no Google id is kept.
//
// The HMAC key is derived from METADATA_USER_ID_SECRET under its own label, as the sign in nonce's is: no new secret, and a
// value made for one purpose is never valid for another.
import { secretProblem } from "./userid.ts";
import { nextReset } from "./plans.ts";

const LABEL = "squibby-deleted-account-v1";
/** What a Dodo customer link, or a report payment's owner, becomes when its account is deleted: this, then the HMAC. A late
 *  payment event that finds it is answered 200 and changes nothing. */
export const DELETED_PREFIX = "deleted:";
export const isDeletedMarker = (x: unknown): boolean => typeof x === "string" && x.startsWith(DELETED_PREFIX);

/** The kept line. `nonces`: [id, good until] of sign in nonces still good when the account was deleted. `until`: when it goes. */
export type DeletedLine = { at: number; day: string; dayUsd: number; month: string; monthUsd: number; nonces: [string, number][]; until: number };

/** A Dodo checkout session lasts 24 hours, and Dodo retries a webhook for about 37 hours, so a payment for a checkout opened
 *  just before the delete arrives within 24 + 48 hours of it. The line is kept at least that long. */
export const DELETED_MIN_KEEP_MS = 72 * 3600 * 1000;
/** When a line written at `at` goes: the end of its month (UTC), at least DELETED_MIN_KEEP_MS after `at`, and after its nonces
 *  run out. Nothing is kept past that. */
export function deletedUntil(at: number, nonces: readonly [string, number][]): number {
  return Math.max(nextReset("month", at), at + DELETED_MIN_KEEP_MS, ...nonces.map(([, until]) => until + 1));
}
/** True while the line is still kept at `now`. A line written before `until` existed is timed from its own date. */
export const deletedLineLive = (l: Pick<DeletedLine, "at" | "nonces"> & { until?: number }, now: number): boolean =>
  now < (typeof l.until === "number" ? l.until : deletedUntil(l.at, l.nonces ?? []));

const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();
function lineKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const derived = new Uint8Array(await crypto.subtle.sign("HMAC", base, enc.encode(LABEL)));
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    })();
    keys.set(secret, k);
  }
  return k;
}

/** The deleted line's key for an owner: 64 hex characters. Throws when the secret is missing or short. */
export async function deletedKey(ownerId: string, secret: string): Promise<string> {
  const problem = secretProblem(secret);
  if (problem) throw new Error(problem);
  if (typeof ownerId !== "string" || ownerId.length === 0) throw new Error("An owner id is needed.");
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await lineKey(secret), enc.encode(ownerId)));
  return [...mac].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Two lines for the same key, as one (audit run 2, finding 2). A second delete sent at the same time as the first finds an
 *  empty owner and makes a line with no spend and no nonces: writing it over the real one would hand the allowance back. So
 *  for the same day (and the same month) the larger amount stays, a newer day or month wins as it is, every nonce is kept
 *  (the later `until` of each), and the line goes at the later of the two `until`s. A line no longer kept counts as none. */
export function mergeDeletedLines(was: DeletedLine | undefined | null, l: DeletedLine): DeletedLine {
  if (!was || !deletedLineLive(was, l.at)) return l;
  const pick = (a: string, au: number, b: string, bu: number): [string, number] => (a === b ? [a, Math.max(au, bu)] : a > b ? [a, au] : [b, bu]);
  const [day, dayUsd] = pick(was.day, was.dayUsd, l.day, l.dayUsd);
  const [month, monthUsd] = pick(was.month, was.monthUsd, l.month, l.monthUsd);
  const byId = new Map<string, number>();
  for (const [id, until] of [...(was.nonces ?? []), ...l.nonces]) byId.set(id, Math.max(until, byId.get(id) ?? until));
  const nonces = [...byId];
  const at = Math.max(was.at, l.at);
  const wasUntil = typeof was.until === "number" ? was.until : deletedUntil(was.at, was.nonces ?? []);
  return { at, day, dayUsd, month, monthUsd, nonces, until: Math.max(wasUntil, l.until, deletedUntil(at, nonces)) };
}
