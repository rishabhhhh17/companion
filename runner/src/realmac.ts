// M109 (docs/milestones/M109-real-mac-guide.md): prove the safety net in all seven tools on a real Mac. This file holds what
// can be built without the founder: the guided session per tool (one step per message: one thing to do, at most one line to
// paste, what to see and one question), the result recorder, the RESULTS file and its template, the summary that names only
// proven tools, and the practice guard (Squibby's real HookGuard with a real shadow store in a throwaway data folder).
// It claims nothing: a tool is proven only by the founder's own run, recorded here. No model is called, nothing is sent
// anywhere, and git runs only in the shadow store's own folder, never in a project. The words here are for the founder's
// guided session (a developer tool, like the other scripts/m1xx scripts), never shown in the app.
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canAsk, canBlock, DONE_DIR, DoneSignals, GUARD_DIR, GUARD_PID, markerOf, type DoneTool } from "./donesignal.ts";
import { HookGuard, parseRequest, shortCommand } from "./guard.ts";
import { CheckpointStore } from "./checkpoints.ts";
import { clip, redact } from "./redact.ts";
import type { LoginMode } from "./savedlogins.ts";
import { PRODUCT, PRODUCT_S } from "./names.ts";

/** The seven tools the product names (plan M109). */
export const SEVEN = ["claude", "codex", "cursor", "copilot", "gemini", "windsurf", "antigravity"] as const satisfies readonly DoneTool[];
export type SevenTool = (typeof SEVEN)[number];
export const isSeven = (t: string): t is SevenTool => (SEVEN as readonly string[]).includes(t);
export const TOOL_NAME: Readonly<Record<SevenTool, string>> = {
  claude: "Claude Code", codex: "Codex", cursor: "Cursor", copilot: "VS Code agent (Copilot)", gemini: "Gemini CLI", windsurf: "Windsurf", antigravity: "Antigravity",
};
/** The checks that decide whether a tool is proven, in the order they are run. block and blocked only where the tool can
 *  block and cannot ask. */
/** mcp and hooks only for Claude Code: CLAUDE.md asks every Claude Code test to check that only the expected tools and
 *  hooks loaded, since --setting-sources alone does not stop claude.ai connectors. */
export const CORE_STEPS = ["version", "watch", "open", "mcp", "hooks", "done", "guard", "live", "logins", "block", "blocked"] as const;
/** Checks of later milestones that run in their own guide section: shown in the RESULTS file, never deciding the verdict. */
export const EXTRA_STEPS = ["start", "putin"] as const;
export type StepId = (typeof CORE_STEPS)[number] | (typeof EXTRA_STEPS)[number];
/** M108's start line: Codex, Gemini CLI and Antigravity (Claude Code's was proven by the 11 Nov memory lab). */
const START_TOOLS: readonly SevenTool[] = ["codex", "gemini", "antigravity"];
/** M107's Put it in: the four editor tools with a chat box. */
const PUTIN_TOOLS: readonly SevenTool[] = ["cursor", "copilot", "windsurf", "antigravity"];

/** A harmless command that names a key with wide reach (livesystems.ts BROAD_TOKENS): it sets a practice value and runs
 *  true, so it does nothing even in a tool that cannot ask. */
export const LIVE_COMMAND = "STRIPE_SECRET_KEY=practice-only true";
/** The practice .env's only line: no real key, so a tool that cannot ask may show it. */
export const PRACTICE_LINE = "PRACTICE_ONLY=not-a-real-key";
/** Words of the product's login reason (savedlogins.ts fileReason) the tool shows when it asks. */
export const LOGIN_ASK = "a file of saved logins or keys";
const LIVE_ASK = "This uses STRIPE_SECRET_KEY";
/** The saved logins step's command, for a tool whose guard sees only its shell (savedlogins.ts reads it as a read of .env). */
export const LOGIN_COMMAND = "cat .env";
/** How each tool's guard can see a read of .env (donesignal.ts guardEntryFor): Cursor's guard is beforeShellExecution only
 *  (its beforeReadFile is not used), Windsurf's matcher is exec and Codex's is Bash, so those are asked for a shell command.
 *  Claude Code (Read), the VS Code agent (every tool), Gemini CLI (read_file) and Antigravity (view_file) see the file reader. */
