// The settings registry (T16): one list of every setting a person can change, in protocol/settings.json, read by the
// shell (app/src-tauri/src/settings.rs, through include_str!), the pages and the engine (both through this file). The
// list is data only: the words a person reads are in app/src/strings.ts (S.set and S.sections). The rules for what a value
// may be are written twice, here and in settings.rs, and both run every case in fixtures/settings-cases.jsonl, so they
// agree on each of them. Refusals are codes; the pages put them in words.
import registryJson from "./settings.json";

export type Kind = "switch" | "choice" | "number" | "text" | "list" | "custom";
export type Applies = "shell" | "runner" | "pages";
export type Store = "settings" | "dock" | "presentation" | "keys" | "voice" | "spending" | "memory" | "metrics" | "rules";
export type Unit = "dollars" | "seconds" | "minutes" | "percent" | "count" | "words";
export type MapName = "isOn" | "notOff" | "isOne" | "notZero" | "textSize";
export type Def = {
  key: string; section: string; kind: Kind; default: unknown;
  options?: string[]; optionsFrom?: "projectScripts"; min?: number; max?: number; step?: number; unit?: Unit; maxLength?: number;
  maxItems?: number; item?: { maxLength: number }; allowedItems?: string[];
  scope: "app" | "project"; applies: Applies[]; store: Store; live: boolean;
  protective?: boolean; floor?: string; renamedFrom?: string[];
  from?: { pageStorage?: { name: string; map: MapName } };
};
export type Registry = { version: number; sections: string[]; settings: Def[] };
export type Reason = "unknown" | "custom" | "notSwitch" | "notChoice" | "notNumber" | "tooLow" | "tooHigh" | "notText" | "notOneLine" | "tooLong" | "secret" | "notList" | "tooMany" | "duplicate" | "empty" | "notAllowed" | "notRule";
export type Checked = { ok: true; value: unknown } | { ok: false; reason: Reason };

export const REGISTRY: Registry = registryJson as unknown as Registry;
export const KINDS: readonly Kind[] = ["switch", "choice", "number", "text", "list", "custom"];
export const STORES: readonly Store[] = ["settings", "dock", "presentation", "keys", "voice", "spending", "memory", "metrics", "rules"];
export const UNITS: readonly Unit[] = ["dollars", "seconds", "minutes", "percent", "count", "words"];
/** The stores the engine keeps itself (spending.json, memory-settings.json, metrics.json), changed only by the shell. */
export const RUNNER_STORES: readonly Store[] = ["spending", "memory", "metrics"];
/** The one migration so far: the page storage choices from before the registry. */
export const PAGE_STORAGE_MARK = "pageStorage.v1";
/** A choice whose other options come from the project (check.start: the project's own scripts) takes a script's name, never a
 *  command: a letter or digit first, then letters, digits and : . _ -, up to 60 of them. The shell checks the same. */
export const SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,59}$/;
/** And only the name of a script that starts the project: dev, develop, start, serve or preview, alone or with more after a
 *  : . _ or - (dev:web, start.local). A build, a lint, the tests, an install step or a deploy can never be chosen, so a
 *  check never runs one as a way to start the project. The shell checks the same (settings.rs start_script); the engine
 *  checks again at use that the script is in package.json and does not sound like it deploys or deletes (detect.ts). */
export const START_WORDS: readonly string[] = ["dev", "develop", "start", "serve", "preview"];
export const isStartScript = (v: string): boolean => SCRIPT_NAME.test(v) && START_WORDS.some((w) => v === w || (v.length > w.length + 1 && v.startsWith(w) && ":._-".includes(v[w.length])));
const KEY = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)+$/;

const byKey = new Map(REGISTRY.settings.map((d) => [d.key, d]));
export const defOf = (key: string): Def | undefined => byKey.get(key);
export const defaultOf = (key: string): unknown => byKey.get(key)?.default;
export const settingsIn = (section: string, r: Registry = REGISTRY): Def[] => r.settings.filter((d) => d.section === section);

// ---------- what a value may be ----------

const isWhite = (c: string) => /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/.test(c);
const isControl = (cp: number) => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
const bytes = (s: string) => new TextEncoder().encode(s).length;
const asciiDigit = (c: string) => c >= "0" && c <= "9";
const asciiUpper = (c: string) => c >= "A" && c <= "Z";
const asciiLower = (c: string) => c >= "a" && c <= "z";
const asciiAlnum = (c: string) => asciiDigit(c) || asciiUpper(c) || asciiLower(c);
const hex = (c: string) => asciiDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");

