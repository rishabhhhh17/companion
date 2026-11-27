// M124: Your team, in History. Pure: no engine, no shell.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lastWords, ruleLine, teamFrom } from "./teamState.ts";
import { teamJoin, teamMake, teamRules, teamShare } from "./commands.ts";

describe("the team page reads only team.state", () => {
  test("a team, its receipts, an invite", () => {
    const p = teamFrom({ type: "team.state", team: { id: "A".repeat(16), name: "bloom studio", me: "Ana", share: true, role: "admin", members: [{ name: "Ana", role: "admin" }], rules: [{ kind: "never_edit", pattern: "pricing.txt" }] },
      receipts: [{ seq: 2, by: "Jon", at: 1, project: "my-shop", tool: "cursor", verdict: "not_done", lines: ["a pricing page"], checks: [{ label: "npm test", result: "passed" }], flags: [], asked: { kept: 1, missing: 1 } }, { seq: 1, by: "x", project: "y", verdict: "great" }],
      invite: "AAAAAAAAAAAAAAAA.secret", last: { ok: true, did: "make" } })!;
    expect(p.team).toMatchObject({ name: "bloom studio", share: true, role: "admin" });
    expect(p.receipts!.map((r) => r.seq)).toEqual([2]);
    expect(p.invite).toBe("AAAAAAAAAAAAAAAA.secret");
    expect(lastWords(p.last)).toContain("The team is made");
  });
  test("not in a team; other events are not ours", () => {
    expect(teamFrom({ type: "team.state", team: null })).toEqual({ team: null });
    expect(teamFrom({ type: "receipt" })).toBeNull();
  });
  test("plain words for every outcome", () => {
    expect(lastWords({ ok: false, reason: "signIn" })).toContain("Sign in to Squibby");
    expect(lastWords({ ok: false, reason: "refused", say: "This team is full." })).toBe("This team is full.");
    expect(ruleLine({ kind: "never_edit", pattern: "pricing.txt" })).toBe("never edit pricing.txt");
    expect(ruleLine({ kind: "ask_install", pattern: "packages" })).toBe("ask before installing packages");
  });
});

describe("commands", () => {
  test("trimmed and capped", () => {
    expect(teamMake("  bloom  ", " Ana ")).toMatchObject({ type: "team.make", name: "bloom", me: "Ana" });
    expect(teamJoin(" X.y ", "Jon")).toMatchObject({ type: "team.join", invite: "X.y" });
    expect(teamShare(true)).toMatchObject({ type: "team.share", on: true });
    expect((teamRules(Array(60).fill({ kind: "never_edit", pattern: "x" })) as { rules: unknown[] }).rules.length).toBe(50);
  });
  test("the panel sends nothing until a press, and sharing is a separate press", () => {
    const src = readFileSync(new URL("./teamPanel.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/useEffect\([^)]*send\(/s);
    expect(src).toContain("onChange={(on) => go(teamShare(on))}");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("<TeamPart send={send} />");
  });
});

describe("Studio: the go live report as a client link", () => {
  test("the report page passes the link server's own check", async () => {
    const { buildReport, reportHtml } = await import("./goLiveReport.ts");
    const { checkPage } = await import("../../usage-proxy/src/receipt-links.ts");
    const p = { paper: "#ffffff", ink: "#10142a", muted: "#555555", line: "#dddddd", ok: "#0a6e40", bad: "#c81e33", unsure: "#946200", skip: "#888888" };
    expect(checkPage(reportHtml(buildReport({ project: "/Users/x/bloom-bakery", when: new Date("2026-11-28T10:00:00Z") }), p))).toBeNull();
  });
  test("the link is made only on the press, from the very page that is saved", () => {
    const src = readFileSync(new URL("./m76Panels.tsx", import.meta.url), "utf8");
    expect(src.match(/send\(receiptShare\(/g)?.length).toBe(1);
    expect(src).toContain("void send(receiptShare(reportHtml(doc, readPalette(css)), doc.title))");
    expect(readFileSync(new URL("./card.tsx", import.meta.url), "utf8").match(/<ShareReport id="[a-z-]+" send=\{send\}/g)?.length).toBe(2);
  });
});