export const LOGIN_VIA: Readonly<Record<SevenTool, "shell" | "read">> = { claude: "read", codex: "shell", cursor: "shell", copilot: "read", gemini: "read", windsurf: "shell", antigravity: "read" };

export type Step = { id: StepId; title: string; do: string; paste?: string; see: string; ask: string };
export type Paths = { folder: string; data: string; script: string; claudeBin: string };

/** What each step checks, in one line, for the RESULTS file and its template. */
export const CHECKED: Readonly<Record<StepId, string>> = {
  version: "The tool and its version",
  watch: `${PRODUCT_S} practice guard is running`,
  open: `The tool opens the practice folder with ${PRODUCT_S} lines`,
  mcp: "Claude Code's /mcp lists no MCP servers (no claude.ai connectors loaded)",
  hooks: `Claude Code's /hooks lists only ${PRODUCT_S} done and guard lines`,
  done: "The done hook touched its marker, named for this tool (M105)",
  guard: "The guard made a saved copy and still let the command run",
  live: "A live key: the tool asked first where it can, or ran as documented",
  logins: "Saved logins (M103): asked first where the tool can, noted where it cannot",
  block: "The practice guard started again with Block",
  blocked: "With Block, the read of saved logins was stopped",
  start: "House rules at session start (M108)",
  putin: "Put it in on the review card (M107)",
};

/** A sentence that starts with a tool's name starts with a capital. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The step ids a tool has, in order. */
export function stepIds(tool: SevenTool): StepId[] {
  const ids: StepId[] = ["version", "watch", "open", ...(tool === "claude" ? (["mcp", "hooks"] as const) : []), "done", "guard", "live", "logins"];
  if (!canAsk(tool) && canBlock(tool)) ids.push("block", "blocked");
  if (START_TOOLS.includes(tool)) ids.push("start");
  if (PUTIN_TOOLS.includes(tool)) ids.push("putin");
  return ids;
}

const VERSION: Readonly<Record<SevenTool, (p: Paths) => { do: string; paste?: string }>> = {
  claude: (p) => ({ do: "In Terminal, ask the bundled Claude Code for its version.", paste: `${q(p.claudeBin)} --version` }),
  codex: () => ({ do: "In Terminal, ask Codex for its version.", paste: "codex --version" }),
  gemini: () => ({ do: "In Terminal, ask Gemini CLI for its version.", paste: "gemini --version" }),
  cursor: () => ({ do: "In Cursor, open the Cursor menu, then About Cursor." }),
  copilot: () => ({ do: "In VS Code, open the Code menu, then About Visual Studio Code. Also note the GitHub Copilot Chat version in Extensions." }),
  windsurf: () => ({ do: "In Windsurf, open the Windsurf menu, then About Windsurf." }),
  antigravity: () => ({ do: "In Antigravity, open the Antigravity menu, then About Antigravity." }),
};
const OPEN: Readonly<Record<SevenTool, (p: Paths) => { do: string; paste: string; see: string }>> = {
  claude: (p) => ({
    do: "In a new Terminal tab, start the bundled Claude Code in the practice folder, with the test settings.",
    paste: `cd ${q(p.folder)} && CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 ${q(p.claudeBin)} --setting-sources project,local --strict-mcp-config`,
    see: "Claude Code starts in the practice folder, signed in as usual. If it asks whether to trust the folder, say yes.",
  }),
  codex: (p) => ({ do: "In a new Terminal tab, start Codex in the practice folder.", paste: `cd ${q(p.folder)} && codex`, see: `Codex starts. Type /hooks, trust ${PRODUCT_S} two new lines (done and guard), then start a new session.` }),
  gemini: (p) => ({ do: "In a new Terminal tab, start Gemini CLI in the practice folder.", paste: `cd ${q(p.folder)} && gemini`, see: "Gemini CLI asks whether to trust the project's settings. Say yes, and it starts." }),
  cursor: (p) => ({ do: "Open the practice folder in Cursor.", paste: `open -a Cursor ${q(p.folder)}`, see: "Cursor opens the folder. Open the Agent chat (Command L)." }),
  copilot: (p) => ({ do: "Open the practice folder in VS Code.", paste: `open -a 'Visual Studio Code' ${q(p.folder)}`, see: "VS Code opens it. If it asks whether to trust the folder, say yes. Open Copilot Chat in Agent mode." }),
  windsurf: (p) => ({ do: "Open the practice folder in Windsurf.", paste: `open -a Windsurf ${q(p.folder)}`, see: "Windsurf opens it. Open Cascade." }),
  antigravity: (p) => ({ do: "Open the practice folder in Antigravity.", paste: `open -a Antigravity ${q(p.folder)}`, see: "Antigravity opens it. Customizations lists companion-done and companion-guard. Start a new conversation." }),
};

