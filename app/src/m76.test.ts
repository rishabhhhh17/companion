// M76, features batch two (docs/milestones/M76-features-two.md): the pages' side. The go live report (honest answer, nothing
// secret, self contained, a real PDF), the tour of a change, and the cards' rules (Show me where to paste only after a copy,
// never typing for the person; the new settings and their places).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildReport, cleanLine, PALETTE_KEYS, readPalette, reportFileName, reportHtml, reportPdf, reportText, type Palette, type ReportInput } from "./goLiveReport.ts";
import { pdfSafe, textWidth, wrap } from "./pdfText.ts";
import { tourFromReceipt, tourFromReview, tourMove, MAX_STEPS } from "./tour.ts";
import type { ProofState, Receipt, ShipReport } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { mainKeys, moreKeys, placeOf, SIDEBAR } from "./settingsPages.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const NO_DASH = /—|–/;
const KEY = "sk-ant-api03-" + "Abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ";
const PROJECT = "/Users/sam/Projects/mug-shop";
const WHEN = new Date(2026, 10, 6, 15, 30);

/** The palette as tokens.css writes it, read the way the page reads its computed style. */
function tokensPalette(): Palette {
  const css = read("./ui/tokens.css");
  return readPalette((name) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1] ?? "");
}
const proofPassed = (): ProofState => ({ verdict: "passed", tries: 1, steps: [
  { rung: "install", label: "Installs", status: "passed", detail: "Installed", runs: [{ command: "npm ci", exit: 0 }] },
  { rung: "checks", label: "Builds", status: "passed", detail: "Built", runs: [{ command: "npm run build", exit: 0 }] },
  { rung: "browser", label: "Works in a browser", status: "passed", detail: "The home page opened" },
] });
const gates = (over: Partial<Record<"checked" | "secrets" | "database_access", ShipReport["gates"][number]["status"]>> = {}): ShipReport => {
  const g = (id: "checked" | "secrets" | "database_access", label: string) => ({ id, label, status: over[id] ?? "passed", detail: `${label}: detail` });
  const list = [g("checked", "The work was checked"), g("secrets", "No secrets would be published"), g("database_access", "Database access is protected")];
  return { gates: list, canShip: list.every((x) => x.status === "passed"), blockedBy: list.filter((x) => x.status === "blocked").map((x) => x.id), needsYou: [], confirmed: [] };
};
const review = (reasons: ReviewCard["result"] extends infer R ? R extends { reasons: infer X } ? X : never : never, checks: "passed" | "failed" | "not_run" = "passed", rating: "safe" | "worth_a_look" | "stop" = "worth_a_look"): ReviewCard => ({
  project: PROJECT, batch: "rv_0123456789", stage: "reviewed", files: [{ file: "src/pay.ts", kind: "modified" }, { file: "src/new.ts", kind: "added" }, { file: "old.ts", kind: "deleted" }], count: 3, capped: false, secretFiles: [], auto: false, proof: false,
  asked: false, fix: null, note: null, later: null,
  result: { rating, touches: [], summary: "Adds a pay page.", notes: [], reasons, checks, sendBack: "", lane: "none", usdEstimate: 0 },
});
const input = (o: Partial<ReportInput> = {}): ReportInput => ({ project: PROJECT, when: WHEN, proof: proofPassed(), ship: gates(), review: null, ...o });

