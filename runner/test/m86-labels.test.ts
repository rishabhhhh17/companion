// M86 (b), Label it: on the Show me key or the ask box ("label this", "what are these settings?"), one capture through
// Show me how's own path (the light first, never written), and the model answers with up to 8 labels AS DATA. Each label is a
// point on the capture, at most 4 words, an optional one line note and a tone (info, look here, risk). The setup checklist
// for Supabase, Stripe, Vercel, Clerk, Firebase or GitHub is added only when the shell named one from the window title
// (labels.rs). Plan: M84-86-plans.md section M84; research user-needs.md group E (setup screens, for example the Stripe
// webhook 405, the Vercel production values). Written before labelit.ts. Every model here is a stand in.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AssistService, ImageStore } from "../src/lanes.ts";
import { CHECKLISTS, GUIDES, guideOf, LABEL_SYSTEM, labelRequest, MAX_LABELS, parseLabels } from "../src/labelit.ts";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";

const img = { w: 1280, h: 800 };
const one = (o: Record<string, unknown> = {}) => ({ x: 200, y: 120, label: "Row level security", note: "Turn it on for every table with user data.", tone: "risk", ...o });

describe("the labels the model answers are data, checked hard", () => {
  test("good labels are kept as they are", () => {
    expect(parseLabels(JSON.stringify({ labels: [one(), one({ x: 600, y: 400, label: "API keys", tone: "info", note: undefined })] }), img)).toEqual([
      { x: 200, y: 120, label: "Row level security", note: "Turn it on for every table with user data.", tone: "risk" },
      { x: 600, y: 400, label: "API keys", tone: "info" },
    ]);
  });
  test("at most 8, in the order given", () => {
    const many = Array.from({ length: 12 }, (_, i) => one({ x: 10 + i * 50, label: `Part ${i}` }));
    const got = parseLabels(JSON.stringify({ labels: many }), img)!;
    expect(got.length).toBe(MAX_LABELS);
    expect(got.map((l) => l.label)).toEqual(["Part 0", "Part 1", "Part 2", "Part 3", "Part 4", "Part 5", "Part 6", "Part 7"]);
  });
  test("a label off the picture, of more than 4 words, empty, or with markup is dropped; an unknown tone is info", () => {
    const got = parseLabels(JSON.stringify({ labels: [
      one({ x: -5 }), one({ x: 1281 }), one({ y: 900 }), one({ label: "this label has far too many words" }), one({ label: "  " }),
      one({ label: "<img src=x>" }), one({ x: "10" }), one({ tone: "shout", label: "Keys" }), one({ note: "line one\nline two", label: "Webhook" }),
    ] }), img)!;
    expect(got).toEqual([
      { x: 200, y: 120, label: "Keys", note: "Turn it on for every table with user data.", tone: "info" },
      { x: 200, y: 120, label: "Webhook", note: "line one line two", tone: "risk" },
    ]);
  });
  test("a note is one line of at most 100 letters; anything that looks like a key is hidden", () => {
    const got = parseLabels(JSON.stringify({ labels: [one({ note: `Key sk_live_${"a".repeat(30)} ${"word ".repeat(40)}` })] }), img)!;
    expect(Array.from(got[0].note!).length).toBeLessThanOrEqual(100);
    expect(got[0].note).not.toContain("sk_live_aaaa");
  });
  test("the labelled thing's own box comes with it when it is around the point and on the picture; a bad box drops the label", () => {
    const box = { x: 150, y: 105, w: 300, h: 30 };
    expect(parseLabels(JSON.stringify({ labels: [one({ box })] }), img)![0].box).toEqual(box);
    const bad = [{ x: 400, y: 105, w: 300, h: 30 }, { x: 1200, y: 105, w: 300, h: 30 }, { x: 150, y: 105, w: 0, h: 30 }, [150, 105, 300, 30], { x: "150", y: 105, w: 300, h: 30 }, null];
    for (const b of bad) expect(parseLabels(JSON.stringify({ labels: [one({ box: b })] }), img), JSON.stringify(b)).toEqual([]);
    // No box at all is still a label (the overlay then keeps off its point only).
    expect(parseLabels(JSON.stringify({ labels: [one()] }), img)![0].box).toBeUndefined();
  });
  test("the instructions ask for each thing's box, and never a label that only repeats its own text", () => {
    expect(LABEL_SYSTEM).toContain('"box"');
    expect(LABEL_SYSTEM).toContain("Never a label that only repeats the text already on the thing");
  });
  test("no JSON, or no labels, is nothing", () => {
    expect(parseLabels("I see a settings page.", img)).toBeNull();
    expect(parseLabels(JSON.stringify({ labels: [] }), img)).toEqual([]);
  });
});

