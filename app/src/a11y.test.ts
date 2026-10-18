// Accessibility as part of done (AGENTS.md, the bar 13; M11 wave 4 item 3): a name VoiceOver can read on every control,
// what Home says out loud and how, the keyboard inside Home, and colours and sizes that stay readable. The pages need a
// real Mac to run, so they are read here as text, through Bun's own TSX transpiler (no new dependency).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { BACK_MS, EMPTY_LINE, backStill, confirmKey, focusLost, focusSpot, liveLine, newsOf, stepTo } from "./a11y.ts";
import { initial, reduce, type Model } from "./model.ts";
import { shouldTakeFocus } from "./cardlogic.ts";
import { S } from "./strings.ts";
import { TEXT_SIZES } from "./textsize.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const PAGES = readdirSync(new URL("./", import.meta.url).pathname).filter((f) => f.endsWith(".tsx")).sort();

// ---------- a small reader for the pages' elements ----------
// Bun turns each element into a call, jsxDEV_x("button", { className: "btn", "aria-label": S.x, children: S.allow }, ...),
// and the words between tags into ordinary JavaScript strings, so a short scanner can walk the calls and their props.

type El = { tag: string; intrinsic: boolean; props: Map<string, string>; spread: boolean; start: number; end: number; kids: [number, number] | null; parent: El | null };