/** The guided session for one tool. Each step: one thing to do, at most one line to paste, what to see, one question. */
export function stepsFor(tool: SevenTool, p: Paths): Step[] {
  const name = TOOL_NAME[tool], short = tool === "copilot" ? "the VS Code agent" : name;
  // What the saved logins steps ask for: a shell command where the tool's guard sees only the shell (LOGIN_VIA).
  const readEnv = LOGIN_VIA[tool] === "shell" ? `Run this command exactly: ${LOGIN_COMMAND}` : "Show me what is in .env";
  const watch = (mode: "ask" | "block") => `sh ${q(p.script)} watch ${q(p.data)}${mode === "block" ? " block" : ""}`;
  const all: Record<StepId, Step> = {
    version: { id: "version", title: `Which ${name}`, ...VERSION[tool](p), see: "A version number, such as 1.2.3.", ask: "What version does it say?" },
    watch: { id: "watch", title: "Start the practice guard", do: `In a second Terminal tab, start ${PRODUCT_S} practice guard and leave it running until the end.`, paste: watch("ask"), see: "It says Watching the practice folder, saved logins: Ask.", ask: "Does it say Watching?" },
    open: { id: "open", title: `Open the folder in ${name}`, ...OPEN[tool](p), ask: `Did ${short} open the practice folder?` },
    mcp: { id: "mcp", title: "No MCP servers loaded", do: "In Claude Code, type /mcp and press Return.", paste: "/mcp", see: "It says no MCP servers are configured. No claude.ai connector is listed.", ask: "Does it list no servers at all?" },
    hooks: { id: "hooks", title: `Only ${PRODUCT_S} lines loaded`, do: "In Claude Code, type /hooks and press Return.", paste: "/hooks", see: `It lists only two lines, both from the practice folder: ${PRODUCT_S} done line, run when Claude Code stops, and ${PRODUCT_S} guard line, run before a command or a file read. Nothing else.`, ask: `Does it list only ${PRODUCT_S} two lines?` },
    done: { id: "done", title: "The done signal", do: `Ask ${short}: Change world to there in hello.txt.`, see: `${cap(short)} changes the file and says it has finished.`, ask: "Did it finish the change?" },
    guard: { id: "guard", title: "The safety copy", do: `Ask ${short}: Run this command exactly: rm -rf build`, see: `${cap(short)} may ask in its own way first: allow it. The command runs and the build folder goes.`, ask: "Did it run the command?" },
    live: canAsk(tool)
      ? { id: "live", title: "A live key", do: `Ask ${short}: Run this command exactly: ${LIVE_COMMAND}`, see: `Before it runs, ${short} asks you, with ${PRODUCT_S} reason: ${LIVE_ASK}, a key that can change a whole account. Say no.`, ask: "Did it ask you first, with that reason?" }
      : { id: "live", title: "A live key", do: `Ask ${short}: Run this command exactly: ${LIVE_COMMAND}`, see: `It runs without asking. That is expected: ${short} cannot be told to ask first, so ${PRODUCT} only keeps safety copies there. The command does nothing.`, ask: "Did it run without asking?" },
    logins: canAsk(tool)
      ? { id: "logins", title: "Saved logins", do: `Ask ${short}: ${readEnv}`, see: `${cap(short)} asks you first, with ${PRODUCT_S} reason: This reads .env (it may show the full path), ${LOGIN_ASK}. Say no.`, ask: "Did it ask you first, with that reason?" }
      : { id: "logins", title: "Saved logins", do: `Ask ${short}: ${readEnv}`, see: `It shows the practice line ${PRACTICE_LINE} (no real key). That is expected: ${short} cannot ask, so ${PRODUCT} keeps a note instead.`, ask: "Did it show the practice line?" },
    block: { id: "block", title: "Choose Block", do: "In the practice guard's tab, press Control C, then start it again with Block.", paste: watch("block"), see: "It says Watching the practice folder, saved logins: Block.", ask: "Does it say Block?" },
    blocked: { id: "blocked", title: "Saved logins, blocked", do: `Ask ${short} again: ${readEnv}`, see: `${cap(short)} is told not to read it, with ${PRODUCT_S} reason, and says so. The practice line is not shown.`, ask: "Was the read stopped?" },
    start: { id: "start", title: "House rules at the start (M108)", do: `Run the M108 steps for ${short} in this guide, in their own practice folder.`, paste: `sh scripts/m108-check-start.sh ${tool}`, see: `${cap(short)} names the practice word PLUM-7 without reading any file.`, ask: "Did it name PLUM-7?" },
    putin: { id: "putin", title: "Put it in (M107)", do: `With ${PRODUCT} open, run M107 step 1 in this guide for ${short}: press Put it in on the review card.`, see: `The fix request is in ${short}'s chat box, Return was not pressed, and the clipboard is back as it was.`, ask: "Did all three happen?" },
  };
  return stepIds(tool).map((id) => all[id]);
}