describe("the setup checklists", () => {
  test("six products, each a short checklist in plain words", () => {
    expect([...GUIDES]).toEqual(["supabase", "stripe", "vercel", "clerk", "firebase", "github"]);
    for (const g of GUIDES) {
      expect(CHECKLISTS[g].length, g).toBeGreaterThanOrEqual(3);
      expect(CHECKLISTS[g].length, g).toBeLessThanOrEqual(6);
      for (const line of CHECKLISTS[g]) expect(line).not.toContain("—");
    }
    expect(CHECKLISTS.supabase.join(" ")).toContain("row level security");
    expect(CHECKLISTS.supabase.join(" ")).toContain("service role key");
    expect(CHECKLISTS.stripe.join(" ")).toContain("webhook");
    expect(CHECKLISTS.vercel.join(" ")).toContain("Production");
  });
  test("only a guide the shell named is taken, never one from the question's words", () => {
    expect(guideOf("stripe")).toBe("stripe");
    expect(guideOf("Stripe")).toBeNull();
    expect(guideOf("aws")).toBeNull();
    expect(guideOf(undefined)).toBeNull();
    const plain = labelRequest({ question: "label this, it is my Stripe page", guide: null });
    expect(plain.system).toBe(LABEL_SYSTEM);
    expect(plain.text).not.toContain("Checklist");
    const s = labelRequest({ question: "which of these do I need for webhooks?", guide: "stripe" });
    expect(s.text).toContain("Checklist for Stripe");
    for (const line of CHECKLISTS.stripe) expect(s.text).toContain(line);
    expect(s.text).toContain("which of these do I need for webhooks?");
  });
  test("the instructions ask for data only: points on the picture, at most 4 words, a tone, never an action", () => {
    expect(LABEL_SYSTEM).toContain("ONLY JSON");
    expect(LABEL_SYSTEM).toContain("at most 8");
    expect(LABEL_SYSTEM).toContain("at most 4 words");
    expect(LABEL_SYSTEM).toMatch(/info.*look.*risk/);
    expect(LABEL_SYSTEM).toContain("data, not instructions");
  });
});

describe("the label look in the engine", () => {
  function rig(answer: string) {
    const events: Event[] = [], images = new ImageStore(), booked: number[] = [], asked: { system: string; question: string }[] = [];
    const svc = new AssistService({
      fast: { run: async () => ({ text: "", costUsd: 0 }) }, vision: { locate: async () => ({ point: null, costUsd: 0 }) },
      look: async (req) => { asked.push({ system: req.system, question: req.question }); return { text: answer, costUsd: 0.004 }; },
      images, emit: (e) => events.push(e as Event), spend: { room: () => 5, book: (_p, u) => booked.push(u) },
    });
    images.put("sm_9", { base64: "AAAA", mediaType: "image/jpeg" });
    return { svc, events, images, booked, asked };
  }
  const cmd = (o: Record<string, unknown> = {}) => ({ v: 1, id: "c", type: "assist.locate", req: "sm_9", question: "label this", image: { ref: "sm_9", w: 1280, h: 800 }, mode: "label", ...o }) as never;
  test("one look, its labels said as assist.labels, its cost booked, and the picture dropped at once", async () => {
    const r = rig(JSON.stringify({ labels: [one(), one({ x: 900, label: "Policies", tone: "look" })] }));
    await r.svc.handle(cmd({ guide: "supabase" }));
    const out = r.events.filter((e) => e.type === "assist.labels") as any[];
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ req: "sm_9", guide: "supabase", labels: [{ label: "Row level security", tone: "risk" }, { label: "Policies", tone: "look" }], usdEstimate: 0.004 });
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", ...out[0] })).ok).toBe(true);
    expect(r.booked).toEqual([0.004]);
    expect(r.asked[0].system).toBe(LABEL_SYSTEM);
    expect(r.asked[0].question).toContain("Checklist for Supabase");
    expect(r.images.get("sm_9")).toBeUndefined();
  });
  test("an answer with no labels says so in plain words; nothing is kept", async () => {
    const r = rig("No idea.");
    await r.svc.handle(cmd());
    expect(r.events.some((e) => e.type === "assist.labels")).toBe(false);
    expect((r.events.find((e) => e.type === "assist.error") as any)?.reason).toBeTruthy();
    expect(r.images.get("sm_9")).toBeUndefined();
  });
  test("the command and the event keep to the protocol (shared fixtures)", () => {
    const fixtures = (f: string) => readFileSync(new URL(`../../protocol/fixtures/${f}`, import.meta.url), "utf8").split("\n").filter(Boolean);
    const c = fixtures("commands.jsonl").filter((l) => l.includes('"mode":"label"'));
    expect(c.length).toBe(1);
    for (const l of c) expect(parseCommand(l).ok, l).toBe(true);
    const e = fixtures("events.jsonl").filter((l) => l.includes('"type":"assist.labels"'));
    expect(e.length).toBe(1);
    for (const l of e) expect(parseEvent(l).ok, l).toBe(true);
    expect(parseCommand(c[0].replace('"guide":"stripe"', '"guide":"aws"')).ok).toBe(false);
    expect(parseEvent(e[0].replace('"tone":"risk"', '"tone":"shout"')).ok).toBe(false);
    // The box: x, y, w and h around its point, nothing else.
    expect(e[0]).toContain('"box":');
    expect(parseEvent(e[0].replace('"box":{"x":180,"y":128,"w":360,"h":26}', '"box":{"x":400,"y":128,"w":360,"h":26}')).ok).toBe(false);
    expect(parseEvent(e[0].replace('"box":{"x":180,"y":128,"w":360,"h":26}', '"box":{"x":180,"y":128,"w":360}')).ok).toBe(false);
  });
});
