// M73 (fluid, item 8): the ask box behaves like a command palette, inside today's box and with no new key. As the person
// types, a short list under it: first the ask itself with their own words (what Return always did, so nothing changes
// unless they move), then the actions whose words start with what they typed, then their own past asks that hold the words.
// Pure: card.tsx draws it and runs a row by the same arrival the notch's panel uses, so every rule (asks first, the safety
// copy) is unchanged. Nothing typed here leaves the page.

/** An action the list can offer: its words as shown, and other words people use for it ("ship", "publish"). */
export type PaletteAction = { id: string; label: string; words?: readonly string[] };
export type PaletteRow = { kind: "ask"; text: string } | { kind: "action"; id: string; label: string } | { kind: "past"; text: string };

/** At most this many rows, the ask included. */
export const PALETTE_MAX = 6;
/** At most this many past asks. */
const PAST_MAX = 2;

const wordsOf = (t: string): string[] => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** How well `query` fits an action: 2 when its label starts with it, 1 when every typed word starts one of its words, 0 not. */
function fit(query: string[], a: PaletteAction): number {
  const label = wordsOf(a.label), all = [...label, ...(a.words ?? []).flatMap(wordsOf)];
  if (!query.every((q) => all.some((w) => w.startsWith(q)))) return 0;
  return label.join(" ").startsWith(query.join(" ")) ? 2 : 1;
}

/** The rows for the words in the box. Nothing while it is empty. */
export function paletteRows(text: string, actions: readonly PaletteAction[], past: readonly string[], max = PALETTE_MAX): PaletteRow[] {
  const said = text.trim().replace(/\s+/g, " ");
  if (!said) return [];
  const q = wordsOf(said);
  const out: PaletteRow[] = [{ kind: "ask", text: said }];
  const acts = actions.map((a, i) => ({ a, i, f: q.length ? fit(q, a) : 0 })).filter((x) => x.f > 0).sort((x, y) => y.f - x.f || x.i - y.i);
  for (const { a } of acts) out.push({ kind: "action", id: a.id, label: a.label });
  const seen = new Set([said.toLowerCase()]);
  let n = 0;
  for (const p of past) {
    const t = p.trim(), key = t.toLowerCase();
    if (!t || seen.has(key) || n >= PAST_MAX) continue;
    const w = wordsOf(t);
    if (!q.every((x) => w.some((y) => y.startsWith(x)))) continue;
    seen.add(key); n++;
    out.push({ kind: "past", text: t });
  }
  return out.slice(0, max);
}

/** Whether the list shows: only when it offers more than the ask itself. */
export const paletteShown = (rows: readonly PaletteRow[]): boolean => rows.length > 1;

/** The highlight after an arrow: it loops at both ends. */
export function paletteMove(at: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return 0;
  return (at + dir + count) % count;
}
