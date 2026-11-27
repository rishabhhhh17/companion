// M123: did it do what you asked, on the result card. Pure: no engine, no shell.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce } from "./model.ts";
import { notKeptOf, promisesOf } from "./asked.ts";
import { verdictOf } from "./verdict.ts";

const rcpt = (promises: unknown) => reduce(initial(), { v: 1, id: "e", type: "receipt", agent: "builder-1", checkpoint: "cp_1", changed: [{ file: "a.tsx", kind: "modified" }], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0, ended: "done", promises } as never);

describe("the receipt's promises", () => {
  test("known shapes are kept, anything else is dropped, at most five", () => {
    const m = rcpt([{ say: "a pricing page opens at /pricing", result: "kept" }, { say: "the menu links to /pricing", result: "not_kept", why: "No link named pricing." }, { say: "x", result: "made_up" }, { result: "kept" }]);
    expect(m.receipt?.promises).toEqual([{ say: "a pricing page opens at /pricing", result: "kept" }, { say: "the menu links to /pricing", result: "not_kept", why: "No link named pricing." }]);
    expect(promisesOf(Array.from({ length: 9 }, (_, i) => ({ say: `p${i}`, result: "kept" }))).promises?.length).toBe(5);
    expect(promisesOf("nope")).toEqual({});
    expect(promisesOf([{ say: "key sk-ant-api03-" + "C".repeat(60), result: "kept" }]).promises?.[0].say).not.toContain("CCCCCCCCCCCCCCCCCCCC");
  });
  test("could not check never counts as broken", () => {
    expect(notKeptOf([{ say: "a", result: "could_not_check" }, { say: "b", result: "kept" }])).toBe(0);
    expect(notKeptOf([{ say: "a", result: "not_kept" }])).toBe(1);
  });
});

describe("the verdict with promises", () => {
  const base = { proof: "passed" as const, ended: "done" as const, undone: false, changed: 1, missing: [] };
  test("checks passed and every promise kept: proven", () => {
    expect(verdictOf({ ...base }).proven).toBe(true);
  });
  test("checks passed but a promise is not there: not fixed yet, never proven", () => {
    const v = verdictOf({ ...base, notKept: 1 });
    expect(v.proven).toBe(false);
    expect(v.kind).toBe("failed");
    expect(v.line).toBe("The checks passed, but one thing you asked for is not there.");
  });
});

test("the card shows what you asked before Keep", () => {
  const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
  const asked = card.indexOf('<AskedList ps={m.receipt.promises}'), keep = card.indexOf('className="row result-actions receipt-top"');
  expect(asked).toBeGreaterThan(0);
  expect(asked).toBeLessThan(keep);
});

describe("F33: the ask typed on the done card", () => {
  test("Review now sends it, trimmed; an empty one is left out", async () => {
    const { reviewNow } = await import("./commands.ts");
    expect(reviewNow("/p", "b1", true, "  add a pricing page ")).toMatchObject({ type: "review.now", batch: "b1", proof: true, asked: "add a pricing page" });
    expect("asked" in reviewNow("/p", "b1", true, "   ")).toBe(false);
    expect("asked" in reviewNow("/p", "b1", false)).toBe(false);
  });
  test("the card has the optional line, and Quick look never sends it", () => {
    const src = readFileSync(new URL("./reviewCard.tsx", import.meta.url), "utf8");
    expect(src.split("<AskThenReview ").length - 1).toBe(2);
    expect(src).toContain("onClick={() => onReview(false)}>{S.review.quickLook}");
    expect(src).toContain("onClick={() => onReview(true, asked)}");
  });
});

describe("slice 4: watch it try", () => {
  test("a picture is kept only when it is a plain picture of a sane size", () => {
    const ok = promisesOf([{ say: "a", result: "not_kept", image: "/9j/4AAQSkZJRg==" }]).promises?.[0];
    expect(ok?.image).toBe("/9j/4AAQSkZJRg==");
    expect(promisesOf([{ say: "a", result: "kept", image: "javascript:alert(1)" }]).promises?.[0].image).toBeUndefined();
    expect(promisesOf([{ say: "a", result: "kept", image: "A".repeat(700_004) }]).promises?.[0].image).toBeUndefined();
  });
  test("the view opens the broken one first and changes only on a press", () => {
    const src = readFileSync(new URL("./askedView.tsx", import.meta.url), "utf8");
    expect(src).toContain('shots.find((x) => x.p.result === "not_kept") ?? shots[0]');
    expect(src).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(src).toContain("data:image/jpeg;base64,");
  });
});

