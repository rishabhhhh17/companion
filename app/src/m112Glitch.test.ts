// M112, first: the glitch the founder saw on 16 Nov 2026 (docs/milestones/M112-squibby-notch-look.md, "The glitch"). The
// opened notch showed two panels at once: the small chat, and under it, cut off by the window's edge, Home's own ask box
// with its project chip. And Flowflow's word beside it ("Looking at yo...") was cut off by its own window's edge.
// The causes, found by reproducing it with the tall Home (look.layout tall, the founder's):
//  1. system.css shows the work column (`.home:not([data-side]):not([data-view="settings"]) .work:has(> .askwrap)`,
//     specificity 0,5,0) over the chat's hide rule (`.home[data-chat] > .inner > :not(.notch-chat)`, 0,4,0), so the whole
//     of Home was laid out under the chat. Home's main scrolls (overflow auto), so a scroll or a focus brought it into view.
//  2. The build's CSS minifier drops `translate` from a rule that also sets `transform`: the label kept `left: 50%` with no
//     `-50%`, so it hung half its width to the right of the character and was cut by the window.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { ALL_CSS, BLACK_CSS, STYLE_CSS, SYSTEM_CSS, WIDE_CSS } from "./ui/cssFiles.ts";
import { chatAsk, chatAskFull, chatProject, chatRowProject, chatShortProject, CHAT_NAME_MAX, CHAT_ROW_MAX } from "./notchChat.ts";
import { S } from "./strings.ts";

type Rule = { sel: string; decl: [string, string][]; at: string | null };
function parse(css0: string, at: string | null = null): Rule[] {
  const css = css0.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@import [^;]+;$/gm, "");
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, close = open;
    for (; close < css.length; close++) { if (css[close] === "{") depth++; else if (css[close] === "}" && --depth === 0) break; }
    const head = css.slice(i, open).trim(), body = css.slice(open + 1, close);
    if (head.startsWith("@")) { if (!head.startsWith("@keyframes")) out.push(...parse(body, head)); }
    else out.push({ sel: head, decl: body.split(";").map((d) => { const c = d.indexOf(":"); return [d.slice(0, c).trim(), d.slice(c + 1).trim()] as [string, string]; }).filter(([k]) => k), at });
    i = close + 1;
  }
  return out;
}
const value = (r: Rule, k: string) => r.decl.find(([p]) => p === k)?.[1];

describe("the glitch: exactly one panel shows when the notch opens", () => {
  const all = parse(ALL_CSS());
  const hide = parse(BLACK_CSS()).find((r) => r.sel === ".home[data-chat] > .inner > :not(.notch-chat)");

  test("while the chat shows, everything else in Home is hidden whatever any other rule says", () => {
    expect(hide).toBeTruthy();
    // !important: no selector, however specific, can lay the rest of Home out under the chat again.
    expect(value(hide!, "display")).toBe("none !important");
    // And nothing else in any stylesheet shows a part of Home with !important (that alone could beat it).
    const loud = all.filter((r) => r !== hide && /!important/.test(value(r, "display") ?? "") && !/none/.test(value(r, "display") ?? "")
      && r.sel.split(",").some((s) => /\.home\b/.test(s) && /\.(work|askwrap|inner|bar|view)\b/.test(s)));
    expect(loud.map((r) => r.sel)).toEqual([]);
  });

  test("the chat never scrolls Home's hidden parts into view: Home itself does not scroll while it shows", () => {
    const own = all.filter((r) => r.sel.split(",").map((s) => s.trim()).includes(".home[data-chat]"));
    // clip, not hidden: a clipped box cannot be scrolled even by a focus or a script (and bigger text still grows Home).
    expect(own.some((r) => value(r, "overflow") === "clip")).toBe(true);
  });

  test("the rule that showed Home's work column under the chat is the one now beaten (it still lays out tall Home)", () => {
    const work = all.find((r) => r.sel.startsWith(".home:not([data-side]):not([data-view=\"settings\"]) .work:has(> .askwrap)"));
    expect(work && value(work, "display")).toBe("flex");
  });
});