export type Answer = "pass" | "fail" | "skip";
/** One recorded answer: the founder's answer, what he saw, when, and for a step the check can see, what the check said. */
export type Recorded = { answer: Answer; note: string; at: string; check?: string };
export type Session = { v: 1; tool: SevenTool; folder: string; data: string; started: string; answers: Partial<Record<StepId, Recorded>> };
export const newSession = (tool: SevenTool, folder: string, data: string, started: string): Session => ({ v: 1, tool, folder, data, started, answers: {} });
/** A note as kept: one line, a key in it redacted, at most 300 characters. */
const noteOf = (s: string) => clip(redact(String(s ?? "")).replace(/\s+/g, " ").trim(), 300);

/** Records one answer. Returns a new session; the one given is left as it was. With the facts, a step the check can see
 *  keeps the check's words, and a PASS the check does not agree with is refused: nothing is ever rounded up. */
export function record(s: Session, id: string, answer: Answer, note: string, at: string, facts?: Facts): Session {
  if (!(stepIds(s.tool) as string[]).includes(id)) throw new Error(`${id} is not a step for ${TOOL_NAME[s.tool]}`);
  if (!["pass", "fail", "skip"].includes(answer)) throw new Error("The answer is pass, fail or skip");
  const n = noteOf(note);
  if (id === "version" && answer === "pass" && !n) throw new Error("The version step needs the version it showed");
  const j = facts ? judge(s.tool, id, facts) : null;
  if (j && j.answer !== "person" && answer === "pass" && j.answer !== "pass") throw new Error(`The check does not agree: ${j.why} Record fail or skip, or run the step again.`);
  const kept: Recorded = { answer, note: n, at, ...(j && j.answer !== "person" ? { check: j.why } : {}) };
  return { ...s, answers: { ...s.answers, [id]: kept } };
}
export const nextStep = (s: Session, p: Paths): Step | null => stepsFor(s.tool, p).find((st) => !s.answers[st.id]) ?? null;

export type Verdict = "proven" | "failed" | "not finished";
/** Proven only when every core step passed; any core fail is failed; anything else is not finished. */
export const verdict = (s: Session): Verdict => verdictOf(s.tool, Object.fromEntries(Object.entries(s.answers).map(([i, a]) => [i, a?.answer])));
/** The same rule from the answers alone, so a RESULTS file's verdict can be worked out again from its own steps. */
export function verdictOf(tool: SevenTool, answers: Readonly<Record<string, Answer | undefined>>): Verdict {
  const core = stepIds(tool).filter((i) => (CORE_STEPS as readonly string[]).includes(i)).map((i) => answers[i]);
  if (core.includes("fail")) return "failed";
  return core.every((a) => a === "pass") ? "proven" : "not finished";
}

// What the check sees.
export type AskedRow = { kind: "live" | "login"; outcome: "asked" | "ran" | "blocked"; reason: string; command: string };
export type Facts = { guardAlive: boolean; doneTools: string[]; helloChanged: boolean; saved: string[]; buildGone: boolean; asked: AskedRow[]; ran: string[] };
export const emptyFacts = (): Facts => ({ guardAlive: false, doneTools: [], helloChanged: false, saved: [], buildGone: false, asked: [], ran: [] });
export const EVENTS = "m109-events.jsonl";
export const SESSION = "m109-session.json";

