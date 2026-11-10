// M79 (risky packages, T18): known serious problems in the packages a change added, looked up on OSV.dev. Only each
// package's ecosystem, name and version leave this Mac, never code and never a file's text. One POST to
// https://api.osv.dev/v1/querybatch (which answers with ids only), then GET https://api.osv.dev/v1/vulns/{id} for the
// record of each id it named, at most MAX_DETAILS a review. Checked against OSV's docs on 11 Nov 2026
// (https://google.github.io/osv.dev/post-v1-querybatch/, https://google.github.io/osv.dev/get-v1-vulns/).
// Answers are kept in a small file in Squibby's own data folder for a day, so the same package is not asked again.
// No answer, a timeout, or anything that is not OSV's JSON means "not checked", said as that, never "safe".
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { writeAtomic } from "../atomic.ts";
import { pkgKey, type Pkg } from "./packages.ts";

export const OSV_HOST = "https://api.osv.dev";
export const CACHE_MS = 24 * 3600_000;
/** The most vulnerability records one review reads. */
export const MAX_DETAILS = 20;
const TIMEOUT_MS = 8000;

export type Severity = "critical" | "high" | "other";
export type Problem = { pkg: Pkg; id: string; severity: Severity; fixed: string | null };
/** checked: the packages OSV answered for. notChecked: those it did not (no answer, a bad answer, too many records). */
export type Lookup = { problems: Problem[]; checked: number; notChecked: number };
export type PackageLookup = { check(pkgs: Pkg[], signal?: AbortSignal): Promise<Lookup> };

// ---------- what the review says ----------

/** One known serious problem as a review reason, in the fixed finding shape's words. Critical is Must fix
 *  (package_critical), high is Should fix (package_high). */
export function packageReason(p: Problem): { kind: "package_critical" | "package_high"; file: string; line?: number; say: string } {
  const fix = p.fixed ? `fixed in ${p.fixed}` : "with no fixed version listed yet";
  return { kind: p.severity === "critical" ? "package_critical" : "package_high", file: p.pkg.file, ...(p.pkg.line ? { line: p.pkg.line } : {}), say: `${p.pkg.name} ${p.pkg.version}: This package has a known serious problem: ${p.id}, ${fix}.` };
}
/** The reasons, critical first, one per package and problem, at most 10. */
export function packageReasons(l: Lookup): ReturnType<typeof packageReason>[] {
  const rank = (s: Severity) => (s === "critical" ? 0 : 1);
  return l.problems.slice().sort((a, b) => rank(a.severity) - rank(b.severity) || a.pkg.name.localeCompare(b.pkg.name) || a.id.localeCompare(b.id)).slice(0, 10).map(packageReason);
}
export const PACKAGE_NOTES = {
  offline: "The new packages could not be checked for known problems just now, because OSV.dev did not answer. They are not known to be safe.",
  some: (n: number) => `${n === 1 ? "1 new package" : `${n} new packages`} could not be checked for known problems just now. ${n === 1 ? "It is" : "They are"} not known to be safe.`,
  checksOnly: "The new packages were not checked for known problems, because What a review may send is set to Checks only.",
  unresolved: (n: number) => `${n === 1 ? "1 new package has" : `${n} new packages have`} no exact version yet (no lock file says one), so ${n === 1 ? "it was" : "they were"} not checked for known problems.`,
  more: (n: number) => `${n} more new packages were not checked for known problems: too many at once.`,
};

// ---------- severity ----------

