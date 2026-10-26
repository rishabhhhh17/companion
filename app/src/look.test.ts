// The look in the real app (docs/design/look.md): the character floats on the desktop with nothing behind it, Home is one calm
// column with the job first and Undo and Stop always in reach, a reply is read at a comfortable size, and the tabs are a small
// row of drawings. The pages need a real Mac to run, so they are read here as text.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("./style.css"), card = read("./card.tsx"), dock = read("./dock.tsx"), main = read("../src-tauri/src/main.rs");

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
    expect(main).toContain('let b = if label == "dock" { b.transparent(true) } else { b };');
    const at = main.indexOf("let dock = make_panel(mtm, dock_ns, false, dock_frame);");
    expect(at).toBeGreaterThan(0);
    const after = main.slice(at, at + 400);
    expect(after).toContain("dock.setOpaque(false);");
    expect(after).toContain("dock.setHasShadow(false);");
    expect(after).toContain("dock.setBackgroundColor(Some(&NSColor::clearColor()));");
    // Home is still an ordinary opaque window.
    expect(main).not.toMatch(/card_w[^;]*transparent\(true\)/);
  });
  test("what it says is a small pill that stays readable on any wallpaper", () => {
    const pill = /\.dock-label \{([^}]*)\}/.exec(css)![1];
    expect(pill).toMatch(/background: color-mix\(in srgb, var\(--bg\) \d+%, transparent\)/);
    expect(pill).toContain("backdrop-filter: blur(");
    expect(pill).toContain("border-radius: var(--radius-pill)");
  });
  test("the count of waiting questions has no colour of its own: ink on white with a dark rim", () => {
    expect(/\.badge \{([^}]*)\}/.exec(css)![1]).toMatch(/background: #fff; color: #000; box-shadow: 0 0 0 1\.5px #000/);
  });
  test("the rings that show the lights first are still there, around the water", () => {
    for (const s of ["listening", "checking", "needsYou", "done"]) expect(css).toMatch(new RegExp(`\\.character\\[data-pose\\]\\[data-state="${s}"\\][^{]*\\{[^}]*drop-shadow`));
    expect(dock).toContain("style={skinVars(SKIN)");
  });
  test("with the water drawing, the button's own wobble stands down, and the glows stay", () => {
    expect(css).toMatch(/\.character\[data-flow\]\[data-pose\]\[data-motion="breathe"\][^{]*\{ animation: none; \}/);
    expect(css).toMatch(/\.character\[data-flow\]\[data-pose\]\[data-react\] \{ animation: none; \}/);
    expect(css).not.toMatch(/\.character\[data-flow\][^{]*\[data-motion="glow"\]/);
  });
});

