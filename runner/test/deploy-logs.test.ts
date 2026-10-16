// Reading why the last Vercel deploy failed, through the person's own Vercel tool, the same way Ship calls it: read only
// (list the deployments, print one build log), never a deploy, a promote or a rollback, and never for a folder that is
// not linked to a Vercel project (the tool would list every project's deployments). The tool is stubbed: no network.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VercelCli } from "../src/ship/deploy.ts";
import { runCommand, shq, type RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "deplog-")); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const res = (o: Partial<RunResult>): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const linked = () => { const p = tmp(); mkdirSync(join(p, ".vercel")); writeFileSync(join(p, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_1", orgId: "team_1" })); return p; };
const signedIn = () => { const f = join(tmp(), "auth.json"); writeFileSync(f, "{}"); return f; };
const LOG = "Vercel CLI 53.4.0\n2026-10-15T14:02:00.000Z  Running build in Washington, D.C., USA (East) – iad1\n2026-10-15T14:02:01.000Z  Type error: nope\nstatus\t● Error\n";
const list = (...deps: { url: string; state: string }[]) => res({ stdout: JSON.stringify({ contextName: "sam", deployments: deps.map((d, i) => ({ id: `dpl_${i}`, name: "shop", target: "production", createdAt: 1_760_000_000_000 - i * 1000, ...d })) }) });

function cli(answers: ((command: string) => RunResult)[], o: { auth?: string; hasCli?: boolean } = {}) {
  const calls: { command: string; opts: any }[] = [];
  let i = 0;
  const run = async (command: string, opts: any) => { calls.push({ command, opts }); return answers[Math.min(i++, answers.length - 1)](command); };
  return { calls, cli: new VercelCli(run as never, o.auth ?? signedIn(), () => o.hasCli ?? true) };
}

describe("before anything runs", () => {
  test("a folder that is not linked to a Vercel project: nothing to read, and the tool is never started", async () => {
    const { cli: c, calls } = cli([() => res({})]);
    expect(await c.lastFailedBuild(tmp())).toEqual({ state: "not_linked" });
    expect(calls).toEqual([]);
  });
  test("no Vercel tool: one plain line with what to do", async () => {
    const { cli: c, calls } = cli([() => res({})], { hasCli: false });
    expect(await c.lastFailedBuild(linked())).toEqual({ state: "unavailable", reason: "I could not read why the Vercel deploy failed: the Vercel tool is not installed. Install it with: npm install -g vercel" });
    expect(calls).toEqual([]);
  });
  test("not signed in: one plain line with what to do", async () => {
    const { cli: c, calls } = cli([() => res({})], { auth: join(tmp(), "missing.json") });
    expect(await c.lastFailedBuild(linked())).toEqual({ state: "unavailable", reason: "I could not read why the Vercel deploy failed: you are not signed in to Vercel. Open Terminal, run: vercel login, then try again." });
    expect(calls).toEqual([]);
  });
});

describe("finding the failed deploy and its build log", () => {
  test("the newest finished deploy failed: its build log is read, and only read", async () => {
    const p = linked();
    const { cli: c, calls } = cli([() => list({ url: "shop-9xk2-sam.vercel.app", state: "BUILDING" }, { url: "shop-abc123-sam.vercel.app", state: "ERROR" }, { url: "shop-old-sam.vercel.app", state: "READY" }), () => res({ code: 1, stderr: LOG })]);
    // createdAt: when that deploy was made, so a line is ringed only in a file that has not changed since.
    expect(await c.lastFailedBuild(p)).toEqual({ state: "failed", url: "https://shop-abc123-sam.vercel.app", log: LOG, createdAt: 1_760_000_000_000 - 1000 });
    // --scope: inspect does not read the folder's link, so it is told the team the project belongs to.
    expect(calls.map((x) => x.command)).toEqual(["vercel list --format json", "vercel inspect 'https://shop-abc123-sam.vercel.app' --logs --scope 'team_1'"]);
    expect(calls.every((x) => x.opts.cwd === p)).toBe(true);
    for (const x of calls) expect(x.command).not.toMatch(/\b(deploy|promote|rollback|remove|rm|--prod)\b/);
  });
  test("a newer deploy worked: nothing to rescue, and no log is read", async () => {
    const { cli: c, calls } = cli([() => list({ url: "shop-new-sam.vercel.app", state: "READY" }, { url: "shop-abc123-sam.vercel.app", state: "ERROR" })]);
    expect(await c.lastFailedBuild(linked())).toEqual({ state: "none" });
    expect(calls).toHaveLength(1);
  });
  test("no deploys at all", async () => {
    const { cli: c } = cli([() => res({ stdout: JSON.stringify({ deployments: [], contextName: "sam" }) })]);
    expect(await c.lastFailedBuild(linked())).toEqual({ state: "none" });
  });
  test("an older Vercel tool without --format: the table it prints is read instead", async () => {
    const table = "Vercel CLI 32.4.1\n> Deployments for sam/shop [612ms]\n\n  Age     Deployment                              Status      Environment     Duration     Username\n  4m      https://shop-abc123-sam.vercel.app      ● Error     Production      21s          sam\n  2d      https://shop-old-sam.vercel.app         ● Ready     Production      40s          sam\n";
    const { cli: c, calls } = cli([() => res({ code: 1, stderr: "Vercel CLI 32.4.1\nError: unknown or unexpected option: --format" }), () => res({ stderr: table, stdout: "https://shop-abc123-sam.vercel.app\nhttps://shop-old-sam.vercel.app\n" }), () => res({ code: 1, stderr: LOG })]);
    const b: any = await c.lastFailedBuild(linked());
    expect(b).toMatchObject({ state: "failed", url: "https://shop-abc123-sam.vercel.app" });
    expect(b.createdAt).toBeUndefined();   // the table says only "4m": no time to check files against
    expect(calls.map((x) => x.command)).toEqual(["vercel list --format json", "vercel list", "vercel inspect 'https://shop-abc123-sam.vercel.app' --logs --scope 'team_1'"]);
    expect(calls[1].opts.keep).toBeGreaterThanOrEqual(100_000);
  });
  test("the team is passed to inspect only when the link names it in the usual shape (a personal account's id works too)", async () => {
    const at = (orgId: unknown) => { const p = linked(); writeFileSync(join(p, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_1", orgId })); return p; };
    for (const [orgId, scope] of [["team_AbC123", " --scope 'team_AbC123'"], ["Xy12AbC", " --scope 'Xy12AbC'"], ["team_1'; rm -rf ~; '", ""], [undefined, ""], [42, ""], ["", ""]] as const) {
      const { cli: c, calls } = cli([() => list({ url: "shop-abc123-sam.vercel.app", state: "ERROR" }), () => res({ code: 1, stderr: LOG })]);
      expect(await c.lastFailedBuild(at(orgId))).toMatchObject({ state: "failed" });
      expect(calls[1].command).toBe(`vercel inspect 'https://shop-abc123-sam.vercel.app' --logs${scope}`);
    }
  });
  test("an address that is not a Vercel deployment is never handed to the shell", async () => {
    const { cli: c, calls } = cli([() => list({ url: "shop.vercel.app; rm -rf ~", state: "ERROR" })]);
    expect(await c.lastFailedBuild(linked())).toEqual({ state: "unavailable", reason: "I could not read why the Vercel deploy failed: its address looked wrong, so I did not use it." });
    expect(calls).toHaveLength(1);
  });
});

describe("when the tool says no", () => {
  test("a login starting means not signed in, and it is stopped", async () => {
    const { cli: c, calls } = cli([() => res({ matched: true, code: null, signal: "SIGTERM" })]);
    expect(await c.lastFailedBuild(linked())).toEqual({ state: "unavailable", reason: "I could not read why the Vercel deploy failed: you are not signed in to Vercel. Open Terminal, run: vercel login, then try again." });
    expect(calls[0].opts.stopWhen).toBeInstanceOf(RegExp);
  });
  test("the tool missing after all, too slow, stopped, or any other no: plain words, with secrets hidden", async () => {
    expect(await cli([() => res({ code: 127 })]).cli.lastFailedBuild(linked())).toMatchObject({ state: "unavailable", reason: expect.stringContaining("npm install -g vercel") });
    expect(await cli([() => res({ timedOut: true, code: null })]).cli.lastFailedBuild(linked())).toMatchObject({ state: "unavailable", reason: expect.stringMatching(/took too long/) });
    expect(await cli([() => res({ aborted: true, code: null })]).cli.lastFailedBuild(linked())).toEqual({ state: "cancelled" });
    const no: any = await cli([() => res({ code: 1, stderr: "Error: token sk_live_abcdefghijklmnop1234 is not valid" })]).cli.lastFailedBuild(linked());
    expect(no.state).toBe("unavailable"); expect(no.reason).not.toContain("sk_live_abcdef"); expect(no.reason).toMatch(/Vercel said no/);
  });
  test("a log that came back empty is not a failure to explain", async () => {
    const { cli: c } = cli([() => list({ url: "shop-abc123-sam.vercel.app", state: "ERROR" }), () => res({ code: 1, stderr: "Error: Can't find the deployment" })]);
    expect(await c.lastFailedBuild(linked())).toMatchObject({ state: "unavailable", reason: expect.stringMatching(/Vercel said no/) });
  });
  test("a list that cannot be read is told in one fixed sentence: none of it (names, commit messages) is shown or passed on", async () => {
    const cut = '{\n  "contextName": "sam",\n  "deployments": [\n    {\n      "url": "shop-abc123-sam.vercel.app",\n      "state": "ERROR",\n      "creator": { "uid": "u1", "username": "teammate-jo" },\n      "meta": { "githubCommitMessage": "secret launch plan for acme" ';
    const b: any = await cli([() => res({ stdout: cut })]).cli.lastFailedBuild(linked());
    expect(b).toEqual({ state: "unavailable", reason: "I could not read why the Vercel deploy failed: the Vercel tool's list of deploys could not be read. Open this project on vercel.com to see why the last deploy failed." });
  });
  test("the build log is read with room for a long log, and stops if a login starts", async () => {
    const { cli: c, calls } = cli([() => list({ url: "shop-abc123-sam.vercel.app", state: "ERROR" }), () => res({ code: 1, stderr: LOG })]);
    await c.lastFailedBuild(linked());
    expect(calls[1].opts.keep).toBeGreaterThanOrEqual(40000);
    expect(calls[1].opts.stopWhen).toBeInstanceOf(RegExp);
  });
});

// The size Vercel's own tool really prints: `vercel list --format json` in CLI 53.4.0 writes JSON.stringify(list, null, 2)
// with up to 20 deployments, each with its creator and its meta (for a project built from GitHub: the commit's message,
// sha, author, repository and branch). That is well over the 8000 characters a command's output is cut to by default.
// It goes through the real runCommand (cat of a file written here), so the cut is the real one.
function bigList(n: number) {
  return {
    contextName: "sam-team",
    deployments: Array.from({ length: n }, (_, i) => ({
      id: `dpl_${"A1b2C3d4E5f6G7h8J9k0".slice(0, 12)}${i}`,
      url: i === 0 ? "shop-9f3k2ab1c-sam-team.vercel.app" : `shop-${(1000 + i).toString(36)}x9q-sam-team.vercel.app`,
      name: "shop",
      state: i === 0 ? "ERROR" : "READY",
      target: i % 3 === 0 ? "production" : null,
      createdAt: 1_760_000_000_000 - i * 3_600_000,
      buildingAt: 1_760_000_000_500 - i * 3_600_000,
      ready: 1_760_000_040_000 - i * 3_600_000,
      creator: { uid: `u${i % 3}Xb7KqP2mN8vR4tY6`, username: ["sam", "teammate-jo", "alex-dev"][i % 3] },
      meta: {
        githubCommitAuthorName: ["Sam Lee", "Jo Park", "Alex Kim"][i % 3], githubCommitAuthorLogin: ["sam", "teammate-jo", "alex-dev"][i % 3],
        githubCommitMessage: `Fix the cart total and the checkout button on small screens (#${120 + i})`, githubCommitOrg: "sam-team",
        githubCommitRef: i % 2 ? "main" : `fix/cart-${i}`, githubCommitRepo: "shop", githubCommitSha: `${i}f3c9a1b2d4e5f60718293a4b5c6d7e8f9a0b1c2`.slice(0, 40),
        githubDeployment: "1", githubOrg: "sam-team", githubRepo: "shop", githubRepoOwnerType: "Organization", githubCommitRepoId: "812345678",
        githubRepoId: "812345678", githubRepoVisibility: "private", githubHost: "github.com", branchAlias: `shop-git-fix-cart-${i}-sam-team.vercel.app`,
      },
    })),
    pagination: { count: n, next: 1_759_928_000_000, prev: 1_760_000_000_000 },
  };
}
describe("a list the size Vercel really prints", () => {
  for (const n of [8, 20]) {
    test(`${n} deployments from a project built from GitHub are read whole, and the failed one is found`, async () => {
      const file = join(tmp(), "list.json");
      const text = JSON.stringify(bigList(n), null, 2) + "\n";
      expect(text.length).toBeGreaterThan(8000);
      writeFileSync(file, text);
      const commands: string[] = [];
      const run = (command: string, opts: any) => { commands.push(command); return command.startsWith("vercel list") ? runCommand(`cat ${shq(file)}`, opts) : Promise.resolve(res({ code: 1, stderr: LOG })); };
      const c = new VercelCli(run as never, signedIn(), () => true);
      expect(await c.lastFailedBuild(linked())).toEqual({ state: "failed", url: "https://shop-9f3k2ab1c-sam-team.vercel.app", log: LOG, createdAt: 1_760_000_000_000 });
      expect(commands[1]).toStartWith("vercel inspect 'https://shop-9f3k2ab1c-sam-team.vercel.app' --logs");
    });
  }
});
