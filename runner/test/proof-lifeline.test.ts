// Must fix 14: proof commands and the project's own server run in their own process group, so killing the engine's group
// by force (Stop with no answer, quit after the grace time, a crash) does not reach them. Every proof command and every
// server the proof starts now ends with the engine however it ends (exec.ts LIFELINE), the way T07 tests it: SIGKILL the
// engine, and the port is free again within about a second.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const made: string[] = [];
const leftovers: number[] = [];
afterEach(() => {
  while (leftovers.length) { try { process.kill(leftovers.pop()!, "SIGKILL"); } catch { /* gone */ } }
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-life-"))); made.push(d); return d; };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const listening = (port: number) => new Promise<boolean>((res) => {
  const s = connect({ port, host: "127.0.0.1" });
  s.once("connect", () => { s.destroy(); res(true); });
  s.once("error", () => res(false));
});

/** A stand in for the engine: runs `body` (which prints a line the test waits for), then idles until killed. */
function engine(d: string, body: string) {
  writeFileSync(join(d, "engine.ts"), `
    import { runCommand } from ${JSON.stringify(join(import.meta.dir, "../src/proof/exec.ts"))};
    import { startServer } from ${JSON.stringify(join(import.meta.dir, "../src/proof/server.ts"))};
    ${body}
    setInterval(() => {}, 1000);
  `);
  return Bun.spawn(["bun", join(d, "engine.ts")], { cwd: d, stdout: "pipe", stderr: "ignore" });
}
async function readUntil(p: ReturnType<typeof Bun.spawn>, re: RegExp, ms = 15_000): Promise<RegExpExecArray> {
  let text = "";
  const reader = (p.stdout as ReadableStream<Uint8Array>).getReader();
  const dec = new TextDecoder();
  const end = Date.now() + ms;
  while (!re.test(text)) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${re} from the stand in engine; saw: ${text.slice(-300)}`);
    const { value, done } = await reader.read();
    if (done) throw new Error(`the stand in engine ended before ${re}; saw: ${text.slice(-300)}`);
    text += dec.decode(value);
  }
  reader.releaseLock();
  return re.exec(text)!;
}

describe("proof work ends with the engine, however the engine ends", () => {
  test("a proof command, with no option set, ends when the engine is killed by force", async () => {
    const d = tmp();
    const e = engine(d, `void runCommand("sleep 30 & echo JOB:$!; wait", { cwd: ${JSON.stringify(d)}, timeoutMs: 60000, onOutput: (t) => process.stdout.write(t) });`);
    const job = Number((await readUntil(e, /JOB:(\d+)/))[1]);
    leftovers.push(job);
    expect(alive(job)).toBe(true);
    e.kill("SIGKILL"); await e.exited;
    const end = Date.now() + 1500;
    while (alive(job) && Date.now() < end) await Bun.sleep(25);
    expect(alive(job), "the proof command outlived the engine").toBe(false);
  });

  test("the project's server the proof started lets go of its port within about a second of the engine being killed", async () => {
    const d = tmp();
    writeFileSync(join(d, "server.ts"), `Bun.serve({ port: Number(process.env.PORT), hostname: "127.0.0.1", fetch: () => new Response("ok") }); setInterval(() => {}, 1000);`);
    const e = engine(d, `
      const r = await startServer({ kind: "server", command: ${JSON.stringify(`${process.execPath} ${join(d, "server.ts")}`)} }, { cwd: ${JSON.stringify(d)}, timeoutMs: 15000 });
      process.stdout.write(r.ok ? "PORT:" + r.port + "\\n" : "FAILED:" + r.reason + "\\n");
    `);
    const m = await readUntil(e, /(PORT:(\d+)|FAILED:.*)\n/);
    expect(m[1]).toStartWith("PORT:");
    const port = Number(m[2]);
    expect(await listening(port)).toBe(true);
    e.kill("SIGKILL"); await e.exited;
    const end = Date.now() + 1500;
    while ((await listening(port)) && Date.now() < end) await Bun.sleep(25);
    expect(await listening(port), "the server still holds its port after the engine was killed").toBe(false);
  });

  test("a proof command that opts out (endWithUs: false) is the only kind left without the lifeline", async () => {
    const src = await Bun.file(join(import.meta.dir, "../src/proof/exec.ts")).text();
    expect(src).toContain("const lifeline = o.endWithUs !== false;");
    const server = await Bun.file(join(import.meta.dir, "../src/proof/server.ts")).text();
    expect(server).toContain('"-c", LIFELINE, "sh", command');
  });
});