describe("slice 5: a receipt as a link", () => {
  test("the commands", async () => {
    const { receiptShare, receiptUnshare } = await import("./commands.ts");
    expect(receiptShare("<!doctype html>", "t")).toMatchObject({ type: "receipt.share", html: "<!doctype html>", title: "t" });
    expect(receiptUnshare("A".repeat(22))).toMatchObject({ type: "receipt.unshare", link: "A".repeat(22) });
  });
  test("what the preview says for each answer", async () => {
    const { sharedFrom, linkWords } = await import("./shareLink.ts");
    const made = sharedFrom({ type: "receipt.shared", links: [], last: { ok: true, url: "https://api.example.test/r/" + "A".repeat(22), expiresAt: "2026-12-27T00:00:00.000Z" } });
    expect(made).toMatchObject({ stage: "made", id: "A".repeat(22) });
    expect(linkWords(made!)).toContain("Anyone with it can see this receipt until");
    expect(sharedFrom({ type: "receipt.shared", links: [], last: { ok: true, url: "http://api.example.test/r/" + "A".repeat(22), expiresAt: "x" } })).toMatchObject({ stage: "failed" });
    expect(sharedFrom({ type: "receipt.shared", links: [], last: { ok: true, url: "https://evil.test/login", expiresAt: "x" } })).toMatchObject({ stage: "failed" });
    expect(linkWords(sharedFrom({ type: "receipt.shared", links: [], last: { ok: false, reason: "signIn" } })!)).toContain("Sign in to Squibby");
    expect(linkWords(sharedFrom({ type: "receipt.shared", links: [], last: { ok: true, removed: "x" } })!)).toContain("no longer opens");
    expect(sharedFrom({ type: "receipt.shared", links: [] })).toBeNull();
    expect(sharedFrom({ type: "receipt.visual" })).toBeNull();
  });
  test("a link is made only on the press", () => {
    const src = readFileSync(new URL("./m88Panels.tsx", import.meta.url), "utf8");
    expect(src.match(/send\(receiptShare\(/g)?.length).toBe(1);
    expect(src).toContain('onClick={() => { waiting.current = true; setLink({ stage: "making" }); void send(receiptShare(html, doc.title)); }}');
  });
});

describe("what you asked, in History and on the shared page", () => {
  test("a History row with a missing promise is not fixed yet; counts are checked", async () => {
    const { historyFacts, askedCount } = await import("./model.ts");
    expect(verdictOf(historyFacts({ status: "done", proof: "passed", changed: 2, asked: { kept: 1, missing: 1 } })).proven).toBe(false);
    expect(verdictOf(historyFacts({ status: "done", proof: "passed", changed: 2, asked: { kept: 2, missing: 0 } })).proven).toBe(true);
    expect(askedCount({ kept: 9, missing: 0 })).toBeNull();
    expect(askedCount({ kept: 0, missing: 0 })).toBeNull();
  });
  test("the shared page says it in one line, only when something was asked", async () => {
    const { shareFromTask } = await import("./shareReceipt.ts");
    const h = { id: 1, label: "add a pricing page", status: "done", usd: 0, startedAt: "2026-11-27T10:00:00.000Z", endedAt: "2026-11-27T10:01:00.000Z", checkpoint: "cp_1", changed: 2, proof: "passed" };
    expect(shareFromTask({ ...h, asked: { kept: 1, missing: 1 } }, "/Users/x/my-shop", new Date("2026-11-27T12:00:00Z")).summary).toContain("1 of 2 things you asked for were there when the hidden browser tried them.");
    expect(shareFromTask(h, "/Users/x/my-shop", new Date("2026-11-27T12:00:00Z")).summary.join(" ")).not.toContain("you asked for");
  });
});
