// Home never takes the keyboard by itself (rule 9). focus.ts and confirm.tsx move it only when the control that had it
// went away, Home has the keyboard and nothing in it does. These run the real decisions against a stand in page (no
// screen): which element has the keyboard, whether Home's window has it, the elements, the time. Each guard is checked by
// what it does, so taking one out fails here, not only a text check.
import { describe, expect, test } from "bun:test";
import { BACK_MS } from "./a11y.ts";
import { openStep } from "./confirm.tsx";
import { focusBack, focusIfLost, refocus, takeIfLost, type Focusable, type Page, type Seen } from "./focus.ts";

type Fake = Focusable & { focused: number; attrs: Map<string, string>; tabIndex: number; isConnected: boolean; disabled: boolean };
function fake(tagName = "BUTTON", o: { isConnected?: boolean; disabled?: boolean; tabIndex?: number; attrs?: Record<string, string> } = {}): Fake {
  const attrs = new Map(Object.entries(o.attrs ?? {}));
  const el: Fake = {
    tagName, isConnected: o.isConnected ?? true, disabled: o.disabled ?? false, tabIndex: o.tabIndex ?? 0, focused: 0, attrs,
    focus() { el.focused++; },
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string, v: string) => { attrs.set(n, v); },
  };
  return el;
}

type At = { tagName: string } | null;
function page(o: { active?: At; has?: boolean; ids?: Record<string, Focusable>; now?: number } = {}): Page {
  return { active: () => (o.active === undefined ? { tagName: "BODY" } : o.active), hasFocus: () => o.has ?? true, byId: (id) => o.ids?.[id] ?? null, now: () => o.now ?? 10_000 };
}

// Home may put the keyboard back: its window has the keyboard and nothing in it does.
const LOST: [string, At][] = [["nothing has it", null], ["the page itself has it", { tagName: "BODY" }], ["the document has it", { tagName: "HTML" }]];
// Home must leave the keyboard alone.
const NOT_OURS: [string, { active?: At; has?: boolean }][] = [
  ["another app has the keyboard (Home's window does not)", { has: false }],
  ["another app has it and nothing in Home does", { active: null, has: false }],
  ["the person is typing in a box", { active: { tagName: "INPUT" } }],
  ["the person is typing in a text area", { active: { tagName: "TEXTAREA" } }],
  ["the person is in a list", { active: { tagName: "SELECT" } }],
  ["another control in Home has it", { active: { tagName: "BUTTON" } }],
];

describe("takeIfLost: the one rule every move of the keyboard in focus.ts and confirm.tsx goes through", () => {
  for (const [why, o] of NOT_OURS) test(`never when ${why}`, () => {
    const el = fake();
    expect(takeIfLost(() => el, page(o))).toBe(false);
    expect(el.focused).toBe(0);
  });
  for (const [why, active] of LOST) test(`when ${why} in a window that has the keyboard`, () => {
    const el = fake();
    expect(takeIfLost(() => el, page({ active }))).toBe(true);
    expect(el.focused).toBe(1);
  });
  test("nothing to go to: nothing moves", () => {
    expect(takeIfLost(() => null, page())).toBe(false);
    expect(takeIfLost(() => undefined, page())).toBe(false);
  });
});

describe("a box opened from the person's own press (Edit, Open from a link, Replace the key)", () => {
  for (const [why, o] of NOT_OURS) test(`does not take the keyboard when ${why}`, () => {
    const box = fake("INPUT");
    focusIfLost(box, page(o));
    expect(box.focused).toBe(0);
  });
  test("takes it when the button that opened it went away and Home has the keyboard", () => {
    const box = fake("INPUT");
    focusIfLost(box, page());
    expect(box.focused).toBe(1);
    expect(() => focusIfLost(null, page())).not.toThrow();
  });
});

describe("an \"are you sure\" step opening (ConfirmStep)", () => {
  const stepBox = (cancel: Fake | null, list: Fake[]) =>
    ({ querySelector: (s: string) => (s === "[data-cancel]" ? cancel : null), querySelectorAll: () => list }) as unknown as HTMLElement;
  for (const [why, o] of NOT_OURS) test(`does not take the keyboard when ${why}`, () => {
    const yes = fake(), cancel = fake();
    expect(openStep(stepBox(cancel, [yes, cancel]), page(o))).toBe(false);
    expect(cancel.focused + yes.focused).toBe(0);
  });
  test("takes it to the safe choice after the person's own press took away the button they pressed", () => {
    const yes = fake(), cancel = fake();
    expect(openStep(stepBox(cancel, [yes, cancel]), page())).toBe(true);
    expect(cancel.focused).toBe(1);
    expect(yes.focused).toBe(0);
  });
  test("with no safe choice marked, its first choice that can take the keyboard", () => {
    const off = fake("BUTTON", { disabled: true }), skipped = fake("SPAN", { tabIndex: -1 }), first = fake();
    expect(openStep(stepBox(null, [off, skipped, first]), page())).toBe(true);
    expect([off.focused, skipped.focused, first.focused]).toEqual([0, 0, 1]);
  });
  test("nothing there: nothing moves", () => {
    expect(openStep(null, page())).toBe(false);
    expect(openStep(stepBox(null, []), page())).toBe(false);
  });
});

