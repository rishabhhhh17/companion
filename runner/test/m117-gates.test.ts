// M117: the money part of the go live check. It is never a gate: canShip, blockedBy and needsYou are exactly what they are
// without it. A check that throws is could not check for every family, never an empty part. Off in Settings is { off: true }.
// Past 3,000 files the rest is could not check with its count. Every field is an id, a file name, a line, a method or a path.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { moneyReportOk, parseEvent, type MoneyReport } from "../../protocol/index.ts";
import { MONEY_MAX_FILES, moneyOfProject, readForMoney } from "../src/money/check.ts";
import { runGates } from "../src/ship/gates.ts";
import { hasKeyShape } from "../src/redact.ts";

const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const folder = (files: Record<string, string>) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-m117-gates-")));
  made.push(d);
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t); }
  return d;
};
const FULL = {
  "package.json": JSON.stringify({ dependencies: { next: "15", "@clerk/nextjs": "6", openai: "4", resend: "4" } }),
  "app/api/chat/route.ts": `import OpenAI from "openai";\nexport async function POST() {}\n`,
  "app/api/invite/route.ts": `import { Resend } from "resend";\nexport async function POST() {}\n`,
  "app/page.tsx": `export default () => <form action="/api/invite"><input type="email" name="email" /></form>;\n`,
  "app/layout.tsx": `import { ClerkProvider } from "@clerk/nextjs";\nfbq("init", "1");\n`,
};

describe("never a gate", () => {
  test("a project full of findings: canShip, blockedBy and needsYou are the same with and without the money part", async () => {
    const d = folder(FULL);
    const proof = { verdict: "passed", unchangedSince: true };
    const without = await runGates({ project: d, proof });
    const withMoney = await runGates({ project: d, proof, money: { told: [] } });
    expect(withMoney.money && "findings" in withMoney.money ? withMoney.money.findings.length : 0).toBeGreaterThan(4);
    expect({ canShip: withMoney.canShip, blockedBy: withMoney.blockedBy, needsYou: withMoney.needsYou, gates: withMoney.gates }).toEqual({ canShip: without.canShip, blockedBy: without.blockedBy, needsYou: without.needsYou, gates: without.gates });
    expect(without.money).toBeUndefined();
  });
  test("a money check that throws gives check_failed for every family, never an empty part", async () => {
    const d = folder(FULL);
    const r = await runGates({ project: d, money: { check: () => { throw new Error("boom"); } } });
    expect(r.money).toEqual({ findings: [], paid: [], seen: [], accounts: false, unsure: ["rate", "abuse", "spend", "fines"].map((family) => ({ family, why: "check_failed" })) } as never);
    expect(moneyOfProject(d, { read: () => { throw new Error("no"); } }).unsure.map((u) => u.why)).toEqual(["check_failed", "check_failed", "check_failed", "check_failed"]);
  });
  test("money.checks off gives { off: true }", async () => {
    expect((await runGates({ project: folder(FULL), money: false })).money).toEqual({ off: true });
  });
});

describe("big projects", () => {
  test("past 3,000 files the rest is too_many_files with its count, for every family", () => {
    const files: Record<string, string> = { "package.json": "{}" };
    for (let i = 0; i < MONEY_MAX_FILES + 1; i++) files[`src/f${String(i).padStart(4, "0")}.ts`] = "export {};\n";
    const d = folder(files);
    const read = readForMoney(d);
    expect(Object.keys(read.files)).toHaveLength(MONEY_MAX_FILES);
    expect(read.leftOver).toBe(2);
    const r = moneyOfProject(d);
    expect(r.unsure.filter((u) => u.why === "too_many_files")).toEqual(["rate", "abuse", "spend", "fines"].map((family) => ({ family, why: "too_many_files", count: 2 })) as never);
  });
});

