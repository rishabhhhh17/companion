// What changed after an update: a short plain list per version, kept by hand in strings.ts (S.whatsNew), shown once on
// Home's Now tab after the version changes. A test fails when the app's version has no lines, so the list stays true when
// the version is bumped (docs/releasing.md). Which version was seen last is kept only on this Mac, in the page's storage.
import { S } from "./strings.ts";

export type Release = { version: string; lines: string[] };
export const SEEN_VERSION_KEY = "companion.seenVersion";
const MAX_SHOWN = 3;

const parts = (v: string): number[] | null => (/^\d+(\.\d+){0,3}$/.test(v) ? v.split(".").map(Number) : null);

/** Below zero when a is older than b, zero when the same, above zero when newer. NaN when either is not a version. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  if (!x || !y) return Number.NaN;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
}

/** Every version's lines, newest first. */
export function releases(): Release[] {
  return Object.entries(S.whatsNew as Record<string, readonly string[]>)
    .filter(([v]) => parts(v))
    .map(([version, lines]) => ({ version, lines: [...lines] }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** What to show for this version, given the version seen last (null on a first install or with no storage), and which
 *  version to remember once it has been shown. A first install, an older version or a damaged note shows nothing.
 *  usedBefore: the first run was finished before (no version kept, but not a first install): an update from a version
 *  that did not keep one yet, so this version's own lines show once. */
export function whatsNew(seen: string | null, current: string, list: Release[] = releases(), o: { usedBefore?: boolean } = {}): { show: Release[]; remember: string | null } {
  if (!parts(current)) return { show: [], remember: null };
  if (seen === current) return { show: [], remember: null };
  if (!seen && o.usedBefore) return { show: list.filter((r) => compareVersions(r.version, current) === 0).slice(0, 1), remember: current };
  if (!seen || !parts(seen) || compareVersions(seen, current) > 0) return { show: [], remember: current };
  const show = list.filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version)).slice(0, MAX_SHOWN);
  return { show, remember: current };
}