describe("Home is one calm column", () => {
  test("the places are a list down the side, each a drawing and its word, shown (the wide Home of 27 Oct 2026)", () => {
    expect(card).toContain('<Icon name={t} />');
    expect(card).toContain('<span className="tab-word">{tabName(t)}</span>');
    expect(card).toContain('aria-orientation="vertical"');
    // The tab list is still a tab list, with every tab reachable by the arrows.
    expect(card).toContain('role="tablist"');
    expect(card).toMatch(/onKeyDown=\{\(e\) => \{ const n = tabKey\(t, e\.key\);/);
  });
  test("the first screen shows the current job first and the ask box after it", () => {
    const ask = card.indexOf('<div hidden={!show("ask")}>');
    for (const panel of ['{show("urgent") && <div ref={urgent}>', '{show("receipt") && m.receipt', '{show("proof") && m.task?.proof', '{show("research") && m.research']) {
      expect(card.indexOf(panel), panel).toBeGreaterThan(-1);
      expect(card.indexOf(panel), `${panel} comes before the ask box`).toBeLessThan(ask);
    }
  });
  test("one filled button to start; the other ways to ask and the options are behind one quiet line", () => {
    const more = card.indexOf('<details className="more">');
    expect(more).toBeGreaterThan(-1);
    const startAt = card.indexOf('<button className="btn primary" type="button" onClick={submit}>{S.start}</button>');
    expect(startAt).toBeGreaterThan(-1);
    expect(startAt).toBeLessThan(more);
    const inside = card.slice(more, card.indexOf("</details>", more));
    for (const btn of ["plan", "rescue", "research", "shipCheck", "online", "showMe", "drawIt"]) expect(inside, btn).toContain(`buttonShown("${btn}")`);
    expect(inside).toContain("setOff(e.target.checked)");
    // A ticked "off the record" is still said on the line that closes the options.
    expect(inside).toContain("{off && <span> · {S.offRecord}</span>}");
  });
  test("watches are one quiet line that opens by itself when a watch is failing", () => {
    expect(card).toMatch(/<details className="more" open=\{watchesOf\(m\.watches, project\)\.some\(\(w\) => w\.state === "failing"\)\}>/);
  });
  test("a reply is large and in a comfortable line, not in a small box", () => {
    const answer = /\.answer \{([^}]*)\}/.exec(css)![1];
    expect(answer).toContain("font-size: var(--t-answer)");
    expect(answer).toContain("line-height: 1.5");
    expect(answer).toMatch(/max-width: (4\d|5\d|6\d|70)ch/);
    // The scale: the answer is 16 and the body 15 at the usual size, in rem so the text size choice reaches it.
    expect(css).toContain("--t-answer: calc(16rem / 14)");
    expect(css).toContain("--t-body: calc(15rem / 14)");
    for (const reply of ['<div className="answer">{m.research.answer}</div>', '<div className="answer">{m.rescue.summary}</div>', '<div className="answer">{m.about.about}</div>', '<div className="answer" role={w.help ? "status" : undefined}>', '<li className="line answer" key={i}>{b}</li>']) expect(card, reply).toContain(reply);
    expect(card).toContain('ehLines(m).map((l, i) => <div className="answer" key={i}>');
    expect(card).toContain('slLines(m).map((l, i) => <div className="answer" key={i}>');
  });
  test("a panel is no box: a hairline between jobs, a small mark for waiting, never a coloured edge", () => {
    expect(/\n\.panel \{([^}]*)\}/.exec(css)![1]).toContain("border: 0");
    expect(css).toContain(".panel + .panel { border-top: 1px solid var(--line);");
    expect(css).not.toMatch(/\.panel\.amber \{[^}]*border-color/);
  });
  test("the receipt reads as one block: what changed, a tick for what was checked, then what it cost and how many files", () => {
    expect(card).toContain('<Icon name={m.receipt.proof === "passed" ? "tick" : m.receipt.proof === "failed" ? "cross" : "wait"} size={16} />');
    expect(card).toContain("S.look.files(m.receipt.changed.length)");
    expect(card).toContain("<li>{S.cost}: {formatUsd(m.receipt.usdEstimate)}</li>");
    // Each check of the proof is a row with its own tick.
    expect(card).toContain('<Icon name={s.status === "passed" ? "tick" : s.status === "failed" ? "cross" : "wait"} size={16} />');
  });
});

describe("Undo and Stop are always in reach", () => {
  const strip = card.slice(card.indexOf('<div className="strip"'), card.indexOf("</>)}", card.indexOf('<div className="strip"')));
  test("a quiet strip at the bottom, drawn whatever tab is open", () => {
    expect(card.indexOf('<div className="strip"')).toBeGreaterThan(card.indexOf('role="tabpanel"'));
    expect(css).toMatch(/\.strip \{[^}]*position: sticky; bottom: 0;/);
  });
  test("Undo is the same flow as before: the receipt's own question, on the same button id, with the same condition", () => {
    expect(strip).toContain("id={undoId}");
    expect(strip).toContain("aria-label={S.undo}");
    expect(strip).toContain('dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint })');
    expect(strip).toContain("disabled={!(m.receipt && m.receipt.changed.length > 0 && !m.undo && project)}");
    // The "are you sure" step and its keyboard handling are still in the receipt, and give the keyboard back to this button.
    expect(card).toContain("label={S.undoSure} back={undoId}");
    // The old button inside the receipt is gone, so there is one Undo.
    expect(card.match(/id=\{undoId\}/g)?.length).toBe(1);
  });
  test("Stop stops the agent, is pressable while one works, and the key that stops everything is named beside them", () => {
    expect(strip).toContain("disabled={!working} onClick={() => void send(stopAgent())}");
    expect(strip).toContain('keyHint("stop", S.look.stopKeys, keys)');
  });
});

describe("only text and drawings in the system font", () => {
  test("no new fonts and nothing from the network in the stylesheet or the pages", () => {
    expect(css).not.toMatch(/@font-face|@import|url\(/);
    expect(css).not.toMatch(/https?:\/\//);
    for (const f of ["../dock.html", "../card.html", "../island.html"]) expect(read(f), f).not.toMatch(/<link|https?:\/\//);
    // The one font stack is the system's.
    expect(css).toContain('font: 14px -apple-system, "SF Pro Text", sans-serif;');
  });
});