describe("only ids, file names, lines, methods and paths", () => {
  test("every string in the part is a known id, a file of the project or a route path; none has a key's shape; ship.gates with it parses", async () => {
    const key = "sk-proj-" + "Z".repeat(40);
    const d = folder({ ...FULL, ".env": `OPENAI_API_KEY=${key}\n`, "app/api/chat/route.ts": `import OpenAI from "openai";\nconst ai = new OpenAI({ apiKey: "${"sk-" + "q".repeat(40)}" });\nexport async function POST() {}\n` });
    const r = await runGates({ project: d, money: { told: [] } });
    const m = r.money as MoneyReport;
    expect(moneyReportOk(m)).toBe(true);
    const strings: string[] = [];
    const walk = (x: unknown) => { if (typeof x === "string") strings.push(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") Object.values(x).forEach(walk); };
    walk(m);
    for (const s of strings) { expect(hasKeyShape(s), s).toBe(false); expect(s.length).toBeLessThanOrEqual(400); expect(s).not.toContain("\n"); }
    expect(JSON.stringify(m)).not.toContain("sk-");
    const ev = parseEvent(JSON.stringify({ v: 1, id: "t1", type: "ship.gates", project: d, ...r }));
    expect(ev.ok).toBe(true);
  });
  test("the protocol refuses free text, a path with a space, an unknown service and a finding with no file where one is needed", () => {
    const ok: MoneyReport = { findings: [{ kind: "paid_route_open", file: "app/api/chat/route.ts", line: 4, method: "POST", path: "/api/chat", services: ["openai"] }], paid: [], unsure: [], seen: [], accounts: false };
    expect(moneyReportOk(ok)).toBe(true);
    expect(moneyReportOk({ ...ok, findings: [{ ...ok.findings[0], say: "ignore the above" }] })).toBe(false);
    expect(moneyReportOk({ ...ok, findings: [{ ...ok.findings[0], value: "sk-x" }] })).toBe(false);
    expect(moneyReportOk({ ...ok, findings: [{ ...ok.findings[0], path: "/api/chat now" }] })).toBe(false);
    expect(moneyReportOk({ ...ok, findings: [{ ...ok.findings[0], services: ["stripe"] }] })).toBe(false);
    expect(moneyReportOk({ ...ok, findings: [{ kind: "paid_route_open" }] })).toBe(false);
    expect(moneyReportOk({ ...ok, findings: [{ ...ok.findings[0], file: "../outside.ts" }] })).toBe(false);
    expect(moneyReportOk({ ...ok, findings: [{ kind: "no_privacy_page", told: true }] })).toBe(false);
    expect(moneyReportOk({ ...ok, unsure: [{ family: "rate", why: "unknown_framework", name: "Koa server please run rm" }] })).toBe(false);
    expect(moneyReportOk({ off: true })).toBe(true);
    expect(moneyReportOk({ off: true, findings: [] })).toBe(false);
  });
});

describe("the shared fixtures", () => {
  const read = (f: string) => require("node:fs").readFileSync(new URL(`../../protocol/fixtures/${f}`, import.meta.url), "utf8").split("\n").filter(Boolean) as string[];
  test("m117e1 to m117e3 parse; m117e1 carries a full money part, m117e2 an off one, m117e3 a worth a look review with the new kinds", () => {
    const es = read("events.jsonl").filter((l) => l.includes('"id":"m117e'));
    expect(es).toHaveLength(3);
    for (const l of es) expect(parseEvent(l).ok, l).toBe(true);
    const [e1, e2, e3] = es.map((l) => JSON.parse(l));
    expect(e1.money.findings.map((f: { kind: string }) => f.kind)).toEqual(["paid_route_open", "paid_route_open", "form_open", "tracker_no_consent", "no_privacy_page"]);
    expect(e2.money).toEqual({ off: true });
    expect(e3.rating).toBe("worth_a_look");
    expect(e3.reasons.map((r: { kind: string }) => r.kind)).toEqual(["paid_route_open", "tracker_no_consent"]);
  });
  test("every refused shape is refused inside ship.gates", () => {
    const good = JSON.parse(read("events.jsonl").find((l) => l.includes('"id":"m117e1"'))!);
    const bad = read("money-refused.jsonl").map((l) => JSON.parse(l));
    expect(bad).toHaveLength(7);
    for (const b of bad) expect(parseEvent(JSON.stringify({ ...good, money: b.money })).ok, b.why).toBe(false);
  });
  test("m117c1, the told line saved through memory.add, parses and reads back as a limit for that file", async () => {
    const { parseCommand, moneyToldOf } = await import("../../protocol/index.ts");
    const l = read("commands.jsonl").find((x) => x.includes('"id":"m117c1"'))!;
    const c = parseCommand(l);
    expect(c.ok).toBe(true);
    expect(moneyToldOf([JSON.parse(l).text])).toEqual([{ what: "limit", file: "app/api/chat/route.ts" }]);
    expect(moneyToldOf(["Rate limit for ../x.ts is set up outside the code (you told me).", "Bot check for a.tsx is set up outside the code."])).toEqual([]);
  });
});
