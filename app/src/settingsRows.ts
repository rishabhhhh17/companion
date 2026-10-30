// Settings rows and search, as plain code (tested in settingsRows.test.ts): what each row shows, its usual value, whether
// Reset is offered, and which settings a search finds. The page (settingsPage.tsx) only draws what these say. Every word
// comes from strings.ts (S.set, S.sections, S.on and S.off).
import { REGISTRY, type Def, type Unit } from "../../protocol/settings.ts";
import { S } from "./strings.ts";

type Words = { label: string; help: string; also?: readonly string[]; options?: Record<string, string>; usual?: string };
export const wordsOf = (key: string): Words => ((S.set as Record<string, Words>)[key] ?? { label: key, help: "" });
const sectionTitle = (id: string): string => (S.sections as Record<string, string>)[id] ?? id;

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
/** A number in its unit's words: "$25", "$12.50", "120", "30 seconds". */
export function numberWords(n: number, unit: Unit | undefined): string {
  const f = (S.units as Record<string, (x: string) => string>)[unit ?? "count"] ?? ((x: string) => x);
  return f(unit === "dollars" ? money(n) : String(n));
}
/** A value in the words the row shows. */
export function valueWords(d: Def, v: unknown): string {
  const w = wordsOf(d.key);
  switch (d.kind) {
    case "switch": return v === true ? S.on : S.off;
    case "choice": return w.options?.[String(v)] ?? String(v ?? "");
    case "number": return typeof v === "number" ? numberWords(v, d.unit) : "";
    case "text": return typeof v === "string" && v ? v : S.setNone;
    // A list with its own words for its usual value (the call apps) says them; one from a fixed set says each item's words.
    case "list": return w.usual && JSON.stringify(v) === JSON.stringify(d.default) ? w.usual : Array.isArray(v) && v.length ? v.map((x) => w.options?.[String(x)] ?? String(x)).join(", ") : S.setNone;
    default: return w.usual ?? "";
  }
}

