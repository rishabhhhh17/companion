// The pages' side of the settings registry (protocol/settings.json, T16). Every window (Home, the character, the overlay)
// reads a setting through setting(key); Home also changes them, always through the shell (settings_set, settings_reset,
// settings_migrate), never by writing anything itself. What is in force comes from:
//  - the shell's snapshot, sent to every window as "settings-changed" and asked for once with settings_get;
//  - the engine's own events for the settings it keeps itself (spending.state, explain.state, memory.state, metrics.summary);
//  - until the one migration has run, the old page storage, read with exactly today's meaning, so no window ever shows a
//    choice the person did not make. Before any of these, the usual value. Nothing here ever throws.
import { useSyncExternalStore } from "react";
import { defOf, defaultOf, fromPageStorage, PAGE_STORAGE_MARK, REGISTRY, RUNNER_STORES, type Def } from "../../protocol/settings.ts";
import { invoke, listen } from "./tauri.ts";

export type Snapshot = { values: Record<string, unknown>; usual: Record<string, unknown>; project: string; migrated: string[]; problems: { key: string | null; code: string }[]; changed: string[] };
type Storage = { getItem(k: string): string | null } | null | undefined;

let snap: Snapshot | null = null;
const engine = new Map<string, unknown>();
const subs = new Set<() => void>();
let version = 0;
let readyResolve: (() => void) | null = null;
let ready = new Promise<void>((r) => { readyResolve = r; });
const notify = () => { version++; for (const f of subs) { try { f(); } catch { /* one reader never stops the others */ } } };

const pageStorage = (): Storage => { try { return globalThis.localStorage; } catch { return null; } };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The shell's answer, read carefully: anything that is not a snapshot is ignored. */
export function snapshotFrom(v: unknown): Snapshot | null {
  if (!isObj(v) || !isObj(v.values) || (v.migrated !== undefined && !Array.isArray(v.migrated))) return null;
  return {
    values: v.values, usual: isObj(v.usual) ? v.usual : {}, project: typeof v.project === "string" ? v.project : "",
    migrated: Array.isArray(v.migrated) ? v.migrated.filter((x): x is string => typeof x === "string") : [],
    problems: Array.isArray(v.problems) ? v.problems.filter(isObj).map((p) => ({ key: typeof p.key === "string" ? p.key : null, code: String(p.code ?? "") })) : [],
    changed: Array.isArray(v.changed) ? v.changed.filter((x): x is string => typeof x === "string") : [],
  };
}
export function takeSnapshot(v: unknown): void {
  const s = snapshotFrom(v);
  if (!s) return;
  snap = s;
  notify();
}
export const snapshotNow = (): Snapshot | null => snap;

/** The engine's own settings, from its events (they apply to every project, so any project's event says them). */
export function engineEvent(ev: unknown): boolean {
  if (!isObj(ev)) return false;
  const set = (k: string, v: unknown) => { if (!same(engine.get(k), v)) { engine.set(k, v); notify(); } return true; };
  switch (ev.type) {
    case "spending.state": return typeof ev.limitUsd === "number" ? set("spend.dailyLimit", ev.limitUsd) : false;
    case "explain.state": return typeof ev.enabled === "boolean" ? set("explain.on", ev.enabled) : false;
    case "memory.state": return typeof ev.paused === "boolean" ? set("memory.paused", ev.paused) : false;
    case "metrics.summary": return typeof ev.enabled === "boolean" ? set("numbers.on", ev.enabled) : false;
    default: return false;
  }
}

/** What an old page storage word meant, for a setting that came from there; undefined when nothing was stored. */
function oldValue(d: Def, st: Storage): unknown {
  const p = d.from?.pageStorage;
  if (!p || !st) return undefined;
  try { return fromPageStorage(p.map, st.getItem(p.name)); } catch { return undefined; }
}
const migrated = () => !!snap && snap.migrated.includes(PAGE_STORAGE_MARK);

