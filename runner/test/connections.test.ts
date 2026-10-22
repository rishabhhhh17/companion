// Builder stack connections, read only (F21): the Vercel and GitHub tools are the person's own, stubbed here (no network, no
// real tool). The write verbs are refused in code, so these tests also try to run them and watch them fail.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ciEvidence, ciResult, deployEvidence, deployResult, GH_NO_CLI, GH_NO_LOGIN, GH_NO_REPO, GhCli, logTail, type CiReader } from "../src/connections.ts";
import { redactOutput, stripTerminal } from "../src/redact.ts";
import { refuseWrite, words } from "../src/readonly.ts";
import { VercelCli } from "../src/ship/deploy.ts";
import { shq, type RunResult } from "../src/proof/exec.ts";
import { PRODUCT } from "../src/names.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "conn-")); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const res = (o: Partial<RunResult>): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });

describe("only reading commands pass", () => {
  test(`the commands ${PRODUCT} really uses are allowed`, () => {
    for (const c of [
      "vercel list --format json", "vercel list", "vercel ls", `vercel inspect ${shq("https://shop-abc.vercel.app")} --logs --scope ${shq("team_1")}`,
      "gh repo view --json defaultBranchRef", "gh run list --limit 20 --json databaseId,status,conclusion --branch 'main'", "gh run view '123' --json jobs", "gh run view '123' --log-failed",
    ]) expect(refuseWrite(c), c).toBeNull();
  });
  test("every write verb is refused, on both tools, with a plain line", () => {
    const writes = [
      "vercel deploy", "vercel deploy --prod", "vercel --prod", "vercel promote https://a.vercel.app", "vercel rollback", "vercel redeploy dpl_1", "vercel env add FOO", "vercel env rm FOO production", "vercel env pull",
      "vercel rm my-project", "vercel remove my-project --yes", "vercel alias set a.vercel.app b.com", "vercel domains add b.com", "vercel link", "vercel pull", "vercel login", "vercel logout", "vercel secrets add a b", "vercel dev", "vercel build",
      "gh run rerun 123", "gh run cancel 123", "gh run delete 123", "gh workflow run build.yml", "gh workflow enable x", "gh pr create --fill", "gh pr merge 4", "gh pr comment 4 -b hi", "gh issue create -t x", "gh issue close 3",
      "gh release create v1", "gh repo create x", "gh repo delete x --yes", "gh repo fork", "gh repo clone a/b", "gh secret set X", "gh variable set X", "gh api -X POST /repos/a/b/issues", "gh api repos/a/b", "gh auth login", "gh auth logout", "gh gist create f",
      "gh run view 123 --web", "gh repo view --web", "gh run list --method POST",
    ];
    for (const c of writes) { const why = refuseWrite(c); expect(why, c).not.toBeNull(); expect(why, c).toMatch(/only reads|only runs|never runs|only reads from/); }
    expect(refuseWrite("vercel deploy")).toBe(`${PRODUCT} never runs "deploy" on your tools. It only reads.`);
    expect(refuseWrite("gh run rerun 123")).toBe(`${PRODUCT} never runs "rerun" on your tools. It only reads.`);
    expect(refuseWrite("gh pr create")).toBe(`${PRODUCT} never runs "create" on your tools. It only reads.`);
  });
  test("a reading command with something else tacked on is refused, however it is joined", () => {
    for (const c of [
      "vercel list; vercel deploy", "vercel list && vercel deploy", "vercel list | sh", "vercel list `vercel deploy`", "vercel list $(vercel deploy)", "vercel list > /etc/hosts", "vercel list\nvercel deploy",
      "gh run list & gh run rerun 1", "gh run view 1 || gh pr create", "gh run view 1 --log-failed | tee x", "vercel list \"$(id)\"", "vercel list \\; deploy", "vercel list 'unterminated",
    ]) expect(refuseWrite(c), c).not.toBeNull();
    expect(words("vercel inspect 'a b; c' --logs")).toEqual(["vercel", "inspect", "a b; c", "--logs"]);
    expect(refuseWrite("vercel inspect 'x; vercel deploy' --logs")).toBeNull();   // inside quotes it is only text
  });
  test("other tools, and an empty line, are refused", () => {
    for (const c of ["", "   ", "rm -rf ~", "curl https://x.com", "git push", "npm publish", "supabase db push", "VERCEL_TOKEN=x vercel list"]) expect(refuseWrite(c), c).not.toBeNull();
  });
});

