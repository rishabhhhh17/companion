// M52 through the real engine program: the shell's settings line names the project and how often to review; a change made
// by another tool is reviewed on Review now; a change the engine's own task made is never counted as the other tool's.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-review-${l}-`))); made.push(d); return d; };

function launch(script: unknown[] = []) {
  const data = tmp("data");
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: JSON.stringify(script) },
  });
  const lines: string[] = [];
  let buf = "";
  const done = (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stdout) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
  })();
  const send = (o: unknown) => { proc.stdin.write(JSON.stringify(o) + "\n"); proc.stdin.flush(); };
  const events = () => lines.map((l) => JSON.parse(l));
  const waitFor = async (cond: () => boolean, ms = 15_000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out; saw: " + lines.join(" | ").slice(-900)); await new Promise((r) => setTimeout(r, 25)); } };
  const close = async () => { proc.stdin.end(); await proc.exited; await done; };
  return { send, events, waitFor, close };
}
const results = (r: ReturnType<typeof launch>) => r.events().filter((e: any) => e.type === "review.result");

describe("the review in the engine program", () => {
  test("Review now on another tool's change: a review with the rules' own words, all in the protocol", async () => {
    const project = tmp("proj");
    writeFileSync(join(project, "index.html"), "<h1>Hello</h1>\n");
    const r = launch();
    await r.waitFor(() => r.events().length >= 1);
    r.send({ v: 1, id: "s1", type: "settings.apply", values: {}, project, projectValues: {} });
    await r.waitFor(() => r.events().some((e: any) => e.type === "settings.applied"));
    // A first press answers only once the starting point is taken (it waits for it), and nothing has changed yet.
    r.send({ v: 1, id: "rn0", type: "review.now", project });
    await r.waitFor(() => results(r).length === 1);
    expect(results(r)[0].reason).toMatch(/Nothing has changed/);
    writeFileSync(join(project, "index.html"), "<h1>Hello there</h1>\n");
    r.send({ v: 1, id: "rn1", type: "review.now", project });
    await r.waitFor(() => results(r).length === 2);
    expect(results(r)[1]).toMatchObject({ ok: true, rating: "safe", lane: "none", files: [{ file: "index.html", kind: "modified" }] });
    for (const l of r.events()) expect(parseEvent(JSON.stringify(l)).ok, JSON.stringify(l)).toBe(true);
    await r.close();
  }, 30_000);
  test("review.mode off in the settings line: nothing is watched, and Review now says so", async () => {
    const project = tmp("proj");
    const r = launch();
    await r.waitFor(() => r.events().length >= 1);
    r.send({ v: 1, id: "s1", type: "settings.apply", values: { "review.mode": "off" }, project, projectValues: {} });
    await r.waitFor(() => r.events().some((e: any) => e.type === "settings.applied"));
    expect(r.events().find((e: any) => e.type === "settings.applied").accepted).toContain("review.mode");
    r.send({ v: 1, id: "rn1", type: "review.now", project });
    await r.waitFor(() => results(r).length === 1);
    expect(results(r)[0]).toMatchObject({ ok: false });
    expect(results(r)[0].reason).toMatch(/off/);
    await r.close();
  }, 30_000);
  test("what the engine's own task wrote is never in a review", async () => {
    const project = tmp("proj");
    writeFileSync(join(project, "index.html"), "<h1>Hello</h1>\n");
    const r = launch([{ tool: { name: "Write", input: { file_path: "made-by-task.txt", content: "x" } }, costUsd: 0 }]);
    await r.waitFor(() => r.events().length >= 1);
    r.send({ v: 1, id: "s1", type: "settings.apply", values: {}, project, projectValues: {} });
    await r.waitFor(() => r.events().some((e: any) => e.type === "settings.applied"));
    r.send({ v: 1, id: "rn0", type: "review.now", project });
    await r.waitFor(() => results(r).length === 1);
    r.send({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "add a note", model: "m", budgetUsd: 1 });
    await r.waitFor(() => r.events().some((e: any) => e.type === "receipt"));
    await new Promise((res) => setTimeout(res, 1000));   // the task's own late file events, if any
    r.send({ v: 1, id: "rn1", type: "review.now", project });
    await r.waitFor(() => results(r).length === 2);
    expect(results(r)[1]).toMatchObject({ ok: false });
    expect(results(r)[1].reason).toMatch(/Nothing has changed/);
    expect(r.events().some((e: any) => e.type === "review.batch")).toBe(false);
    // The other tool then changes a file: only that one is in the review, never what the task wrote.
    writeFileSync(join(project, "index.html"), "<h1>Changed by the other tool</h1>\n");
    r.send({ v: 1, id: "rn2", type: "review.now", project });
    await r.waitFor(() => results(r).length === 3);
    expect(results(r)[2]).toMatchObject({ ok: true, files: [{ file: "index.html", kind: "modified" }], count: 1 });
    await r.close();
  }, 40_000);
});