/** The value in force for a setting (undefined for a name that does not exist). */
export function setting(key: string, st: Storage = pageStorage()): unknown {
  const d = defOf(key);
  if (!d) return undefined;
  if (RUNNER_STORES.includes(d.store)) return engine.has(key) ? engine.get(key) : d.default;
  if (!migrated()) { const old = oldValue(d, st); if (old !== undefined) return old; }
  if (snap && Object.hasOwn(snap.values, key)) return snap.values[key];
  return d.default;
}
/** The usual value: for keys and voice the shell says what theirs are; for every other setting, the registry's. */
export const usualOf = (key: string): unknown => (snap && Object.hasOwn(snap.usual, key) && defOf(key)?.kind === "custom" ? snap.usual[key] : defaultOf(key));

/** Re-renders when any setting changes, and gives the one asked for. */
export function useSetting(key: string): unknown {
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version, () => version);
  return setting(key);
}
export function subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }
/** Resolves once the shell has answered the first settings_get (or could not be asked). */
export const settingsReady = (): Promise<void> => ready;

/** Every setting away from its usual value now (in one section, or all), the engine's own included. */
export function changedNow(section?: string): string[] {
  return REGISTRY.settings.filter((d) => !d.protective && (!section || d.section === section)).filter((d) => {
    const v = d.kind === "custom" ? snap?.values[d.key] : setting(d.key);
    return v !== undefined && !same(v, usualOf(d.key));
  }).map((d) => d.key);
}
/** What Undo after Reset all puts back: every changed setting with the value it had. */
export const undoValues = (): [string, unknown][] => changedNow().map((k) => [k, defOf(k)!.kind === "custom" ? snap?.values[k] : setting(k)]);

// ---------- changing, always through the shell ----------

export type Done = { ok: true; notReset?: string[] } | { ok: false; code: string };
const asDone = (p: Promise<unknown>): Promise<Done> => p.then((v) => { takeSnapshot(v); const n = isObj(v) && Array.isArray(v.notReset) ? (v.notReset as string[]) : []; return { ok: true as const, ...(n.length ? { notReset: n } : {}) }; }, (e) => ({ ok: false as const, code: String(e) }));
export const changeSetting = (key: string, value: unknown): Promise<Done> => asDone(invoke("settings_set", { key, value }));
export const resetSetting = (key: string): Promise<Done> => asDone(invoke("settings_reset", { key }));
export const resetSection = (section: string): Promise<Done> => asDone(invoke("settings_reset", { section }));
export const resetAll = (): Promise<Done> => asDone(invoke("settings_reset", { all: true }));
/** Undo after Reset all: each value put back, one at a time, through settings_set. Says which could not be. */
export async function undoReset(back: [string, unknown][]): Promise<string[]> {
  const failed: string[] = [];
  for (const [k, v] of back) { const r = await changeSetting(k, v); if (!r.ok) failed.push(k); }
  return failed;
}

/** The values the old page storage held, with today's meaning; null when the storage cannot be read (nothing is
 *  migrated then, and the migration is tried again next time). */
export function migrationValues(st: Storage = pageStorage()): Record<string, unknown> | null {
  if (!st) return null;
  try { st.getItem("companion.reactions"); } catch { return null; }
  const values: Record<string, unknown> = {};
  for (const d of REGISTRY.settings) { const v = oldValue(d, st); if (v !== undefined) values[d.key] = v; }
  return values;
}
/** Home only, once the first snapshot shows it is still to do: the old choices go to the shell, which keeps only the
 *  ones not already set. The old page storage is left as it is for one version, so going back still works. */
export async function migrateFromPageStorage(): Promise<void> {
  await ready;
  if (!snap || migrated()) return;
  const values = migrationValues();
  if (values === null) return;
  await invoke("settings_migrate", { from: PAGE_STORAGE_MARK, values }).then(takeSnapshot, () => {});
}

/** Every window calls this once as it starts. The overlay may only listen (its capability), so it does not ask: it takes
 *  the snapshot the shell sends with each change and with the events that need one (`ask: false`). */
let started = false;
export function startSettings(o: { ask?: boolean } = {}): void {
  if (started) return;
  started = true;
  void listen("settings-changed", (e) => takeSnapshot(e.payload));
  void listen("runner-event", (e) => { engineEvent(e.payload); });
  if (o.ask === false) { readyResolve?.(); return; }
  void invoke("settings_get").then(takeSnapshot, () => {}).finally(() => readyResolve?.());
}

/** Tests only: forget everything read. */
export function _resetForTests(): void {
  snap = null; engine.clear(); version = 0; started = false;
  ready = new Promise<void>((r) => { readyResolve = r; });
}
