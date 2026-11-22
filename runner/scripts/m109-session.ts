// M109 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md), run by scripts/m109-session.sh. The guided session for
// one of the seven tools, with the engine's own code (runner/src/realmac.ts):
//   setup <tool> <folder> <data>   makes the practice files and the tool's done and guard lines (DoneSignals), and the session
//   watch <data> [block]           the practice guard: Squibby's real HookGuard and a real shadow store, until Control C
//   next <data>                    the next step, as one message
//   check <data>                   what the practice guard and the folder show, judged for each step
//   record <data> <step> <pass|fail|skip> [what was seen...]
//   results <data> [folder]        writes the RESULTS file (default docs/status/<date>-m109-<tool>.md)
//   summary [folder]               all seven tools from the RESULTS files there (default docs/status), and what may be claimed
//   template                       prints the RESULTS template (docs/milestones/M109-results-template.md)
// Every folder is a throwaway practice folder (never a real project). No model is called, nothing is sent anywhere, and git
// runs only in the shadow store's own folder inside the data folder.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { DoneSignals } from "../src/donesignal.ts";
import { loginModeOf } from "../src/savedlogins.ts";
import {
  CORE_STEPS, EXTRA_STEPS, PRACTICE_LINE, SESSION, TOOL_NAME, gather, isSeven, judge, newSession, nextStep, parseResult, practiceGuard,
  record, resultsMarkdown, stepIds, summary, template, verdict, type Answer, type Paths, type Session,
} from "../src/realmac.ts";

