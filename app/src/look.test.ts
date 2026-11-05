// The look in the real app (docs/design/look.md): the character floats on the desktop with nothing behind it, Home is one calm
// column with the job first and Undo and Stop always in reach, a reply is read at a comfortable size, and the tabs are a small
// row of drawings. The pages need a real Mac to run, so they are read here as text.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { STYLE_CSS, TOKENS_CSS, ALL_CSS } from "./ui/cssFiles.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = ALL_CSS(), card = read("./card.tsx"), dock = read("./dock.tsx"), main = read("../src-tauri/src/main.rs");

describe("the character floats on the desktop", () => {
  test("its page paints nothing: the dock page, like the island's, is see through", () => {
    expect(css).toMatch(/html\.dock-page, body\.dock-page \{ background: transparent;/);
    expect(read("../dock.html")).toContain('<html lang="en" class="dock-page">');
    expect(read("../dock.html")).toContain('<body class="dock-page" data-label="dock">');
    // The island and the pointer's page were see through already: they stay so.
    expect(css).toMatch(/html\.island-page, body\.island-page \{ background: transparent;/);
    expect(read("../overlay.html")).toMatch(/html,body\{margin:0;background:transparent/);
  });
  test("its window and panel are see through too (the page cannot paint over a white panel)", () => {
    expect(main).toContain('let b = if label == "dock" || label == "card" { b.transparent(true) } else { b };');
    const at = main.indexOf("let dock = make_panel(mtm, dock_ns, false, dock_frame);");
    expect(at).toBeGreaterThan(0);
    const after = main.slice(at, at + 400);
    expect(after).toContain("dock.setOpaque(false);");
    expect(after).toContain("dock.setHasShadow(false);");
    expect(after).toContain("dock.setBackgroundColor(Some(&NSColor::clearColor()));");
    // Home is see through too (27 Oct 2026): its page paints one black shape with round bottom corners (island.rs tests).
    expect(main).toContain('let b = if label == "dock" || label == "card" { b.transparent(true) } else { b };');
  });
  test("what it says is a small card (pills are for controls) that stays readable on any wallpaper", () => {
    const pill = /\.dock-label \{([^}]*)\}/.exec(css)![1];
    // Fixed glass in every theme (the audit, item 54: in the theme's own colours it vanished on a matching wallpaper).
    expect(pill).toContain("background: var(--glass-quiet)");
    expect(pill).toContain("backdrop-filter: blur(");
    expect(pill).toContain("border-radius: var(--r-card)");
  });
  test("the count of waiting questions has no colour of its own: a small black pill with white words and a white rim", () => {
    expect(/\.badge \{([^}]*)\}/.exec(css)![1]).toMatch(/min-height: 18px;[^}]*border-radius: var\(--r-pill\); background: var\(--notch\); color: var\(--notch-ink\); box-shadow: 0 0 0 1\.5px var\(--notch-ink\)/);
    expect(TOKENS_CSS()).toContain("--notch: #000000;");
    expect(TOKENS_CSS()).toContain("--notch-ink: #FFFFFF;");
  });
  test("the rings that show the lights first are still there, around the water", () => {
    for (const s of ["listening", "checking", "needsYou", "done"]) expect(css).toMatch(new RegExp(`\\.character\\[data-pose\\]\\[data-state="${s}"\\][^{]*\\{[^}]*drop-shadow`));
    expect(dock).toContain("style={{ ...skinVars(SKIN),");
    // Never a web style ring or a filled box around the picture (M15): every light is a glow along the outline.
    expect(css).not.toMatch(/\.character\[[^{]*\{[^}]*box-shadow: 0 0 0/);
    expect(css).not.toMatch(/\.character\[data-state="error"\] \{[^}]*background/);
  });
  test("with the water drawing, the button's own wobble stands down, and the glows stay", () => {
    expect(css).toMatch(/\.character\[data-flow\]\[data-pose\]\[data-motion="breathe"\][^{]*\{ animation: none; \}/);
    expect(css).toMatch(/\.character\[data-flow\]\[data-pose\]\[data-react\] \{ animation: none; \}/);
    expect(css).not.toMatch(/\.character\[data-flow\][^{]*\[data-motion="glow"\]/);
  });
});

describe("Home is one calm column, status first (F28, the overhaul spec 4.1)", () => {
  test("the places are quiet buttons with words at the top, then Close; no round icon buttons, no tab list", () => {
    expect(card).toContain("{S.home.places[t]}");
    expect(card).toContain('<Button kind="icon" className="close" label={S.look.close} title={S.look.close}');
    expect(card).not.toContain('role="tablist"');
    expect(card).not.toContain('className="icon-btn"');
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\.icon-btn/);
  });
  test("one column: Flowflow on its water with the status, then the ask field, then the recent fixes and the results", () => {
    // M69 step 2: the hero steps aside while the review card leads Now (it carries the headline then).
    const hero = card.indexOf('<Lead className="hero" wordsClass="hero-words" hidden={home.tab !== "now" || cardLeads}');   // M71: the Lead part
    const ask = card.indexOf('<div className="askwrap" hidden={!show("ask")}>');
    // M69 step 2: at rest the Last fix and Since then cards stand where the recent list was (homeRest.tsx).
    const recent = card.indexOf('{!side && show("ask") && restCards(restIn) && atRest && home.tab === "now" && <div className="view view-lead">{restBlock()}</div>}');
    expect(hero).toBeGreaterThan(-1);
    expect(hero).toBeLessThan(ask);
    expect(ask).toBeLessThan(recent);
    for (const panel of ['{side && urgentCards}', '{show("receipt") && m.receipt', '{!m.receipt && proofPanel}', '{show("research") && m.research']) {
      expect(card.indexOf(panel), panel).toBeGreaterThan(recent);
    }
    // The ranked UI audit (2 Nov 2026, item 26): in the tall Home the cards that wait on the person come right under the
    // hero, before the ask box, where "Your answer goes just below" points.
    expect(card.indexOf("{!side && urgentCards")).toBeGreaterThan(hero);
    expect(card.indexOf("{!side && urgentCards")).toBeLessThan(ask);
    // M42's two columns, its side list, its quick actions and the Do list are gone, in the page and in the styles.
    for (const gone of ['className="home-side"', 'className="chips quick"', "side-item", "S.sideDo", "chip-btn"]) expect(card, gone).not.toContain(gone);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\.home-side|\.side-item|\.side-head|\.chip-btn|\.chips\.quick|:has\(> \.home-side\)/);
  });
  test("one main button: the ask field's Start is a quiet drawing, and every other way to ask is behind one quiet line", () => {
    const more = card.indexOf('<details className="more">');
    expect(more).toBeGreaterThan(-1);
    const startAt = card.indexOf('<Button kind="icon" className="send" label={S.look.send} title={S.look.send} disabled={working} onClick={submit}>');
    expect(startAt).toBeGreaterThan(-1);
    expect(startAt).toBeLessThan(more);
    expect(card).not.toContain('"btn primary icon send"');
    const inside = card.slice(more, card.indexOf("</details>", more));
    // Nothing is dropped (customizable everything): each way to ask is still here, as a small Button.
    for (const btn of ["findProblem", "shipCheck", "showMe", "plan", "rescue", "research", "online", "drawIt"]) expect(inside, btn).toContain(`buttonShown("${btn}")`);
    expect(inside).toContain('toolOn("errorHelp")');
    // The check the main button already offers is not here twice.
    expect(inside).toContain('main !== "fix" && main !== "check"');
    expect(inside).toContain('main !== "shipCheck"');
    // The options are switches with their words, never a bare checkbox.
    expect(inside).toContain("<Switch checked={off} onChange={setOff} label={S.offRecord} />");
    expect(inside).not.toContain('type="checkbox"');
    // A ticked "off the record" is still said on the line that opens the options.
    expect(inside).toContain("{off && <span> · {S.offRecord}</span>}");
  });
  test("watches are one quiet line that opens by itself when a watch is failing", () => {
    expect(card).toMatch(/<details className="more" open=\{watchesOf\(m\.watches, project\)\.some\(\(w\) => w\.state === "failing"\)\}>/);
  });
  test("a reply is large and in a comfortable line, not in a small box", () => {
    const answer = /\n\.answer \{([^}]*)\}/.exec(css)![1];
    expect(answer).toContain("font-size: var(--t-answer)");
    expect(answer).toContain("line-height: 1.5");
    expect(answer).toMatch(/max-width: (4\d|5\d|6\d|70)ch/);
    // The scale (ui/tokens.css, the graphite look of M51): the answer is 15 and the body 13 at the usual size, in rem so the
    // text size choice reaches it.
    expect(TOKENS_CSS()).toMatch(/--t-answer: calc\(15rem \/ 14\);/);
    expect(TOKENS_CSS()).toMatch(/--t-body: calc\(13rem \/ 14\);/);
    for (const reply of ['<div className="answer">{m.research.answer}</div>', '<div className="answer">{m.rescue.summary}</div>', '<div className="answer">{m.about.about}</div>', '<div className="answer" role={w.help ? "status" : undefined}>', '<li className="line answer" key={i}>{b}</li>']) expect(card, reply).toContain(reply);
    expect(card).toContain('ehLines(m).map((l, i) => <div className="answer" key={i}>');
    expect(card).toContain('slLines(m).map((l, i) => <div className="answer" key={i}>');
  });
  test("a result is a card on Home's page: one hairline, 12 point corners, no rim of light; a small mark for waiting, never a coloured edge", () => {
    expect(/\n\.panel \{([^}]*)\}/.exec(css)![1]).toContain("border: 0");
    // The Card part's look (the overhaul spec, 2.3): --surface-1, a --line hairline, --r-card, and no rim or glow.
    expect(css).toMatch(/\.home \.view \.panel \{ background: var\(--surface-1\); border: 1px solid var\(--line\); border-radius: var\(--r-card\);/);
    expect(TOKENS_CSS()).toMatch(/--r-card: 12px;/);
    expect(css).not.toMatch(/\.panel[^{]*\{[^}]*inset 0 1px 0 rgba\(255, 255, 255/);
    // M51: a card's words are body size, its title the answer size.
    expect(css).toContain(".home .view .panel .line, .home .view .panel .proof { font-size: var(--t-body); line-height: 1.5; }");
    expect(css).toMatch(/\.home \.view \.panel > h2 \{ font-size: var\(--t-answer\);/);
    expect(css).not.toMatch(/\.panel\.amber \{[^}]*border-color/);
  });
  test("the result card: the verdict first at verdict size, the checks as ticks, what changed, and no cost (F29)", () => {
    // M45 and the overhaul spec 4.2: the mark is the verdict's own (a tick only for a proven fix, VerdictLine).
    expect(card).toContain('<VerdictLine verdict={v} size="card" sub={said || putBackShown ?');
    expect(card).toContain("<ChangesCard changed={m.receipt.changed} undone={undone} />");   // M39: how many files heads the changes card
    expect(card).toContain("<ProofTicks ticks={proofTicks(m)}");
    // M69 (F29): Squibby pays for the model, so a result never says what it cost.
    expect(card).not.toContain("S.fixCost(formatUsd(m.receipt.usdEstimate))");
    // Each check of the proof is a row with its own tick.
    expect(card).toContain('<Icon name={s.status === "passed" ? "tick" : s.status === "failed" ? "cross" : "wait"} size={16} />');
  });
});

describe("Undo and Stop are in reach whenever they can act (F28, the overhaul spec 4.2)", () => {
  const result = card.slice(card.indexOf('<section className="panel receipt"'), card.indexOf("</section>", card.indexOf('<section className="panel receipt"')));
  const job = card.slice(card.indexOf('<section className="panel job"'), card.indexOf("</section>", card.indexOf('<section className="panel job"')));
  test("no strip of pills at the foot: Undo is inside the result card, Stop inside the working card", () => {
    expect(card).not.toContain('<div className="strip"');
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/(^|[^\w-])\.(strip|pill)\b/m);   // the island's own .island.pill (the notch's shape) is not one
    // M69: Replay what Squibby did sits beside it in the same row (runListView.tsx Replay).
    // M69 step 3: one Undo button (undoButton), at the top of a proven result, in a failed one's lead, else beside Replay.
    expect(result).toContain("{undoCan(m, project) && !failLead && undoButton(m.receipt.wholePlan ? S.home.undoWholeFix : S.home.undoFix)}");
    expect(result).toContain("{undoCan(m, project) && undoButton(S.homeNow.undo)}");
    expect(job).toContain("{stopCan(m) && <Button kind=\"secondary\" size=\"sm\"");
  });
  test("Undo is the same flow as before: the receipt's own question, on the same button id, with the same condition", () => {
    expect(card).toContain("const undoButton = (words: string) => <Button id={undoId}");
    expect(result).toContain("undoButton(m.receipt.wholePlan ? S.home.undoWholeFix : S.home.undoFix)");
    expect(card).toContain('dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint })');
    expect(card).toContain("label={S.undoSure} back={undoId}");
    expect(card.match(/id=\{undoId\}/g)?.length).toBe(1);
  });
  test("Stop stops the agent, shows while one works, and the key that stops everything is in its name and its tooltip", () => {
    for (const at of [job, card.slice(card.indexOf("{stopCan(m) && !jobShown && mode !== \"question\" &&"))]) {
      expect(at).toContain("onClick={() => void stopNow()}");
      expect(at).toContain('label={`${S.stop}. ${keyHint("stop", S.look.stopKeys, keys)}`} title={keyHint("stop", S.look.stopKeys, keys)}');
    }
    // Where something works with no card of its own (a look, an answer being written), Stop sits beside the words.
    expect(card).toContain("{stopCan(m) && !jobShown && mode !== \"question\" && <div className=\"hero-main ui-lead-acts\"><Button kind=\"secondary\" size=\"sm\"");
  });
  test("after an undo, Put back as it was shows for two seconds in the card", () => {
    expect(result).toContain('{putBackShown && <span className="putback-note" role="status">{said ? " " : ""}{S.look.putBack}</span>}');
    expect(card).toContain('if (m.undo?.stage !== "done") return;');
    expect(card).not.toContain("spin(e.currentTarget)");
  });
});

describe("only text and drawings in the system font", () => {
  test("no new fonts and nothing from the network in the stylesheet or the pages", () => {
    // style.css imports only the two local files of the design system, first.
    expect(STYLE_CSS().match(/@import [^;]+;/g)).toEqual(['@import "./ui/tokens.css";', '@import "./ui/parts.css";']);
    expect(STYLE_CSS().indexOf('@import "./ui/tokens.css";')).toBe(0);
    expect(css).not.toMatch(/@font-face|url\(/);
    expect(ALL_CSS().replace(/^@import [^;]+;$/gm, "")).not.toMatch(/@import/);
    expect(css).not.toMatch(/https?:\/\//);
    for (const f of ["../dock.html", "../card.html", "../island.html"]) expect(read(f), f).not.toMatch(/<link|https?:\/\//);
    // The one font stack is the system's (-apple-system alone; it picks Text or Display by itself).
    expect(TOKENS_CSS()).toContain("--font: -apple-system, sans-serif;");
    expect(TOKENS_CSS()).toContain("font: 14px var(--font);");
  });
});