describe("refocus: when the control with the keyboard goes away", () => {
  const setup = (o: { back?: Fake; spot?: Fake; tab?: Fake | null } = {}) => {
    const gone = fake("BUTTON", { isConnected: false });
    const spot = o.spot ?? fake("SECTION");
    const tab = o.tab === undefined ? fake() : o.tab;
    const seen: Seen = { last: gone, around: [spot] };
    return { gone, spot, tab, seen, tabOf: () => tab };
  };
  const moved = (...els: (Fake | null)[]) => els.reduce((n, e) => n + (e?.focused ?? 0), 0);

  test("nothing moves while the control that had the keyboard is still there", () => {
    const { spot, tab, tabOf } = setup();
    const here = fake();
    const seen: Seen = { last: here, around: [spot] };
    expect(refocus(seen, tabOf, page())).toBeNull();
    expect(moved(here, spot, tab)).toBe(0);
    expect(seen.last).toBe(here);
    expect(refocus({ last: null, around: [spot] }, tabOf, page())).toBeNull();
  });
  for (const [why, o] of NOT_OURS) test(`nothing moves when ${why}, even though its control went away`, () => {
    const opener = fake();
    const { spot, tab, seen, tabOf } = setup();
    const p = page({ ...o, ids: { opener } });
    focusBack("opener", p);
    expect(refocus(seen, tabOf, p)).toBeNull();
    expect(moved(opener, spot, tab)).toBe(0);
    expect(seen.last, "the control that went away is forgotten").toBeNull();
  });
  test("back to the button a closed step was opened from", () => {
    const opener = fake();
    const { spot, tab, seen, tabOf } = setup();
    focusBack("opener", page({ now: 10_000 }));
    expect(refocus(seen, tabOf, page({ ids: { opener }, now: 10_000 + BACK_MS }))).toBe(opener);
    expect([opener.focused, spot.focused, tab!.focused]).toEqual([1, 0, 0]);
  });
  test("an old way back is not used: the nearest part of Home still showing instead, made able to hold the keyboard", () => {
    const opener = fake();
    const { spot, seen, tabOf } = setup();
    focusBack("opener", page({ now: 10_000 }));
    expect(refocus(seen, tabOf, page({ ids: { opener }, now: 10_001 + BACK_MS }))).toBe(spot);
    expect(opener.focused).toBe(0);
    expect(spot.attrs.get("tabindex")).toBe("-1");
  });
  test("a way back to a button that is gone or turned off is not used", () => {
    for (const opener of [fake("BUTTON", { isConnected: false }), fake("BUTTON", { disabled: true })]) {
      const { spot, seen, tabOf } = setup();
      focusBack("opener", page());
      expect(refocus(seen, tabOf, page({ ids: { opener } }))).toBe(spot);
      expect(opener.focused).toBe(0);
    }
  });
  test("a part of Home that already takes the keyboard keeps its own place in the Tab order", () => {
    const { spot, seen, tabOf } = setup({ spot: fake("DIV", { attrs: { tabindex: "0" } }) });
    expect(refocus(seen, tabOf, page())).toBe(spot);
    expect(spot.attrs.get("tabindex")).toBe("0");
  });
  test("else the open tab, left as it is", () => {
    const { spot, tab, seen, tabOf } = setup({ spot: fake("SECTION", { isConnected: false }) });
    expect(refocus(seen, tabOf, page())).toBe(tab);
    expect([spot.focused, tab!.focused]).toEqual([0, 1]);
    expect(tab!.attrs.has("tabindex")).toBe(false);
  });
  test("no open tab to go to: nothing moves", () => {
    const { spot, seen, tabOf } = setup({ spot: fake("SECTION", { isConnected: false }), tab: null });
    expect(refocus(seen, tabOf, page())).toBeNull();
    expect(spot.focused).toBe(0);
  });
  test("a way back is used once", () => {
    const opener = fake();
    focusBack("opener", page());
    const a = setup();
    expect(refocus(a.seen, a.tabOf, page({ ids: { opener } }))).toBe(opener);
    const b = setup();
    expect(refocus(b.seen, b.tabOf, page({ ids: { opener } }))).toBe(b.spot);
    expect(opener.focused).toBe(1);
  });
  test("a way back asked while the keyboard was elsewhere is dropped, never kept for later", () => {
    const opener = fake();
    focusBack("opener", page());
    const a = setup();
    expect(refocus(a.seen, a.tabOf, page({ has: false, ids: { opener } }))).toBeNull();
    const b = setup();
    expect(refocus(b.seen, b.tabOf, page({ ids: { opener } }))).toBe(b.spot);
    expect(opener.focused).toBe(0);
  });
});