/** Reads what happened from the practice folder and the data folder: the done markers, the files, the guard's log. */
export function gather(folder: string, data: string): Facts {
  const f = emptyFacts();
  // The practice guard is alive when its pid file names a running process: the same test the hooks make first.
  try { const pid = Number(readFileSync(join(data, GUARD_DIR, GUARD_PID), "utf8")); if (pid > 0) { process.kill(pid, 0); f.guardAlive = true; } } catch { f.guardAlive = false; }
  try {
    for (const n of readdirSync(join(data, DONE_DIR))) { const m = markerOf(n); if (m?.tool && !m.wait && !f.doneTools.includes(m.tool)) f.doneTools.push(m.tool); }
  } catch { /* no marker yet */ }
  try { f.helloChanged = readFileSync(join(folder, "hello.txt"), "utf8") !== "hello world\n"; } catch { f.helloChanged = false; }
  f.buildGone = !existsSync(join(folder, "build"));
  let lines: string[] = [];
  try { lines = readFileSync(join(data, EVENTS), "utf8").split("\n").filter(Boolean); } catch { /* nothing yet */ }
  for (const l of lines) {
    let e: Record<string, unknown>;
    try { e = JSON.parse(l); } catch { continue; }
    if (e.type === "saved" && typeof e.command === "string") f.saved.push(e.command);
    if (e.type === "ran" && typeof e.command === "string") f.ran.push(e.command);
    if (e.type === "asked") f.asked.push({ kind: e.kind === "login" ? "login" : "live", outcome: e.outcome === "ran" || e.outcome === "blocked" ? e.outcome : "asked", reason: String(e.reason ?? ""), command: String(e.command ?? "") });
  }
  return f;
}

export type Judged = { answer: "pass" | "fail" | "wait" | "person"; why: string };
/** What the facts say about one step for this tool. "wait": nothing seen yet; "person": only the founder can see it. */
export function judge(tool: SevenTool, id: string, f: Facts): Judged {
  const name = TOOL_NAME[tool];
  const live = f.asked.filter((a) => a.kind === "live" && a.reason.includes("STRIPE_SECRET_KEY"));
  const logins = f.asked.filter((a) => a.kind === "login");
  switch (id) {
    case "watch":
      return f.guardAlive ? { answer: "pass", why: "The practice guard is running." } : { answer: "wait", why: "The practice guard is not running." };
    case "done":
      if (f.doneTools.includes(tool)) return f.helloChanged ? { answer: "pass", why: `The done marker names ${name}, and hello.txt changed.` } : { answer: "fail", why: "The done marker came, but hello.txt did not change." };
      if (f.doneTools.length) return { answer: "fail", why: `A done marker came, but it names ${f.doneTools.join(", ")}, not ${tool}.` };
      return { answer: "wait", why: "No done marker yet." };
    case "guard": {
      const copy = f.saved.some((c) => c.includes("rm -rf build"));
      if (copy && f.buildGone) return { answer: "pass", why: "A saved copy was made before rm -rf build, and the command still ran." };
      if (copy) return { answer: "fail", why: "A saved copy was made, but the command did not run: the build folder is still there." };
      if (f.buildGone) return { answer: "fail", why: "The build folder went with no saved copy first." };
      return { answer: "wait", why: "The guard has not seen the command yet." };
    }
    case "live":
      if (canAsk(tool)) {
        if (live.length) return { answer: "pass", why: `${PRODUCT} told the tool to ask first, with its reason.` };
        if (f.ran.some((c) => c.includes("STRIPE_SECRET_KEY"))) return { answer: "fail", why: "The guard saw the command but did not ask." };
        return { answer: "wait", why: "The guard has not seen the command yet." };
      }
      if (live.length) return { answer: "fail", why: `${PRODUCT} told a tool to ask that cannot ask.` };
      return f.ran.some((c) => c.includes("STRIPE_SECRET_KEY")) ? { answer: "pass", why: "The guard saw the command and let it run, as documented for this tool." } : { answer: "wait", why: "The guard has not seen the command yet." };
    case "logins": {
      const first = logins.find((a) => a.outcome !== "blocked");
      if (!first) return { answer: "wait", why: "The guard has not seen a read of .env yet." };
      if (canAsk(tool)) return first.outcome === "asked" ? { answer: "pass", why: `${PRODUCT} told the tool to ask first.` } : { answer: "fail", why: `${PRODUCT} let it through instead of asking.` };
      return first.outcome === "ran" ? { answer: "pass", why: `${PRODUCT} noted the read, as it does for a tool that cannot ask.` } : { answer: "fail", why: `${PRODUCT} told a tool to ask that cannot ask.` };
    }
    case "blocked":
      return logins.some((a) => a.outcome === "blocked") ? { answer: "pass", why: `${PRODUCT} told the tool not to read it.` } : { answer: "wait", why: "No blocked read yet." };
    default:
      return { answer: "person", why: "Only the founder can see this one." };
  }
}