describe("the Vercel tool, as a watch reads it", () => {
  const linked = () => { const p = tmp(); mkdirSync(join(p, ".vercel")); writeFileSync(join(p, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_1", orgId: "team_1" })); return p; };
  const auth = () => { const f = join(tmp(), "auth.json"); writeFileSync(f, "{}"); return f; };
  const list = (...deps: { url: string; state: string }[]) => res({ stdout: JSON.stringify({ deployments: deps.map((d, i) => ({ id: `dpl_${i}`, createdAt: 1_760_000_000_000 - i * 1000, ...d })) }) });
  function cli(answers: RunResult[], o: { auth?: string; hasCli?: boolean } = {}) {
    const calls: string[] = [];
    let i = 0;
    const run = async (command: string) => { calls.push(command); return answers[Math.min(i++, answers.length - 1)]; };
    return { calls, cli: new VercelCli(run as never, o.auth ?? auth(), () => o.hasCli ?? true) };
  }
  test("the newest finished deploy decides: live, failed, or none yet", async () => {
    const a = cli([list({ url: "a-1.vercel.app", state: "READY" }, { url: "a-0.vercel.app", state: "ERROR" })]);
    expect(await a.cli.latestDeploy(linked())).toMatchObject({ state: "ready", url: "a-1.vercel.app", building: false });
    const b = cli([list({ url: "a-2.vercel.app", state: "BUILDING" }, { url: "a-1.vercel.app", state: "ERROR" }, { url: "a-0.vercel.app", state: "READY" })]);
    expect(await b.cli.latestDeploy(linked())).toMatchObject({ state: "failed", building: true });
    const c = cli([list()]);
    expect(await c.cli.latestDeploy(linked())).toEqual({ state: "none", building: false });
    expect(a.calls).toEqual(["vercel list --format json"]);
  });
  test("not linked, no tool, not signed in: one plain line each, and the tool is never started", async () => {
    const a = cli([list()]);
    expect(await a.cli.latestDeploy(tmp())).toEqual({ state: "not_linked" });
    expect(deployResult({ state: "not_linked" })!.reason).toMatch(/vercel link/);
    const b = cli([list()], { hasCli: false });
    const nb = await b.cli.latestDeploy(linked());
    expect(nb).toMatchObject({ state: "unavailable" });
    expect((nb as any).reason).toBe("I could not check your Vercel deploys: the Vercel tool is not installed. Install it with: npm install -g vercel");
    const c = cli([list()], { auth: join(tmp(), "none.json") });
    expect((await c.cli.latestDeploy(linked()) as any).reason).toBe("I could not check your Vercel deploys: you are not signed in to Vercel. Open Terminal, run: vercel login, then try again.");
    expect([...a.calls, ...b.calls, ...c.calls]).toEqual([]);
  });
  test("a timeout and a tool that says no are unknown with a plain line; Stop is no answer at all", async () => {
    expect(((await cli([res({ timedOut: true })]).cli.latestDeploy(linked())) as any).reason).toMatch(/took too long/);
    expect(((await cli([res({ code: 1, stderr: "Error: bad things password=hunter2hunter2" })]).cli.latestDeploy(linked())) as any).reason).not.toContain("hunter2hunter2");
    expect(await cli([res({ aborted: true })]).cli.latestDeploy(linked())).toEqual({ state: "cancelled" });
    expect(deployResult({ state: "cancelled" })).toBeNull();
  });
  test("what a watch shows for each state", () => {
    expect(deployResult({ state: "ready", url: "x", building: false })).toEqual({ outcome: "ok", reason: "Your latest Vercel deploy is live." });
    expect(deployResult({ state: "failed", url: "x", building: true })).toEqual({ outcome: "failing", reason: "Your latest Vercel deploy failed (a newer one is still building)." });
    expect(deployResult({ state: "none", building: false })!.outcome).toBe("unknown");
  });
  test("the existing reader still refuses to run anything but a list and an inspect", async () => {
    const { cli: c } = cli([list({ url: "a-0.vercel.app", state: "ERROR" }), res({ code: 1, stderr: "2026-10-15T14:02:00.000Z  boom" })]);
    const prev = (c as any).run;
    const seen: string[] = [];
    (c as any).run = async (cmd: string, o: any) => { seen.push(cmd); return prev(cmd, o); };
    await c.lastFailedBuild(linked());
    for (const s of seen) expect(refuseWrite(s), s).toBeNull();
    expect(seen).toHaveLength(2);
  });
});

describe("the GitHub tool", () => {
  const repo = () => { const p = tmp(); mkdirSync(join(p, ".git")); return p; };
  const run = (id: number, workflow: string, conclusion: string | null, o: Record<string, unknown> = {}) => ({ databaseId: id, status: conclusion ? "completed" : "in_progress", conclusion, workflowName: workflow, headBranch: "main", displayTitle: `Change ${id}`, createdAt: `2026-10-22T10:${String(id).padStart(2, "0")}:00Z`, url: `https://github.com/sam/shop/actions/runs/${id}`, ...o });
  function gh(answers: RunResult[], hasCli = true) {
    const calls: string[] = [];
    let i = 0;
    const runner = async (command: string) => { calls.push(command); return answers[Math.min(i++, answers.length - 1)]; };
    return { calls, gh: new GhCli(runner as never, () => hasCli) };
  }
  const branch = res({ stdout: JSON.stringify({ defaultBranchRef: { name: "main" } }) });
  const runs = (...r: unknown[]) => res({ stdout: JSON.stringify(r) });

  test("passing: fine, with the default branch asked for", async () => {
    const t = gh([branch, runs(run(9, "CI", "success"), run(8, "CI", "failure"))]);
    const r = await t.gh.latestRun(repo());
    expect(r).toMatchObject({ state: "ok", reason: "CI passed on main." });
    expect(t.calls[0]).toBe("gh repo view --json defaultBranchRef");
    expect(t.calls[1]).toBe("gh run list --limit 20 --json databaseId,status,conclusion,workflowName,headBranch,displayTitle,createdAt,url --branch 'main'");
    expect(ciResult(r)).toEqual({ outcome: "ok", reason: "CI passed on main." });
  });
  test("failing: names the workflow, and a passing workflow cannot hide a failing one", async () => {
    const t = gh([branch, runs(run(9, "Lint", "success"), run(8, "Tests", "failure"), run(7, "Tests", "success"))]);
    const r = await t.gh.latestRun(repo());
    expect(r).toMatchObject({ state: "failing", reason: "Tests failed on main." });
    expect((r as any).run.id).toBe(8);
    const two = await gh([branch, runs(run(9, "Lint", "failure"), run(8, "Tests", "timed_out"))]).gh.latestRun(repo());
    expect(two).toMatchObject({ state: "failing", reason: "2 GitHub workflows failed: Lint, Tests." });
  });
  test("a run still going, cancelled or skipped says nothing yet", async () => {
    const r = await gh([branch, runs(run(9, "CI", null), run(8, "CI", "cancelled"), run(7, "CI", "success"))]).gh.latestRun(repo());
    expect(r).toMatchObject({ state: "ok" });
    const none = await gh([branch, runs(run(9, "CI", null))]).gh.latestRun(repo());
    expect(none).toMatchObject({ state: "none" });
    expect(ciResult(none)!.outcome).toBe("unknown");
  });
  test("no tool, not signed in, not a GitHub project, a timeout: one plain line each", async () => {
    expect(await gh([branch], false).gh.latestRun(repo())).toEqual({ state: "unknown", reason: GH_NO_CLI });
    expect(await gh([res({})]).gh.latestRun(tmp())).toEqual({ state: "unknown", reason: GH_NO_REPO });
    expect(await gh([res({ code: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" })]).gh.latestRun(repo())).toEqual({ state: "unknown", reason: GH_NO_LOGIN });
    expect(await gh([res({ code: 1, stderr: "none of the git remotes configured for this repository point to a known GitHub host" })]).gh.latestRun(repo())).toEqual({ state: "unknown", reason: GH_NO_REPO });
    expect(((await gh([branch, res({ timedOut: true })]).gh.latestRun(repo())) as any).reason).toMatch(/took too long/);
    expect(await gh([res({ aborted: true })]).gh.latestRun(repo())).toEqual({ state: "cancelled" });
    expect(await gh([branch, res({ stdout: "not json" })]).gh.latestRun(repo())).toMatchObject({ state: "unknown" });
    expect(GH_NO_LOGIN).toMatch(/gh auth login/);
  });
  test("when the default branch cannot be read, any branch counts", async () => {
    const t = gh([res({ code: 1, stderr: "something odd" }), runs(run(9, "CI", "success"))]);
    expect(await t.gh.latestRun(repo())).toMatchObject({ state: "ok" });
    expect(t.calls[1]).not.toContain("--branch");
  });
  test("a hostile branch name, run id or url is never put in a command or shown", async () => {
    const t = gh([res({ stdout: JSON.stringify({ defaultBranchRef: { name: "main'; gh pr create; '" } }) }), runs(run(9, "CI", "failure", { url: "javascript:alert(1)" }))]);
    const r = await t.gh.latestRun(repo());
    expect(t.calls[1]).not.toContain("--branch");
    expect((r as any).run.url).toBe("");
    const evil = await gh([branch, runs(run(9, "CI", "failure", { databaseId: "9; gh pr create" }))]).gh.latestRun(repo());
    expect(evil).toMatchObject({ state: "unknown" });   // an id that is not a number is dropped, so nothing is built from it
    const logs = gh([res({})]);
    expect(await logs.gh.failureLog(repo(), { id: Number.NaN, workflow: "x", branch: "", url: "", title: "" })).toBeNull();
    expect(logs.calls).toEqual([]);
  });
  test("the failing job, its step and the end of its log; secrets hidden, the size capped, only reading", async () => {
    const jobs = res({ stdout: JSON.stringify({ jobs: [{ name: "build", conclusion: "success", steps: [] }, { name: "test", conclusion: "failure", steps: [{ name: "Run tests", conclusion: "failure" }] }] }) });
    const big = Array.from({ length: 500 }, (_, i) => `test\tRun tests\t2026-10-22T10:00:00.0000000Z line ${i} ${i === 499 ? "token=abcdef123456789 sk-abcdefghijklmnopqrstuv" : ""}`).join("\n");
    const t = gh([jobs, res({ stdout: big })]);
    const text = (await t.gh.failureLog(repo(), { id: 8, workflow: "Tests", branch: "main", url: "", title: "" }))!;
    expect(text).toContain('Failed: test, step "Run tests"');
    expect(text).toContain("line 499");
    expect(text).not.toContain("abcdef123456789");
    expect(text).not.toContain("sk-abcdefghijklmnopqrstuv");
    expect(text.length).toBeLessThanOrEqual(6000);
    expect(text).not.toContain("line 100");
    expect(t.calls).toEqual(["gh run view '8' --json jobs", "gh run view '8' --log-failed"]);
    for (const c of t.calls) expect(refuseWrite(c)).toBeNull();
  });
  test("every command the class can build is a reading one, and a write is refused before it reaches the tool", async () => {
    const seen: string[] = [];
    const g = new GhCli((async (c: string) => { seen.push(c); return res({ stdout: "[]" }); }) as never, () => true);
    await g.latestRun(repo());
    for (const s of seen) expect(refuseWrite(s)).toBeNull();
    expect(() => (g as any).read(tmp(), "pr create --fill", 1000)).toThrow(/never runs "create"/);
    expect(() => (g as any).read(tmp(), "run rerun 1", 1000)).toThrow(/never runs "rerun"/);
    expect(seen.some((s) => /\b(rerun|create)\b/.test(s))).toBe(false);
  });
});

describe("evidence for Fix it and Rescue", () => {
  const ci = (latest: any, log: string | null = "The end of its log:\nboom"): CiReader => ({ latestRun: async () => latest, failureLog: async () => log });
  test("a failed CI run: its name, its change and the end of its log, as one capped block", async () => {
    const e = await ciEvidence("/p", ci({ state: "failing", reason: "Tests failed on main.", run: { id: 1, workflow: "Tests", branch: "main", url: "", title: "Fix the cart" }, failing: [] }));
    expect(e).toEqual({ ok: false, text: "Your latest GitHub run failed: Tests failed on main.\nChange: Fix the cart\nThe end of its log:\nboom" });
    expect(await ciEvidence("/p", ci({ state: "ok", reason: "", run: {}, failing: [] }))).toBeNull();
    expect(await ciEvidence("/p", ci({ state: "none", reason: "x" }))).toBeNull();
    expect(await ciEvidence("/p", ci({ state: "cancelled" }))).toBeNull();
    expect(await ciEvidence("/p", ci({ state: "unknown", reason: GH_NO_LOGIN }))).toEqual({ ok: false, unknown: true, text: GH_NO_LOGIN });
    const huge = await ciEvidence("/p", ci({ state: "failing", reason: "x", run: { id: 1, workflow: "w", branch: "", url: "", title: "" }, failing: [] }, "y".repeat(20_000)));
    expect(huge!.text.length).toBeLessThanOrEqual(6000);
  });
  test("a failed Vercel deploy: the located problem and the end of its build log, secrets hidden", async () => {
    const log = "2026-10-15T14:02:00.000Z  Running build\n2026-10-15T14:02:01.000Z  Error: Cannot find module 'foo' token=abcdef123456789\n2026-10-15T14:02:02.000Z  Error: Command \"npm run build\" exited with 1\n";
    const reader = { lastFailedBuild: async () => ({ state: "failed" as const, url: "https://a.vercel.app", log }) };
    const e = await deployEvidence(tmp(), reader);
    expect(e!.ok).toBe(false);
    expect(e!.text).toContain("Your last Vercel deploy failed");
    expect(e!.text).toContain("The end of its build log");
    expect(e!.text).not.toContain("abcdef123456789");
    expect(await deployEvidence(tmp(), { lastFailedBuild: async () => ({ state: "not_linked" as const }) })).toBeNull();
    expect(await deployEvidence(tmp(), { lastFailedBuild: async () => ({ state: "none" as const }) })).toEqual({ ok: true, text: "Your last Vercel deploy worked." });
    expect(await deployEvidence(tmp(), { lastFailedBuild: async () => ({ state: "unavailable" as const, reason: "no tool" }) })).toEqual({ ok: false, unknown: true, text: "no tool" });
  });
  test("a secret that a colour code cuts in two is still hidden, in a log and in what a tool said", () => {
    for (const raw of ["token ghp_\u001b[0mABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "key sk-ant-\u001b[1mabcdefghijklmnopqrstuvwxyz0123", "key sk-ant-abcdefgh\r\u001b[2Kijklmnopqrstuvwxyz0123"]) {
      const t = logTail(raw);
      expect(t, raw).not.toMatch(/ABCDEFGHIJKLM|abcdefghijklm|ijklmnop/);
      expect(t).toContain("[secret]");
    }
    expect(redactOutput("ghp_\u001b[0mABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")).toBe("[secret]");
    expect(stripTerminal("a\u001b[31mb\u001b[0m\rc")).toBe("abc");
  });
  test("a log tail drops colours and times, hides secrets, and keeps the end", () => {
    const t = logTail(`\u001b[31mred\u001b[0m\n${Array.from({ length: 100 }, (_, i) => `2026-10-22T10:00:00Z row ${i}`).join("\n")}\nSECRET_KEY=abcdefgh1234`, 5, 400);
    expect(t).not.toContain("\u001b");
    expect(t).not.toContain("abcdefgh1234");
    expect(t.split("\n")).toHaveLength(5);
    expect(t).toContain("row 99");
  });
});
