// The "it's live" card: the live page's picture laid out with the project's name, its address and the date.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserInstalled } from "../src/proof/browser.ts";
import { cardHtml, makeShareCard, projectTitle } from "../src/ship/card.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });

describe("the words on the card", () => {
  test("the project's name, as a person would say it", () => {
    expect(projectTitle("mug-shop", "x")).toBe("Mug shop");
    expect(projectTitle("@me/portfolio_site", "x")).toBe("Portfolio site");
    expect(projectTitle("vite-project", "recipe-box")).toBe("Recipe box");
    expect(projectTitle(undefined, "")).toBe("My project");
  });
  test("names and addresses cannot break the page", () => {
    const h = cardHtml({ title: "<script>alert(1)</script>", url: "https://shop.example.com/path?x=1", date: "10 Oct 2026" });
    expect(h).not.toContain("<script>alert");
    expect(h).toContain("shop.example.com");
    expect(h).not.toContain("?x=1");
  });
});

describe.skipIf(!browserInstalled())("making the card", () => {
  test("a JPEG of the right size, with the live page in it", async () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-card-"))); made.push(d);
    writeFileSync(join(d, "index.html"), "<h1 style='font:40px sans-serif'>Mug shop</h1>");
    const c = await makeShareCard({ url: `file://${join(d, "index.html")}`, title: "Mug shop", date: "10 Oct 2026" });
    expect(c?.withShot).toBe(true);
    const b = Buffer.from(c!.jpeg, "base64");
    expect(b.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    // JPEG frame header: height then width
    const i = b.indexOf(Buffer.from([0xff, 0xc0]));
    expect([b.readUInt16BE(i + 5), b.readUInt16BE(i + 7)]).toEqual([630, 1200]);
  }, 60000);
  test("a site that cannot be opened still gets a card, without the picture", async () => {
    const c = await makeShareCard({ url: "http://127.0.0.1:9/", title: "Mug shop", date: "10 Oct 2026", timeoutMs: 3000 });
    expect(c?.withShot).toBe(false);
  }, 60000);
  test("Stop: no card", async () => {
    const ac = new AbortController(); ac.abort();
    expect(await makeShareCard({ url: "http://127.0.0.1:9/", title: "x", date: "y", signal: ac.signal })).toBeNull();
  });
});
