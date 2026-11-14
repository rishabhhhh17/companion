// M88: Your numbers, Share what my AI did, the plan offers (switched off) and spoken status, the pages' side. Pure, no
// engine, no model; the week is the protocol's own fixture (m79e2, with M88's jobs and days). The why is the checked
// research of 13 Nov 2026: synthesis.md section 3, features 8 (a shareable receipt) and 9 (spoken status), and section 5
// (YC numbers: "weekly users, paying users, reviews done, undos used, fixes that passed checks").
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { WeekView } from "../../protocol/index.ts";
import { initial, type HistoryItem, type Model } from "./model.ts";
import type { Palette } from "./goLiveReport.ts";
import { cents, friendFirstMonth, inviterCredit, less, OFF, offerLines, OFFERS, offersFrom, PRICES, statusFrom, studentFirstMonth, yearlyAgrees, yearlyFrom, type PlanStatus } from "./plan.ts";
import { RECEIPT_META, projectName, receiptFileName, receiptHtml, shareFromTask, shareFromWeek, shareLine, shotOk } from "./shareReceipt.ts";
import { momentsOf, nextStatus, spokenReplayTimes, statusContext, statusLines, statusSays, statusStep, STATUS_MOMENTS } from "./spokenStatus.ts";
import { replayTimes, type ReplayView } from "./replay.ts";
import { S } from "./strings.ts";
import { weekFrom, weekPage } from "./weekSummary.ts";
import { dayOf, mailArgs, NUMBERS_TO, numbersJson, numbersOf, numbersRows, toolsConnected } from "./yourNumbers.ts";
import type { DoneState } from "./doneSignal.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const fixture = (id: string) => JSON.parse(read("../../protocol/fixtures/events.jsonl").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const WEEK = (): WeekView => weekFrom(fixture("m79e2"), "p_9f2c")!;
const NO_DASH = /[\u2013\u2014]/;
const PROJECT = "/Users/sam/Projects/mug-shop";
const NOW = new Date(2026, 10, 14, 12, 0, 0);
const PALETTE: Palette = { paper: "#FFFFFF", ink: "#1A1A1A", muted: "#5C5C5C", line: "#E4E4E4", ok: "#0F7B4F", bad: "#B4232C", unsure: "#8A5A00", skip: "#5C5C5C" };
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/";
const task = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 7, label: "Fix the contact form", status: "done", usd: 0.1, startedAt: "2026-11-14T09:00:00Z", endedAt: "2026-11-14T09:05:00Z", checkpoint: "cp_0007", changed: 3, proof: "passed", ...o });

