// The ring of choices around the character (dropRing.tsx, dropmenu.ts), redrawn bigger and calmer: targets of 44 points with
// real space between them on an arc, the word outside the target, drawings in place of letters and no emoji.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { RADIUS, RING_MAX, TARGET, WINDOW, actionIcon, arcSpots, ringChoices, showsWord } from "./dropmenu.ts";
import { S } from "./strings.ts";
import { shellSource } from "../dom/sourceText.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("which choices the ring shows", () => {
  test("five or fewer all show, with no More", () => {
    expect(ringChoices(["toJpeg", "toHeic"])).toEqual({ shown: ["toJpeg", "toHeic"], more: false });
    expect(ringChoices(["a", "b", "c", "d", "e"]).more).toBe(false);
  });
  test("more than five: the first few, and More for the rest in Home", () => {
    const r = ringChoices(["a", "b", "c", "d", "e", "f", "g"]);
    expect(r.shown).toEqual(["a", "b", "c", "d"]);
    expect(r.more).toBe(true);
  });
  test("with More and Close the ring never holds more than six targets", () => {
    for (const n of [0, 1, 5, 6, 20, 80]) {
      const r = ringChoices(Array.from({ length: n }, (_, i) => String(i)));
      expect(r.shown.length + (r.more ? 1 : 0) + 1).toBeLessThanOrEqual(6);
    }
    expect(RING_MAX + 1).toBe(6);
  });
});

describe("the arc has real space", () => {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  test("every target is 44 points, and neighbours leave at least 8 points of gap, for 2 to 6 targets", () => {
    for (let n = 2; n <= 6; n++) {
      const s = arcSpots(n, RADIUS);
      expect(s.length).toBe(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(dist(s[i], s[j]) - TARGET, `${n} targets, ${i} and ${j}`).toBeGreaterThanOrEqual(8);
    }
  });
  test("it stays inside the character's window, with room to spare for the outline", () => {
    for (let n = 1; n <= 6; n++) for (const p of arcSpots(n, RADIUS)) {
      expect(Math.abs(p.x) + TARGET / 2).toBeLessThanOrEqual(WINDOW / 2 - 2);
      expect(Math.abs(p.y) + TARGET / 2).toBeLessThanOrEqual(WINDOW / 2 - 2);
    }
  });
  test("it goes clockwise from the lower left over the top to the lower right and leaves the bottom middle clear", () => {
    const s = arcSpots(5, RADIUS);
    expect(s[0].x).toBeLessThan(0);
    expect(s[4].x).toBeGreaterThan(0);
    expect(s[2].y).toBeLessThan(s[0].y);
    for (const p of s) expect(p.y).toBeLessThan(RADIUS * 0.9);
  });
  test("the middle of the ring is empty, for the character and the word", () => {
    for (const p of arcSpots(6, RADIUS)) expect(Math.hypot(p.x, p.y) - TARGET / 2).toBeGreaterThanOrEqual(30);
  });
  test("an empty or single ring is still sound", () => {
    expect(arcSpots(0, RADIUS)).toEqual([]);
    expect(arcSpots(1, RADIUS)).toEqual([{ x: 0, y: -RADIUS }]);
  });
});

describe("every choice has a drawing", () => {
  test("every action the page has words for gets a drawing of its own kind, not the plain file", () => {
    const ids = Object.keys(S.drop.actions);
    expect(ids.length).toBeGreaterThan(50);
    const plain = ids.filter((id) => actionIcon(id) === "file");
    expect(plain).toEqual([]);
  });
  test("an action it does not know gets the plain file", () => {
    expect(actionIcon("somethingNew")).toBe("file");
  });
  test("a format conversion shows its format's name, since a drawing could not tell JPEG from PNG; the rest are drawings", () => {
    for (const id of ["toPng", "toJpeg", "toHeic", "toWebp", "toWav", "toMp4", "toPdf"]) expect(showsWord(id), id).toBe(true);
    for (const id of ["resize", "compress", "grayscale", "trim", "merge", "zip", "stripInfo"]) expect(showsWord(id), id).toBe(false);
    // Every conversion has a short name to show, and it is short enough for a 44 point target.
    for (const [id, w] of Object.entries(S.drop.actions)) if (showsWord(id)) expect(w.short.length, id).toBeLessThanOrEqual(6);
  });
});

describe("the ring on the page", () => {
  const ring = read("./dropRing.tsx"), css = read("./style.css"), icons = read("./icons.tsx");
  test("no emoji: a drawing is inline SVG, and the word for a drawing shows in the middle, outside its target", () => {
    expect(icons).toContain("<svg");
    // Any pictograph or dingbat used as a picture would show here.
    expect(ring + icons).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(ring).toContain("actionIcon(");
    expect(ring).toContain("drop-caption");
    expect(ring).toContain("showsWord(a)");
  });
  test("a target is at least 44 points and shows the word beside it, not inside it", () => {
    expect(css).toMatch(/\.drop-item \{[^}]*min-width: 44px/);
    expect(css).toMatch(/\.drop-item \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.drop-caption \{/);
  });
  test("every target still has its full name for VoiceOver and the keyboard", () => {
    expect(ring).toContain("aria-label={w.label}");
    expect(ring).toContain('role="menuitem"');
    expect(ring).toContain("onKeyDown={(e) => onKey(e, drop)}");
  });
  test("More opens the whole list in Home", () => {
    expect(ring).toContain('invoke("open_card_cmd")');
    expect(S.drop.more).toBeTruthy();
  });
});

describe("a dropped folder can be the project (M15)", () => {
  test("the ring names it in plain words with the find drawing, and Home finds the problem when the shell says so", async () => {
    const { actionWords } = await import("./dropmenu.ts");
    expect(actionWords("openProject")?.short).toBe("Fix this");
    expect(actionIcon("openProject")).toBe("find");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('listen("home-find", (e) =>');
    expect(card).toContain("offDropFind.then((f) => f());");
    const main = shellSource();
    const fn = main.slice(main.indexOf("fn drop_open_project("), main.indexOf("\n}\n", main.indexOf("fn drop_open_project(")));
    // Checked like any folder chosen, from the menu the shell made, only for one folder, never while a job runs.
    expect(fn).toContain("use_project_inner(app.clone(), path)?");
    expect(fn).toContain("d.actions.contains(&convert::OPEN_PROJECT) || d.paths.len() != 1");
    expect(fn).toContain('if d.running.is_some() { return Err("busy".into()); }');
    expect(fn).toContain('open_card(app, "drop_project", false);');
  });
});
