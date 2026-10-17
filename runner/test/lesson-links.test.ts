// A lesson step may name the one web page it is about (Go to cursor.com/download), so the card can offer an Open button
// for it. A lesson is data, checked hard: the address must be a plain secure web address, or the lesson is refused. It is
// only ever opened on the person's press (app/src/links.ts, share.rs web_link check it again).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { parseEvent } from "../../protocol/index.ts";
import { parseLesson, Walkthrough } from "../src/walk.ts";

const step = (id: string, extra: Record<string, unknown> = {}) => ({ id, say: `Do ${id}`, find: `the ${id} button`, check: { kind: "ask" }, ...extra });
const raw = (steps: unknown[]) => ({ id: "demo", title: "Demo", app: "Demo app", goal: "Do the demo", needsProject: false, steps });
const T = () => "2026-10-18T10:00:00Z";

describe("a link on a lesson step", () => {
  test("a plain secure web address is kept, on the step and on its other way", () => {
    const r = parseLesson(raw([step("a", { link: "https://cursor.com/download", instead: { say: "Use the other page", find: "the other page", link: "https://cursor.com/downloads/mac" } }), step("b")]));
    if (!r.ok) throw new Error(r.error);
    expect(r.lesson.steps[0].link).toBe("https://cursor.com/download");
    expect(r.lesson.steps[0].instead?.link).toBe("https://cursor.com/downloads/mac");
    expect("link" in r.lesson.steps[1]).toBe(false);
  });
  test("anything else refuses the lesson, with a reason", () => {
    for (const link of ["http://cursor.com", "cursor.com/download", "javascript:alert(1)", "file:///etc/passwd", "https://user:pw@cursor.com", "https://cursor .com", "https://cursor.com/a b",
      "https://localhost/x", "https://cursor", "https://cursor.com/‮", `https://cursor.com/${"a".repeat(300)}`, 42, "", null]) {
      const r = parseLesson(raw([step("a", { link })]));
      expect(r.ok, String(link)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/link/);
    }
  });
  test("the step shown says which page it is about, for the way it is on", () => {
    const r = parseLesson(raw([step("a", { link: "https://github.com", instead: { say: "Sign in another way", find: "the sign in page" } })]));
    if (!r.ok) throw new Error(r.error);
    const w = new Walkthrough(r.lesson, null, { now: T, project: "no-project" });
    expect(w.current()?.step.link).toBe("https://github.com");
  });
  test("the step event may carry it, and only as text", () => {
    const ev = (o: Record<string, unknown>) => parseEvent(JSON.stringify({ v: 1, id: "e", type: "walk.step", walk: "w", project: "p", lesson: "l", title: "t", index: 0, total: 1, variant: "main", say: "s", find: "f", ask: true, ...o })).ok;
    expect(ev({})).toBe(true);
    expect(ev({ link: "https://cursor.com/download" })).toBe(true);
    expect(ev({ link: 5 })).toBe(false);
  });
  test("the shipped lessons that send you to a page link to it, and every link passes the check", () => {
    const dir = new URL("../../lessons/", import.meta.url).pathname;
    const links: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const r = parseLesson(JSON.parse(readFileSync(dir + f, "utf8")));
      expect(r.ok, f).toBe(true);
      if (r.ok) for (const s of r.lesson.steps) { if (s.link) links.push(s.link); if (s.instead?.link) links.push(s.instead.link); }
    }
    expect(links).toContain("https://cursor.com/download");
    expect(links).toContain("https://github.com");
  });
});