describe("(a) Your numbers", () => {
  test("the counts come from the week the engine counted (task log rows), with jobs, days and the tools connected", () => {
    const st: DoneState = { project: "p_9f2c", tools: [
      { tool: "claude", hook: "done", on: true, file: "", adds: "", creates: false }, { tool: "claude", hook: "guard", on: true, file: "", adds: "", creates: false }, { tool: "claude", hook: "waiting", on: true, file: "", adds: "", creates: false },
      { tool: "cursor", hook: "done", on: true, file: "", adds: "", creates: false }, { tool: "cursor", hook: "guard", on: false, file: "", adds: "", creates: false },
    ] };
    expect(toolsConnected(st)).toBe(1);
    expect(toolsConnected(null)).toBeNull();
    const n = numbersOf(WEEK(), 1);
    expect(n).toEqual({
      numbers: 1, from: dayOf("2026-11-04T10:00:00.000Z"), to: dayOf("2026-11-11T10:00:00.000Z"),
      changesReviewed: 6, filesReviewed: 14, caught: { keys: 1, weakenedChecks: 1, falseDones: 2, riskyPackages: 1 },
      fixesProven: 3, undos: 1, savedCopies: 2, savedCopiesUsed: 1, jobsHanded: 4, aiToolsConnected: 1, daysUsed: 5,
    });
    expect(numbersRows(n).map((r) => [r.id, r.value])).toEqual([["reviews", "6"], ["files", "14"], ["keys", "1"], ["weakened", "1"], ["falseDones", "2"], ["packages", "1"], ["proven", "3"], ["undone", "1"], ["saved", "2"], ["savedUsed", "1"], ["jobs", "4"], ["tools", "1"], ["days", "5"]]);
  });
  test("a count that was not counted says so, and is left out of what is sent; nothing is made up", () => {
    const w = WEEK(); delete w.jobs; delete w.days;
    const n = numbersOf(w, null);
    expect(numbersRows(n).filter((r) => r.value === S.m88.numbers.notCounted).map((r) => r.id)).toEqual(["jobs", "tools", "days"]);
    expect(Object.keys(JSON.parse(numbersJson(n)))).not.toContain("jobsHanded");
  });
  test("the JSON holds only counts and dates: never the project, a file, a decision or a word from a review", () => {
    const w = WEEK();
    const json = numbersJson(numbersOf(w, 2));
    const o = JSON.parse(json);
    expect(Object.keys(o)).toEqual(["numbers", "from", "to", "changesReviewed", "filesReviewed", "caught", "fixesProven", "undos", "savedCopies", "savedCopiesUsed", "jobsHanded", "aiToolsConnected", "daysUsed"]);
    const walk = (v: unknown, path: string): void => {
      if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); return; }
      if (path === ".from" || path === ".to") expect(v as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      else expect(Number.isInteger(v) && (v as number) >= 0, path).toBe(true);
    };
    walk(o, "");
    for (const d of w.decisions) expect(json).not.toContain(d.slice(0, 20));
    expect(json).not.toContain("p_9f2c");
    expect(mailArgs(numbersOf(w, 2))).toEqual({ json, subject: S.m88.numbers.mailSubject });
  });
  test("the address lives in one config spot, empty until the founder sets one", () => {
    expect(JSON.parse(read("./numbers.json")).to).toBe("");
    expect(NUMBERS_TO).toBe("");
    // The shell reads the very same file (numbersmail.rs), so the two can never disagree.
    expect(read("../src-tauri/src/numbersmail.rs")).toContain('include_str!("../../src/numbers.json")');
  });
  test("nothing is sent without the presses: the row asks only on its press, the mail only from Open a mail draft after the JSON is shown", () => {
    const part = read("./m88Panels.tsx");
    expect(part.match(/invoke\("numbers_mail"/g)?.length).toBe(1);
    const openMail = part.slice(part.indexOf("const openMail"), part.indexOf("\n", part.indexOf("const openMail")));
    expect(openMail).toContain('invoke("numbers_mail", mailArgs(n))');
    // Open a mail draft is drawn only in the sending state, right under the exact JSON.
    const sendBlock = part.slice(part.indexOf("numbers-send"), part.indexOf("</pre>"));
    expect(sendBlock).toContain("numbersJson(n)");
    expect(part.indexOf("{t.openMail}")).toBeGreaterThan(part.indexOf("numbers-json"));
    // The week and the tools are asked only in press().
    const press = part.slice(part.indexOf("const press = () =>"), part.indexOf("const n: YourNumbers"));
    expect(press).toContain("send(weekAsk(project))");
    expect(part.match(/send\(weekAsk\(/g)?.length).toBe(1);
    expect(part.match(/send\(showDoneSignal\(/g)?.length).toBe(1);
  });
  test("the send panel says where the numbers go, or that no address is set; the range is said in words like This week", () => {
    const part = read("./m88Panels.tsx");
    const sendBlock = part.slice(part.indexOf("numbers-send"), part.indexOf("</pre>"));
    expect(sendBlock).toContain("NUMBERS_TO ? t.goesTo(NUMBERS_TO) : t.noAddress");
    expect(S.m88.numbers.goesTo("me@example.com")).toBe("Goes to me@example.com. Your mail app opens a draft to that address.");
    expect(part).toContain("weekPage(week).range");
    expect(part).not.toContain("t.range(n.from, n.to)");
    // Every word the page has is used: the unused ones are gone.
    expect("off" in S.m88.numbers).toBe(false);
    expect("range" in S.m88.numbers).toBe(false);
  });
  test("the row's mark is a neutral one: a tick keeps meaning proven", () => {
    const part = read("./m88Panels.tsx");
    const row = part.slice(part.indexOf("<ListRow"), part.indexOf("/>", part.indexOf("<ListRow")));
    expect(row).not.toContain('icon="tick"');
    expect(row).toContain('icon="grid"');
  });
  test("its words are plain, with no praise, streak or score", () => {
    const flat = (o: unknown): string[] => (typeof o === "string" ? [o] : typeof o === "function" ? [String((o as (...a: unknown[]) => unknown)(1, 2, 3))] : o && typeof o === "object" ? Object.values(o).flatMap(flat) : []);
    for (const t of flat(S.m88)) { expect(/streak|great job|well done|awesome|nice work|score/i.test(t), t).toBe(false); expect(NO_DASH.test(t), t).toBe(false); }
  });
});

describe("(b) Share what my AI did: redaction", () => {
  test("keys are hidden and a line that still looks like a key is left out", () => {
    expect(shareLine("Added the key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA to the form", PROJECT)).not.toContain("sk-ant");
    const doc = shareFromTask(task({ label: "Use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab in deploy" }), PROJECT, NOW);
    expect(JSON.stringify(doc)).not.toContain("ghp_ABCDEFGHIJ");
  });
  test("paths are hidden: the project's folder is said as its name, and any other folder or file path goes", () => {
    expect(shareLine(`Fixed ${PROJECT}/src/App.tsx and ~/Desktop/notes.txt`, PROJECT)).toBe("Fixed (hidden) and (hidden)");
    expect(shareLine("Fix the header in components/Header.tsx", PROJECT)).toBe("Fix the header in (hidden)");
    expect(shareLine("Read C:\\Users\\sam\\x.txt", PROJECT)).toBe("Read (hidden)");
    expect(shareLine(PROJECT, PROJECT)).toBe("mug-shop");
    expect(shareLine("src/a.ts", PROJECT)).toBeNull();
    // Paths side by side are said as one hidden mark, built from the words in strings.ts (never the words written here).
    expect(shareLine("Moved a/b c/d e/f to x/y", PROJECT)).toBe(`Moved ${S.m88.share.hidden} to ${S.m88.share.hidden}`);
    const code = read("./shareReceipt.ts").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    expect(code).not.toContain("hidden\\)");
    // A colon in plain words is not a path or a link.
    expect(shareLine("Fix the profile: avatar upload", PROJECT)).toBe("Fix the profile: avatar upload");
    expect(projectName(PROJECT)).toBe("mug-shop");
    expect(projectName("/Users/sam/Projects/mug-shop/")).toBe("mug-shop");
  });
  test("a task's receipt: its words, the files as a count only, its proof, and the picture only when it is a JPEG", () => {
    const d = shareFromTask(task(), PROJECT, NOW, JPEG);
    expect(d).toMatchObject({ kind: "task", title: "What my AI did", project: "mug-shop", summary: ["Fix the contact form", "3 files changed."], proof: { words: "Its checks passed.", tone: "ok" }, shot: JPEG, counts: [] });
    expect(shareFromTask(task({ proof: "failed", undone: true }), PROJECT, NOW).summary).toContain(S.m88.share.undone);
    expect(shareFromTask(task({ proof: "failed" }), PROJECT, NOW).proof).toEqual({ words: "Its checks did not pass.", tone: "bad" });
    expect(shareFromTask(task({ proof: null }), PROJECT, NOW).proof).toEqual({ words: "No checks were run for this.", tone: "skip" });
    expect(shotOk("iVBORw0KGgo=")).toBeUndefined();   // not a JPEG
    expect(shotOk(`${JPEG}"><script>`)).toBeUndefined();
    expect(shareFromTask(task(), PROJECT, NOW, "data:image/jpeg;base64,xx").shot).toBeUndefined();
  });
  test("a week's receipt: plain lines and counts, never the decisions or house rules (they are words)", () => {
    const w = WEEK();
    const d = shareFromWeek(w, PROJECT, null, NOW);
    expect(d.kind).toBe("week");
    expect(d.summary[0]).toBe("6 changes reviewed, 14 files in all.");
    const all = JSON.stringify(d);
    for (const x of w.decisions) expect(all).not.toContain(x);
    // A count not known (tools, here) is left out rather than shown as unknown.
    expect(d.counts.map((c) => c.label)).not.toContain(S.m88.numbers.rows.tools);
    expect(d.counts.find((c) => c.label === S.m88.numbers.rows.jobs)?.value).toBe("4");
  });
  test("a week's receipt says each count once: the sentences, and the table only for what they do not say", () => {
    const w = WEEK(), p = weekPage(w);
    const d = shareFromWeek(w, PROJECT, 2, NOW);
    expect(d.summary).toEqual([...p.lines, ...p.caught.map((c) => `${c}.`)]);
    const r = S.m88.numbers.rows;
    expect(d.counts).toEqual([{ label: r.jobs, value: "4" }, { label: r.tools, value: "2" }, { label: r.days, value: "5" }]);
    for (const x of [r.reviews, r.files, r.keys, r.weakened, r.falseDones, r.packages, r.proven, r.undone, r.saved, r.savedUsed]) expect(d.counts.map((c) => c.label)).not.toContain(x);
  });
  test("the file: self contained, nothing that runs or loads, everything escaped, colours only from the palette", () => {
    const d = shareFromTask(task({ label: '<img src=x onerror="alert(1)"> fix' }), PROJECT, NOW, JPEG);
    const h = receiptHtml(d, PALETTE);
    expect(h.startsWith("<!doctype html>\n")).toBe(true);
    expect(h).toContain(RECEIPT_META);
    expect(h).not.toContain("<img src=x");
    expect(h).toContain("&lt;img");
    const low = h.toLowerCase();
    for (const bad of ["<script", "<iframe", "<link", "href=", "@import", "url(", "javascript:", "http:", "https:", "/users/", "~/"]) expect(low, bad).not.toContain(bad);
    expect(low.match(/<img/g)?.length).toBe(1);
    expect(h).toContain(`src="data:image/jpeg;base64,${JPEG}"`);
    const used = new Set((h.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((x) => x.toUpperCase()));
    for (const c of used) expect(Object.values(PALETTE).map((x) => x.toUpperCase())).toContain(c);
    expect(read("./shareReceipt.ts")).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    // A colour the stylesheet could not give is inherit, never one written in the code.
    expect(receiptHtml(d, { ...PALETTE, ink: "" })).toContain("color:inherit");
    expect(receiptFileName(d)).toBe(`mug-shop what my AI did ${dayOf(NOW.toISOString())}`);
  });
  test("the shared fixture is exactly what the page makes, and the shell's own check passes it (receiptfile.rs reads it)", () => {
    const d = shareFromTask(task(), PROJECT, new Date(2026, 10, 14, 12), JPEG);
    expect(receiptHtml(d, PALETTE)).toBe(read("../../protocol/fixtures/m88-receipt.html"));
    expect(read("../src-tauri/src/receiptfile.rs")).toContain('include_str!("../../../protocol/fixtures/m88-receipt.html")');
  });
  test("the preview shows before anything is saved, and Save is the only way out of the page", () => {
    const p = read("./m88Panels.tsx");
    expect(p.match(/invoke\("save_receipt"/g)?.length).toBe(1);
    const save = p.slice(p.indexOf("const save = () =>"), p.indexOf("return (", p.indexOf("const save = () =>")));
    expect(save).toContain('invoke("save_receipt", { name: receiptFileName(doc), html })');
    expect(read("./card.tsx")).toContain("<SharePreview id={`share-${h.id}`}");
    expect(read("./weekSummary.tsx")).toContain('<SharePreview id="share-week"');
  });
  test("the preview is the very page that is saved: one string, shown in a frame that runs nothing", () => {
    const p = read("./m88Panels.tsx");
    const prev = p.slice(p.indexOf("export function SharePreview"));
    expect(prev).toContain("const html = useMemo(() => receiptHtml(doc, readPalette(css)), [doc])");
    expect(prev).toContain('invoke("save_receipt", { name: receiptFileName(doc), html })');
    expect(prev).toMatch(/<iframe[^>]*sandbox="allow-same-origin"[^>]*srcDoc=\{html\}/);
    expect(prev).not.toContain("allow-scripts");
    expect(prev).not.toContain("share-paper");
    expect(read("./ui/pages.css")).not.toContain(".share-paper");
  });
  test("a page the shell refuses gets its own words, not the ones for a folder that could not be written", () => {
    const p = read("./m88Panels.tsx");
    expect(p).toContain('(e) => setSaid(e === "notSaved" ? s.notSaved : s.notAllowed)');
    expect(S.m88.share.notAllowed).not.toBe(S.m88.share.notSaved);
    expect(S.m88.share.notAllowed).not.toMatch(/another place/i);
  });
});

describe("(c) payments, still switched off (F31)", () => {
  test("the founder's offers live in prices.json: yearly 20% off, students 50% off the first month, invite and earn 25% and 25% for 12 months", () => {
    expect(JSON.parse(read("./prices.json")).offers).toEqual({ yearlyOffPercent: 20, studentFirstMonthOffPercent: 50, inviteFriendFirstMonthOffPercent: 25, inviterSharePercent: 25, inviterMonths: 12 });
    expect(OFFERS).toEqual({ yearlyOff: 20, studentFirstMonthOff: 50, friendFirstMonthOff: 25, inviterShare: 25, inviterMonths: 12 });
    expect(offersFrom({ offers: { yearlyOffPercent: 0, studentFirstMonthOffPercent: 100, inviteFriendFirstMonthOffPercent: "25", inviterSharePercent: 25.5, inviterMonths: 36 } })).toEqual({ yearlyOff: null, studentFirstMonthOff: null, friendFirstMonthOff: null, inviterShare: null, inviterMonths: null });
    expect(offersFrom(null).yearlyOff).toBeNull();
  });
  test("Pro stays 15 a month, and the yearly price is twelve months less 20%: the file agrees with itself", () => {
    expect(PRICES.proMonthly).toBe(15);
    expect(yearlyFrom(15, 20)).toBe(144);
    expect(PRICES.proYearly).toBe(144);
    expect(yearlyAgrees()).toBe(true);
    expect(yearlyAgrees({ ...PRICES, proYearly: 150 })).toBe(false);
  });
  test("a student's first month, a friend's first month, and the inviter's credit", () => {
    expect(studentFirstMonth()).toBe(7.5);
    expect(friendFirstMonth()).toBe(11.25);
    expect(less(15, 25)).toBe(11.25);
    expect(cents(0.1 + 0.2)).toBe(0.3);
    // 25% of the friend's plan for each month they are on it, up to 12 months.
    expect(inviterCredit({ term: "monthly", paid: 1 })).toBe(3.75);
    expect(inviterCredit({ term: "monthly", paid: 12 })).toBe(45);
    expect(inviterCredit({ term: "monthly", paid: 30 })).toBe(45);
    expect(inviterCredit({ term: "monthly", paid: 0 })).toBe(0);
    // A yearly friend: 25% of the yearly plan once (it covers the twelve months), never a second year.
    expect(inviterCredit({ term: "yearly", paid: 1 })).toBe(36);
    expect(inviterCredit({ term: "yearly", paid: 3 })).toBe(36);
    expect(inviterCredit({ term: "monthly", paid: -1 })).toBeNull();
    expect(inviterCredit({ term: "monthly", paid: 2 }, PRICES, { ...OFFERS, inviterShare: null })).toBeNull();
  });
  test("with payments off (today) no offer shows to anyone; with them on, the three lines in percents only", () => {
    expect(offerLines(OFF)).toEqual([]);
    expect(offerLines(statusFrom(null))).toEqual([]);
    const on: PlanStatus = statusFrom({ paymentsOn: true, plan: "free", state: "free", key: null, trial: null, trialUsed: false, checkout: { yearly: true, monthly: true }, portal: true });
    const lines = offerLines(on);
    expect(lines).toEqual([
      "Yearly saves 20%.",
      "Students get 50% off their first month.",
      "Invite a friend: they get 25% off their first monthly month, and you get 25% of their plan as credit, for up to 12 months.",
    ]);
    for (const l of lines) { expect(l).not.toMatch(/\$\d/); expect(NO_DASH.test(l)).toBe(false); }
    expect(offerLines(on, { ...PRICES, proYearly: null })).not.toContain("Yearly saves 20%.");
    // Both switches stay off in the build: the billing files say so.
    for (const f of ["../src-tauri/billing.live.json", "../src-tauri/billing.test.json"]) expect(JSON.parse(read(f)).paymentsOn, f).toBe(false);
  });
  test("recorded as a founder decision, and no dollar amount is written outside prices.json", () => {
    const f31 = read("../../docs/decisions/F31-yearly-students-and-invites.md");
    expect(f31).toContain("13 Nov 2026");
    expect(f31).toContain("prices.json");
    for (const f of ["./plan.ts", "./planCard.tsx", "./strings.ts", "./m88Panels.tsx", "./shareReceipt.ts", "./yourNumbers.ts", "./spokenStatus.ts"]) expect(read(f).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n"), f).not.toMatch(/\$\d|\b(15|144|7\.5|11\.25) a (month|year)/);
  });
});

describe("(d) spoken status", () => {
  const P = "/p";
  const base = (): Model => ({ ...initial(), folder: P } as Model);
  const passed = (): Model => ({ ...base(), task: { agent: "builder-1" } as never, agents: { ...initial().agents, "builder-1": "done" } as never, receipt: { checkpoint: "cp_0003", proof: "passed", changed: [], commands: 0, notUndoable: [], usdEstimate: 0 } as never });
  const waiting = (): Model => ({ ...base(), claudeWaiting: { project: P } } as Model);
  const stop = (): Model => ({ ...base(), review: { project: P, batch: "rv_1", stage: "reviewed", result: { rating: "stop" } } as never });
  test("off as usual: no moment is chosen, and nothing is said without voice on", () => {
    expect(JSON.parse(read("../../protocol/settings.json")).settings.find((d: { key: string }) => d.key === "speak.status").default).toEqual([]);
    expect(statusLines(passed(), P, [])).toEqual([]);
    expect(statusSays("fixPassed", ["fixPassed"], false)).toBe(false);
    expect(statusSays("fixPassed", ["fixPassed"], true)).toBe(true);
    expect(momentsOf(["notSafe", "shout", 3])).toEqual(["notSafe"]);
    expect([...STATUS_MOMENTS]).toEqual(["fixPassed", "toolWaiting", "notSafe", "replay"]);
  });
  test("each moment, in fixed words, only for the open project", () => {
    const all = [...STATUS_MOMENTS];
    expect(statusLines(passed(), P, all).map((l) => l.text)).toEqual(["Your fix passed its checks."]);
    expect(statusLines(waiting(), P, all).map((l) => l.text)).toEqual(["Claude Code is waiting on you."]);
    expect(statusLines(stop(), P, all).map((l) => l.text)).toEqual(["A review says this change is not safe yet."]);
    expect(statusLines(waiting(), "/other", all)).toEqual([]);
    expect(statusLines(stop(), "/other", all)).toEqual([]);
    // Not proven, put back, or still running: no "passed".
    expect(statusLines({ ...passed(), receipt: { ...passed().receipt!, proof: "partial" } } as Model, P, all)).toEqual([]);
    expect(statusLines({ ...passed(), receipt: { ...passed().receipt!, undone: true } } as Model, P, all)).toEqual([]);
    expect(statusLines({ ...passed(), agents: { ...initial().agents, "builder-1": "working" } } as Model, P, all)).toEqual([]);
    // A review that says worth a look is not "not safe".
    expect(statusLines({ ...base(), review: { project: P, batch: "rv_1", stage: "reviewed", result: { rating: "worth_a_look" } } } as never, P, all)).toEqual([]);
  });
  test("said once; a moment that went away can be said when it comes back; Stop everything (quiet) says nothing late", () => {
    const lines = statusLines(waiting(), P, ["toolWaiting"]);
    let n = nextStatus(lines, new Set(), false);
    expect(n.say.map((l) => l.text)).toEqual(["Claude Code is waiting on you."]);
    n = nextStatus(lines, n.said, false);
    expect(n.say).toEqual([]);
    n = nextStatus([], n.said, false);        // it stopped waiting
    n = nextStatus(lines, n.said, false);     // and waits again
    expect(n.say.map((l) => l.text)).toEqual(["Claude Code is waiting on you."]);
    const q = nextStatus(lines, new Set(), true);
    expect(q.say).toEqual([]);
    expect(nextStatus(lines, q.said, false).say).toEqual([]);
  });
  test("two moments at once are both said, in order; neither is marked said without being said", () => {
    const both = statusLines({ ...passed(), review: stop().review } as Model, P, ["fixPassed", "notSafe"]);
    expect(both.length).toBe(2);
    const n = nextStatus(both, new Set(), false);
    expect(n.say.map((l) => l.text)).toEqual(["Your fix passed its checks.", "A review says this change is not safe yet."]);
    expect(nextStatus(both, n.said, false).say).toEqual([]);
    // One already said, one new: only the new one.
    const one = nextStatus(both.slice(0, 1), new Set(), false);
    expect(nextStatus(both, one.said, false).say.map((l) => l.text)).toEqual(["A review says this change is not safe yet."]);
  });
  test("choosing a moment, or opening another project, never says what is already on Home; only what comes after", () => {
    const P2 = "/q";
    const ctxOff = statusContext(P, []), ctxOn = statusContext(P, ["fixPassed"]);
    expect(ctxOff).not.toBe(ctxOn);
    expect(statusContext(P, ["fixPassed", "shout"])).toBe(ctxOn);
    // On Home already: a passed fix. Turning fixPassed on says nothing about it.
    let st = statusStep([], { said: new Set(), ctx: "" }, ctxOff, false).state;
    const old = statusLines(passed(), P, ["fixPassed"]);
    let n = statusStep(old, st, ctxOn, false);
    expect(n.say).toEqual([]);
    // A new fix that passes afterwards is said.
    const fresh = statusLines({ ...passed(), receipt: { ...passed().receipt!, checkpoint: "cp_0004" } } as Model, P, ["fixPassed"]);
    n = statusStep(fresh, n.state, ctxOn, false);
    expect(n.say.map((l) => l.text)).toEqual(["Your fix passed its checks."]);
    // Another project whose last receipt passed: nothing is said on opening it.
    const other = statusLines(passed(), P2, ["fixPassed"]);
    expect(statusStep(other, n.state, statusContext(P2, ["fixPassed"]), false).say).toEqual([]);
    // The very first look after the page opens says nothing late either.
    expect(statusStep(old, { said: new Set(), ctx: "" }, ctxOn, false).say).toEqual([]);
  });
  test("Watch what changed out loud: each beat waits for its words at the voice's speed, never sooner than the drawing", () => {
    const r: ReplayView = { beats: [{ say: "Three files changed in the pages and the server.", draw: "count" }, { say: "The tests passed.", draw: "check", ref: "Tests" }, { say: "It is proven by its checks, so it works as far as they go.", draw: "verdict" }], by: "rules", files: [], count: 3, more: 0, checks: [] };
    const drawn = replayTimes(r, "normal"), said = spokenReplayTimes(r, "normal", 0.8);
    expect(said.map((t) => t.at)[0]).toBe(0);
    for (let i = 0; i < said.length; i++) expect(said[i].dur).toBeGreaterThanOrEqual(drawn[i].dur);
    for (let i = 1; i < said.length; i++) expect(said[i].at).toBe(said[i - 1].at + said[i - 1].dur);
  });
  test("through the existing spoken replies path only: quiet during calls and while listening, captions shown, Stop everything silences", () => {
    const card = read("./card.tsx"), view = read("./replayView.tsx");
    const block = card.slice(card.indexOf("// M88 (d): spoken status"), card.indexOf("// Another project: its answers"));
    expect(block).toContain("if (words) sayIt(words, false);");
    expect(block).not.toContain('invoke("speak"');
    expect(block).toContain('"app.stop_everything"');
    expect(view).toContain('statusSays("replay", statusChoice, voice)');
    expect(view).toContain('invoke("speak", { text: replay.beats[i].say })');
    expect(view).toContain("hushed.current = true");
    const rs = read("../src-tauri/src/shell_speech.rs");
    const speak = rs.slice(rs.indexOf("fn speak(app: AppHandle"), rs.indexOf("// ---------- Voice settings"));
    expect(speak).toContain("if quiet()");
    expect(speak).toContain("if listening_now()");
    expect(speak).toContain('setting_now("talk.captions")');
    expect(read("../src-tauri/src/main.rs")).toMatch(/point_cancel\(\); turn_cancel\(\); speech_off\(app\);/);
  });
});