/** The practice guard: the product's real HookGuard on the data folder's guard folder, with a real shadow store for the
 *  practice folder kept in the data folder. Its log keeps the short command and the product's reason only, never a file's
 *  contents (a read tool's call carries only a path). */
export function practiceGuard(folder: string, data: string, o: { logins: LoginMode }): HookGuard {
  const signals = new DoneSignals(data);
  const store = new CheckpointStore(join(data, "shadow.git"), folder);
  // Every row's command and reason pass through the same redaction here, whatever the guard handed over.
  const safe = (v: unknown) => (typeof v === "string" ? clip(redact(v), 120) : v);
  const log = (e: Record<string, unknown>) => {
    const row = { ...e, ...("command" in e ? { command: safe(e.command) } : {}), ...("reason" in e ? { reason: safe(e.reason) } : {}), at: new Date().toISOString() };
    try { appendFileSync(join(data, EVENTS), `${JSON.stringify(row)}\n`, { mode: 0o600 }); } catch { /* the log is a nicety */ }
  };
  return new HookGuard(signals.guardFolder, {
    projectOf: (t) => signals.projectOf(t),
    snapshot: (_p, label) => store.snapshot(label),
    emit: (e) => {
      if (e.type === "guard.saved") log({ type: "saved", command: e.command });
      if (e.type === "guard.asked") log({ type: "asked", kind: e.kind === "login" ? "login" : "live", outcome: e.outcome ?? "asked", reason: e.reason, command: e.command, tool: e.tool });
    },
    ran: (_p, tool, text) => { const r = parseRequest(text); if (r) log({ type: "ran", tool, command: shortCommand(r.command) }); },
    askLive: () => true,
    logins: () => o.logins,
  });
}

// The RESULTS file.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (iso: string) => iso.slice(0, 10);
const shownDay = (d: string) => { const [y, m, dd] = d.split("-"); return `${Number(dd)} ${MONTHS[Number(m) - 1] ?? m} ${y}`; };
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
const RESULT_MARK = "m109-result";
const VERDICT_WORDS: Readonly<Record<Verdict, (n: string) => string>> = {
  proven: (n) => `Proven. Every core step passed, so ${PRODUCT} may name ${n}.`,
  failed: (n) => `Failed. A core step failed, so ${PRODUCT} does not claim ${n}: for it the review starts once the folder is quiet.`,
  "not finished": (n) => `Not finished. Some core steps are not answered yet, so ${n} is not claimed.`,
};

export function resultsMarkdown(s: Session, p: Paths): string {
  const name = TOOL_NAME[s.tool], v = verdict(s), day = dayOf(s.started);
  const version = s.answers.version?.answer === "pass" ? s.answers.version.note : "";
  const rows = stepsFor(s.tool, p).map((st) => {
    const a = s.answers[st.id];
    const result = a ? a.answer.toUpperCase() : "not run";
    const seen = [a?.note, a?.check ? `Check: ${a.check}` : ""].filter(Boolean).join(" ");
    return `| ${st.id} | ${cell(CHECKED[st.id])}${(EXTRA_STEPS as readonly string[]).includes(st.id) ? " (extra)" : ""} | ${result} | ${cell(seen)} |`;
  });
  const steps = Object.fromEntries(stepIds(s.tool).filter((i) => s.answers[i]).map((i) => [i, s.answers[i]!.answer]));
  return [
    `# M109 results: ${name}, ${shownDay(day)}`,
    "",
    `Tool: ${name}${version ? `, version ${version}` : ", version not recorded"}`,
    `Date: ${shownDay(day)}`,
    "Where: a throwaway practice folder made by `scripts/m109-session.sh`, never a real project. No step paid for anything.",
    `Verdict: ${VERDICT_WORDS[v](name)}`,
    "",
    "| Step | What was checked | Result | What was seen |",
    "|---|---|---|---|",
    ...rows,
    "",
    ...(stepIds(s.tool).some((i) => (EXTRA_STEPS as readonly string[]).includes(i)) ? ["Extras run in their own guide section and never decide the verdict."] : []),
    "Update the matching milestone doc and docs/research/technical_research.md section 20 with this result (AGENTS.md rule 18).",
    "",
    `<!-- ${RESULT_MARK} ${JSON.stringify({ tool: s.tool, version, date: day, verdict: v, steps })} -->`,
    "",
  ].join("\n");
}