export type RowModel = {
  key: string; kind: Def["kind"]; label: string; help: string; shown: string; usualLine: string; resetLabel: string;
  changed: boolean; canReset: boolean; later: boolean; floor?: string; disabled: boolean; projectLine?: string;
  options?: { id: string; label: string }[]; number?: { min: number; max: number; step: number; unit: Unit | undefined }; maxLength?: number; maxItems?: number;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The last part of a folder's path, for "This project: shop". */
export const folderName = (p: string): string => p.replace(/\/+$/, "").split("/").pop() ?? p;

/** Everything one row shows. Reset is offered only when the value differs from usual, never for a protective list (only
 *  its own Remove takes an item off). A project setting with no folder chosen is shown, disabled, with why. */
export function rowModel(d: Def, value: unknown, usual: unknown, project: string): RowModel {
  const w = wordsOf(d.key);
  const usualWords = valueWords(d, usual);
  const changed = value !== undefined && !same(value, usual);
  const needsFolder = d.scope === "project" && !project;
  return {
    key: d.key, kind: d.kind, label: w.label, help: w.help, shown: valueWords(d, value), usualLine: S.setUsual(usualWords),
    resetLabel: S.setResetLabel(w.label, usualWords), changed, canReset: changed && !d.protective && !needsFolder, later: !d.live,
    ...(d.floor ? { floor: d.floor } : {}), disabled: needsFolder,
    ...(d.scope === "project" ? { projectLine: needsFolder ? S.setNeedsProject : S.setThisProject(folderName(project)) } : {}),
    ...(d.kind === "choice" ? { options: (d.options ?? []).map((id) => ({ id, label: w.options?.[id] ?? id })) } : {}),
    ...(d.kind === "number" ? { number: { min: d.min ?? 0, max: d.max ?? 0, step: d.step ?? 1, unit: d.unit } } : {}),
    ...(d.kind === "text" ? { maxLength: d.maxLength } : {}),
    ...(d.kind === "list" ? { maxItems: d.maxItems } : {}),
  };
}

/** A number as a person types it: digits with at most one point, a "$" in front is fine. Anything else is not a number. */
export function numberFrom(text: string): number | null {
  const t = text.trim().replace(/^\$\s*/, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------- search ----------

/** Lower case, without accents, so "Cafe" finds "Café". */
export const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const wordsIn = (s: string): string[] => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** Every word typed must be the start of some word in what is searched. */
function matches(query: string[], haystack: string[]): boolean {
  const words = haystack.flatMap(wordsIn);
  return query.every((q) => words.some((w) => w.startsWith(q)));
}
export type FixedGroup = keyof typeof S.fixedGroups;
export const FIXED_GROUPS = Object.keys(S.fixedGroups) as FixedGroup[];

/** What a search finds: settings grouped under their section titles (in page order), and the parts of Settings that are not
 *  settings. A section whose title matches shows all its settings. Nothing typed: everything. */
export function searchSettings(query: string, settings: readonly Def[] = REGISTRY.settings): { all: boolean; sections: { id: string; title: string; keys: string[] }[]; fixed: FixedGroup[]; count: number } {
  const q = wordsIn(query);
  const all = q.length === 0;
  const sections: { id: string; title: string; keys: string[] }[] = [];
  for (const id of REGISTRY.sections) {
    const title = sectionTitle(id);
    const inIt = settings.filter((d) => d.section === id && !d.hidden);
    if (!inIt.length) continue;
    const whole = all || matches(q, [title]);
    const keys = inIt.filter((d) => {
      if (whole) return true;
      const w = wordsOf(d.key);
      return matches(q, [title, w.label, w.help, ...(w.also ?? []), ...Object.values(w.options ?? {})]);
    }).map((d) => d.key);
    if (keys.length) sections.push({ id, title, keys });
  }
  const fixed = FIXED_GROUPS.filter((g) => all || matches(q, [S.fixedGroups[g].title, ...S.fixedGroups[g].also]));
  return { all, sections, fixed, count: sections.reduce((n, s) => n + s.keys.length, 0) + fixed.length };
}

/** Rows that only mean something with another setting's value, shown only then: how long before the island moves to
 *  another display is only for Follow me (island.display). Every other row always shows. */
const ONLY_WITH: Record<string, [string, unknown]> = { "island.followDelay": ["island.display", "follow"] };
export function shownNow(key: string, valueOf: (key: string) => unknown): boolean {
  const w = ONLY_WITH[key];
  return !w || valueOf(w[0]) === w[1];
}

/** The character's place, put back together by Reset the character's place (Settings, Home and the character). */
export const PLACE_KEYS = ["character.edge", "character.position", "character.sameEverywhere"] as const;

/** Under Home size: Large may suit text larger than usual (display.textSize larger or largest), while Home is standard. */
export function homeSizeHint(textSize: unknown, homeSize: unknown): string | null {
  return (textSize === "larger" || textSize === "largest" || textSize === "huge") && homeSize === "standard" ? S.setHomeLarger : null;
}

/** The words for a setting's fixed part (its floor), from strings.ts. */
export const floorWords = (id: string): string => (S.floors as Record<string, string>)[id] ?? "";

/** The words for a refusal code from the shell or the shared rules. */
export function problemWords(code: string, d?: Def): string {
  const p = S.setProblem as Record<string, unknown>;
  const lim = (n: number | undefined) => numberWords(n ?? 0, d?.unit);
  switch (code) {
    case "tooLow": return S.setProblem.tooLow(lim(d?.min));
    case "tooHigh": return S.setProblem.tooHigh(lim(d?.max));
    case "tooLong": return S.setProblem.tooLong(d?.maxLength ?? d?.item?.maxLength ?? 0);
    case "tooMany": return S.setProblem.tooMany(d?.maxItems ?? 0);
    default: return typeof p[code] === "string" ? (p[code] as string) : S.setProblem.other;
  }
}