function luhn(d: number[]): boolean {
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) { let v = d[i]; if (alt) { v *= 2; if (v > 9) v -= 9; } sum += v; alt = !alt; }
  return sum % 10 === 0;
}
function cardNumber(text: string): boolean {
  const chars = Array.from(text);
  let run: number[] = [];
  const flush = () => { const ok = run.length >= 13 && run.length <= 19 && luhn(run); run = []; return ok; };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (asciiDigit(c)) run.push(Number(c));
    else if ((c === " " || c === "-") && run.length > 0 && chars[i + 1] !== undefined && asciiDigit(chars[i + 1])) { /* inside a number */ }
    else if (flush()) return true;
  }
  return flush();
}
function iban(text: string): boolean {
  const c = Array.from(text).filter(asciiAlnum).map((x) => x.toUpperCase());
  for (let i = 0; i < Math.max(0, c.length - 14); i++) {
    if (!(asciiUpper(c[i]) && asciiUpper(c[i + 1]) && asciiDigit(c[i + 2]) && asciiDigit(c[i + 3]))) continue;
    for (let len = 15; len <= 34; len++) {
      if (i + len > c.length) break;
      const w = c.slice(i, i + len);
      let rem = 0;
      for (const ch of [...w.slice(4), ...w.slice(0, 4)]) {
        const v = asciiDigit(ch) ? Number(ch) : ch.charCodeAt(0) - 65 + 10;
        rem = v >= 10 ? (rem * 100 + v) % 97 : (rem * 10 + v) % 97;
      }
      if (rem === 1) return true;
    }
  }
  return false;
}
const PREFIXES = ["sk-", "sk_live_", "sk_test_", "rk_live_", "ghp_", "gho_", "ghu_", "ghs_", "github_pat_", "AKIA", "xoxb-", "xoxp-", "xoxa-", "AIza", "npm_", "whsec_", "SG."];
const GLUED = ["sk-ant-", "ghp_", "gho_", "ghu_", "ghs_", "github_pat_", "xoxb-", "xoxp-", "xoxa-", "whsec_", "sk_live_", "sk_test_", "rk_live_"];
function token(text: string): boolean {
  const words: string[] = [];
  let cur = "";
  for (const c of Array.from(text)) { if (isWhite(c) || "\"'`=:,;()[]{}<>".includes(c)) { words.push(cur); cur = ""; } else cur += c; }
  words.push(cur);
  for (const raw of words) {
    const w = raw.replace(/^[.,]+|[.,]+$/g, "");
    if (bytes(w) < 10) continue;
    if (PREFIXES.some((p) => w.startsWith(p)) && bytes(w) >= 16) return true;
    if (GLUED.some((p) => { const i = w.indexOf(p); return i >= 0 && bytes(w.slice(i)) >= 20; })) return true;
    if (w.startsWith("eyJ") && w.split(".").length - 1 === 2 && bytes(w) >= 30) return true;
    const cs = Array.from(w);
    if (bytes(w) >= 32 && cs.every(hex)) return true;
    if (bytes(w) >= 40 && cs.every((c) => asciiAlnum(c) || "+/_-=".includes(c)) && cs.some(asciiDigit) && cs.some(asciiUpper) && cs.some(asciiLower)) return true;
  }
  return false;
}
const LABELS = ["password", "passwd", "secret", "api key", "api_key", "apikey", "private key", "token", "recovery code", "security code", "cvv", "cvc", "pin:", "ssn"];
function labelledSecret(text: string): boolean {
  const t = text.toLowerCase();
  return LABELS.some((k) => t.includes(k)) && (t.includes(":") || t.includes("=") || Array.from(t).some(asciiDigit)) && Array.from(t).filter((c) => /[\p{Alphabetic}\p{N}]/u.test(c)).length > 12;
}
/** Whether text looks like a key, a password, a card or a bank number: the shell's own check (redact.rs is_sensitive),
 *  written again here, so a value one side refuses the other refuses too. Strict: a harmless value refused costs little. */
export const looksSecret = (text: string): boolean => cardNumber(text) || iban(text) || token(text) || labelledSecret(text);

/** One line of text: no control characters and no line or paragraph breaks anywhere, then spaces off both ends. */
function oneLine(v: unknown, maxLength: number): Checked {
  if (typeof v !== "string") return { ok: false, reason: "notText" };
  for (const c of Array.from(v)) { const cp = c.codePointAt(0)!; if (isControl(cp) || cp === 0x2028 || cp === 0x2029) return { ok: false, reason: "notOneLine" }; }
  const t = v.replace(/^ +| +$/g, "");
  if (Array.from(t).length > maxLength) return { ok: false, reason: "tooLong" };
  if (t && looksSecret(t)) return { ok: false, reason: "secret" };
  return { ok: true, value: t };
}
/** Round half up, the same way in Rust: floor(x + 0.5). */
const half = (x: number) => Math.floor(x + 0.5);
/** A number on its nearest step from min, tidied to ten places so steps like 0.01 do not leave long tails. */
export function snap(v: number, min: number, step: number, max: number): number {
  const n = half((min + half((v - min) / step) * step) * 1e10) / 1e10;
  return Math.min(n, max);
}