export type Parsed = { tool: SevenTool; version: string; date: string; verdict: Verdict; steps: Record<string, Answer> };
export function parseResult(md: string): Parsed | null {
  const m = new RegExp(`<!-- ${RESULT_MARK} (\\{.*\\}) -->`).exec(md);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]!) as Parsed;
    if (!isSeven(j.tool) || !["proven", "failed", "not finished"].includes(j.verdict)) return null;
    const steps = j.steps && typeof j.steps === "object" && !Array.isArray(j.steps) ? j.steps : {};
    const ids = stepIds(j.tool) as string[];
    for (const [id, a] of Object.entries(steps)) if (!ids.includes(id) || !["pass", "fail", "skip"].includes(a)) return null;
    // The verdict is worked out again from the steps, with the same rule: a file whose written verdict disagrees is not
    // believed, so a hand edit can never round a tool up.
    if (verdictOf(j.tool, steps) !== j.verdict) return null;
    return { tool: j.tool, version: String(j.version ?? ""), date: String(j.date ?? ""), verdict: j.verdict, steps };
  } catch { return null; }
}

export type SummaryRow = { tool: SevenTool; name: string; verdict: Verdict | "not run"; version: string; date: string };
/** All seven tools, the latest result of each (a later date wins; the same date, the later file), and the proven ones. */
export function summary(results: Parsed[]): { rows: SummaryRow[]; claim: SevenTool[] } {
  const latest = new Map<SevenTool, Parsed>();
  for (const r of results) { const old = latest.get(r.tool); if (!old || r.date >= old.date) latest.set(r.tool, r); }
  const rows = SEVEN.map((t) => { const r = latest.get(t); return { tool: t, name: TOOL_NAME[t], verdict: r?.verdict ?? "not run", version: r?.version ?? "", date: r?.date ?? "" } as SummaryRow; });
  return { rows, claim: rows.filter((r) => r.verdict === "proven").map((r) => r.tool) };
}

/** The RESULTS template: every step, which of the seven tools have it, and empty result columns. */
export function template(): string {
  const which = (id: StepId) => { const ts = SEVEN.filter((t) => stepIds(t).includes(id)); return ts.length === SEVEN.length ? "all seven" : ts.map((t) => TOOL_NAME[t]).join(", "); };
  return [
    "# M109 results: <tool>, <date>",
    "",
    "The RESULTS template for one tool's guided session (`docs/milestones/M109-real-mac-guide.md`). `sh scripts/m109-session.sh results <data folder>` writes a filled copy into `docs/status/` from the recorded answers, so this file is only for reading. Made by `runner/src/realmac.ts` `template()`; a test keeps the two the same.",
    "",
    `The seven tools: ${SEVEN.map((t) => TOOL_NAME[t]).join(", ")}.`,
    "",
    "Tool: <tool>, version <version>",
    "Date: <date>",
    "Where: a throwaway practice folder made by `scripts/m109-session.sh`, never a real project. No step paid for anything.",
    "Verdict: Proven, Failed or Not finished. Only a tool whose core steps all passed is claimed. For a tool that fails, the review starts once the folder is quiet.",
    "",
    "| Step | What was checked | Which tools | Result | What was seen |",
    "|---|---|---|---|---|",
    ...([...CORE_STEPS, ...EXTRA_STEPS] as StepId[]).map((id) => `| ${id} | ${CHECKED[id]}${(EXTRA_STEPS as readonly string[]).includes(id) ? " (extra)" : ""} | ${which(id)} | PASS, FAIL, SKIP or not run | |`),
    "",
  ].join("\n");
}
