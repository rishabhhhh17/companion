// Must fix 4 (review of 4 Nov): one error while drawing blanked the whole window (the blank Settings of 3 Nov). Each Home
// place, the Settings body and the first run now sit in a boundary that shows one plain line and Reload this part, and
// notes the failure for a report. Settings reads its settings through one useSettings hook, never a hook per key in a loop,
// and a bad event keeps the page's state as it was.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { failureDetail, PartBoundary } from "./partBoundary.tsx";
import { eventFailureDetail, safeReduce } from "./useModel.ts";
import { initial, type Model } from "./model.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("a part that fails to draw", () => {
  test("shows one plain line and Reload this part, never a blank window", () => {
    expect(PartBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const b = new PartBoundary({ part: "now", children: null });
    b.state = { failed: true, tries: 0 };
    const html = renderToStaticMarkup(b.render() as never);
    expect(html).toContain(S.partFailed);
    expect(html).toContain(S.partReload);
    expect(html).toContain('role="alert"');
    expect(S.partFailed).toMatch(/^[A-Z][^—]*\.$/);
    expect(S.partReload).toBe("Reload this part");
  });
  test("draws its children while nothing failed", () => {
    expect(renderToStaticMarkup(createElement(PartBoundary, { part: "now" }, createElement("p", null, "hello")))).toBe("<p>hello</p>");
  });
  test("Reload this part draws it again, fresh", () => {
    const b = new PartBoundary({ part: "now", children: null });
    let next: unknown = null;
    b.state = { failed: true, tries: 0 };
    b.setState = ((f: unknown) => { next = typeof f === "function" ? (f as (s: unknown) => unknown)(b.state) : f; }) as never;
    b.reload();
    expect(next).toEqual({ failed: false, tries: 1 });
  });
  test("going to another place clears the failure", () => {
    const b = new PartBoundary({ part: "now", resetKey: "history", children: null });
    let next: unknown = null;
    b.state = { failed: true, tries: 0 };
    b.setState = ((f: unknown) => { next = f; }) as never;
    b.componentDidUpdate({ part: "now", resetKey: "now", children: null });
    expect(next).toEqual({ failed: false });
  });
  test("the failure is noted for a report, short and with keys hidden", () => {
    const d = failureDetail(new Error("boom with sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789abcdefghij"), "\n    at Row\n    at GroupView\n    at PageView");
    expect(d).toContain("boom");
    expect(d).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(d).toContain("Row");
    expect(d.length).toBeLessThanOrEqual(400);
    const src = read("./partBoundary.tsx");
    expect(src).toContain('invoke("note_failure"');
  });
  test("the character page and the notch have one too, so a draw error never blanks them", () => {
    expect(read("./dock.tsx")).toContain('<PartBoundary part="dock" auto>');
    expect(read("./island.tsx")).toContain('<PartBoundary part="island" auto>');
  });
  test("an auto boundary draws the part again by itself a few times before it shows the line", () => {
    const b = new PartBoundary({ part: "dock", auto: true, children: null });
    b.state = { failed: true, tries: 0 };
    const html = renderToStaticMarkup(b.render() as never);
    expect(html).toBe("");
    b.state = { failed: true, tries: 3 };
    expect(renderToStaticMarkup(b.render() as never)).toContain(S.partReload);
  });
  test("each Home place, the Settings body and the first run have one", () => {
    const card = read("./card.tsx");
    expect(card).toContain('<PartBoundary part="firstRun">');
    expect(card).toContain("<PartBoundary part={home.tab} resetKey={home.tab}>");
    const settings = read("./settingsPage.tsx");
    expect(settings).toContain("<PartBoundary part=\"settings\" resetKey={page}>");
  });
});

describe("Settings never calls a hook in a loop", () => {
  test("one useSettings hook reads many keys", () => {
    const settings = read("./settingsPage.tsx");
    expect(settings).not.toMatch(/for \(const [^)]*\) \{?[^}\n]*useSetting\(/);
    expect(settings).toContain("useSettings(");
    expect(read("./settingsStore.ts")).toMatch(/export function useSettings\(keys: readonly string\[\]\): unknown\[\]/);
  });
});

describe("a bad event keeps the page as it was", () => {
  test("the reducer's throw is caught and the old state kept", () => {
    const m = initial();
    const bad = { type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "a.js", kind: "modified" }], get commands(): number { throw new Error("bad event"); } };
    const out = safeReduce(m, bad as never);
    expect(out).toBe(m as Model);
    expect(safeReduce(m, { type: "ui.settle" } as never).character).toBe("idle");
  });
  test("the note says what broke and where, not only the error's name, and never what the event carried", () => {
    // Review of M56: "receipt: TypeError" alone could not find the bug.
    const err = new TypeError("Cannot read properties of undefined (reading 'steps')");
    err.stack = "addPlanStep@http://localhost/assets/model.ts:120:9\nreduce@http://localhost/assets/model.ts:40:3\nsafeReduce@http://localhost/assets/useModel.ts:9:15";
    const d = eventFailureDetail({ type: "receipt", summary: "secret words sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789abcdefghij" }, err);
    expect(d).toStartWith("receipt: TypeError: Cannot read properties of undefined (reading 'steps')");
    expect(d).toContain("addPlanStep");
    expect(d).toContain("reduce");
    expect(d).not.toContain("secret words");
    expect(d).not.toContain("localhost/assets");
    expect(d.length).toBeLessThanOrEqual(400);
    // V8's form of the same stack reads the same way.
    const v8 = new Error("bad"); v8.stack = "Error: bad\n    at wholePlanReceipt (http://x/model.ts:1:1)\n    at reduce (http://x/model.ts:2:2)";
    expect(eventFailureDetail({ type: "drive.done" }, v8)).toContain("wholePlanReceipt < reduce");
    expect(read("./useModel.ts")).toContain("detail: eventFailureDetail(e, err)");
  });
});