/** Checks one value against its definition, and gives it back tidied (trimmed, on its step). Never throws. */
export function validate(d: Def, v: unknown): Checked {
  switch (d.kind) {
    case "switch": return typeof v === "boolean" ? { ok: true, value: v } : { ok: false, reason: "notSwitch" };
    case "choice": return typeof v === "string" && ((d.options ?? []).includes(v) || (d.optionsFrom === "projectScripts" && isStartScript(v))) ? { ok: true, value: v } : { ok: false, reason: "notChoice" };
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, reason: "notNumber" };
      const min = d.min ?? 0, max = d.max ?? 0, step = d.step ?? 1;
      if (v < min) return { ok: false, reason: "tooLow" };
      if (v > max) return { ok: false, reason: "tooHigh" };
      return { ok: true, value: snap(v, min, step, max) };
    }
    case "text": return oneLine(v, d.maxLength ?? 0);
    case "list": {
      if (!Array.isArray(v)) return { ok: false, reason: "notList" };
      if (v.length > (d.maxItems ?? 0)) return { ok: false, reason: "tooMany" };
      const out: string[] = [];
      for (const item of v) {
        let one: string;
        if (d.allowedItems) {
          if (typeof item !== "string") return { ok: false, reason: "notText" };
          if (!d.allowedItems.includes(item)) return { ok: false, reason: "notAllowed" };
          one = item;
        } else {
          const c = oneLine(item, d.item?.maxLength ?? 0);
          if (!c.ok) return c;
          one = c.value as string;
          if (!one) return { ok: false, reason: "empty" };
        }
        if (out.includes(one)) return { ok: false, reason: "duplicate" };
        out.push(one);
      }
      return { ok: true, value: out };
    }
    default: return { ok: false, reason: "custom" };
  }
}
export function validateKey(key: string, v: unknown): Checked {
  const d = defOf(key);
  return d ? validate(d, v) : { ok: false, reason: "unknown" };
}

// ---------- house rules (rules.house, the project's own .companion/rules.txt) ----------

/** The five kinds of house rule. A rule can only make things stricter (runner/src/rules.ts enforces them). */
export const RULE_KINDS = ["never_edit", "never_run", "ask_edit", "ask_run", "ask_install"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
const RULE_LINES: [RegExp, RuleKind][] = [
  [/^never\s+edit\s+(.+)$/i, "never_edit"],
  [/^never\s+run\s+(.+)$/i, "never_run"],
  [/^ask\s+before\s+editing\s+(.+)$/i, "ask_edit"],
  [/^ask\s+before\s+running\s+(.+)$/i, "ask_run"],
  [/^ask\s+before\s+installing\s+packages$/i, "ask_install"],
];
/** One line of a rules file read as a rule (spaces tidied), or null for a note, an empty line or a line not understood.
 *  The shell reads lines the same way (houserules.rs); both run fixtures/rules-cases.jsonl. */
export function ruleOf(raw: string): { kind: RuleKind; pattern: string; text: string } | null {
  const line = raw.replace(/\s+/g, " ").trim();
  if (!line || line.startsWith("#")) return null;
  for (const [re, kind] of RULE_LINES) { const m = re.exec(line); if (m) return { kind, pattern: (m[1] ?? "").trim(), text: line }; }
  return null;
}
const RULE_START: Record<RuleKind, string> = { never_edit: "never edit", never_run: "never run", ask_edit: "ask before editing", ask_run: "ask before running", ask_install: "ask before installing packages" };
/** The line for a rule built from one of the five kinds and what it is about; null when that does not make a rule. */
export function ruleText(kind: RuleKind, pattern: string): string | null {
  const r = ruleOf(kind === "ask_install" ? RULE_START[kind] : `${RULE_START[kind]} ${pattern}`);
  return r && r.kind === kind ? r.text : null;
}

// ---------- the old page storage, read with exactly today's meaning ----------

const TEXT_SIZES = ["standard", "large", "larger", "largest"];
/** Each map takes the stored word (null when nothing is stored) and gives the value it meant. */
export const MIGRATION_MAPS: Record<MapName, (raw: string) => unknown> = {
  isOn: (raw) => raw === "on",
  notOff: (raw) => raw !== "off",
  isOne: (raw) => raw === "1",
  notZero: (raw) => raw !== "0",
  textSize: (raw) => (TEXT_SIZES.includes(raw) ? raw : "standard"),
};
/** What a stored word meant; undefined when nothing was stored (then the usual value applies, as it did). */
export function fromPageStorage(map: string, raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) return undefined;
  const f = (MIGRATION_MAPS as Record<string, (r: string) => unknown>)[map];
  return f ? f(raw) : undefined;
}

