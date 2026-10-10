// MANUAL, NO CLAUDE, NO COST: does "point at the problem" find the failing line on a real looking editor screen?
// Editor screens (gutter, code, file tree, terminal with the error) are drawn in the hidden browser at Retina size, so
// the true place of every line is known from the page. The pictures are handed to the Rust side, which runs the Mac's
// own text reader and the same matcher the app uses (cargo test point_eval -- --ignored).
// Run: bun run scripts/eval-point.ts [cases] [seed]   Writes cases into a temporary folder and prints the Rust command.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { browserExecutable } from "../src/proof/browser.ts";

const COUNT = Number(process.argv[2] ?? 40);
const out = mkdtempSync(join(tmpdir(), "companion-point-eval-"));
const src = join(import.meta.dir, "..", "src");
const files = readdirSync(src).filter((f) => f.endsWith(".ts")).map((f) => ({ name: f, lines: readFileSync(join(src, f), "utf8").split("\n") })).filter((f) => f.lines.length > 60);

let seed = Number(process.argv[3] ?? 7);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const THEMES = [
  { name: "dark", bg: "#1e1e1e", fg: "#d4d4d4", gutter: "#858585", side: "#252526", term: "#181818", kw: "#569cd6", str: "#ce9178", err: "#f48771", hl: "#2a2d2e" },
  { name: "light", bg: "#ffffff", fg: "#1f1f1f", gutter: "#6e7681", side: "#f3f3f3", term: "#f8f8f8", kw: "#0000ff", str: "#a31515", err: "#cd3131", hl: "#f0f0f0" },
  { name: "cursor", bg: "#181818", fg: "#cccccc", gutter: "#6e6e6e", side: "#141414", term: "#141414", kw: "#82aaff", str: "#c3e88d", err: "#ff5370", hl: "#222222" },
];
const FONTS = ["Menlo", "SF Mono", "Monaco"];
const color = (line: string, t: typeof THEMES[0]) => esc(line)
  .replace(/(&quot;|"[^"]*"|'[^']*'|`[^`]*`)/g, `<span style="color:${t.str}">$1</span>`)
  .replace(/\b(const|let|return|if|else|export|import|from|function|async|await|type|for|of|new)\b/g, `<span style="color:${t.kw}">$1</span>`);

type Case = { id: string; rgba: string; w: number; h: number; scale: number; line: number; lineText: string; truth: number[]; message: string; messageTruth: number[] };
const cases: Case[] = [];
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable()! });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

for (let i = 0; i < COUNT; i++) {
  const f = pick(files), t = pick(THEMES), font = pick(FONTS), size = pick([12, 13, 14, 15]);
  const lh = Math.round(size * 1.5);
  // Mostly real code lines; every fifth case is a short line ("}" and the like) that only its line number can find.
  const want = i % 5 === 4 ? (n: string) => n.trim().length > 0 && n.trim().length <= 3 : (n: string) => n.trim().length >= 12;
  const choices = f.lines.map((l, k) => ({ l, k })).filter((x) => x.k > 3 && x.k < f.lines.length - 25 && want(x.l));
  if (!choices.length) { i--; continue; }
  const target = pick(choices);
  const first = Math.max(0, target.k - 3 - Math.floor(rnd() * 12));
  const shown = f.lines.slice(first, first + 40);
  const message = pick(["Type 'string' is not assignable to type 'number'.", "ReferenceError: undefinedThing is not defined", "SyntaxError: Unexpected token '}'", "Error: Cannot find module './config'"]);
  const html = `<body style="margin:0;background:${t.bg};color:${t.fg};font:${size}px ${font},monospace;display:flex;height:900px;overflow:hidden">
<div style="width:220px;background:${t.side};padding:10px;font:13px -apple-system,sans-serif;color:${t.gutter}">EXPLORER<br><br>${["src", "  App.tsx", "  main.tsx", "  " + f.name, "package.json", "README.md"].map((x) => `<div style="padding:3px 0;white-space:pre">${esc(x)}</div>`).join("")}</div>
<div style="flex:1;display:flex;flex-direction:column;min-width:0">
<div style="height:34px;background:${t.side};font:13px -apple-system,sans-serif;padding:9px 14px;color:${t.fg}">${esc(f.name)}</div>
<div style="flex:1;overflow:hidden;padding-top:6px">${shown.map((l, k) => `<div style="display:flex;height:${lh}px;line-height:${lh}px;${first + k === target.k ? `background:${t.hl}` : ""}"><span style="width:56px;text-align:right;padding-right:22px;color:${t.gutter};flex:none">${first + k + 1}</span><span ${first + k === target.k ? 'id="target"' : ""} style="white-space:pre">${color(l, t)}</span></div>`).join("")}</div>
<div style="height:170px;background:${t.term};border-top:1px solid ${t.gutter}55;padding:10px 14px;font-size:${size - 1}px;line-height:1.5">
<div style="color:${t.gutter}">TERMINAL</div><div>$ npm run build</div><div id="msg" style="color:${t.err}">${esc(message)}</div><div style="color:${t.gutter}">    at build (src/${esc(f.name)}:${target.k + 1}:3)</div></div></div></body>`;
  await page.setContent(html);
  const box = await page.locator("#target").boundingBox();
  const mbox = await page.locator("#msg").evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  // The visible part of the line only: long lines run past the window's edge.
  const truth = [box!.x, box!.y, Math.min(box!.width, 1440 - box!.x), box!.height];
  const png = await page.screenshot({ type: "png" });
  const rgba: string = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = ""; for (let k = 0; k < d.length; k += 32768) s += String.fromCharCode(...d.subarray(k, k + 32768));
    return btoa(s);
  }, png.toString("base64"));
  const id = `${String(i).padStart(3, "0")}-${t.name}-${font.replace(/ /g, "")}-${size}`;
  const file = join(out, `${id}.rgba`);
  writeFileSync(file, Buffer.from(rgba, "base64"));
  cases.push({ id, rgba: file, w: 2880, h: 1800, scale: 2, line: target.k + 1, lineText: target.l.trim(), truth, message, messageTruth: [mbox.x, mbox.y, mbox.width, mbox.height] });
}
await browser.close();
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "cases.json"), JSON.stringify(cases));
console.log(`${cases.length} editor screens written to ${out}`);
console.log(`Now run: cd app/src-tauri && COMPANION_POINT_EVAL=${out} cargo test point_eval -- --ignored --nocapture`);