const WORD: Record<string, Severity> = { CRITICAL: "critical", HIGH: "high" };
/** CVSS 3.0 and 3.1 base score from its vector (FIRST's specification, section 7). Null for anything else. */
export function cvss3Score(vector: string): number | null {
  const m = /^CVSS:3\.[01]\/(.+)$/.exec(vector.trim());
  if (!m) return null;
  const v: Record<string, string> = {};
  for (const part of m[1].split("/")) { const [k, x] = part.split(":"); if (k && x) v[k] = x; }
  const AV = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[v.AV], AC = { L: 0.77, H: 0.44 }[v.AC], UI = { N: 0.85, R: 0.62 }[v.UI];
  const S = v.S, cia = (x: string) => ({ H: 0.56, L: 0.22, N: 0 } as Record<string, number>)[x];
  const PR = S === "C" ? { N: 0.85, L: 0.68, H: 0.5 }[v.PR] : { N: 0.85, L: 0.62, H: 0.27 }[v.PR];
  const C = cia(v.C), I = cia(v.I), A = cia(v.A);
  if ([AV, AC, UI, PR, C, I, A].some((x) => x === undefined) || (S !== "U" && S !== "C")) return null;
  const iss = 1 - (1 - C!) * (1 - I!) * (1 - A!);
  const impact = S === "U" ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const expl = 8.22 * AV! * AC! * PR! * UI!;
  if (impact <= 0) return 0;
  const up = (x: number) => { const i = Math.round(x * 100000); return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10; };
  return up(Math.min(S === "U" ? impact + expl : 1.08 * (impact + expl), 10));
}
/** How serious a record says it is: its database's own word (GitHub's CRITICAL or HIGH), else its CVSS 3 base score
 *  (9 and up critical, 7 and up high). Anything else, unrated included, is "other" and is not raised. */
export function severityOf(rec: Record<string, any>): Severity {
  const word = (w: unknown): Severity | null => (typeof w === "string" ? WORD[w.toUpperCase()] ?? "other" : null);
  const db = word(rec?.database_specific?.severity);
  if (db) return db;
  for (const a of Array.isArray(rec?.affected) ? rec.affected : []) { const e = word(a?.ecosystem_specific?.severity); if (e) return e; }
  let best = -1;
  for (const s of Array.isArray(rec?.severity) ? rec.severity : []) if (typeof s?.score === "string" && /^CVSS_V3/.test(String(s?.type))) best = Math.max(best, cvss3Score(s.score) ?? -1);
  return best >= 9 ? "critical" : best >= 7 ? "high" : "other";
}

/** -1, 0 or 1. Numbers part by part, words after numbers. Good enough to pick the next fixed version. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/), pb = b.split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0", y = pb[i] ?? "0";
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { const d = Number(x) - Number(y); if (d) return Math.sign(d); }
    else if (nx !== ny) return nx ? 1 : -1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
/** The lowest version the record says fixes it above the one in use, for this package; null when it names none. */
export function fixedFor(rec: Record<string, any>, pkg: Pkg): string | null {
  const same = (n: unknown) => typeof n === "string" && (pkg.ecosystem === "PyPI" ? n.toLowerCase() === pkg.name.toLowerCase() : n === pkg.name);
  const fixed: string[] = [];
  for (const a of Array.isArray(rec?.affected) ? rec.affected : []) {
    if (a?.package?.ecosystem !== pkg.ecosystem || !same(a?.package?.name)) continue;
    for (const r of Array.isArray(a.ranges) ? a.ranges : []) for (const e of Array.isArray(r?.events) ? r.events : []) if (typeof e?.fixed === "string" && r?.type !== "GIT") fixed.push(e.fixed.replace(/^v/, ""));
  }
  const above = fixed.filter((f) => compareVersions(f, pkg.version) > 0).sort(compareVersions);
  return above[0] ?? null;
}

// ---------- the cache, in Squibby's own data folder ----------

type Cache = { v: 1; q: Record<string, { at: number; ids: string[] }>; r: Record<string, { at: number; rec: { severity: Severity; affected: unknown } }> };
const empty = (): Cache => ({ v: 1, q: {}, r: {} });