describe("the glitch: nothing is cut by a window's edge", () => {
  test("no rule sets translate and transform together (the build keeps only the transform)", () => {
    const dir = new URL("./ui/", import.meta.url);
    const sheets = [STYLE_CSS(), ...readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(new URL(f, dir), "utf8"))];
    const both = sheets.flatMap((s) => parse(s)).filter((r) => r.decl.some(([k]) => k === "translate") && r.decl.some(([k]) => k === "transform"));
    expect(both.map((r) => r.sel)).toEqual([]);
  });

  test("the character's word is centred under it and never wider than its window", () => {
    const label = parse(STYLE_CSS()).find((r) => r.sel === ".dock-label")!;
    expect(value(label, "transform")).toMatch(/translateX\(-50%\)/);
    const shown = parse(STYLE_CSS()).find((r) => r.sel === ".dock-label[data-shown]")!;
    expect(value(shown, "transform")).toMatch(/translateX\(-50%\)/);
    // Bounded by the window's own width, so a long word wraps inside it instead of running past its edge.
    expect(value(label, "max-width")).toMatch(/100vw/);
  });

  test("a long project name is shortened with an ellipsis inside the chat, in its row and in the field's hint", () => {
    const long = "/Users/me/Squibby practice signup page for the spring launch campaign";
    const name = chatShortProject(long);
    expect(name.length).toBeLessThanOrEqual(CHAT_NAME_MAX);
    expect(name.endsWith("…")).toBe(true);
    expect(chatAsk(long)).toBe(S.m96.chat.askAbout(name));
    // Never two ellipses, or an ellipsis and a full stop, after a shortened name.
    expect(chatAsk(long)).not.toMatch(/…[.…]/);
    expect(S.m96.chat.empty(name)).not.toMatch(/…[.…]/);
    // A name that fits is left as it is.
    expect(chatShortProject("/Users/me/signup-page")).toBe("signup-page");
    expect(chatProject("")).toBe("");
    // M112 review: the top row has more room than the hint (shot 3f), so it keeps up to CHAT_ROW_MAX letters.
    expect(CHAT_ROW_MAX).toBeGreaterThan(CHAT_NAME_MAX);
    const row = chatRowProject(long);
    expect(row.length).toBeLessThanOrEqual(CHAT_ROW_MAX);
    expect(row.length).toBeGreaterThan(name.length);
    expect(row.endsWith("…")).toBe(true);
    // The top row's name may shrink beside the hello, and wraps inside the row at a bigger text size (never cut by the edge).
    const proj = parse(BLACK_CSS()).find((r) => r.sel === ".notch-chat .nc-proj")!;
    expect(value(proj, "min-width")).toBe("0");
  });

  test("the whole project name can always be read: the top row's name, its tooltip and the field's spoken name are never shortened", () => {
    const long = "/Users/me/Squibby practice signup page for the spring launch campaign";
    expect(chatProject(long)).toBe("Squibby practice signup page for the spring launch campaign");
    expect(chatAskFull(long)).toBe(S.m96.chat.askAbout("Squibby practice signup page for the spring launch campaign"));
    expect(chatAskFull("")).toBe(S.m96.chat.ask);
    const tsx = readFileSync(new URL("./notchChat.tsx", import.meta.url), "utf8");
    // The tooltip has the whole name; VoiceOver reads the whole name, never the shortened words.
    // Changed on purpose (round 2): the shown name is fitted to the row's room (fit ?? shown) and the element is measured
    // (ref); the tooltip and VoiceOver still have the whole name.
    expect(tsx).toContain('<span className="nc-proj" ref={projRef} title={C.project(name)}><span aria-hidden="true">{fit ?? shown}</span><span className="sr">{name}</span></span>');
    expect(tsx).toMatch(/placeholder=\{ask\} aria-label=\{askFull\}/);
  });
});

// M112 review: in shot 4h the "Nothing yet today" row ended in a hard cut where the ask box (sticky at the tall Home's foot,
// on the page's black) covered it, with nothing to say the work went on under it. The wide Home marks that edge with a
// hairline while there is more below (a fade there hid a card's Undo and its proof, so nothing fades over the work); the
// tall Home now does the same.
describe("no row ends in a hard cut above the ask box", () => {
  const rules = [...parse(SYSTEM_CSS()), ...parse(WIDE_CSS())];
  for (const sel of [
    '.home:not([data-side]):not([data-view="settings"])[data-more] .work > .askwrap::after',
    ".home[data-side][data-more] .work > .askwrap::after",
  ]) test(sel, () => {
    const line = rules.filter((r) => r.sel === sel);
    expect(line.length, sel).toBeGreaterThan(0);
    expect(line.some((r) => /var\(--hair\) solid var\(--line(-strong)?\)/.test(value(r, "border-top") ?? ""))).toBe(true);
  });
  test("and nothing fades over the work in either layout (a fade hid buttons)", () => {
    for (const r of rules) if (/\.askwrap::before$/.test(r.sel) && value(r, "content") !== undefined) expect(value(r, "mask-image") ?? "", r.sel).toBe("");
  });
});
