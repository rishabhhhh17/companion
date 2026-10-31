// Spike: can the practice projects' checks, tests and server run with the engine's own Bun in place of Node and npm,
// inside the safety box for checks (runner/src/proof/box.ts), with no internet? (M49, rule 18.)
//
// Run it from the runner folder:  cd runner && bun ../spikes/practice-bun/spike.ts
// It copies the Bun running it into a folder laid out like the app's engine (engine/bin/bun, the way
// app/scripts/stage-engine.sh copies it), and gives every command a PATH with only that folder and the system's own folders,
// so neither node nor npm can be found. Every command runs through the runner's own runCommand and startServer, in the box,
// with no internet ("local"). Nothing is downloaded or installed. It prints what it ran and what happened, as JSON lines.
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync, chmodSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand, shq } from "../../runner/src/proof/exec.ts";
import { startServer } from "../../runner/src/proof/server.ts";
import { boxReady } from "../../runner/src/proof/box.ts";
import { locateProblem } from "../../runner/src/proof/locate.ts";
import { bunServer, bunTests } from "../../runner/src/proof/practicerun.ts";
import { NAMES } from "../../runner/src/names.ts";

const SAMPLES = join(import.meta.dir, "../../app/sample");
const catalog = JSON.parse(readFileSync(join(SAMPLES, "practices.json"), "utf8")) as { practices: { id: string; folder: string; copyName: string; find: string; expect: { file?: string; line?: number; about?: string } }[] };
const made: string[] = [];
const tmp = (n: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `practice-bun-${n}-`))); made.push(d); return d; };

// The app's layout: Contents/Resources/engine/bin/bun.
const engine = tmp("engine");
mkdirSync(join(engine, "bin"));
const bun = join(engine, "bin", "bun");
copyFileSync(process.execPath, bun); chmodSync(bun, 0o755);
const PATH = `${join(engine, "bin")}:/usr/bin:/bin:/usr/sbin:/sbin`;
const env = { PATH, CI: "1" };

const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));
const short = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 240);
const box = (project: string) => ({ project, net: "local" as const });

// The one change a person would make for each practice the tests check (as runner/test/practice-library.test.ts).
const edit = (p: string, f: string, from: string, to: string) => writeFileSync(join(p, f), readFileSync(join(p, f), "utf8").split(from).join(to));
const FIXES: Record<string, (p: string) => void> = {
  signup: (p) => edit(p, "public/signup.js", "/api/signup", "/api/register"),
  setting: (p) => writeFileSync(join(p, ".env.local"), "SHOP_NAME=Sam's Plants\n"),
  route: (p) => edit(p, "index.html", 'href="/prices"', 'href="/pricing"'),
  import: (p) => edit(p, "server.js", 'require("./lib/format-price")', 'require("./lib/money")'),
};

async function run(project: string, command: string) {
  const r = await runCommand(command, { cwd: project, timeoutMs: 30_000, env, box: box(project) });
  return { code: r.code, timedOut: r.timedOut, ms: r.ms, out: r.stdout + "\n" + r.stderr };
}

log({ step: "setup", bunVersion: Bun.version, boxReady: boxReady(), PATH: PATH.replace(engine, "<engine>") });
{
  const probe = tmp("probe");
  const r = await run(probe, "command -v node || echo no-node; command -v npm || echo no-npm; command -v bun");
  log({ step: "no node on this PATH", out: short(r.out.replace(engine, "<engine>")) });
  // No internet in the box: a connection to an address on the internet is refused by the box at once (192.0.2.1 is a
  // documentation address that leads nowhere, so nothing is sent even outside the box).
  const net = await run(probe, `${shq(bun)} -e 'const s=require("node:net").connect(80,"192.0.2.1");s.on("error",e=>{console.log("refused:",e.code);process.exit(3)});s.on("connect",()=>{console.log("connected");process.exit(0)});setTimeout(()=>{console.log("timeout");process.exit(4)},3000)'`);
  log({ step: "no internet in the box", code: net.code, out: short(net.out) });
}