export class OsvClient implements PackageLookup {
  private fetch: typeof fetch;
  private now: () => number;
  constructor(private o: { cacheFile: string; fetch?: typeof fetch; now?: () => number; timeoutMs?: number; host?: string }) {
    this.fetch = o.fetch ?? fetch;
    this.now = o.now ?? Date.now;
  }
  private load(): Cache {
    try { const c = JSON.parse(readFileSync(this.o.cacheFile, "utf8")) as Cache; return c && c.v === 1 && c.q && c.r ? c : empty(); } catch { return empty(); }
  }
  private save(c: Cache) {
    const now = this.now();
    for (const [k, x] of Object.entries(c.q)) if (now - x.at > CACHE_MS) delete c.q[k];
    for (const [k, x] of Object.entries(c.r)) if (now - x.at > CACHE_MS) delete c.r[k];
    try { mkdirSync(dirname(this.o.cacheFile), { recursive: true, mode: 0o700 }); writeAtomic(this.o.cacheFile, JSON.stringify(c), 0o600); } catch { /* the cache is a nicety */ }
  }
  private async json(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown | null> {
    const t = AbortSignal.timeout(this.o.timeoutMs ?? TIMEOUT_MS);
    try {
      const r = await this.fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, t]) : t, redirect: "error" });
      if (!r.ok || !/json/i.test(r.headers.get("content-type") ?? "json")) return null;
      return await r.json();
    } catch { return null; }
  }

  async check(pkgs: Pkg[], signal?: AbortSignal): Promise<Lookup> {
    const host = this.o.host ?? OSV_HOST;
    const c = this.load(), now = this.now();
    const fresh = (at: number) => now - at <= CACHE_MS && at <= now + 60_000;
    const uniq = [...new Map(pkgs.map((p) => [pkgKey(p), p])).values()];
    const ask = uniq.filter((p) => !(c.q[pkgKey(p)] && fresh(c.q[pkgKey(p)].at)));
    const unknown = new Set<string>();
    let learned = false;
    if (ask.length) {
      // Only these three things per package. Nothing else is in the body.
      const body = JSON.stringify({ queries: ask.map((p) => ({ package: { name: p.name, ecosystem: p.ecosystem }, version: p.version })) });
      const a = await this.json(`${host}/v1/querybatch`, { method: "POST", headers: { "content-type": "application/json" }, body }, signal);
      const results = (a as { results?: unknown })?.results;
      if (!Array.isArray(results) || results.length !== ask.length) for (const p of ask) unknown.add(pkgKey(p));
      else ask.forEach((p, i) => {
        const vulns = (results[i] as { vulns?: unknown })?.vulns;
        if (vulns !== undefined && !Array.isArray(vulns)) { unknown.add(pkgKey(p)); return; }
        const ids = (vulns ?? []).map((x: any) => x?.id).filter((id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(id));
        c.q[pkgKey(p)] = { at: now, ids };
        learned = true;
      });
    }
    // The records of the ids named, at most MAX_DETAILS read from OSV in one review.
    let read = 0;
    const problems: Problem[] = [];
    for (const p of uniq) {
      const k = pkgKey(p);
      if (unknown.has(k)) continue;
      for (const id of c.q[k]?.ids ?? []) {
        let rec = c.r[id] && fresh(c.r[id].at) ? c.r[id].rec : null;
        if (!rec) {
          if (read >= MAX_DETAILS) { unknown.add(k); continue; }
          read++;
          const d = await this.json(`${host}/v1/vulns/${encodeURIComponent(id)}`, { method: "GET" }, signal);
          if (!d || typeof d !== "object" || (d as { id?: unknown }).id !== id) { unknown.add(k); continue; }
          rec = { severity: severityOf(d as Record<string, any>), affected: (d as Record<string, any>).affected ?? [] };
          c.r[id] = { at: now, rec };
          learned = true;
        }
        if (rec.severity === "other") continue;
        problems.push({ pkg: p, id, severity: rec.severity, fixed: fixedFor({ affected: rec.affected }, p) });
      }
    }
    if (learned) this.save(c);
    const notChecked = uniq.filter((p) => unknown.has(pkgKey(p))).length;
    // A problem found is said even when another record of the same package could not be read: that package also counts as
    // not fully checked.
    return { problems, checked: uniq.length - notChecked, notChecked };
  }
}