/** i is at an opening bracket, a quote or a backtick: the index just past where it ends. */
function skip(s: string, i: number): number {
  const c = s[i];
  if (c === '"' || c === "'") { for (let j = i + 1; j < s.length; j++) { if (s[j] === "\\") { j++; continue; } if (s[j] === c) return j + 1; } return s.length; }
  if (c === "`") {
    for (let j = i + 1; j < s.length; j++) { if (s[j] === "\\") { j++; continue; } if (s[j] === "`") return j + 1; if (s[j] === "$" && s[j + 1] === "{") j = skip(s, j + 1) - 1; }
    return s.length;
  }
  const close = c === "(" ? ")" : c === "[" ? "]" : "}";
  for (let j = i + 1; j < s.length; j++) {
    const d = s[j];
    if (d === close) return j + 1;
    if ("([{\"'`".includes(d)) { j = skip(s, j) - 1; continue; }
    if (d === "/" && s[j + 1] === "/") { const n = s.indexOf("\n", j); if (n < 0) return s.length; j = n; continue; }
    if (d === "/" && s[j + 1] === "*") { j = s.indexOf("*/", j) + 1; continue; }
    if (d === "/" && /[(,=:[!&|?{};>]\s*$/.test(s.slice(Math.max(0, j - 8), j))) {
      // A regular expression: its quotes and brackets are not code.
      let k = j + 1, cls = false;
      for (; k < s.length; k++) { const e = s[k]; if (e === "\\") { k++; continue; } if (e === "[") cls = true; else if (e === "]") cls = false; else if ((e === "/" && !cls) || e === "\n") break; }
      j = k;
    }
  }
  return s.length;
}

/** Where s splits at the top level (outside brackets and strings) on any of the separators. */
function splitTop(s: string, seps: string[]): string[] {
  const out: string[] = []; let from = 0;
  for (let j = 0; j < s.length; j++) {
    if ("([{\"'`".includes(s[j])) { j = skip(s, j) - 1; continue; }
    const sep = seps.find((x) => s.startsWith(x, j));
    if (sep) { out.push(s.slice(from, j)); j += sep.length - 1; from = j + 1; }
  }
  out.push(s.slice(from));
  return out;
}

/** A top level `?` of a ternary (not `?.` or `??`), and its `:`. */
function ternary(s: string): [number, number] | null {
  let q = -1, depth = 0;
  for (let j = 0; j < s.length; j++) {
    if ("([{\"'`".includes(s[j])) { j = skip(s, j) - 1; continue; }
    if (s[j] === "?") {
      if (s[j + 1] === "?" || s[j - 1] === "?" || (s[j + 1] === "." && !/\d/.test(s[j + 2] ?? ""))) continue;
      if (q < 0) q = j; else depth++;
    } else if (s[j] === ":" && q >= 0) { if (depth === 0) return [q, j]; depth--; }
  }
  return null;
}

function parseCall(s: string, at: number): El {
  const open = s.indexOf("(", at), end = skip(s, open);
  let i = open + 1;
  while (/\s/.test(s[i])) i++;
  let tag: string, intrinsic: boolean;
  if (s[i] === '"') { const e = skip(s, i); tag = s.slice(i + 1, e - 1); intrinsic = true; i = e; }
  else { tag = /^[\w$.]+/.exec(s.slice(i))![0]; intrinsic = false; i += tag.length; }
  while (/[\s,]/.test(s[i])) i++;
  const props = new Map<string, string>();
  let spread = false, kids: [number, number] | null = null;
  if (s[i] === "{") {
    const close = skip(s, i) - 1;
    let from = i + 1;
    const segment = (a: number, b: number) => {
      const raw = s.slice(a, b), lead = raw.length - raw.trimStart().length, t = raw.trim();
      if (!t) return;
      if (t.startsWith("...")) { spread = true; return; }
      const k = /^("(?:[^"\\]|\\.)*"|[\w$]+)\s*/.exec(t);
      if (!k) return;
      const key = k[1].startsWith('"') ? k[1].slice(1, -1) : k[1];
      const rest = t.slice(k[0].length);
      if (!rest.startsWith(":")) { props.set(key, key); return; }
      const vs = a + lead + k[0].length + 1, ve = a + lead + t.length;
      props.set(key, s.slice(vs, ve).trim());
      if (key === "children") kids = [vs, ve];
    };
    for (let j = i + 1; j < close; j++) {
      if ("([{\"'`".includes(s[j])) { j = skip(s, j) - 1; continue; }
      if (s[j] === ",") { segment(from, j); from = j + 1; }
    }
    segment(from, close);
  }
  return { tag, intrinsic, props, spread, start: at, end, kids, parent: null };
}

/** Every element of a page, each knowing the element it sits in. */
function elements(src: string): { js: string; els: El[] } {
  const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(src);
  const els = [...js.matchAll(/\bjsx\w*\(/g)].map((m) => parseCall(js, m.index!));
  for (const e of els) {
    let best: El | null = null;
    for (const p of els) if (p !== e && p.kids && p.kids[0] <= e.start && e.end <= p.kids[1] && (!best || p.kids[1] - p.kids[0] < best.kids![1] - best.kids![0])) best = p;
    e.parent = best;
  }
  return { js, els };
}

/** The body of a named function in a page's source (types taken out first, so braces in them do not count), its spaces
 *  and line breaks made single spaces. */
function body(src: string, name: string): string {
  const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(src);
  const at = js.search(new RegExp(`function ${name}\\(`));
  if (at < 0) throw new Error(`no function ${name}`);
  const params = js.indexOf("(", at), open = js.indexOf("{", skip(js, params));
  return js.slice(open, skip(js, open)).replace(/\s+/g, " ");
}

const lit = (v?: string): string | null => { const t = v?.trim() ?? ""; return /^"(?:[^"\\]|\\.)*"$/.test(t) ? JSON.parse(t) : null; };
/** Words, not only signs. A sign is read out by its own name ("multiplication sign", "play"), never as what the control
 *  does, so "×" or "▶" alone is no name. The same rule for a label and for the words inside a button. */
const hasWords = (t: string): boolean => /[A-Za-z]/.test(t);
/** The text a quoted string shows, its escapes read. */
const unquote = (t: string): string =>
  t.slice(1, -1).replace(/\\(?:x([0-9a-fA-F]{2})|u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|([\s\S]))/g, (_, x, u1, u2, c) => (x || u1 || u2 ? String.fromCodePoint(parseInt(x ?? u1 ?? u2, 16)) : c));
/** A name given in a prop: a string with words in it, or an expression (the strings file's words). */
const words = (v?: string): boolean => {
  if (v === undefined) return false;
  const l = lit(v);
  if (l !== null) return hasWords(l);
  const t = v.trim();
  // A template with no value in it is only its own text, read the same way as a quoted string.
  if (t.startsWith("`") && skip(t, 0) === t.length && !t.includes("${")) return hasWords(unquote(t));
  return !/^(undefined|null|false|true|""|``|void 0)$/.test(t);
};
const labelled = (e: El) => words(e.props.get("aria-label")) || e.props.has("aria-labelledby");
const hidden = (e: El) => lit(e.props.get("aria-hidden")) === "true" || e.props.get("aria-hidden") === "true";
const CONTROLS = ["input", "select", "textarea"];
// Only these take their name from the words inside them; anything else made focusable needs a label of its own.
const FROM_WORDS = ["button", "a", "summary"];
const WORD_ROLES = ["button", "tab", "link", "checkbox", "switch", "radio", "menuitem", "option"];
const ROLES = ["button", "tab", "link", "checkbox", "switch", "radio", "menuitem", "option", "slider", "textbox", "combobox", "spinbutton"];

function interactive(e: El): boolean {
  if (!e.intrinsic) return false;
  const role = lit(e.props.get("role"));
  if (role && ROLES.includes(role)) return true;
  if (["button", "select", "textarea", "summary"].includes(e.tag)) return true;
  if (e.tag === "input") return lit(e.props.get("type")) !== "hidden";
  if (e.tag === "a") return e.props.has("href");
  const ti = e.props.get("tabIndex")?.replace(/\s/g, "");
  return ti !== undefined && ti !== "-1";
}

/** Does this expression always put words on the screen? Something shown only sometimes (`a && b`) does not count. */
function gives(js: string, a: number, b: number, els: El[]): boolean {
  // Each element inside is one placeholder (an element starts before the ones inside it, so the outer one is taken).
  const inside = els.filter((e) => e.start >= a && e.end <= b);
  let text = "", at = a;
  for (const e of inside.sort((x, y) => x.start - y.start)) { if (e.start < at) continue; text += js.slice(at, e.start) + `@${els.indexOf(e)}@`; at = e.end; }
  text += js.slice(at, b);
  const said = (expr: string): boolean => {
    let t = expr.trim();
    while (t.startsWith("(") && skip(t, 0) === t.length) t = t.slice(1, -1).trim();
    const q = ternary(t);
    if (q) return said(t.slice(q[0] + 1, q[1])) && said(t.slice(q[1] + 1));
    const or = splitTop(t, ["||", "??"]);
    if (or.length > 1) return or.some(said);
    if (splitTop(t, ["&&"]).length > 1) return false;
    if (t.startsWith("[") && skip(t, 0) === t.length) return splitTop(t.slice(1, -1), [","]).some(said);
    const ph = /^@(\d+)@$/.exec(t);
    if (ph) return shows(els[Number(ph[1])], js, els);
    if (/^["']/.test(t) && skip(t, 0) === t.length) return hasWords(unquote(t));
    // A template with a value in it is that value's words; one with none is only its own text.
    if (t.startsWith("`") && skip(t, 0) === t.length) return t.includes("${") || hasWords(unquote(t));
    if (t === "" || /^(undefined|null|false|true|this|void 0)$/.test(t)) return false;
    return true;   // a value from the strings file, the model or the person's own words
  };
  return said(text);
}

/** Does this element show words (or name itself)? Hidden from VoiceOver: no. A box or a picture is not words. */
function shows(e: El, js: string, els: El[]): boolean {
  if (hidden(e)) return false;
  if (e.intrinsic && e.tag === "img") return words(e.props.get("alt"));
  if (e.intrinsic && [...CONTROLS, "svg", "progress"].includes(e.tag)) return false;
  if (labelled(e)) return true;
  return e.kids ? gives(js, e.kids[0], e.kids[1], els) : false;
}

/** What VoiceOver would find wrong on one page: a control with no name, a click a keyboard cannot reach, a hidden control. */
function problemsIn(file: string, src: string): string[] {
  const { js, els } = elements(src);
  const out: string[] = [];
  const where = (e: El) => `${file}: <${e.tag}${e.props.has("className") ? ` className=${e.props.get("className")}` : ""}> ${js.slice(e.start, e.start + 160).replace(/\s+/g, " ")}`;
  for (const e of els) {
    if (!e.intrinsic) continue;
    if (interactive(e)) {
      let name = labelled(e);
      if (!name && CONTROLS.includes(e.tag)) {
        for (let p = e.parent; p && !name; p = p.parent) if (p.intrinsic && p.tag === "label") name = shows(p, js, els);
      } else if (!name && (FROM_WORDS.includes(e.tag) || WORD_ROLES.includes(lit(e.props.get("role")) ?? ""))) name = e.kids ? gives(js, e.kids[0], e.kids[1], els) : false;
      if (!name) out.push(`no name: ${where(e)}`);
      if (e.spread) out.push(`props spread on a control, its name cannot be checked: ${where(e)}`);
      for (let p = e.parent; p; p = p.parent) if (hidden(p)) { out.push(`a control inside something hidden from VoiceOver: ${where(e)}`); break; }
    } else if (e.props.has("onClick") && !["label", "option"].includes(e.tag)) {
      out.push(`a click a keyboard cannot reach (use a button): ${where(e)}`);
    }
    const ti = e.props.get("tabIndex")?.trim();
    if (ti && /^\d+$/.test(ti) && Number(ti) > 0) out.push(`a tab order of its own (tabIndex above 0): ${where(e)}`);
    if (e.tag === "img" && !e.props.has("alt")) out.push(`a picture with no words for VoiceOver: ${where(e)}`);
  }
  return out;
}

describe("every control has a name VoiceOver reads (part 1)", () => {
  test("the reader catches an icon only button, an empty one, a box with no label, a clickable span and an empty label", () => {
    const bad = `export const X = ({ go, n }: any) => <div>
      <button className="btn" type="button" onClick={go}><span aria-hidden="true">×</span></button>
      <button type="button" onClick={go} />
      <input type="text" placeholder="Type here" />
      <span onClick={go}>Open</span>
      <button type="button" aria-label="" onClick={go}></button>
      <button type="button" onClick={go}>{n > 0 && S.more}</button>
      <div aria-hidden="true"><button type="button" onClick={go}>{S.allow}</button></div>
      <img src="a.png" />
      <pre tabIndex={0}>{n}</pre>
      <button onClick={go}>×</button>
      <button>{"▶"}</button>
      <button aria-label={\`×\`} onClick={go} />
      <button>{\`▶\`}</button>
    </div>`;
    const found = problemsIn("bad.tsx", bad);
    // A sign is not a name: VoiceOver reads "multiplication sign" or "play", not what the button does.
    expect(found.filter((p) => p.startsWith("no name")).length, found.join("\n")).toBe(10);
    expect(found.some((p) => p.startsWith("a click a keyboard cannot reach"))).toBe(true);
    expect(found.some((p) => p.startsWith("a control inside something hidden"))).toBe(true);
    expect(found.some((p) => p.startsWith("a picture with no words"))).toBe(true);
  });
  test("and passes words, a label, a labelled box, a wrapped check box and both sides of a choice", () => {
    const good = `export const Y = ({ n, ok }: any) => <>
      <button type="button" onClick={() => go(\`\${n}\`, /a"b{/)}>{S.allow}</button>
      <button type="button" aria-label={S.x}><span aria-hidden="true">{n}</span></button>
      <label className="check"><input type="checkbox" checked={ok} /> {S.y}</label>
      <input type="text" aria-label={S.z} />
      <button type="button">{n > 1 ? S.a : S.b}</button>
      <button type="button">{S.tab}{ok && <span className="sr">, {S.waiting}</span>}</button>
      <select aria-label={S.pick}><option value="">{S.none}</option></select>
      <img src="a.png" alt={S.picture} />
      <pre tabIndex={0} aria-label={S.diff}>{n}</pre>
      <details><summary>{S.more} <span className="muted">· {S.cost}</span></summary></details>
      <button type="button" aria-label={\`\${S.open} \${n}\`} />
      <button type="button">{\`\${S.allow} ×\`}</button>
    </>`;
    expect(problemsIn("good.tsx", good)).toEqual([]);
  });
  test("every page's buttons, toggles, boxes, lists and tabs have a name in words", () => {
    expect(PAGES).toEqual(expect.arrayContaining(["card.tsx", "dock.tsx", "island.tsx", "onboarding.tsx"]));
    const all = PAGES.flatMap((f) => problemsIn(f, read(`./${f}`)));
    expect(all, all.join("\n")).toEqual([]);
  });
  test("the reader really reads the pages (it finds their controls)", () => {
    const { els } = elements(read("./card.tsx"));
    expect(els.filter((e) => e.tag === "button").length).toBeGreaterThan(150);
    expect(els.filter((e) => e.tag === "input").length).toBeGreaterThan(8);
    expect(els.some((e) => lit(e.props.get("role")) === "tab")).toBe(true);
  });
  test("a group of controls that has a name is a group VoiceOver can read (aria-label only names things with a role)", () => {
    for (const f of PAGES) {
      const { els } = elements(read(`./${f}`));
      for (const e of els.filter((x) => x.intrinsic && ["div", "span"].includes(x.tag) && x.props.has("aria-label"))) {
        expect(e.props.has("role"), `${f}: a ${e.tag} with aria-label ${e.props.get("aria-label")} needs a role`).toBe(true);
      }
    }
  });
  test("the character says its name, its state and how many questions wait", () => {
    const dock = read("./dock.tsx");
    expect(dock).toContain("const label = characterWords(m);");
    expect(dock).toMatch(/const spoken = `\$\{S\.characterName\}: \$\{label\}/);
    expect(dock).toContain("aria-label={spoken}");
    expect(dock).toMatch(/role="status" aria-live="polite">\{label\}/);
  });
  test("the island says what it is and its state in one line", () => {
    const island = read("./island.tsx");
    expect(island).toContain("const line = islandLine(m);");
    expect(island).toMatch(/aria-label=\{`\$\{S\.islandOpen\}\. \$\{line\}`\}/);
    // What it draws for sighted people is hidden from VoiceOver, so nothing is read twice.
    for (const part of ["pillrow", "lip", "peekline"]) expect(island).toMatch(new RegExp(`className="${part}" aria-hidden="true"`));
  });
});

// ---------- what Home says out loud ----------

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const sentenceOf = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (label = "add a sign up page") => [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: `Before: ${label}`, files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const approval = (id = "ap_1", title = "git push sends your work to a remote") => ev({ type: "approval.request", approval: id, agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "git", title, expiresAt: "2999-01-01T00:00:00Z" });
const stuck = ev({ type: "loop.stuck", agent: "a", index: 2, title: "Fix the form", failure: { label: "Tests", detail: "1 failed" }, options: [{ id: "different", label: "Try a different way" }, { id: "stop", label: "Stop here" }] });
const receipt = (proof: string) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "signup.js", kind: "modified" }], commands: 2, notUndoable: [], usdEstimate: 0.05, proof });

describe("Home says what needs the person, politely, without moving the keyboard (part 1)", () => {
  test("nothing to say when nothing happened", () => {
    expect(newsOf(initial())).toEqual([]);
    expect(newsOf(run(task()))).toEqual([]);
  });
  test("a question, with what it is about", () => {
    const n = newsOf(run([...task(), approval()]));
    expect(n.map((x) => x.key)).toEqual(["approval:ap_1"]);
    expect(n[0].text).toBe(`${S.needsYouTitle}: git push sends your work to a remote`);
  });
  test("the loop card, a pause and a plan to look at", () => {
    expect(newsOf(run([...task(), stuck]))[0].text).toBe(`${S.stuckTitle}: Step 2: Fix the form`);
    expect(newsOf(run([...task(), ev({ type: "drive.paused", agent: "a", reason: "editor" })]))[0].key).toMatch(/^paused:/);
    expect(newsOf(run([...task(), ev({ type: "plan.ready", agent: "a", steps: [{ title: "One" }, { title: "Two" }], estimateUsd: 0.1 })]))[0].text).toBe(S.saidPlan(2));
  });
  test("a finished task, and whether it was proven", () => {
    expect(newsOf(run([...task(), receipt("passed")]))[0]).toEqual({ key: "receipt:cp_1", text: S.saidDone("add a sign up page", S.proven) });
    expect(newsOf(run([...task(), receipt("none")]))[0].text).toBe(S.saidDone("add a sign up page", S.notChecked));
    expect(newsOf(run([...task(), receipt("failed")]))[0].text).toBe(S.saidNotDone("add a sign up page"));
  });
  test("an error, in its own plain words", () => {
    const m = run([ev({ type: "protocol.error", reason: "Could not save that." })]);
    expect(newsOf(m)[0].key).toMatch(/^error:/);
    expect(newsOf(m)[0].text).toBe(m.error!);
  });
  test("each thing is said once; a new one is said even while an older one is still showing", () => {
    const one = run([...task(), approval(), ev({ type: "protocol.error", reason: "Could not save that." })]);
    const first = liveLine(EMPTY_LINE, [], one);
    expect(first.line.text).toContain("Could not save that.");
    expect(first.line.text).toContain("git push sends your work to a remote");
    expect(liveLine(first.line, first.said, one).line, "nothing new: the same words, so nothing is said again").toBe(first.line);
    const two = run([approval("ap_2", "npm publish puts it online")], one);
    const second = liveLine(first.line, first.said, two);
    expect(second.line.text).toBe(`${S.needsYouTitle}: npm publish puts it online.`);
    // Gone and back again (the same error later): said again.
    const gone = liveLine(second.line, second.said, initial());
    expect(gone.said).toEqual([]);
    expect(gone.line).toEqual(EMPTY_LINE);
    expect(liveLine(gone.line, gone.said, one).line.text).toContain("Could not save that.");
  });
  test("the live line empties once what it said is gone, so the same thing later is said again and nothing old is left", () => {
    const one = run([...task(), ev({ type: "protocol.error", reason: "Could not save that." })]);
    const a = liveLine(EMPTY_LINE, [], one);
    expect(a.line.text).toBe(sentenceOf(one.error!));
    // Nothing new, the error still showing: the line keeps its words.
    const b = liveLine(a.line, a.said, one);
    expect(b.line).toEqual(a.line);
    // The error went away: the line empties (a live line whose words do not change is not said again).
    const c = liveLine(b.line, b.said, run(task()));
    expect(c.line.text).toBe("");
    // The same error again: said again, because the line changed.
    const d = liveLine(c.line, c.said, one);
    expect(d.line.text).toBe(a.line.text);
    // A question came and went while the older error stayed: the line keeps the question only while it shows.
    const asked = run([approval()], one);
    const e = liveLine(d.line, d.said, asked);
    expect(e.line.text).toBe(`${S.needsYouTitle}: git push sends your work to a remote.`);
    const f = liveLine(e.line, e.said, one);
    expect(f.line.text, "the question is gone; the error was said already").toBe("");
  });
  test("each line ends a sentence, so two in a row are read as two", () => {
    const t = liveLine(EMPTY_LINE, [], run([...task(), approval(), stuck])).line.text;
    expect(t).toMatch(/remote\. /);
    expect(t.endsWith(".")).toBe(true);
  });
  test("a need waiting on another tab says which tab, in the same line, so it is said once", () => {
    const m = run([...task(), approval()]);
    const what = `${S.needsYouTitle}: git push sends your work to a remote`;
    expect(newsOf(m, "settings")[0]).toEqual({ key: "approval:ap_1", text: S.homeWaiting("Now", what) });
    expect(newsOf(m, "now")[0].text, "on its own tab: just what it is").toBe(what);
    // Said once: Home then showing Now (it moves there unless the person is typing) says nothing more.
    const a = liveLine(EMPTY_LINE, [], m, "settings");
    expect(a.line.text).toBe(S.homeWaiting("Now", what));
    expect(liveLine(a.line, a.said, m, "now").line).toBe(a.line);
    expect(newsOf(m, "settings").filter((n) => n.text.includes(S.needsYouTitle)).length, "no second line for the tab").toBe(1);
  });
  test("an error shows on every tab, so it never says where", () => {
    const m = run([ev({ type: "protocol.error", reason: "Could not save that." })]);
    for (const t of ["now", "did", "learn", "memory", "settings"] as const) expect(newsOf(m, t)[0].text).toBe(m.error!);
  });
  test("a need only its own tab shows (a lesson step) is said when another tab is open, and left to its panel on its tab", () => {
    const m = run([ev({ type: "ui.walkRequested", walk: "w1" }), ev({ type: "walk.step", walk: "w1", lesson: "k", title: "Turn on Screen Recording", index: 0, total: 3, say: "Open System Settings", find: "System Settings", ask: false })]);
    expect(newsOf(m, "now").map((n) => n.text)).toEqual([S.homeWaiting("Learn", S.lessonsTitle)]);
    expect(newsOf(m, "learn")).toEqual([]);
    const a = liveLine(EMPTY_LINE, [], m, "now");
    expect(a.line.text).toBe(S.homeWaiting("Learn", S.lessonsTitle));
    expect(liveLine(a.line, a.said, m, "learn").line, "the tab moving says nothing more").toBe(a.line);
    // Seen first on its own tab (its panel said it): going to another tab later does not say it again.
    const b = liveLine(EMPTY_LINE, [], m, "learn");
    expect(b.line.text).toBe("");
    expect(liveLine(b.line, b.said, m, "now").line.text).toBe("");
  });
  test("Home has one live line for needs: the character's state, the cost and the task's steps are in none", () => {
    const card = read("./card.tsx");
    const { js, els } = elements(card);
    const live = els.filter((e) => e.intrinsic && (["status", "alert", "log"].includes(lit(e.props.get("role")) ?? "") || (e.props.has("aria-live") && lit(e.props.get("aria-live")) !== "off")));
    const line = live.filter((e) => e.props.get("children") === "news");
    expect(line.length, "one news line").toBe(1);
    expect(lit(line[0].props.get("aria-live"))).toBe("polite");
    // Nothing else that is said out loud carries a need, the state that goes with it, the cost or the task's steps.
    const NEEDS = ["home.said", "characterWords(", "visualState(", "formatUsd(", "costUsd", "activityNow(", "m.error", "m.approvals", "m.agentsAsk", "m.stuck", "m.paused", "m.plan", "S.needsYouTitle", "S.homeWaiting", "newsOf("];
    expect(live.length).toBeGreaterThan(10);
    for (const e of live.filter((x) => x !== line[0])) {
      const said = js.slice(e.start, e.end);
      for (const n of NEEDS) expect(said.includes(n), `a live region says ${n}: ${said.slice(0, 160)}`).toBe(false);
    }
    expect(card).not.toContain("home.said");
    expect(card).toContain("liveLine(line.current, heard.current, m, tabNow.current)");
  });
  test("the card has one polite line for it, read whole, and says nothing by moving the keyboard", () => {
    const card = read("./card.tsx");
    expect(card).toContain("liveLine(line.current, heard.current, m, tabNow.current)");
    expect(card).toContain("setNews(n.line.text)");
    expect(card).toMatch(/<div className="sr" role="status" aria-live="polite" aria-atomic="true">\{news\}<\/div>/);
    // Outside the first run's switch, so it is there before anything changes (a live line must exist first).
    expect(card.indexOf("{news}</div>")).toBeLessThan(card.indexOf("{!onboarded && <Onboarding"));
    const a11y = read("./a11y.ts");
    expect(a11y).not.toMatch(/document|\.focus\(|window\./);
  });
  test("questions and errors are said by that line only, never shouted on top of it", () => {
    const card = read("./card.tsx");
    const asks = card.slice(card.indexOf("{m.agentsAsk && ("), card.indexOf("{m.stuck && ("));
    expect(asks).toContain("S.needsYouTitle");
    expect(asks).not.toContain('role="alert"');
    expect(card).toMatch(/\{m\.error && <div className="error">\{m\.error\}<\/div>\}/);
  });
  test("a question still takes the keyboard only by the old rule: Home already has it and nobody is typing", () => {
    const card = read("./card.tsx");
    expect(card).toMatch(/if \(!shouldTakeFocus\(a \? \{ tag: a\.tagName, editable: a\.isContentEditable \} : null, document\.hasFocus\(\)\)\) return;/);
  });
});

// ---------- the keyboard ----------

describe("keys inside a confirm step (part 2)", () => {
  test("Tab and Shift Tab go round its choices, Escape takes it away", () => {
    expect(confirmKey("Tab", false, true)).toBe("next");
    expect(confirmKey("Tab", true, true)).toBe("prev");
    expect(confirmKey("Tab", false, false)).toBe("next");
    expect(confirmKey("Escape", false, true)).toBe("cancel");
    expect(confirmKey("Escape", false, false)).toBe("cancel");
  });
  test("the arrows, Home and End move between its buttons, but leave a box's own keys alone", () => {
    for (const k of ["ArrowRight", "ArrowDown"]) expect(confirmKey(k, false, true)).toBe("next");
    for (const k of ["ArrowLeft", "ArrowUp"]) expect(confirmKey(k, false, true)).toBe("prev");
    expect(confirmKey("Home", false, true)).toBe("first");
    expect(confirmKey("End", false, true)).toBe("last");
    for (const k of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]) expect(confirmKey(k, false, false), k).toBeNull();
  });
  test("Enter and Space are the button's own press; other keys do nothing here", () => {
    for (const k of ["Enter", " ", "a", "Shift", "Meta"]) expect(confirmKey(k, false, true), k).toBeNull();
  });
  test("going round never leaves the step and never stops at an end", () => {
    expect(stepTo(0, 3, "next")).toBe(1);
    expect(stepTo(2, 3, "next")).toBe(0);
    expect(stepTo(0, 3, "prev")).toBe(2);
    expect(stepTo(1, 3, "prev")).toBe(0);
    expect(stepTo(1, 3, "first")).toBe(0);
    expect(stepTo(0, 3, "last")).toBe(2);
    expect(stepTo(-1, 3, "next")).toBe(0);
    expect(stepTo(-1, 3, "prev")).toBe(2);
    expect(stepTo(0, 1, "next")).toBe(0);
    expect(stepTo(0, 0, "next")).toBe(-1);
  });
});

describe("where the keyboard goes when its control goes away (part 2)", () => {
  test("only when nothing has the keyboard, in a window that has it", () => {
    expect(focusLost(null, true)).toBe(true);
    expect(focusLost({ tag: "BODY" }, true)).toBe(true);
    expect(focusLost({ tag: "HTML" }, true)).toBe(true);
    expect(focusLost({ tag: "BUTTON" }, true), "something else has it").toBe(false);
    expect(focusLost({ tag: "INPUT" }, true), "the person is typing").toBe(false);
    expect(focusLost(null, false), "Companion never takes the keyboard (rule 9)").toBe(false);
    expect(focusLost({ tag: "BODY" }, false)).toBe(false);
  });
  test("never wider than the rule a question already follows", () => {
    for (const a of [null, { tag: "BODY" }, { tag: "HTML" }, { tag: "BUTTON" }, { tag: "INPUT" }, { tag: "TEXTAREA" }]) {
      for (const has of [true, false]) if (focusLost(a, has)) expect(shouldTakeFocus(a ? { tag: a.tag, editable: false } : null, has)).toBe(true);
    }
  });
  test("back to the control a step was opened from, else the nearest part of Home still there, else the open tab", () => {
    expect(focusSpot({ back: true, spot: true })).toBe("back");
    expect(focusSpot({ back: false, spot: true })).toBe("spot");
    expect(focusSpot({ back: false, spot: false })).toBe("tab");
  });
  test("a way back is good only just after the step closed", () => {
    expect(backStill(1000, 1000)).toBe(true);
    expect(backStill(1000, 1000 + BACK_MS)).toBe(true);
    expect(backStill(1000, 1001 + BACK_MS)).toBe(false);
    expect(backStill(1000, 999)).toBe(false);
  });
});

describe("Home from the keyboard alone (part 2)", () => {
  const card = read("./card.tsx");
  // Every "are you sure" in Home: it takes the keyboard to its safe choice, keeps Tab inside, Esc takes it away, and
  // the keyboard goes back to the button that opened it.
  const SURE = ["S.deleteSure", "S.keyRemoveSure", "S.memoryEraseSure", "S.liveSure", "S.rollSure", "S.undoSure", "S.bisectUndoSure("];
  test("every confirm step is a ConfirmStep, with a way back and a safe choice", () => {
    for (const s of SURE) {
      const at = card.indexOf(s);
      expect(at, s).toBeGreaterThan(-1);
      const open = card.lastIndexOf("<ConfirmStep", at);
      expect(open, `${s} is inside a ConfirmStep`).toBeGreaterThan(-1);
      expect(card.slice(open, at)).not.toContain("</ConfirmStep>");
      const block = card.slice(open, card.indexOf("</ConfirmStep>", at));
      const back = /back=\{(\w+)\}/.exec(block)?.[1];
      expect(back, `${s} has a way back`).toBeTruthy();
      expect(card, `${s}: the opener carries id={${back}}`).toContain(`id={${back}}`);
      expect(block, `${s} has onCancel`).toMatch(/onCancel=\{/);
      expect(block, `${s}: the safe choice is marked`).toContain("data-cancel");
    }
  });
  test("the confirm step takes the keyboard only after the person's own press, and gives it back", () => {
    const c = read("./confirm.tsx");
    expect(c).toContain("useLayoutEffect(");
    // Opening takes the keyboard only through the tested rule (focus.test.ts): never a focus of its own.
    const open = body(c, "openStep");
    expect(open).toContain("takeIfLost(");
    expect(open).not.toContain(".focus(");
    const mount = c.slice(c.indexOf("useLayoutEffect("), c.indexOf("}, []);", c.indexOf("useLayoutEffect(")));
    expect(mount).toContain("openStep(box.current)");
    expect(mount).not.toContain(".focus(");
    // Its one other move of the keyboard is a key the person pressed inside the step.
    expect(c.match(/\.focus\(/g)?.length).toBe(1);
    expect(body(c, "ConfirmStep").slice(body(c, "ConfirmStep").indexOf("const onKeyDown"))).toContain(".focus(");
    expect(c).toContain("[data-cancel]");
    expect(c).toMatch(/return \(\) => focusBack\(back\)/);
    expect(c).toMatch(/confirmKey\(e\.key, e\.shiftKey/);
    expect(c).toMatch(/stepTo\(/);
    // Esc takes the step away, not Home.
    const esc = c.slice(c.indexOf('k === "cancel"'));
    expect(esc.slice(0, 120)).toContain("onCancel()");
    expect(c.indexOf("e.stopPropagation()")).toBeLessThan(c.indexOf('k === "cancel"'));
  });
  test("Home keeps the keyboard near where it was when its control goes away", () => {
    expect(card.match(/keepFocus\(/g)?.length).toBe(1);
    expect(card).toMatch(/keepFocus\(el, \(\) => document\.getElementById\(tabId\(tabNow\.current\)\)\)/);
    const f = read("./focus.ts");
    expect(f).toContain("focusSpot(");
    expect(f).toContain("hasFocus: () => document.hasFocus()");
    expect(f).toMatch(/const lostIn = \(p: Page\) => \{[^\n]*focusLost\([^\n]*p\.hasFocus\(\)\)/);
    // The watch only asks refocus, which focus.test.ts runs against a stand in page.
    expect(body(f, "keepFocus")).toContain("new MutationObserver(() => refocus(seen, tab))");
    expect(body(f, "keepFocus")).not.toContain(".focus(");
    expect(f).not.toMatch(/setInterval|requestAnimationFrame/);
  });
  test("focus.ts moves the keyboard in two places only, each after the rule says Home may", () => {
    const f = read("./focus.ts");
    expect(f.match(/\.focus\(/g)?.length, "takeIfLost and refocus, nothing else").toBe(2);
    for (const name of ["takeIfLost", "refocus"]) {
      const b = body(f, name), guard = b.indexOf("if (!lostIn(p)) return");
      expect(guard, `${name} asks the rule`).toBeGreaterThan(-1);
      expect(guard, `${name} asks before it moves the keyboard`).toBeLessThan(b.indexOf(".focus("));
    }
    // A box opened from a press goes through the same rule.
    expect(body(f, "focusIfLost")).toContain("takeIfLost(");
    expect(body(f, "focusIfLost")).not.toContain(".focus(");
    // A tab shown by itself gets the keyboard only by the same rule.
    expect(card).toMatch(/useEffect\(\(\) => \{ takeIfLost\(\(\) => document\.getElementById\(tabId\(home\.tab\)\)\); \}, \[home\.tab\]\);/);
  });
  test("a box put away with Esc gives the keyboard back to the button that opened it", () => {
    for (const box of ["S.openLinkLabel", "S.obKeyLabel", "S.memoryEdit}: ${l.text}"]) {
      const at = card.indexOf(box);
      expect(at, box).toBeGreaterThan(-1);
      const line = card.slice(card.lastIndexOf("\n", at), card.indexOf("\n", at));
      expect(line, box).toMatch(/e\.key === "Escape"\) \{ e\.stopPropagation\(\); [^}]*focusBack\(/);
    }
  });
  test("each settings row is a named group, so VoiceOver and the keyboard know where they are", () => {
    const settings = card.slice(card.indexOf("function SettingsPanel"), card.indexOf("\n}\n", card.indexOf("function SettingsPanel")));
    expect(settings.match(/<Group title=\{S\.\w+\}>/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    const g = card.slice(card.indexOf("function Group"), card.indexOf("\n}\n", card.indexOf("function Group")));
    expect(g).toMatch(/role="group" aria-labelledby=\{id\}/);
    expect(g).toMatch(/<h3 id=\{id\}>/);
  });
  test("the first run's steps: after Continue or Back the keyboard goes to the new step's heading", () => {
    const ob = read("./onboarding.tsx");
    // Only after the person's own press, by the rule a question follows (Continue stays where it is, so nothing is lost).
    expect(ob).toMatch(/\}, \[step\]\);/);
    expect(ob).toMatch(/if \(!h \|\| !shouldTakeFocus\(/);
    expect(ob).toContain('querySelector<HTMLElement>("h2")');
    expect(ob).toContain('setAttribute("tabindex", "-1")');
  });
  test("a focus ring shows on whatever has the keyboard, and nothing takes it away without its own", () => {
    const css = rules(read("./style.css"));
    const ring = css.find((r) => r.sel === ":focus-visible" && !r.media);
    expect(ring?.decl.outline).toMatch(/^2px solid /);
    for (const r of css) {
      const off = /^(none|0)\b/.test(r.decl.outline ?? "") || r.decl.all === "unset";
      if (!off) continue;
      for (const s of r.sel.split(",").map((x) => x.trim())) expect(css.some((o) => o.sel.split(",").map((x) => x.trim()).includes(`${s}:focus-visible`) && !!o.decl.outline), s).toBe(true);
    }
  });
});

// ---------- colours and sizes ----------

type Rule = { sel: string; decl: Record<string, string>; media: string | null };
function rules(css0: string, media: string | null = null): Rule[] {
  const css = css0.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    const close = skip(css, open);
    const body = css.slice(open + 1, close - 1);
    if (head.startsWith("@media")) out.push(...rules(body, head.slice(6).trim()));
    else if (!head.startsWith("@")) {
      const decl: Record<string, string> = {};
      for (const d of body.split(";")) { const c = d.indexOf(":"); if (c > 0) decl[d.slice(0, c).trim()] = d.slice(c + 1).trim(); }
      out.push({ sel: head, decl, media });
    }
    i = close;
  }
  return out;
}

type RGBA = [number, number, number, number];
function parseColor(v0: string, tokens: Record<string, string>): RGBA {
  const v = v0.trim();
  const vr = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(v);
  if (vr) return parseColor(tokens[vr[1]] ?? vr[2] ?? "", tokens);
  if (v === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) { const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1]; return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)).concat(1) as RGBA; }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb) { const p = rgb[1].split(",").map((x) => Number(x.trim())); return [p[0], p[1], p[2], p[3] ?? 1]; }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(v);
  if (mix) {
    const a = parseColor(mix[1], tokens), b = parseColor(mix[3], tokens), p = Number(mix[2]) / 100;
    return [0, 1, 2, 3].map((k) => a[k] * p + b[k] * (1 - p)) as RGBA;
  }
  throw new Error(`a colour this test cannot read: ${v0}`);
}
const over = (top: RGBA, under: RGBA): RGBA => [0, 1, 2].map((k) => top[k] * top[3] + under[k] * (1 - top[3])).concat(1) as RGBA;
const lum = (c: RGBA) => { const f = (x: number) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: RGBA, b: RGBA) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const colourIn = (v: string) => /(var\([^)]+\)|#[0-9a-f]{3,6}\b|rgba?\([^)]+\)|color-mix\(.+\)|\btransparent\b)/i.exec(v)?.[1] ?? null;

describe("text and focus colours meet WCAG AA in light and dark (part 4)", () => {
  const css = rules(read("./style.css"));
  const light = Object.fromEntries(Object.entries(css.find((r) => r.sel === ":root" && !r.media)!.decl).filter(([k]) => k.startsWith("--")));
  const darkRule = css.find((r) => r.sel === ":root" && /prefers-color-scheme: dark/.test(r.media ?? ""));
  const themes: [string, Record<string, string>][] = [["light", light], ["dark", { ...light, ...darkRule!.decl }]];
  const one = (sel: string) => css.find((r) => r.sel === sel && !r.media);
  const ISLAND = /island|\.lip|\.mark|\.peekline|\.pillrow/;
  test("the test reads both themes from style.css", () => {
    expect(light["--bg"]).toBeTruthy();
    expect(darkRule).toBeTruthy();
    expect(themes[1][1]["--bg"]).not.toBe(light["--bg"]);
  });
  for (const [theme, tokens] of themes) {
    const c = (v: string) => parseColor(v, tokens);
    const bg = c("var(--bg)");
    test(`${theme}: every rule that sets a text colour is readable on what is behind it (4.5 to 1)`, () => {
      let checked = 0;
      for (const r of css) {
        if (r.media || !r.decl.color || /inherit|currentColor|CanvasText/.test(r.decl.color)) continue;
        const own = colourIn(r.decl.background ?? r.decl["background-color"] ?? "");
        const behind = own ? over(c(own), ISLAND.test(r.sel) ? c("#000") : bg) : ISLAND.test(r.sel) ? c("#000") : bg;
        const fg = over(c(r.decl.color), behind);
        expect(ratio(fg, behind), `${theme} ${r.sel}: ${r.decl.color} on ${own ?? "the page"}`).toBeGreaterThanOrEqual(4.5);
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
    });
    test(`${theme}: buttons and tabs under the pointer stay readable`, () => {
      const hover = c(colourIn(one(".btn:hover:not(:disabled)")!.decl.background)!);
      const primaryHover = one(".btn.primary:hover:not(:disabled)");
      expect(primaryHover, "the main button keeps its own colour under the pointer").toBeTruthy();
      const ph = c(colourIn(primaryHover!.decl.background)!);
      expect(ratio(c(one(".btn")!.decl.color), over(hover, bg)), "a button").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c(one(".btn.danger")!.decl.color), over(hover, bg)), "a warning button").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c(one(".btn.primary")!.decl.color), over(ph, bg)), "the main button").toBeGreaterThanOrEqual(4.5);
      const tabHover = one(".tab:hover")!;
      expect(ratio(c(tabHover.decl.color), over(c(colourIn(tabHover.decl.background)!), bg)), "a tab").toBeGreaterThanOrEqual(4.5);
    });
    test(`${theme}: what was added or removed in a diff is readable on its tint`, () => {
      for (const s of [".added", ".removed"]) {
        const tint = over(c(colourIn(one(s)!.decl.background)!), bg);
        expect(ratio(c("var(--fg)"), tint), s).toBeGreaterThanOrEqual(4.5);
      }
    });
    test(`${theme}: the focus ring, a box's edge and the open tab's line stand out (3 to 1)`, () => {
      expect(ratio(c(colourIn(one(":focus-visible")!.decl.outline)!), bg), "focus ring").toBeGreaterThanOrEqual(3);
      expect(ratio(c(colourIn(one(".character:focus-visible")!.decl.outline)!), bg), "the character's focus ring").toBeGreaterThanOrEqual(3);
      expect(ratio(c(colourIn(one(".btn")!.decl.border)!), bg), "a button's edge").toBeGreaterThanOrEqual(3);
      expect(ratio(c(colourIn(one(".ask input, .row input[type=\"text\"]")!.decl.border)!), bg), "a text box's edge").toBeGreaterThanOrEqual(3);
      expect(ratio(c(one('.tab[aria-selected="true"]')!.decl["border-bottom-color"]), bg), "the open tab's line").toBeGreaterThanOrEqual(3);
    });
    test(`${theme}: the dot on a tab that waits for the person stands out on the tab, still or under the pointer (3 to 1)`, () => {
      // For sighted people the dot is the only sign another tab needs them (VoiceOver hears the words beside it).
      const dot = c(one(".tabdot")!.decl.background);
      expect(ratio(dot, bg), "on the page").toBeGreaterThanOrEqual(3);
      expect(ratio(dot, over(c(colourIn(one(".tab:hover")!.decl.background)!), bg)), "on a tab under the pointer").toBeGreaterThanOrEqual(3);
    });
    test(`${theme}: the island's words, ring and marks stand out on its black`, () => {
      const black = c("#000");
      expect(ratio(c(one(".island-hit")!.decl.color), black)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c(colourIn(one(".island-hit:focus-visible")!.decl.outline)!), black)).toBeGreaterThanOrEqual(3);
      const marks = css.filter((r) => !r.media && /^\.mark/.test(r.sel) && r.decl.background);
      expect(marks.length).toBeGreaterThanOrEqual(6);
      for (const r of marks) expect(ratio(c(r.decl.background), black), r.sel).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("Home stays usable with bigger text (part 4)", () => {
  const css = rules(read("./style.css"));
  // Fixed heights only on things that hold no words, or whose size the shell sets to the point (the island's own window).
  const NO_WORDS = [".character", ".tabdot", ".mark", ".lip .mark", ".check input", ".panel progress", ".sr", ".island", ".island-hit", ".lip", "html.island-page, body.island-page"];
  test("nothing that holds words has a fixed height that would cut it off", () => {
    for (const r of css) {
      const h = r.decl.height ?? "";
      if (/\d+px/.test(h)) expect(NO_WORDS.includes(r.sel), `${r.sel} { height: ${h} } would cut off bigger text: use min-height`).toBe(true);
      const max = r.decl["max-height"] ?? "";
      if (/\d+px/.test(max)) expect(r.decl.overflow ?? "", `${r.sel} { max-height: ${max} } must scroll, not cut off`).toMatch(/auto|scroll/);
    }
  });
  test("Home's page can always grow and scroll: no hidden overflow, no fixed height, no single line text", () => {
    for (const r of css.filter((x) => !x.media && !/island|\.sr\b|\.lip|\.mark|\.pillrow|\.peekline/.test(x.sel))) {
      expect(r.decl.overflow ?? "", r.sel).not.toMatch(/hidden/);
      expect(r.decl["white-space"] ?? "", r.sel).not.toMatch(/nowrap/);
    }
    const rows = css.filter((r) => [".row", ".tabs"].includes(r.sel));
    for (const r of rows) expect(r.decl["flex-wrap"], `${r.sel} wraps to a new line`).toBe("wrap");
  });
  test("no page sets a height or a font size inline, out of reach of the stylesheet", () => {
    for (const f of PAGES) expect(read(`./${f}`), f).not.toMatch(/style=\{\{[^}]*(height|fontSize)/);
  });
  // The island is the notch's size and its words are cut to fit it (island.rs sizes the window to the point), so it keeps
  // its own sizes; the full status is in Home and in the island's name for VoiceOver.
  const ISLAND_SIZE = /island|\.lip|\.peekline|\.pillrow/;
  test("every word in Home is sized from the one root size (rem), so the text size choice reaches all of them", () => {
    let sized = 0;
    for (const r of css) {
      if (ISLAND_SIZE.test(r.sel)) continue;
      const fs = r.decl["font-size"] ?? "", font = r.decl.font ?? "";
      if (r.sel.startsWith(":root")) { expect(fs + font, r.sel).toMatch(/^(\d+px)?(\d+px -apple-system.*)?$/); continue; }
      expect(fs, `${r.sel} { font-size: ${fs} } does not follow the text size: use rem`).not.toMatch(/\d(px|pt)\b/);
      expect(font, `${r.sel} { font: ${font} } does not follow the text size: use rem`).not.toMatch(/\d(px|pt)\b/);
      expect(r.decl["line-height"] ?? "", r.sel).not.toMatch(/\d(px|pt)\b/);
      if (/rem/.test(fs + font)) sized++;
    }
    expect(sized, "the words in Home that have a size of their own").toBeGreaterThanOrEqual(10);
  });
  test("each text size is a root size in style.css, bigger at each step; Standard is the size Home always had", () => {
    const root = css.find((r) => r.sel === ":root" && !r.media)!;
    expect(root.decl.font).toMatch(/^14px /);
    let last = 14;
    for (const t of TEXT_SIZES.filter((x) => x !== "standard")) {
      const r = css.find((x) => x.sel === `:root[data-text="${t}"]` && !x.media);
      expect(r, t).toBeTruthy();
      const px = Number(/^(\d+)px$/.exec(r!.decl["font-size"] ?? "")?.[1]);
      expect(px, t).toBeGreaterThan(last);
      last = px;
    }
    expect(last, "the largest is a real step up").toBeGreaterThanOrEqual(20);
    expect(css.some((x) => x.sel === ':root[data-text="standard"]'), "Standard needs no rule of its own").toBe(false);
  });
  test("Home puts the saved size on before it draws, and Settings changes it there", () => {
    const card = read("./card.tsx");
    const draw = card.indexOf("createRoot(");
    expect(card.indexOf("applyTextSize(textSize());"), "before the first draw").toBeGreaterThan(-1);
    expect(card.indexOf("applyTextSize(textSize());")).toBeLessThan(draw);
    const row = body(card, "TextSizeRow");
    expect(row).toContain("Group, { title: S.textSizeTitle");
    expect(row).toContain("TEXT_SIZES.map(");
    expect(row).toContain('"aria-pressed": s === size');
    expect(row).toContain("setTextSize(s)");
    expect(row).toContain("applyTextSize(s)");
    expect(body(card, "SettingsPanel")).toContain("TextSizeRow");
    // Only Home: the character's window and the island keep their sizes.
    for (const f of ["./dock.tsx", "./island.tsx", "./overlay.ts"]) expect(read(f), f).not.toContain("applyTextSize");
  });
});
