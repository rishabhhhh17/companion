// Search in Settings (the overhaul spec, 3.7): a small scorer written here, with no new dependency. It reads each setting's
// label, its description, its help and its plain synonyms (strings.ts `also`), and the words of the parts that are not
// settings (S.setFixed). Every word typed must match: an exact word first, then the start of a word, then, for words over
// four letters, a word one typo away (a letter missing, added, changed or two swapped). At most 30 results, grouped under
// their page's name. settingsSearch.test.ts runs it over every setting.
import { REGISTRY, type Def } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { fold, wordsOf } from "./settingsRows.ts";
import { PAGES, SIDEBAR, placeOf, ROW_OWNS, type Fixed, type PageId } from "./settingsPages.ts";

export const MAX_RESULTS = 30;
export type Hit = { key: string } | { fixed: Fixed };
export type Result = { hit: Hit; page: PageId; group: string; score: number; order: number };
export type ResultGroup = { page: PageId; group: string; hits: Hit[] };

const wordsIn = (s: string): string[] => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Letters apart, counting two swapped letters as one (optimal string alignment), stopping early past `most`. */
export function typos(a: string, b: string, most = 1): number {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    let row = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      row = Math.min(row, d[i][j]);
    }
    if (row > most) return most + 1;
  }
  return d[a.length][b.length];
}

/** How well one typed word matches a list of words: 3 exact, 2 the start of a word, 1 one typo away, 0 not at all. */
export function wordScore(q: string, words: readonly string[]): number {
  let best = 0;
  for (const w of words) {
    if (w === q) return 3;
    if (best < 2 && w.startsWith(q)) best = 2;
    else if (best < 1 && q.length > 4 && w.length > 4 && typos(q, w) <= 1) best = 1;
  }
  return best;
}

/** The words a setting is found by: its label counts twice (a match on the name comes first). */
function settingWords(key: string): { label: string[]; rest: string[] } {
  const w = wordsOf(key);
  const short = (S.short as Record<string, string>)[key] ?? "";
  return { label: wordsIn(w.label), rest: [w.help, short, ...(w.also ?? []), ...Object.values(w.options ?? {})].flatMap(wordsIn) };
}
function fixedWords(fx: Fixed): { label: string[]; rest: string[] } {
  const w = S.setFixed[fx];
  return { label: wordsIn(w.title), rest: [...w.also].flatMap(wordsIn) };
}

/** Score of a whole query against one thing's words: every typed word must match, or it is 0. */
export function scoreOf(query: string, words: { label: string[]; rest: string[] }): number {
  const q = wordsIn(query);
  if (!q.length) return 0;
  let total = 0;
  for (const word of q) {
    const l = wordScore(word, words.label), r = wordScore(word, words.rest);
    if (!l && !r) return 0;
    total += Math.max(l + 1, r);
  }
  return total;
}

/** Everything search can find, in page order: each visible setting (a row that owns two keys counts once) and each part
 *  that is not a setting. */
export function searchables(settings: readonly Def[] = REGISTRY.settings): { hit: Hit; order: number }[] {
  const visible = new Set(settings.filter((d) => !d.hidden).map((d) => d.key));
  const owned = new Set(Object.entries(ROW_OWNS).flatMap(([row, ks]) => ks.filter((k) => k !== row)));
  const out: { hit: Hit; order: number }[] = [];
  const seen = new Set<string>();
  const add = (i: string | { fixed: Fixed }) => {
    const id = typeof i === "string" ? i : `fixed:${i.fixed}`;
    if (seen.has(id)) return;
    if (typeof i === "string" && (!visible.has(i) || owned.has(i))) return;
    seen.add(id);
    out.push({ hit: typeof i === "string" ? { key: i } : { fixed: i.fixed }, order: out.length });
  };
  for (const p of SIDEBAR) { for (const g of PAGES[p].groups) g.items.forEach(add); }
  for (const p of SIDEBAR) { for (const t of PAGES[p].more) t.items.forEach(add); }
  // A setting no page names yet still shows up in search (and in More's last section, settingsPage.tsx).
  for (const d of settings) if (!d.hidden) add(d.key);
  // Danger zone, Replay and the others are searched like any row.
  for (const fx of Object.keys(S.setFixed) as Fixed[]) add({ fixed: fx });
  return out;
}

/** How a whole query matched one thing: only one typo away for some word ("typo"), or every word found as typed or as the
 *  start of a word ("exact"). */
function closeness(query: string, words: { label: string[]; rest: string[] }): "exact" | "typo" {
  return wordsIn(query).every((w) => Math.max(wordScore(w, words.label), wordScore(w, words.rest)) >= 2) ? "exact" : "typo";
}
/** With something found as typed, at most this many things that are only a typo away come after it (the audit, item 20:
 *  night and white each listed some twenty unrelated settings). */
export const MAX_TYPO_HITS = 3;

/** The results for what was typed: best first, at most 30, and nothing for an empty box. When nothing matches every word
 *  of a query of several words, each thing is scored by its best word instead, so "theme thingamajig" still finds Theme. */
export function searchSettingsFor(query: string, settings: readonly Def[] = REGISTRY.settings): Result[] {
  const q = wordsIn(query);
  if (!q.length) return [];
  const all = searchables(settings).map(({ hit, order }) => ({ hit, order, words: "key" in hit ? settingWords(hit.key) : fixedWords(hit.fixed) }));
  const scored = (score: (w: { label: string[]; rest: string[] }) => number, q2: string) => {
    const out: (Result & { close: "exact" | "typo" })[] = [];
    for (const { hit, order, words } of all) {
      const sc = score(words);
      if (!sc) continue;
      const place = placeOf("key" in hit ? hit.key : hit.fixed) ?? { page: "more" as PageId, group: "", more: true };
      out.push({ hit, page: place.page, group: place.group, score: sc, order, close: closeness(q2, words) });
    }
    return out;
  };
  let out = scored((w) => scoreOf(query, w), query);
  if (!out.length && q.length > 1) {
    const best = (w: { label: string[]; rest: string[] }) => Math.max(...q.map((x) => scoreOf(x, w)));
    out = scored(best, query).map((r) => ({ ...r, close: q.some((x) => closeness(x, all.find((a) => a.order === r.order)!.words) === "exact") ? "exact" : "typo" }));
  }
  if (out.some((r) => r.close === "exact")) {
    let typo = 0;
    out = out.sort((a, b) => b.score - a.score || a.order - b.order).filter((r) => r.close === "exact" || typo++ < MAX_TYPO_HITS);
  }
  return out.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, MAX_RESULTS).map(({ close: _c, ...r }) => r);
}

/** Results grouped under their page and group ("General, Notch and Home"), in the order the best of each came. */
export function groupResults(results: readonly Result[]): ResultGroup[] {
  const groups: ResultGroup[] = [];
  for (const r of results) {
    let g = groups.find((x) => x.page === r.page && x.group === r.group);
    if (!g) { g = { page: r.page, group: r.group, hits: [] }; groups.push(g); }
    g.hits.push(r.hit);
  }
  return groups;
}
