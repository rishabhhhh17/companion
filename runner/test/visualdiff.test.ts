// The visual receipt: what is on the page now that was not there before, as a few boxes to circle.
// Pages are compared by what they show (text, buttons, pictures), so something added at the top that pushes the rest
// down circles only the new thing, not the whole page.
import { describe, expect, test } from "bun:test";
import { changedRegions, type PageItem } from "../src/proof/visualdiff.ts";

const it = (key: string, x: number, y: number, w = 200, h = 20): PageItem => ({ key, x, y, w, h });
const page = (...items: PageItem[]) => items;

describe("what changed on the page", () => {
  test("nothing changed: nothing to circle", () => {
    const p = page(it("h1:Shop", 20, 20), it("button:Buy", 20, 80, 80, 30));
    expect(changedRegions(p, p)).toEqual([]);
  });
  test("a new button is circled, and only it", () => {
    const before = page(it("h1:Shop", 20, 20), it("p:Our products", 20, 60));
    const after = page(it("h1:Shop", 20, 20), it("p:Our products", 20, 60), it("button:Add to cart", 20, 100, 120, 32));
    expect(changedRegions(before, after)).toEqual([{ x: 20, y: 100, w: 120, h: 32 }]);
  });
  test("something added at the top pushes the rest down, but only the new thing is circled", () => {
    const before = page(it("h1:Shop", 20, 20), it("p:Our products", 20, 60), it("button:Buy", 20, 100, 80, 30));
    const after = page(it("div:Free shipping this week", 0, 0, 1280, 40), it("h1:Shop", 20, 60), it("p:Our products", 20, 100), it("button:Buy", 20, 140, 80, 30));
    expect(changedRegions(before, after)).toEqual([{ x: 0, y: 0, w: 1280, h: 40 }]);
  });
  test("changed words count as a change", () => {
    const before = page(it("h1:Welcom to the shop", 20, 20, 300, 40));
    const after = page(it("h1:Welcome to the shop", 20, 20, 300, 40));
    expect(changedRegions(before, after)).toEqual([{ x: 20, y: 20, w: 300, h: 40 }]);
  });
  test("new things close together become one circle", () => {
    const before = page(it("h1:Contact", 20, 20));
    const after = page(it("h1:Contact", 20, 20), it("label:Email", 20, 100, 60, 20), it("input:email", 90, 100, 200, 24), it("button:Send", 20, 134, 80, 30));
    expect(changedRegions(before, after)).toEqual([{ x: 20, y: 100, w: 270, h: 64 }]);
  });
  test("at most three circles, biggest first", () => {
    const before = page(it("h1:Home", 20, 20));
    const after = page(it("h1:Home", 20, 20), it("p:a", 20, 100, 50, 20), it("p:b", 20, 300, 400, 100), it("p:c", 20, 500, 100, 20), it("p:d", 600, 700, 300, 60));
    const r = changedRegions(before, after);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ x: 20, y: 300, w: 400, h: 100 });
  });
  test("the same thing twice: a second copy is new", () => {
    const before = page(it("li:Item", 20, 20));
    const after = page(it("li:Item", 20, 20), it("li:Item", 20, 50));
    expect(changedRegions(before, after)).toEqual([{ x: 20, y: 50, w: 200, h: 20 }]);
  });
  test("nothing is circled off the visible page, and a circle is kept inside it", () => {
    const before = page(it("h1:Home", 20, 20));
    const after = page(it("h1:Home", 20, 20), it("p:far below", 20, 2000), it("div:wide", -50, 700, 1500, 300));
    expect(changedRegions(before, after, { w: 1280, h: 800 })).toEqual([{ x: 0, y: 700, w: 1280, h: 100 }]);
  });
  test("a page that was broken before: everything on it is new, shown as one circle around the content", () => {
    const after = page(it("h1:Shop", 20, 20), it("button:Buy", 20, 80, 80, 30));
    expect(changedRegions([], after)).toEqual([{ x: 20, y: 20, w: 200, h: 90 }]);
  });
});
