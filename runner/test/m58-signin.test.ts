// M58 (the shortlist, item 8, first part): a sign in wall in the browser check is said as the person's turn. The browser
// step carries needs: "signIn", the result is "passed with gaps" (never "passed", rule 14), and the check never fills a
// field: it is handed a page and only reads it. M67's sign in detection (browser.ts) is used as it is, never changed
// (m67-signin.test.ts stays green untouched). A static page served in this process and a stand in browser: nothing reaches
// the network, no real project.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { SIGN_IN_GAP, type BrowserResult } from "../src/proof/browser.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-m58-signin-"))); made.push(d); return d; };

async function ladder(answer: Partial<BrowserResult>) {
  const dir = tmp();
  writeFileSync(join(dir, "index.html"), "<!doctype html><h1>Members</h1>");
  const store = new CheckpointStore(tmp(), dir);
  const snap = await store.snapshot("now");
  const asked: Record<string, unknown>[] = [];
  const r = await runLadder({ project: dir, store, beforeId: snap.id, afterId: snap.id, noRoomWaitsMs: [],
    browser: async (url, o) => { asked.push(o as Record<string, unknown>); return { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1, ...answer }; } });
  return { r, asked };
}

test("a sign in wall: the browser step needs the person's sign in, and the result is never passed", async () => {
  const { r } = await ladder({ gaps: [SIGN_IN_GAP] });
  expect(r.verdict).toBe("passed_with_gaps");
  const step = r.steps.find((s) => s.rung === "browser")!;
  expect(step.needs).toBe("signIn");
  expect(step.detail).toContain(SIGN_IN_GAP);
});

test("no wall: the browser step needs nothing, as before", async () => {
  const { r } = await ladder({});
  expect(r.verdict).toBe("passed");
  expect(r.steps.find((s) => s.rung === "browser")!.needs).toBeUndefined();
});

test("the check is never told to type: no password, user name or fill option reaches the browser", async () => {
  const { asked } = await ladder({ gaps: [SIGN_IN_GAP] });
  for (const o of asked) for (const k of Object.keys(o)) expect(k).not.toMatch(/pass|user|fill|type|credential|login/i);
});
