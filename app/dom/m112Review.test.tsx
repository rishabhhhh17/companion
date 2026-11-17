// M112 review, rendered: the tall Home's places highlight is measured again once the place's words have their real size.
// In shots 4a and 4h the open Now's soft fill covered only its glyph: the strip was measured before the label had its width
// (the font arriving, the first layout), and the observer's first report, which carried the new size, was thrown away.
import { afterEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { PlaceButton, PlacesGlide } from "../src/ui/parts.tsx";

type Box = { left: number; top: number; width: number; height: number };
const boxes = new Map<string, Box>();
const realRect = HTMLElement.prototype.getBoundingClientRect;
const realRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
const observers: { cb: ResizeObserverCallback }[] = [];
class FakeRO { cb: ResizeObserverCallback; constructor(cb: ResizeObserverCallback) { this.cb = cb; observers.push(this); } observe() {} unobserve() {} disconnect() {} }

function install() {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeRO;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const k = this.classList.contains("places") ? "row" : this.getAttribute("aria-pressed") === "true" ? "on" : "other";
    const b = boxes.get(k) ?? { left: 0, top: 0, width: 0, height: 0 };
    return { ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height, toJSON: () => b } as DOMRect;
  };
}
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = realRO;
  observers.length = 0;
  boxes.clear();
});

const row = () => (
  <div className="places">
    <PlacesGlide k="now:0" colour="blue" />
    <PlaceButton place="now" label="Now" on onClick={() => {}} />
    <PlaceButton place="learn" label="Learn" on={false} onClick={() => {}} />
  </div>
);
const glide = (c: HTMLElement) => c.querySelector<HTMLElement>(".ui-places-glide")!;

describe("the places highlight covers the whole open place", () => {
  test("a size that changed before the observer's first report is measured, not thrown away", async () => {
    install();
    boxes.set("row", { left: 0, top: 0, width: 600, height: 40 });
    boxes.set("on", { left: 0, top: 5, width: 30, height: 30 });   // only the glyph has its size yet
    const { container } = render(row());
    expect(glide(container).style.getPropertyValue("--glide-r")).toBe("570px");
    boxes.set("on", { left: 0, top: 5, width: 74, height: 30 });   // the label arrives
    await act(async () => { for (const o of observers) o.cb([], o as unknown as ResizeObserver); });
    expect(glide(container).style.getPropertyValue("--glide-r")).toBe("526px");
  });
  test("it is measured again once the fonts have loaded", async () => {
    install();
    let loaded!: () => void;
    const ready = new Promise<void>((r) => { loaded = r; });
    const fonts = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
    try {
      boxes.set("row", { left: 0, top: 0, width: 600, height: 40 });
      boxes.set("on", { left: 0, top: 5, width: 30, height: 30 });
      const { container } = render(row());
      boxes.set("on", { left: 0, top: 5, width: 74, height: 30 });
      await act(async () => { loaded(); await ready; });
      expect(glide(container).style.getPropertyValue("--glide-r")).toBe("526px");
    } finally {
      if (fonts) Object.defineProperty(document, "fonts", fonts); else delete (document as { fonts?: unknown }).fonts;
    }
  });
});