// ---------- the list itself ----------

/** Everything wrong with a list of settings, in developer words (empty when it is fine). The shell checks the same. */
export function checkRegistry(r: Registry): string[] {
  const out: string[] = [];
  if (r.version !== 1) out.push("version must be 1");
  if (!Array.isArray(r.sections) || r.sections.length === 0 || new Set(r.sections).size !== r.sections.length || r.sections.some((s) => !/^[a-z][a-zA-Z]*$/.test(s))) out.push("sections must be unique lowerCamel names");
  const keys = new Set<string>();
  for (const d of r.settings ?? []) {
    const bad = (m: string) => out.push(`${d.key}: ${m}`);
    if (typeof d.key !== "string" || !KEY.test(d.key)) bad("the name must be dotted lowerCamel");
    if (keys.has(d.key)) bad("the name is used twice");
    keys.add(d.key);
    for (const old of d.renamedFrom ?? []) if (!KEY.test(old) || r.settings.some((x) => x.key === old)) bad(`the old name ${old} is not usable`);
    if (!r.sections.includes(d.section)) bad("its section does not exist");
    if (!KINDS.includes(d.kind)) { bad("its kind does not exist"); continue; }
    if (d.scope !== "app" && d.scope !== "project") bad("scope must be app or project");
    if (!Array.isArray(d.applies) || d.applies.length === 0 || d.applies.some((a) => !["shell", "runner", "pages"].includes(a)) || new Set(d.applies).size !== d.applies.length) bad("applies must name shell, runner or pages");
    if (!STORES.includes(d.store)) bad("its store does not exist");
    if (typeof d.live !== "boolean") bad("live must be true or false");
    if (d.protective !== undefined && (typeof d.protective !== "boolean" || (d.protective && d.kind !== "list"))) bad("only a list can be protective");
    if (d.floor !== undefined && (typeof d.floor !== "string" || !d.floor)) bad("floor must name its words");
    if (d.kind === "custom") {
      if (d.store !== "keys" && d.store !== "voice") bad("custom is only for the editors that already exist");
      if (d.default !== null) bad("a custom setting's usual value lives in its own store");
      continue;
    }
    if (d.store === "keys" || d.store === "voice") bad("that store has its own editor");
    if (d.store === "rules" && !(d.kind === "list" && d.protective === true && d.scope === "project")) bad("the house rules file holds only a protective list for a project");
    if (RUNNER_STORES.includes(d.store) && (d.applies.join() !== "runner" || d.scope !== "app")) bad("the engine's own stores are applied by the engine, for every project");
    if (d.optionsFrom !== undefined && (d.optionsFrom !== "projectScripts" || d.kind !== "choice")) bad("only a choice can take its other options from the project's scripts");
    if (d.kind === "choice" && (!Array.isArray(d.options) || d.options.length < (d.optionsFrom ? 1 : 2) || new Set(d.options).size !== d.options.length || d.options.some((o) => typeof o !== "string" || !o))) bad("a choice needs two or more different options");
    if (d.kind === "number") {
      const { min, max, step } = d;
      if (typeof min !== "number" || typeof max !== "number" || typeof step !== "number" || !(min < max) || !(step > 0)) bad("a number needs min below max and a step above 0");
      else { const n = (max - min) / step; if (Math.abs(n - Math.round(n)) > 1e-9) bad("the step must fit from min to max"); }
      if (!UNITS.includes(d.unit as Unit)) bad("a number needs a unit");
    }
    if (d.kind === "text" && !(Number.isInteger(d.maxLength) && (d.maxLength as number) > 0)) bad("text needs a maxLength");
    if (d.kind === "list") {
      if (!(Number.isInteger(d.maxItems) && (d.maxItems as number) > 0)) bad("a list needs maxItems");
      const allowed = d.allowedItems;
      if (allowed !== undefined && (!Array.isArray(allowed) || allowed.length === 0 || new Set(allowed).size !== allowed.length)) bad("allowedItems must be different words");
      if (allowed === undefined && !(d.item && Number.isInteger(d.item.maxLength) && d.item.maxLength > 0)) bad("a list needs item.maxLength or allowedItems");
    }
    const p = d.from?.pageStorage;
    if (d.from !== undefined && (!p || typeof p.name !== "string" || !p.name || !(p.map in MIGRATION_MAPS))) bad("its migration names a map that does not exist");
    if (p && d.store !== "settings") bad("only settings kept in settings.json migrate from page storage");
    const c = validate(d, d.default);
    if (!c.ok || JSON.stringify(c.value) !== JSON.stringify(d.default)) bad("its usual value does not pass its own rules");
  }
  return out;
}