for (const p of catalog.practices) {
  // Named the way the shell names a copy (practice.rs): "Squibby practice signup page", spaces and all.
  const project = join(tmp(p.id), `${NAMES.practiceCopyBase} ${p.copyName}`);
  cpSync(join(SAMPLES, p.folder), project, { recursive: true });
  const pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  log({ practice: p.id, scripts: pkg.scripts, dependencies: pkg.dependencies ?? {}, devDependencies: pkg.devDependencies ?? {} });
  if (pkg.scripts?.test) {
    // What happens today without Node: npm (the package manager the checks pick) is not there.
    const today = await run(project, "npm run test");
    log({ practice: p.id, try: "npm run test (today)", code: today.code, out: short(today.out) });
    // Bun runs the script, and puts its own stand in for node on the PATH; but "node --test" is Node's test runner.
    const viaScript = await run(project, `${shq(bun)} run test`);
    log({ practice: p.id, try: "bun run test (the script, node --test)", code: viaScript.code, out: short(viaScript.out) });
    // Bun's own test runner, which runs node:test files, the way the engine now runs it (practicerun.ts bunTests).
    const broken = await run(project, bunTests(bun));
    const found = locateProblem(broken.out, project, "tests");
    const want = p.expect;
    const where = found && found.kind === "line" ? { file: found.file, line: found.line, message: found.message } : found;
    const matches = !!found && found.kind === "line" && found.file === want.file && found.line === want.line && found.message.toLowerCase().includes((want.about ?? "").toLowerCase());
    log({ practice: p.id, try: "bun test, as the engine runs it (broken)", code: broken.code, found: where, expected: want, matches, out: short(broken.out.replace(project, "<project>")) });
    FIXES[p.id]?.(project);
    const fixed = await run(project, bunTests(bun));
    log({ practice: p.id, try: "bun test, as the engine runs it (after the small fix)", code: fixed.code, out: short(fixed.out.replace(project, "<project>")) });
  }
  // The server: its dev script is "node server.js".
  const viaDev = await runCommand(`${shq(bun)} run dev`, { cwd: project, timeoutMs: 8_000, env: { ...env, PORT: "0" }, box: box(project), stopWhen: /http:\/\/127\.0\.0\.1:\d+/ });
  log({ practice: p.id, try: "bun run dev (the script, node server.js)", matched: viaDev.matched ?? false, code: viaDev.code, out: short((viaDev.stdout + viaDev.stderr).replace(project, "<project>")) });
  const s = await startServer({ kind: "server", command: bunServer(bun, "server.js"), env: { PATH } }, { cwd: project, timeoutMs: 15_000, box: box(project) });
  if (s.ok) {
    const res = await fetch(s.url).catch((e) => ({ status: String(e) }) as { status: string });
    log({ practice: p.id, try: "bun server.js, as the engine starts it, through startServer", ok: true, status: (res as Response).status, url: s.url });
    await s.stop();
  } else log({ practice: p.id, try: "bun server.js, as the engine starts it, through startServer", ok: false, reason: short(s.reason) });
}

// Bun kept as strict as Node: the project's bunfig.toml is not read (it could load code before the tests), no .env file is
// loaded on its own, and nothing is installed while it runs.
{
  const project = join(tmp("strict"), `${NAMES.practiceCopyBase} signup page`);
  cpSync(join(SAMPLES, "stuck-signup"), project, { recursive: true });
  writeFileSync(join(project, "cheat.js"), "console.log('PRELOAD RAN');\n");
  writeFileSync(join(project, "bunfig.toml"), 'preload = ["./cheat.js"]\n[test]\npreload = ["./cheat.js"]\n');
  writeFileSync(join(project, ".env"), "PROBE=from-env-file\n");
  writeFileSync(join(project, "test/probe.test.js"), 'const test = require("node:test"); const assert = require("node:assert");\ntest("no env file was loaded", () => assert.strictEqual(process.env.PROBE, undefined));\n');
  writeFileSync(join(project, "needs.js"), 'require("left-pad");\n');
  const plain = await run(project, `${shq(bun)} test`);
  log({ step: "plain bun test with a bunfig.toml and a .env", preloadRan: plain.out.includes("PRELOAD RAN"), envLoaded: !plain.out.includes("(pass) no env file was loaded") });
  const strict = await run(project, bunTests(bun));
  log({ step: "bun test as the engine runs it", preloadRan: strict.out.includes("PRELOAD RAN"), envLoaded: !strict.out.includes("(pass) no env file was loaded") });
  const pkgRun = await run(project, bunServer(bun, "needs.js"));
  log({ step: "a missing package, as the engine runs a file", code: pkgRun.code, out: short(pkgRun.out.replace(project, "<project>")) });
}

for (const d of made) rmSync(d, { recursive: true, force: true });