describe("the go live report's answer (rule 14)", () => {
  test("Ready only when every gate passed, the work's checks passed and nothing must or should be fixed", () => {
    const d = buildReport(input());
    expect(d.answer).toBe("ready");
    expect(d.answerWords).toBe(S.goLive.answer.ready);
    expect(d.sections.some((s) => s.id === "notChecked")).toBe(false);
  });
  test("a blocked gate, a failed check or an open Must fix is Not ready, and never says Ready", () => {
    for (const d of [
      buildReport(input({ ship: gates({ secrets: "blocked" }) })),
      buildReport(input({ proof: { ...proofPassed(), verdict: "failed", steps: [{ rung: "tests", label: "Tests pass", status: "failed", detail: "2 failed" }] } })),
      buildReport(input({ review: review([{ kind: "secret_in_code", say: "A key in src/pay.ts", file: "src/pay.ts", line: 4 }], "passed", "stop") })),
    ]) {
      expect(d.answer).toBe("notReady");
      expect(reportText(d)).not.toContain(S.goLive.answer.ready);
    }
  });
  test("anything not run is Not fully checked, and is listed under What was not checked", () => {
    const cases: [ReportInput, string][] = [
      [input({ ship: null }), S.goLive.noGates],
      [input({ proof: null }), S.goLive.noProof],
      [input({ ship: gates({ database_access: "could_not_check" }) }), S.goLive.gateUnsure("Database access is protected")],
      [input({ proof: { ...proofPassed(), verdict: "passed_with_gaps", steps: [...proofPassed().steps.slice(0, 2), { rung: "browser", label: "Works in a browser", status: "skipped", detail: "The browser check is not installed" }] } }), S.goLive.skipped("Works in a browser")],
      [input({ proof: { ...proofPassed(), steps: proofPassed().steps.slice(0, 2) } }), S.goLive.noBrowser],
    ];
    for (const [i, line] of cases) {
      const d = buildReport(i);
      expect(d.answer).toBe("notChecked");
      const nc = d.sections.find((s) => s.id === "notChecked")!;
      expect(nc.rows.map((r) => r.head)).toContain(line);
      expect(reportText(d)).not.toContain(S.goLive.answer.ready);
    }
  });
  test("a Should fix (checks that did not run on the change) keeps it from Ready; a Worth a look does not", () => {
    expect(buildReport(input({ review: review([], "not_run", "safe") })).answer).toBe("notChecked");
    expect(buildReport(input({ review: review([{ kind: "files_removed", say: "old.ts was removed" }], "passed") })).answer).toBe("ready");
  });
  test("the words never call the project safe, and use no long dashes", () => {
    for (const i of [input(), input({ ship: null }), input({ ship: gates({ secrets: "blocked" }) })]) {
      const t = reportText(buildReport(i));
      const body = t.split("\n").slice(1).join("\n");
      expect(body).not.toMatch(/\bsafe\b/i);
      expect(t).not.toMatch(NO_DASH);
    }
  });
});

describe("nothing secret in the report (rule 15)", () => {
  const leaky = (): ReportInput => input({
    ship: { ...gates({ secrets: "blocked" }), gates: gates({ secrets: "blocked" }).gates.map((g) => g.id === "secrets" ? { ...g, detail: `Found ${KEY} in ${PROJECT}/src/pay.ts`, findings: [`OPENAI_API_KEY=${KEY}`] } : g) },
    review: review([{ kind: "secret_in_code", say: `A key ${KEY} in src/pay.ts`, file: "src/pay.ts", line: 4, lines: [{ n: 4, text: `const key = "${KEY}";` }] }], "passed", "stop"),
    codeLines: true,
  });
  test("keys are hidden everywhere, and the project's full path is said as its name", () => {
    const d = buildReport(leaky());
    const t = reportText(d);
    expect(t).not.toContain(KEY);
    expect(t).not.toContain("Abcdefghijklmnop");
    expect(t).not.toContain("/Users/sam");
    expect(reportHtml(d, tokensPalette())).not.toContain(KEY);
    expect(new TextDecoder("latin1").decode(reportPdf(d, tokensPalette()))).not.toContain("Abcdefghijklmnop");
  });
  test("code lines are left out unless turned on, and then only short masked lines", () => {
    const r = review([{ kind: "touches_risky", say: "Changes the pay page", file: "src/pay.ts", line: 4, lines: [{ n: 4, text: "x".repeat(400) }, { n: 5, text: "y" }, { n: 6, text: "z" }] }]);
    expect(buildReport(input({ review: r })).sections.flatMap((s) => s.rows).some((x) => x.code)).toBe(false);
    const code = buildReport(input({ review: r, codeLines: true })).sections.flatMap((s) => s.rows).flatMap((x) => x.code ?? []);
    expect(code.length).toBe(3);
    expect(code.every((l) => Array.from(l).length <= 130)).toBe(true);
  });
  test("a line that still has a key's shape after hiding is dropped whole", () => {
    expect(cleanLine("nothing here")).toBe("nothing here");
    expect(cleanLine(`token ${KEY}`) ?? "").not.toContain(KEY);
    expect(cleanLine("")).toBeNull();
  });
  test("the setting for code lines is off by default", () => {
    const reg = JSON.parse(read("../../protocol/settings.json"));
    expect(reg.settings.find((d: { key: string }) => d.key === "report.codeLines")).toMatchObject({ kind: "switch", default: false });
  });
});

