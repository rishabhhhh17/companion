// Accessibility as part of done (AGENTS.md, the bar 13; M11 wave 4 item 3): a name VoiceOver can read on every control,
// what Home says out loud and how, the keyboard inside Home, and colours and sizes that stay readable. The pages need a
// real Mac to run, so they are read here as text, through Bun's own TSX transpiler (no new dependency).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { BACK_MS, EMPTY_LINE, backStill, confirmKey, focusLost, focusSpot, liveLine, newsOf, stepTo } from "./a11y.ts";
import { initial, reduce, type Model } from "./model.ts";
import { shouldTakeFocus } from "./cardlogic.ts";
import { S, PRODUCT } from "./strings.ts";
import { TEXT_SIZES } from "./textsize.ts";
import { ALL_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
// The pages, and the parts every page is built from (ui/parts.tsx), so a part's own names are read too.
const PAGES = [...readdirSync(new URL("./", import.meta.url).pathname).filter((f) => f.endsWith(".tsx")).sort(), "ui/parts.tsx"];

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
    // Home is card.tsx and, since the settings registry (T16), its Settings tab in settingsPage.tsx.
    // Settings is built from the parts (ui/parts.tsx, the overhaul spec, section 3): its buttons are Button, its boxes Field
    // and Stepper.
    const els = [...elements(read("./card.tsx")).els, ...elements(read("./settingsPage.tsx")).els];
    expect(els.filter((e) => e.tag === "button" || e.tag === "Button").length).toBeGreaterThan(150);
    expect(els.filter((e) => ["input", "Field", "Stepper"].includes(e.tag)).length).toBeGreaterThan(8);
    // The quiet buttons with words at the top of Home say whether their place is open (F28: the Button part's `pressed`).
    expect(els.some((e) => e.props.has("aria-pressed") || (e.tag === "Button" && e.props.has("pressed")))).toBe(true);
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
    // Its name as chosen (character.name, M18), or its own.
    expect(dock).toMatch(/const spoken = `\$\{characterName\(nameSet\)\}: \$\{label\}/);
    expect(dock).toContain('const nameSet = useSetting("character.name");');
    expect(dock).toContain("aria-label={spoken}");
    expect(dock).toMatch(/role="status" aria-live="polite">\{label\}/);
  });
  test("the island says what it is and its state in one line", () => {
    const island = read("./island.tsx");
    // The update a check found is part of the same one line (home.ts islandLine), so VoiceOver hears what the eye sees.
    expect(island).toContain("const line = islandLine(m, { update, group: showGroup && g && g !== \"core\" ? S.groups.names[g] : null });");
    // Idle nothing is written on it, and its name still says the state in words (home.ts islandName).
    expect(island).toContain("aria-label={islandName(line)}");
    expect(S.islandQuiet).not.toMatch(/Ready/);
    // What it draws for sighted people (the wings with the agent and the mark) is hidden from VoiceOver; the panel under
    // it is real buttons with words (islandPanel.tsx), hidden from VoiceOver only while it is not shown.
    expect(island).toContain('{showWings && w && <span aria-hidden="true">');
    expect(read("./islandPanel.tsx")).toContain("aria-hidden={!shown}");
    expect(island).toContain('<FlowMini className="island-flow"');
    const mini = read("./flowflowMini.tsx");
    expect(mini).toMatch(/<img className=\{className\} [^>]*alt=""/);   // the picture fallback says nothing
    expect(mini).toContain('aria-hidden="true"');                        // nor does the live water
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
    expect(newsOf(run([...task(), receipt("passed")]))[0]).toEqual({ key: "receipt:cp_1:proven", text: S.saidResult("add a sign up page", "Fixed and proven.") });
    expect(newsOf(run([...task(), receipt("none")]))[0].text).toBe(S.saidResult("add a sign up page", `${S.verdict.unchecked}. ${S.verdict.uncheckedLine}`));
    expect(newsOf(run([...task(), receipt("failed")]))[0].text).toBe(S.saidResult("add a sign up page", `${S.verdict.failed}. ${S.verdict.failedLine}`));
  });
  test("Undo is announced once as Undone (M45)", () => {
    const m = run([...task(), receipt("passed")]);
    const after = run([ev({ type: "checkpoint.restored", checkpoint: "cp_1", safety: "cp_2", recovered: [], largeLeftAlone: [], leftAlone: [] })], m);
    const [a, b] = [newsOf(m)[0], newsOf(after)[0]];
    expect(b.key).not.toBe(a.key);
    expect(b.text).toBe(S.saidResult("add a sign up page", `${S.verdict.undone}. ${S.verdict.undoneFix}`));
    const first = liveLine(EMPTY_LINE, [], m), second = liveLine(first.line, first.said, after);
    expect(second.line.text).toContain(S.verdict.undone);
    expect(liveLine(second.line, second.said, after).line, "said once").toBe(second.line);
  });
  test("a stopped task is not announced as Done (M45)", () => {
    const t = newsOf(run([...task(), ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], usdEstimate: 0, proof: "skipped", ended: "stopped" })]))[0].text;
    expect(t).toBe(S.saidResult("add a sign up page", `${S.verdict.stopped}. ${S.verdict.stoppedNothing}`));
    expect(t).not.toMatch(/\bDone\b/);
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
    expect(card).toMatch(/\{m\.error && <div className="error">\{m\.error\}/);   // M28: plus Restart when the engine stopped
  });
  // Changed in the M11 audit (A62): a question used to take the keyboard from any button the person was on (Stop, a tab),
  // and put it on its first button, Allow, so the Return they pressed for Stop said yes. Now it takes the keyboard only when
  // nothing in Home has it, and puts it on the safe choice.
  test("a question takes the keyboard only when nothing in Home has it, and then onto its safe choice", () => {
    const card = read("./card.tsx");
    const effect = card.slice(card.indexOf("const urgentKey ="), card.indexOf("}, [urgentKey, home.needKey]);"));
    expect(effect).toContain('takeIfLost(() => urgent.current?.querySelector<HTMLElement>("[data-safe]") ?? urgent.current?.querySelector<HTMLElement>("input, button"));');
    expect(effect).not.toContain(".focus()");
    // The safe choice of each question that holds work up: Don't allow, No (AGENTS.md), Stop here (the loop card).
    const approval = card.slice(card.indexOf("{m.approvals.map((a) => { const w = approvalWords(a, project); return ("), card.indexOf("{m.stuck && ("));
    expect(approval).toMatch(/data-safe aria-label=\{`\$\{S\.dontAllow\}/);
    expect(approval).not.toMatch(/data-safe aria-label=\{`\$\{S\.allow\}/);
    const agents = card.slice(card.indexOf("{m.agentsAsk && ("), card.indexOf("{m.approvals.map((a) => { const w = approvalWords(a, project); return ("));
    expect(agents).toContain('data-safe onClick={() => { void send(answerAgents(project, "no"))');
    const stuck = card.slice(card.indexOf("{m.stuck && ("), card.indexOf("{m.paused && ("));
    expect(stuck).toContain('data-safe={o.id === "stop" || undefined}');
    // takeIfLost moves the keyboard only when nothing in Home has it (focus.test.ts runs it on a stand in page).
    for (const a of [{ tag: "BUTTON" }, { tag: "INPUT" }, { tag: "TEXTAREA" }]) expect(focusLost(a, true), a.tag).toBe(false);
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
    expect(focusLost(null, false), `${PRODUCT} never takes the keyboard (rule 9)`).toBe(false);
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
  // Home: card.tsx and its Settings tab (settingsPage.tsx, T16).
  const card = read("./card.tsx") + "\n" + read("./settingsPage.tsx");
  // Every "are you sure" in Home: it takes the keyboard to its safe choice, keeps Tab inside, Esc takes it away, and
  // the keyboard goes back to the button that opened it.
  const SURE = ["S.deleteSure", "S.keyRemoveSure", "S.memoryEraseSure", "S.liveSure", "S.rollSure", "S.undoSure", "S.bisectUndoSure("];
  test("every are you sure of the practice projects (Undo, Start over, Remove my copy, all copies to the Trash) is a ConfirmStep, each one", () => {
    // The practice panel and the list (practicePanel.tsx) are part of Home; Settings has Move all my practice copies.
    const pages = read("./practicePanel.tsx") + "\n" + read("./settingsPage.tsx");
    let n = 0;
    for (const s of ["S.undoSure", "S.practiceStartOverSure", "S.practiceRemoveSure", "S.practiceRemoveAllSure"]) {
      for (let at = pages.indexOf(`label={${s}}`); at >= 0; at = pages.indexOf(`label={${s}}`, at + 1)) {
        n++;
        const open = pages.lastIndexOf("<ConfirmStep", at);
        expect(open, `${s} is a ConfirmStep's label`).toBeGreaterThan(-1);
        expect(pages.slice(open, at), `${s} is on the step itself`).not.toContain(">");
        const block = pages.slice(open, pages.indexOf("</ConfirmStep>", at));
        const back = /back=\{(\w+)\}/.exec(block)?.[1];
        expect(back, `${s} has a way back`).toBeTruthy();
        expect(pages, `${s}: the opener carries id={${back}}`).toContain(`id={${back}}`);
        expect(block, `${s} has onCancel`).toMatch(/onCancel=\{/);
        expect(block, `${s}: the safe choice is marked`).toMatch(/data-cancel|<CancelButton /);
      }
    }
    expect(n).toBe(6);
  });
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
      // The opener carries that id itself, or is a danger zone row given it (settingsPage.tsx DangerZone `row(id, ...)`).
      expect(card, `${s}: the opener carries id={${back}}`).toMatch(new RegExp(`id=\\{${back}\\}|row\\(${back},`));
      expect(block, `${s} has onCancel`).toMatch(/onCancel=\{/);
      expect(block, `${s}: the safe choice is marked`).toMatch(/data-cancel|<CancelButton /);
    }
    // The safe choice part: a Button with `cancel`, which the part marks data-cancel.
    expect(card).toContain("return <Button cancel disabled={disabled} onClick={onClick}>{S.planCancel}</Button>;");
    expect(read("./ui/parts.tsx")).toContain("data-cancel={cancel || undefined}");
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
    // Back to the open place's round button, or on Now (which has none) the ask box.
    expect(card).toContain("keepFocus(el, () => placeEl(tabNow.current))");
    expect(card).toContain('const placeEl = (t: Tab): HTMLElement | null => document.getElementById(tabId(t)) ?? (t === "now" ? box.current : null);');
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
    expect(card).toContain("useEffect(() => { takeIfLost(() => placeEl(home.tab)); }, [home.tab]);");
  });
  test("a box put away with Esc gives the keyboard back to the button that opened it", () => {
    for (const box of ["S.openLinkLabel", "S.memoryEdit}: ${l.text}"]) {
      const at = card.indexOf(box);
      expect(at, box).toBeGreaterThan(-1);
      const line = card.slice(card.lastIndexOf("\n", at), card.indexOf("\n", at));
      expect(line, box).toMatch(/e\.key === "Escape"\) \{ e\.stopPropagation\(\); [^}]*focusBack\(/);
    }
    // A sheet (the new key in Settings, the lists, the keys) closes with Esc too, and gives the keyboard back to the button
    // that opened it, by the same rule (focus.ts takeIfLost).
    const sheet = body(read("./ui/parts.tsx"), "Sheet");
    expect(sheet).toContain('e.key === "Escape"');
    expect(sheet).toContain("takeIfLost(() => opener.current");
  });
  test("taking a file off the ask box gives the keyboard back to the box, and what was added or taken away is said", () => {
    // The Remove button goes with its chip, so the keyboard would fall out of Home: it goes back to the box (focus.ts).
    const remove = card.split("\n").find((l) => l.includes("label={S.attachRemove(a.name)}"))!;
    expect(remove).toContain("focusBack(askId)");
    expect(remove).not.toContain(".focus(");
    expect(remove).toContain("setAttachSaid(S.attachRemoved(a.name))");
    expect(card).toMatch(/<textarea ref=\{box\} id=\{askId\}/);
    // One polite line, there before anything is added, says what a paste or a drop added.
    expect(card).toContain('<div className="sr" role="status">{attachSaid}</div>');
    expect(card).toMatch(/setAttachSaid\(addedLine\(fresh\.filter\(\(f\) => next\.includes\(f\)\)\)\)/);   // only what this drop really added (A66)
  });
  test("Copy keeps its name and says Copied, or why it could not, on a polite line that is there first", () => {
    const btn = card.slice(card.indexOf("function CopyButton("), card.indexOf("function ResearchNote("));
    expect(btn).toContain("aria-label={label}");
    expect(btn).toContain('<span className={state === "failed" ? "line" : "sr"} role="status">{state === "copied" ? S.copied : state === "failed" ? S.copyFailed : ""}</span>');
    expect(btn).not.toMatch(/state === "failed" && </);
  });
  test("the count of a search in What I did is said from the first search on", () => {
    const panel = card.slice(card.indexOf("function HistoryPanel("), card.indexOf("function MemoryList("));
    expect(panel).toMatch(/\{items\.length > 0 && <div className=\{filtering \? "line muted" : "sr"\} role="status" aria-live="polite">/);
    expect(panel).not.toMatch(/\{filtering && <div[^>]*role="status"/);
  });
  test("each settings row is a named group, so VoiceOver and the keyboard know where they are", () => {
    const page = read("./settingsPage.tsx"), parts = read("./ui/parts.tsx");
    const fn = (src: string, name: string) => src.slice(src.indexOf(`function ${name}`), src.indexOf("\n}\n", src.indexOf(`function ${name}`)));
    // Each setting is a Row (ui/parts.tsx), a group named by its own label; each page's group and each More topic is a
    // Group (named by its title) or a Disclosure; the parts that are not settings are Rows in those Groups.
    const row = fn(page, "SettingRow(");
    expect(row).toContain("<Row id={anchor} label={r.label}");
    expect(row).toContain("labelId={labelId}");
    expect(fn(parts, "Row(")).toContain('<div role="group" aria-labelledby={lid} className="ui-row"');
    expect(fn(page, "GroupView(")).toContain("<Group id={id} title={title || undefined} footer={foot}>");
    expect(fn(page, "TopicView(")).toContain("<Disclosure id={topic.id}");
    expect(fn(parts, "Disclosure(")).toContain('<button type="button" className="ui-disc-head" aria-expanded={open} aria-controls={bodyId}');
    const settings = page.slice(page.indexOf("// ---------- the parts that are not settings ----------"));
    expect(settings.match(/<Row id=\{fixedAnchor\("\w+"\)\}/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(page).not.toMatch(/<h3 className="google-head"|className="line"|className="row"/);
    const g = fn(parts, "Group(");
    expect(g).toMatch(/<section className="ui-group" id=\{id\} aria-labelledby=\{title \? hid : undefined\}/);
    expect(g).toMatch(/<h3 className="ui-group-title" id=\{hid\}>/);
    // Switches say on or off to VoiceOver; choices are a radio group the arrows move through, or a menu past three.
    expect(row).toContain("<Switch id={switchId} checked={value === true} labelledBy={labelId}");
    expect(fn(parts, "Switch(")).toContain('role="switch" className="ui-switch" aria-checked={checked}');
    const choice = fn(page, "ChoiceControl(");
    expect(choice).toContain("<Segmented labelledBy={labelId}");
    expect(choice).toContain("<Menu labelledBy={labelId}");
    const seg = fn(parts, "Segmented<");
    expect(seg).toContain('role="radiogroup"');
    expect(seg).toContain('role="radio" className="ui-seg-opt" aria-checked={o.id === value} tabIndex={i === at ? 0 : -1}');
    expect(seg).toContain("moveIndex(e.key, at, options.length)");
    const logic = read("./ui/partsLogic.ts");
    for (const k of ["ArrowRight", "ArrowLeft", "Home", "End"]) expect(logic).toContain(k);
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
    const css = rules(ALL_CSS());
    const ring = css.find((r) => r.sel === ":focus-visible" && !r.media);
    expect(ring?.decl.outline).toBe("var(--ring) solid var(--focus)");
    expect(rules(TOKENS_CSS()).find((r) => r.sel === ":root" && !r.media)!.decl["--ring"]).toBe("2px");
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

describe("text, controls and marks meet WCAG AA in Night (Graphite), Paper and Deep (part 4)", () => {
  // The look's tokens are in ui/tokens.css: Night, now called Graphite (M51), on :root (the usual theme, every page), Paper
  // on :root[data-theme="paper"] and Deep on :root[data-theme="deep"] (look.theme, Home and Settings only), and each with
  // the Mac's More contrast. Every rule of the stylesheets is read.
  const css = rules(ALL_CSS());
  const tokRules = rules(TOKENS_CSS());
  const decls = (sel: string, media: RegExp | null) => Object.fromEntries(Object.entries(tokRules.find((r) => r.sel === sel && (media ? media.test(r.media ?? "") : !r.media))?.decl ?? {}).filter(([k]) => k.startsWith("--")));
  const night = decls(":root", null), paper = { ...night, ...decls(':root[data-theme="paper"]', null) }, deep = { ...night, ...decls(':root[data-theme="deep"]', null) };
  const more = /prefers-contrast: more/;
  const themes: [string, Record<string, string>][] = [["Night", night], ["Paper", paper], ["Deep", deep],
    ["Night, more contrast", { ...night, ...decls(":root", more) }], ["Paper, more contrast", { ...paper, ...decls(':root[data-theme="paper"]', more) }],
    ["Deep, more contrast", { ...deep, ...decls(':root[data-theme="deep"]', more) }]];
  const one = (sel: string) => css.find((r) => r.sel === sel && !r.media);
  const ISLAND = /island|\.lip|\.mark|\.peekline|\.pillrow/;
  // Disabled words need not be read (WCAG 1.4.3 leaves them out); they are the only place --fg-3 may colour words.
  const DISABLED = /:disabled|\[data-disabled\]|\[aria-disabled/;
  test("Night (Graphite) is the usual theme on every page, Paper and Deep are the others, and the Mac's light or dark changes nothing", () => {
    // The graphite look (M51, the founder, 1 Nov 2026): the usual page is #111111, Paper's is white, Deep's a dark sea blue.
    expect(night["--bg"]).toBe("#111111");
    expect(paper["--bg"]).toBe("#FFFFFF");
    expect(deep["--bg"]).toBe("#0B1622");
    expect(css.some((r) => /prefers-color-scheme/.test(r.media ?? "")), "no rule follows the Mac's light or dark").toBe(false);
    // Deep was hidden until it had a full, tested look (founder call 3, T17); M51 offers it, with every check here run on it.
    expect(TOKENS_CSS()).toContain(':root[data-theme="deep"] {');
    expect(themes.map(([n]) => n)).toEqual(expect.arrayContaining(["Deep", "Deep, more contrast"]));
    expect(themes[1][1]["--bg"]).not.toBe(night["--bg"]);
  });
  test("--fg-3 colours only disabled words and marks, never words that must be read", () => {
    for (const r of css) if (/var\(--fg-3\)/.test(r.decl.color ?? "")) expect(DISABLED.test(r.sel), r.sel).toBe(true);
  });
  // A drawing (an icon, a tick, a mark) is not words: it reaches 3 to 1, not 4.5 (WCAG 1.4.11).
  const MARK = /-mark\b|\.ic\b|-tick\b/;
  for (const [theme, tokens] of themes) {
    const c = (v: string) => parseColor(v, tokens);
    const bg = c("var(--bg)");
    // A value with a size in it ("var(--hair) solid var(--edge-control)"): its tokens read first, then its colour found.
    const res = (v: string) => v.replace(/var\((--[\w-]+)\)/g, (m, k) => (/^-?[\d.]+(px|rem|em|%)?$/.test(tokens[k] ?? "") ? tokens[k] : m));
    const col = (v: string) => colourIn(res(v));
    const SURFACES = ["--bg", "--surface-1", "--surface-2", "--surface-3", "--inset"];
    test(`${theme}: the readable words reach 4.5 to 1 on every surface, and the main button's words on its fill`, () => {
      for (const s of SURFACES) for (const w of ["--fg", "--fg-2"]) expect(ratio(c(`var(${w})`), c(`var(${s})`)), `${w} on ${s}`).toBeGreaterThanOrEqual(4.5);
      for (const s of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(c("var(--bad)"), c(`var(${s})`)), `--bad words on ${s}`).toBeGreaterThanOrEqual(4.5);
      for (const f of ["--main", "--main-hover", "--main-press"]) expect(ratio(c("var(--main-ink)"), c(`var(${f})`)), `the main button's words on ${f}`).toBeGreaterThanOrEqual(4.5);
      for (const f of ["--silver", "--silver-hover", "--silver-press"]) expect(ratio(c("var(--silver-ink)"), c(`var(${f})`)), `words on ${f}`).toBeGreaterThanOrEqual(4.5);
    });
    test(`${theme}: marks, control edges and the focus ring reach 3 to 1`, () => {
      for (const s of ["--bg", "--surface-1", "--surface-2"]) {
        const under = c(`var(${s})`);
        for (const m of ["--ok", "--amber", "--bad", "--water", "--focus", "--fg"]) expect(ratio(over(c(`var(${m})`), under), under), `${m} on ${s}`).toBeGreaterThanOrEqual(3);
        // A field's edge and a switch that is off are found by their edge; the off knob by its own grey.
        for (const m of ["--edge-control", "--knob-off"]) expect(ratio(over(c(`var(${m})`), under), under), `${m} on ${s}`).toBeGreaterThanOrEqual(3);
      }
      expect(ratio(over(c("var(--edge-control)"), c("var(--inset)")), c("var(--surface-1)")), "a field's edge between its fill and the card").toBeGreaterThanOrEqual(3);
      // A switch that is on: the filled track against the card, and its knob against the track.
      expect(ratio(c("var(--fg)"), c("var(--bg)")), "the on knob on its track").toBeGreaterThanOrEqual(3);
    });
    test(`${theme}: every rule that sets a text colour is readable on what is behind it (4.5 to 1)`, () => {
      let checked = 0;
      for (const r of css) {
        if (r.media || !r.decl.color || /inherit|currentColor|CanvasText/.test(r.decl.color) || DISABLED.test(r.sel)) continue;
        const own = colourIn(r.decl.background ?? r.decl["background-color"] ?? "");
        const behind = own ? over(c(own), ISLAND.test(r.sel) ? c("#000") : bg) : ISLAND.test(r.sel) ? c("#000") : bg;
        const fg = over(c(r.decl.color), behind);
        expect(ratio(fg, behind), `${theme} ${r.sel}: ${r.decl.color} on ${own ?? "the page"}`).toBeGreaterThanOrEqual(MARK.test(r.sel) ? 3 : 4.5);
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
    });
    test(`${theme}: every button stays readable still, under the pointer and pressed`, () => {
      const fill = (sel: string) => { const v = colourIn(one(sel)?.decl.background ?? ""); expect(v, `${sel} has a fill`).toBeTruthy(); return over(c(v!), bg); };
      const words = (sel: string) => c(one(sel)!.decl.color);
      // The Button part: the usual (secondary) one, quiet, danger, and the one main button.
      for (const s of [".btn:hover:not(:disabled)", ".btn:active:not(:disabled)"]) expect(ratio(words(".btn"), fill(s)), s).toBeGreaterThanOrEqual(4.5);
      expect(ratio(words(".btn.quiet"), bg), "a quiet button").toBeGreaterThanOrEqual(4.5);
      for (const s of [".btn.danger:hover:not(:disabled)", ".btn.danger:active:not(:disabled)"]) expect(ratio(words(".btn.danger"), fill(s)), s).toBeGreaterThanOrEqual(4.5);
      for (const s of [".btn.primary", ".btn.primary:hover:not(:disabled)", ".btn.primary:active:not(:disabled)"]) expect(ratio(words(".btn.primary"), fill(s)), s).toBeGreaterThanOrEqual(4.5);
      // The Pro tag inside the main button (Home's Check before going live): the button's own words and an edge in them,
      // never the faint second ink on the silver or ink fill.
      expect(one(".btn.primary .pro-tag")?.decl.color, "the Pro tag takes the main button's words").toBe("inherit");
      expect(one(".btn.primary .pro-tag")?.decl["border-color"]).toBe("currentColor");
      for (const s of [".btn.primary", ".btn.primary:hover:not(:disabled)", ".btn.primary:active:not(:disabled)"]) expect(ratio(words(".btn.primary"), fill(s)), `the Pro tag on ${s}`).toBeGreaterThanOrEqual(4.5);
      // The sidebar, a menu's items and a recent fix: the words on their hover and selected fills.
      for (const s of [".sb-item:hover", ".sb-item:active", '.sb-item[aria-current="page"]']) expect(ratio(words(".sb-item"), fill(s)), s).toBeGreaterThanOrEqual(4.5);
      expect(ratio(words(".ui-menu-item"), over(c(colourIn(one(".ui-menu-item[data-active]")!.decl.background)!), c("var(--surface-2)"))), "a menu item under the pointer").toBeGreaterThanOrEqual(4.5);
      for (const s of [".ui-recent:hover", ".ui-recent:active"]) expect(ratio(words(".ui-recent-name"), fill(s)), s).toBeGreaterThanOrEqual(4.5);
      // The open place's quiet button in Home's top bar (F28): its words on its fill.
      expect(ratio(words('.btn.quiet[aria-pressed="true"]'), fill('.btn.quiet[aria-pressed="true"]')), "the open place").toBeGreaterThanOrEqual(4.5);
      // Home's back arrow, the one button of its own left (the places, Undo, Stop and the quick actions are Buttons now).
      for (const [still, hover] of [[".back", ".back:hover"]]) {
        const fg = words(still);
        expect(ratio(fg, fill(still)), still).toBeGreaterThanOrEqual(4.5);
        expect(ratio(c(one(hover)!.decl.color ?? one(still)!.decl.color), fill(hover)), hover).toBeGreaterThanOrEqual(4.5);
      }
    });
    test(`${theme}: the marker reads as a highlighter, a clear yellow, and its words reach 4.5 to 1 on it (M51)`, () => {
      for (const s of ["--bg", "--surface-1", "--surface-2", "--inset"]) {
        const m = over(c("var(--marker)"), c(`var(${s})`));
        expect(ratio(c("var(--marker-ink)"), m), `the marker's words on it, over ${s}`).toBeGreaterThanOrEqual(4.5);
        // A highlighter, not an olive: red and green high and close, blue well under them (a muddy olive is dark).
        const [r, g, b] = m;
        expect(Math.min(r, g), `the marker over ${s} is bright`).toBeGreaterThanOrEqual(200);
        expect(Math.abs(r - g), `the marker over ${s} is yellow, not orange or lime`).toBeLessThanOrEqual(40);
        expect(Math.min(r, g) - b, `the marker over ${s} is saturated`).toBeGreaterThanOrEqual(60);
      }
    });
    test(`${theme}: what was added or removed in a diff is readable on its tint`, () => {
      for (const s of [".added", ".removed"]) {
        const tint = over(c(colourIn(one(s)!.decl.background)!), bg);
        expect(ratio(c("var(--fg)"), tint), s).toBeGreaterThanOrEqual(4.5);
      }
    });
    test(`${theme}: the focus ring, a box's edge and the open place stand out (3 to 1)`, () => {
      expect(res(one(":focus-visible")!.decl.outline)).toMatch(/^2px solid /);
      expect(ratio(c(col(one(":focus-visible")!.decl.outline)!), bg), "focus ring").toBeGreaterThanOrEqual(3);
      expect(ratio(c(colourIn(one(".character:focus-visible")!.decl.outline)!), bg), "the character's focus ring").toBeGreaterThanOrEqual(3);
      // A button is found by its words (4.5 to 1 above), so its edge is a hairline; the main button by its fill.
      expect(ratio(over(c(colourIn(one(".btn.primary")!.decl.background)!), bg), bg), "the main button's fill").toBeGreaterThanOrEqual(3);
      // Every box a person types in is found by its edge.
      for (const s of [".ui-field", ".ui-stepper-box", ".ask textarea", '.ask input, .row input[type="text"]', '.row input[type="search"]', ".home .ask"]) {
        expect(ratio(over(c(col(one(s)!.decl.border)!), bg), bg), `${s}'s edge`).toBeGreaterThanOrEqual(3);
      }
      // The open place's button in Home (F28, a quiet Button with words): filled and in full --fg, while the others are
      // --fg-2 with no fill, so it is never told by a tint alone; the place's own title beside the back arrow names it too.
      const s = '.btn.quiet[aria-pressed="true"]';
      expect(one(s)!.decl.color).toBe("var(--fg)");
      expect(one(s)!.decl.background).toBe("var(--surface-2)");
      expect(one(".btn.quiet")!.decl.color).toBe("var(--fg-2)");
      expect(read("./card.tsx")).toContain('<h1 id="home-title" className="view-title">{viewTitle}</h1>');
      // The open page in Settings is a filled row, and its name is bold too, so it is never shown by a tint alone.
      expect(one('.sb-item[aria-current="page"]')!.decl["font-weight"]).toBe("var(--w-strong)");
      // The option the arrow keys are on in an open menu: a ring as well as its fill, 3 to 1 on the fill and on the list
      // (the fill alone is about 1.1 to 1; review, 31 Oct).
      const ring = c(col(one(".ui-menu-list:focus .ui-menu-item[data-active]")!.decl.outline)!);
      for (const s2 of ["--surface-2", "--surface-3"]) expect(ratio(ring, c(`var(${s2})`)), `the active option's ring on ${s2}`).toBeGreaterThanOrEqual(3);
      // A button kept pressed (the key a job uses, in Change keys) of any kind: filled, and edged in --fg, 3 to 1 on the card
      // and the sheet; its words stay readable on the fill.
      const pressed = one('.btn[aria-pressed="true"]')!;
      for (const s2 of ["--surface-1", "--surface-2"]) expect(ratio(c(pressed.decl["border-color"]), c(`var(${s2})`)), `a pressed button's edge on ${s2}`).toBeGreaterThanOrEqual(3);
      expect(ratio(c(one(".btn")!.decl.color), c(pressed.decl.background)), "a pressed button's words").toBeGreaterThanOrEqual(4.5);
    });
    test(`${theme}: the dot on a place that waits for the person stands out on the place, still or under the pointer (3 to 1)`, () => {
      // For sighted people the dot is the only sign another place needs them (VoiceOver hears the words beside it).
      const dot = c(one(".tabdot")!.decl.background);
      expect(ratio(dot, bg), "on the page").toBeGreaterThanOrEqual(3);
      expect(one(".back .tabdot")!.decl["box-shadow"]).toBe("0 0 0 2px var(--bg)");
    });
    test(`${theme}: a disabled control's words are exempt from 4.5 to 1 but stay legible (3 to 1), and still look disabled`, () => {
      const ink = c("var(--ink-disabled)"), fill = c("var(--fill-disabled)");
      // On the disabled fill (a secondary or main button, a field, a stepper, a picture choice) and with no fill (a quiet
      // or icon button, a disabled row's label) on the page, a card and a sheet.
      for (const under of [fill, ...["--bg", "--surface-1", "--surface-2"].map((s) => c(`var(${s})`))]) expect(ratio(ink, under)).toBeGreaterThanOrEqual(3);
      // A disabled switch: its knob against its track, off and on.
      expect(ratio(ink, fill), "a disabled knob on its track").toBeGreaterThanOrEqual(3);
      // Still told apart from a control in use: fainter than every readable word, and a fill of its own.
      expect(ratio(ink, fill)).toBeLessThan(ratio(c("var(--fg-2)"), fill));
      expect(tokens["--fill-disabled"]).toBe("var(--surface-3)");
      // Every disabled rule draws with these two, never --fg-3 or a fade.
      for (const r of css) if (DISABLED.test(r.sel.replace(/:not\([^)]*\)/g, ""))) {
        expect(r.decl.opacity, r.sel).toBeUndefined();
        if (r.decl.color) expect(r.decl.color, r.sel).toMatch(/^(var\(--ink-disabled\)|var\(--fill-disabled\))$/);
      }
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
  const css = rules(ALL_CSS());
  // Fixed heights only on things that hold no words, or whose size the shell sets to the point (the island's own window).
  const NO_WORDS = [".job-bar", ".home-pond .ch-water .waterline, .companion-hero .ch-water .waterline", ".home-pond .ch-water .waterline svg, .companion-hero .ch-water .waterline svg", "details.more > summary::after", ".character", ".tabdot", ".panel.amber > h2::before", ".mark", ".lip .mark", ".check input", ".panel progress", ".sr", ".island", ".island-hit", ".lip", "html.island-page, body.island-page", ".island-flow", ".island-panel .ip-agent.ff-mini", ".island-peek", '.island-wing .mark[data-mark="dots"]', '.island-wing .mark[data-mark="bars"]', '.island-wing .mark[data-mark="tick"]', '.island-wing .mark[data-mark="dots"] i', '.island-wing .mark[data-mark="arc"]', '.island-wing .mark[data-mark="look"]', '.island-wing .mark[data-mark="bars"] i', '.setting button[role="switch"]::after', ".island-panel::after", ".fr-tank .waterline", ".fr-tank .waterline svg", ".fr-hello .fr-drop", ".fr-hello .fr-ripple", ".fr-tog::after", ".companion-hero .ch-water .waterline", ".companion-hero .ch-water .waterline svg", ".island-panel .ip-job[data-tone=\"working\"]::after"];
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
    const rows = css.filter((r) => [".row", ".tabs", ".bar", ".places"].includes(r.sel));
    expect(rows.map((r) => r.sel), "Home's top bar and its places wrap too (Huge text at 640 wide; review, 31 Oct)").toEqual(expect.arrayContaining([".bar", ".places"]));
    // A row wraps to a new line; the places are a column down the side, where each word wraps inside its own place.
    for (const r of rows) if (r.decl["flex-direction"] !== "column") expect(r.decl["flex-wrap"], `${r.sel} wraps to a new line`).toBe("wrap");
  });
  test("no page sets a height or a font size inline, out of reach of the stylesheet", () => {
    for (const f of PAGES) expect(read(`./${f}`), f).not.toMatch(/style=\{\{[^}]*(height|fontSize)/);
  });
  // The island is the notch's size and its words are cut to fit it (island.rs sizes the window to the point), so it keeps
  // its own sizes; the full status is in Home and in the island's name for VoiceOver.
  const ISLAND_SIZE = /island|\.lip|\.peekline|\.pillrow/;
  test("every word in Home is sized from the one root size (rem), so the text size choice reaches all of them", () => {
    let sized = 0;
    // The type scale is a set of tokens (--t-*), each in rem; a rule that names one is read as the size it stands for.
    const tokens = css.find((x) => x.sel === ":root" && !x.media)!.decl;
    const scale = Object.entries(tokens).filter(([k]) => k.startsWith("--t-"));
    expect(scale.length, "the type scale").toBeGreaterThanOrEqual(5);
    for (const [k, v] of scale) expect(v, `${k} follows the text size`).toMatch(/rem/);
    const resolve = (v: string) => v.replace(/var\((--[\w-]+)\)/g, (_, k) => tokens[k] ?? "");
    for (const r of css) {
      if (ISLAND_SIZE.test(r.sel)) continue;
      const fs = resolve(r.decl["font-size"] ?? ""), font = resolve(r.decl.font ?? "");
      if (r.sel.startsWith(":root")) { expect(fs + font, r.sel).toMatch(/^(\d+px)?(\d+px -apple-system.*)?$/); continue; }
      expect(fs, `${r.sel} { font-size: ${fs} } does not follow the text size: use rem`).not.toMatch(/\d(px|pt)\b/);
      expect(font, `${r.sel} { font: ${font} } does not follow the text size: use rem`).not.toMatch(/\d(px|pt)\b/);
      expect(r.decl["line-height"] ?? "", r.sel).not.toMatch(/\d(px|pt)\b/);
      if (/rem/.test(fs + font)) sized++;
    }
    expect(sized, "the words in Home that have a size of their own").toBeGreaterThanOrEqual(10);
  });
  test("each text size is a root size in ui/tokens.css, bigger at each step; Standard is the size Home always had", () => {
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
    expect(last, "the biggest reaches twice the usual size (WCAG 1.4.4, 200 percent)").toBeGreaterThanOrEqual(28);
    expect(css.some((x) => x.sel === ':root[data-text="standard"]'), "Standard needs no rule of its own").toBe(false);
  });
  test("Home puts the saved size on before it draws, and Settings changes it there", () => {
    const card = read("./card.tsx");
    const draw = card.indexOf("createRoot(");
    expect(card.indexOf("applyTextSize(textSize());"), "before the first draw").toBeGreaterThan(-1);
    expect(card.indexOf("applyTextSize(textSize());")).toBeLessThan(draw);
    // Settings changes it through the registry (display.textSize, a choice row); Home follows what is in force.
    expect(card).toContain('const size = useSetting("display.textSize");');
    expect(card).toContain("useEffect(() => { applyTextSize(textSizeFrom(size)); }, [size]);");
    expect(read("./settingsPage.tsx")).toContain('case "choice": return <ChoiceControl');
    // Only Home: the character's window and the island keep their sizes.
    for (const f of ["./dock.tsx", "./island.tsx", "./overlay.ts"]) expect(read(f), f).not.toContain("applyTextSize");
  });
});

describe("the notch panel keeps Night's tokens on its black in every theme (review, 31 Oct)", () => {
  // The notch is the hardware notch, black in every theme. Its panel is drawn from the same parts as Home (Button,
  // VerdictLine, ProofChips), which read --fg and friends, so the island page must never take Paper's dark words.
  const tokRules = rules(TOKENS_CSS());
  const night = Object.fromEntries(Object.entries(tokRules.find((r) => r.sel === ":root" && !r.media)!.decl).filter(([k]) => k.startsWith("--")));
  const c = (v: string) => parseColor(v, night);
  test("the island page asks for the notch's look, which pins Night whatever look.theme says", () => {
    expect(read("./island.tsx")).toContain("useLook({ keepNight: true });");
    const hook = read("./useLook.ts");
    expect(hook).toContain('const theme = opts.keepNight ? "night" : chosen;');
    expect(hook).toContain("applyLook(document.documentElement, water, theme);");
  });
  test("every part the panel uses reads on the notch black and on its card (#111113)", () => {
    for (const under of ["#000", "#111113"]) {
      const u = c(under);
      for (const w of ["--fg", "--fg-2"]) expect(ratio(c(`var(${w})`), u), `${w} words on ${under}`).toBeGreaterThanOrEqual(4.5);
      for (const m of ["--ok", "--amber", "--bad", "--focus", "--edge-control"]) expect(ratio(over(c(`var(${m})`), u), u), `${m} on ${under}`).toBeGreaterThanOrEqual(3);
      // "Add your key", the notch's one main button: silver on black, and its words on the silver.
      expect(ratio(c("var(--main)"), u), `the main button's fill on ${under}`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(c("var(--main-ink)"), c("var(--main)"))).toBeGreaterThanOrEqual(4.5);
  });
});
