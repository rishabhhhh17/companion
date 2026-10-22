// Second Look, as the card sees it: the light and the read happen in the app (seclook.rs); the card shows each stage, then
// the verdict, each thing to check and how, a page a web search found (opened only on a press), what it checked, what it
// could not tell, whether it searched, and the cost estimate. Only the answer to this press counts; Stop clears it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseEvent } from "../../protocol/index.ts";
import { initial, reduce, slLines, slSources, type Model } from "./model.ts";
import { need } from "./home.ts";
import { activeGroup, usedBy } from "./groups.ts";
import { slCopy } from "./copytext.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const stage = (s: string, o: Record<string, unknown> = {}) => ev({ type: "app.second_look", stage: s, ...o });
const result = (o: Record<string, unknown> = {}) => ev({
  type: "secondlook.result", req: "sl_1", ok: true, verdict: "check",
  items: [
    { kind: "number", claim: "120 × 4 = 460", issue: "120 × 4 is 480, not 460.", verify: "Redo this calculation, or check it in a calculator.", by: "recomputed" },
    { kind: "citation", claim: "Smith v. Jones (2019)", issue: "I could not find this case.", verify: "Search the court's records for it.", by: "model", source: { url: "https://courts.example.gov/smith", title: "Court records" } },
  ],
  checked: ["The steps follow from each other."], cantTell: ["Whether the law changed this year."], search: "searched", searches: 2, usdEstimate: 0.03, ...o,
});
const thinking = () => run([stage("reading", { app: "ChatGPT" }), stage("thinking", { app: "ChatGPT", req: "sl_1" })]);

describe("each stage on the card", () => {
  test("reading, thinking for this press, then the answer in plain words", () => {
    let m = run([stage("reading", { app: "ChatGPT" })]);
    expect(slLines(m)).toEqual([S.slReading("ChatGPT")]);
    m = thinking();
    expect(slLines(m)).toEqual([S.slThinking]);
    m = reduce(m, result() as never);
    expect(m.sl?.stage).toBe("ready");
    const lines = slLines(m);
    expect(lines[0]).toBe(S.slVerdict.check);
    expect(lines).toContain('"120 × 4 = 460": 120 × 4 is 480, not 460.');
    expect(lines).toContain(S.slRecomputed);
    expect(lines).toContain("To check: Search the court's records for it.");
    expect(lines).toContain(S.slChecked("The steps follow from each other."));
    expect(lines).toContain(S.slCantTell("Whether the law changed this year."));
    expect(lines).toContain(S.slSearched(2));
    expect(lines.at(-1)).toBe(S.slCost("3 cents"));
    for (const l of lines) expect(l, l).not.toMatch(/[—–]/);
  });
  test("solid and I can't tell say so; not searching is said honestly, for each reason", () => {
    expect(slLines(reduce(thinking(), result({ verdict: "solid", items: [], cantTell: [] }) as never))[0]).toBe(S.slVerdict.solid);
    expect(slLines(reduce(thinking(), result({ verdict: "cant_tell", items: [] }) as never))[0]).toBe(S.slVerdict.cant_tell);
    for (const s of ["not_needed", "off", "unavailable"]) expect(slLines(reduce(thinking(), result({ search: s, searches: 0 }) as never)), s).toContain(S.slSearch[s]);
  });
  test("an answer to an older press, or with no press waiting, is ignored", () => {
    expect(reduce(run([stage("thinking", { req: "sl_2" })]), result() as never).sl?.stage).toBe("thinking");
    expect(run([result()]).sl).toBeNull();
  });
  test("a failure says why; switched off says where to turn it on; Close and Stop everything clear it", () => {
    const failed = reduce(thinking(), result({ ok: false, verdict: undefined, items: [], reason: "Stopped." }) as never);
    expect(failed.sl?.stage).toBe("failed");
    expect(slLines(failed)).toEqual(["Stopped."]);
    expect(slLines(run([stage("off")]))).toEqual([S.slOff]);
    expect(run([stage("dismissed")], thinking()).sl).toBeNull();
    expect(reduce(thinking(), { type: "ui.slClosed" } as never).sl).toBeNull();
    expect(reduce(thinking(), ev({ type: "app.stop_everything" }) as never).sl).toBeNull();
  });
});

describe("pages it found", () => {
  test("only web addresses are kept, each once, and they are opened only through the card's one Open button", () => {
    const m = reduce(thinking(), result() as never);
    expect(slSources(m)).toEqual([{ url: "https://courts.example.gov/smith", title: "Court records" }]);
    const bad = reduce(thinking(), result({ items: [{ kind: "fact", claim: "x", issue: "y", verify: "z", by: "model", source: { url: "javascript:alert(1)", title: "t" } }] }) as never);
    expect(slSources(bad)).toEqual([]);
    expect(slCopy(m)).toContain("Court records: https://courts.example.gov/smith");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const panel = card.slice(card.indexOf('show("secondLook")'), card.indexOf('show("showMe")'));
    expect(panel).toContain("<ResearchNote key={src.url}");
    expect(panel).not.toContain("open_link");
  });
});

describe("Home and the groups", () => {
  test("its card opens Now and must show; it lights the Voice group while it reads and thinks; a real answer marks it tried", () => {
    expect(need(thinking())).toBeNull();
    expect(need(run([stage("reading", { app: "ChatGPT" })]))).toMatchObject({ tab: "now", mustShow: true, why: S.slTitle });
    expect(need(reduce(thinking(), result() as never))).toMatchObject({ tab: "now" });
    expect(activeGroup(thinking())).toBe("voice");
    expect(usedBy({ type: "secondlook.result", ok: true })).toEqual(["secondLook"]);
    expect(usedBy({ type: "secondlook.result", ok: false })).toEqual([]);
  });
  test("the shared protocol fixtures are answers the card can show", () => {
    const lines = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"secondlook.result"'));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const l of lines) {
      expect(parseEvent(l).ok, l).toBe(true);
      const e = JSON.parse(l);
      const m = reduce(run([stage("thinking", { req: e.req })]), e);
      expect(slLines(m).length, l).toBeGreaterThan(0);
    }
  });
});