describe("the report as a file", () => {
  test("the web page is self contained: no script, no link out, no picture from anywhere, and dated", () => {
    const html = reportHtml(buildReport(input()), tokensPalette());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script|<link|<img|<iframe|src=|href=|@import|url\(/i);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("6 November 2026");
    expect(html).toContain(S.goLive.answer.ready);
  });
  test("a shortened colour from the built stylesheet is read in full, so the paper stays white", () => {
    const p = readPalette((n) => (n === "--report-paper" ? " #fff" : n === "--report-ink" ? "#16181d" : "#5a606b"));
    expect(p.paper).toBe("#ffffff");
    expect(reportHtml(buildReport(input()), p)).toContain("background:#ffffff");
  });
  test("its colours are the --report tokens of tokens.css, and no other", () => {
    const p = tokensPalette();
    for (const k of PALETTE_KEYS) expect(p[k]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const html = reportHtml(buildReport(input({ ship: gates({ secrets: "blocked" }) })), p);
    const used = new Set((html.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((x) => x.toUpperCase()));
    const allowed = new Set(PALETTE_KEYS.map((k) => p[k].toUpperCase()));
    for (const c of used) expect(allowed.has(c)).toBe(true);
    expect(read("./goLiveReport.ts")).not.toMatch(/#[0-9A-Fa-f]{6}\b(?!\$)/);
  });
  test("the PDF is a real PDF: header, objects, a cross reference table whose offsets point at each object, and the end", () => {
    const bytes = reportPdf(buildReport(input({ review: review([{ kind: "files_removed", say: "old.ts was removed" }]) })), tokensPalette());
    const t = new TextDecoder("latin1").decode(bytes);
    expect(t.startsWith("%PDF-1.4\n")).toBe(true);
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
    const start = Number(/startxref\n(\d+)\n/.exec(t)![1]);
    expect(t.slice(start, start + 4)).toBe("xref");
    const rows = t.slice(start).split("\n").filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
    rows.forEach((off, i) => expect(t.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(Number(/\/Count (\d+)/.exec(t)![1])).toBeGreaterThanOrEqual(1);
    for (const m of t.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) expect(t.slice(m.index! + m[0].length + Number(m[1]), m.index! + m[0].length + Number(m[1]) + 10)).toBe("\nendstream");
    expect(t).toContain("(Is this safe to go live?) Tj");
  });
  test("a long report runs onto more pages, and words are wrapped inside the page", () => {
    const many = review(Array.from({ length: 20 }, (_, n) => ({ kind: "touches_risky" as const, say: `A long sentence about place ${n} `.repeat(6), file: `src/f${n}.ts`, line: n + 1 })));
    const t = new TextDecoder("latin1").decode(reportPdf(buildReport(input({ review: many })), tokensPalette()));
    expect(Number(/\/Count (\d+)/.exec(t)![1])).toBeGreaterThan(1);
    for (const l of wrap("word ".repeat(200), 10.5, 400)) expect(textWidth(l, 10.5)).toBeLessThanOrEqual(400);
    expect(pdfSafe("a “quote” — \u{1F600}")).toBe('a "quote" - ?');
  });
  test("the file name is plain and dated", () => {
    expect(reportFileName(buildReport(input()), "pdf")).toBe("mug-shop-go-live-report-2026-11-06.pdf");
    expect(reportFileName(buildReport(input({ project: "/x/../" })), "html")).toMatch(/^[a-z0-9-]+-go-live-report-2026-11-06\.html$/);
  });
});

describe("the tour of a change (roadmap 18)", () => {
  test("a review: findings with a place first, then each other changed file, and a one line summary", () => {
    const t = tourFromReview(review([{ kind: "touches_risky", say: "Changes how payments are taken", file: "src/pay.ts", line: 12, lines: [{ n: 12, text: "charge(card)" }] }]))!;
    expect(t.steps[0]).toMatchObject({ file: "src/pay.ts", line: 12, lineText: "charge(card)", what: "Changes how payments are taken", level: "should" });
    expect(t.steps.map((s) => s.file)).toEqual(["src/pay.ts", "src/new.ts", "old.ts"]);
    expect(t.steps[2]!.why).toBe(S.tour.removedWhy);
    expect(t.summary).toBe(S.tour.summary(3, 1));
    for (const s of t.steps) { expect(s.what.length).toBeGreaterThan(0); expect(s.why.length).toBeGreaterThan(0); expect(s.what + s.why).not.toMatch(NO_DASH); }
  });
  test("a fix: the changed place first with its line, line counts, and Explain's words when they name the file", () => {
    const rc: Receipt = { checkpoint: "cp1", changed: [{ file: "README.md", kind: "modified", added: 1 }, { file: "src/app.ts", kind: "modified", added: 3, removed: 1 }], commands: 1, notUndoable: [], usdEstimate: 0, changedAt: { file: "src/app.ts", line: 7, lineText: "return total;" } };
    const t = tourFromReceipt(rc, { checkpoint: "cp1", bullets: ["app.ts now adds the tax before the total."] })!;
    expect(t.steps[0]).toMatchObject({ file: "src/app.ts", line: 7, lineText: "return total;", why: "app.ts now adds the tax before the total." });
    expect(t.steps[0]!.what).toBe(`${S.tour.changed("src/app.ts")} ${S.tour.lines(3, 1)}`);
    expect(t.steps[1]!.why).toBe(S.tour.whyFix);
    expect(tourFromReceipt({ ...rc, undone: true })).toBeNull();
  });
  test("secrets are hidden before any words are shown", () => {
    const t = tourFromReview(review([{ kind: "secret_in_code", say: `Key ${KEY} in src/pay.ts`, file: "src/pay.ts", line: 4, lines: [{ n: 4, text: `k = "${KEY}"` }] }], "passed", "stop"))!;
    expect(JSON.stringify(t)).not.toContain("Abcdefghijklmnop");
  });
  test("at most twelve places, the rest counted; Back and Next stay in range and end on the summary", () => {
    const big = review([]); big.files = Array.from({ length: 30 }, (_, n) => ({ file: `f${n}.ts`, kind: "modified" as const })); big.count = 40;
    const t = tourFromReview(big)!;
    expect(t.steps.length).toBe(MAX_STEPS);
    expect(t.more).toBe(40 - MAX_STEPS);
    expect(tourMove(t, 0, -1)).toBe(0);
    expect(tourMove(t, MAX_STEPS - 1, 1)).toBe(MAX_STEPS);
    expect(tourMove(t, MAX_STEPS, 1)).toBe(MAX_STEPS);
  });
  test("no model is called: the tour file sends nothing", () => {
    const src = read("./tour.ts");
    expect(src).not.toMatch(/send\(|invoke\(|fetch\(/);
  });
});

describe("the cards", () => {
  test("Show me where to paste comes only after Copy for my AI, and the page never pastes for the person", () => {
    const card = read("./reviewCard.tsx");
    expect(card).toContain("S.pasteHere.button");
    expect(card).toMatch(/copied && pasteOn/);
    expect(read("./pasteHere.ts")).not.toMatch(/paste_text|press_paste|type_text/);
  });
  test("the new settings live where people look", () => {
    for (const k of ["paste.showWhere", "tour.offer", "report.codeLines"]) expect(placeOf(k), k).toBeTruthy();
    expect(SIDEBAR.flatMap((p) => [...mainKeys(p), ...moreKeys(p)]).filter((k) => ["paste.showWhere", "tour.offer", "report.codeLines"].includes(k)).length).toBe(3);
  });
  test("Home never reads a setting behind a condition (the hook order would change when the first review card comes)", () => {
    for (const f of ["./card.tsx", "./reviewCard.tsx", "./m76Panels.tsx"]) {
      const bad = read(f).split("\n").filter((l) => /(&&|\|\||\?)[^;]*\buse(Setting|Settings)\(/.test(l) && !l.trim().startsWith("//"));
      expect(bad, f).toEqual([]);
    }
  });
  test("the strings use no long dashes", () => {
    expect(JSON.stringify({ g: S.goLive, p: S.pasteHere, t: S.tour })).not.toMatch(NO_DASH);
  });
});