const repo = resolve(import.meta.dir, "..", "..");
const claudeBin = join(repo, "runner", "node_modules", "@anthropic-ai", `claude-agent-sdk-darwin-${process.arch === "arm64" ? "arm64" : "x64"}`, "claude");
const paths = (s: Pick<Session, "folder" | "data">): Paths => ({ folder: s.folder, data: s.data, script: join(repo, "scripts", "m109-session.sh"), claudeBin });
const fail = (msg: string): never => { console.error(msg); process.exit(2); };
const load = (data: string): Session => {
  try { return JSON.parse(readFileSync(join(data, SESSION), "utf8")) as Session; } catch { return fail(`No M109 session in ${data}. Start one with: sh scripts/m109-session.sh <tool>`); }
};
const save = (s: Session) => { const f = join(s.data, SESSION); writeFileSync(`${f}.tmp`, `${JSON.stringify(s, null, 2)}\n`, { mode: 0o600 }); renameSync(`${f}.tmp`, f); };
const inside = (a: string, b: string) => { const r = relative(b, a); return r === "" || (!r.startsWith("..") && !r.startsWith(sep) && r !== ".."); };
const emptyDir = (d: string) => { try { return statSync(d).isDirectory() && readdirSync(d).length === 0; } catch { return false; } };

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "setup") {
  const [tool, f, d] = args;
  if (!tool || !isSeven(tool)) fail(`Usage: setup <${["claude", "codex", "cursor", "copilot", "gemini", "windsurf", "antigravity"].join("|")}> <folder> <data folder>`);
  if (!f || !d) fail("setup needs a practice folder and a data folder");
  // Only new, empty folders: never a real project, and the data folder (the guard's folder and the shadow store) is outside
  // the practice folder, as Squibby's own data folder is.
  if (!emptyDir(f!) || !emptyDir(d!)) fail("Both folders must be new and empty (never a real project).");
  const folder = realpathSync(f!), data = realpathSync(d!);
  if (inside(data, folder) || inside(folder, data)) fail("The data folder must be outside the practice folder.");
  writeFileSync(join(folder, "hello.txt"), "hello world\n");
  mkdirSync(join(folder, "build"));
  writeFileSync(join(folder, "build", "output.txt"), "practice build output\n");
  writeFileSync(join(folder, ".env"), `${PRACTICE_LINE}\n`);
  const s = new DoneSignals(data);
  for (const h of ["done", "guard"] as const) {
    const r = s.add(folder, tool as never, h);
    if (!r.on) fail(`The ${h} line was not written (${r.problem ?? "unknown"})`);
    console.log(`${h}: written in ${r.rel}`);
  }
  save(newSession(tool as never, folder, data, new Date().toISOString()));
  console.log(`Practice folder: ${folder}`);
  console.log(`Data folder (outside it, do not open it in the tool): ${data}`);
} else if (cmd === "watch") {
  const s = load(args[0] ?? "");
  const mode = loginModeOf(args[1] === "block" ? "block" : "ask");
  const g = practiceGuard(s.folder, s.data, { logins: mode });
  if (!g.start()) fail("The practice guard could not start.");
  console.log(`Watching the practice folder ${s.folder}, saved logins: ${mode === "block" ? "Block" : "Ask"}. Leave this tab open; Control C stops it.`);
  const end = () => { g.stop(); process.exit(0); };
  process.on("SIGINT", end);
  process.on("SIGTERM", end);
  setInterval(() => undefined, 60_000);
} else if (cmd === "next") {
  const s = load(args[0] ?? "");
  const st = nextStep(s, paths(s));
  if (!st) { console.log(`Every step for ${TOOL_NAME[s.tool]} is answered. Verdict: ${verdict(s)}. Write the RESULTS file: sh scripts/m109-session.sh results ${s.data}`); process.exit(0); }
  const n = stepIds(s.tool).indexOf(st.id) + 1, of = stepIds(s.tool).length;
  console.log(`Step ${n} of ${of} (${st.id}): ${st.title}`);
  console.log(`Do: ${st.do}`);
  if (st.paste) console.log(`Paste: ${st.paste}`);
  console.log(`You should see: ${st.see}`);
  console.log(`Question: ${st.ask}`);
} else if (cmd === "check") {
  const s = load(args[0] ?? "");
  const facts = gather(s.folder, s.data);
  for (const id of stepIds(s.tool)) {
    const j = judge(s.tool, id, facts);
    if (j.answer !== "person") console.log(`${id}: ${j.answer.toUpperCase()}. ${j.why}`);
  }
} else if (cmd === "record") {
  const [data, step, answer, ...note] = args;
  const s = load(data ?? "");
  try { save(record(s, step ?? "", answer as Answer, note.join(" "), new Date().toISOString(), gather(s.folder, s.data))); } catch (e) { fail((e as Error).message); }
  console.log(`Recorded ${step}: ${answer}.`);
} else if (cmd === "results") {
  const s = load(args[0] ?? "");
  const out = resolve(args[1] ?? join(repo, "docs", "status"));
  mkdirSync(out, { recursive: true });
  const file = join(out, `${s.started.slice(0, 10)}-m109-${s.tool}.md`);
  writeFileSync(file, resultsMarkdown(s, paths(s)));
  console.log(`Wrote ${file} (${verdict(s)}).`);
} else if (cmd === "summary") {
  const dir = resolve(args[0] ?? join(repo, "docs", "status"));
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => /-m109-[a-z]+\.md$/.test(n)).sort() : [];
  const parsed = files.map((n) => parseResult(readFileSync(join(dir, n), "utf8"))).filter((p) => p !== null);
  const sum = summary(parsed);
  for (const r of sum.rows) console.log(`${r.name}: ${r.verdict}${r.version ? `, version ${r.version}` : ""}${r.date ? `, ${r.date}` : ""}`);
  console.log(`Claim only: ${sum.claim.length ? sum.claim.map((t) => TOOL_NAME[t]).join(", ") : "none yet"}`);
  console.log("These are the seven tools in this guide. The M115 tools (Copilot CLI, OpenCode, Amp, Cline, Kiro, Zed, JetBrains, Xcode) are proven in their own section of the guide, not here.");
  if (files.length > parsed.length) console.log(`${files.length - parsed.length} RESULTS file(s) were left out: their written verdict does not match their own steps, or they could not be read.`);
} else if (cmd === "template") {
  process.stdout.write(template());
} else {
  console.log(`Usage: setup <tool> <folder> <data> | watch <data> [block] | next <data> | check <data> | record <data> <step> <pass|fail|skip> [note] | results <data> [folder] | summary [folder] | template`);
  console.log(`Steps: ${[...CORE_STEPS, ...EXTRA_STEPS].join(", ")}`);
  process.exit(2);
}
