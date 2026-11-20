// M114 [verify] helper (docs/milestones/M109-real-mac-guide.md): what does a real AI tool hand its PermissionRequest and
// AskUserQuestion hooks, and does it honour the reply shapes in toolask.ts? In a throwaway practice folder only (never a real
// project). No model is called by this script, nothing is sent anywhere, git is never run.
//   setup <claude|codex> <mode> <folder>: writes ONE capture hook (approve, and for Claude Code also answer) into the folder's
//     own hook file. The hook keeps a copy of each request in <folder>/.capture/ and prints the reply for <mode>: watch
//     (nothing: the tool asks as it always does), allow, deny, always (Claude Code: its first suggested allow rule) or answer
//     (Claude Code: the first choice of each question). These replies stand in for the person's press.
//   reply <mode> <folder>: what the hook runs (reads the request on stdin).
//   check <folder>: prints, for each request, its event, tool and keys, and what the notch's card would show (parseAsk).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAsk, replyFor, type AskChoice } from "../src/toolask.ts";

const MODES = ["watch", "allow", "deny", "always", "answer"] as const;
type Mode = (typeof MODES)[number];
const [what, a, b, c] = process.argv.slice(2);
const usage = () => { console.error("Usage: m114-ask-check.ts setup <claude|codex> <watch|allow|deny|always|answer> <folder>  |  reply <mode> <folder>  |  check <folder>"); process.exit(2); };

if (what === "reply") {
  const mode = a as Mode, dir = b;
  if (!dir || !MODES.includes(mode)) process.exit(0);
  const text = await new Response(Bun.stdin.stream()).text();
  try { mkdirSync(join(dir, ".capture"), { recursive: true }); writeFileSync(join(dir, ".capture", `${Date.now()}-${process.pid}.json`), text); } catch { /* the reply still goes */ }
  if (mode === "watch") process.exit(0);
  const o = (() => { try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; } })();
  const ext = o.hook_event_name === "PreToolUse" ? "question" : "perm";
  const ask = parseAsk(text, ext, dir);
  const tool = process.env.M114_TOOL === "codex" ? "codex" : "claude";
  if (ask) {
    const choice: AskChoice = mode === "answer" ? "answer" : mode;
    const picks = ask.questions?.map(() => [0]);
    const out = replyFor(tool, ext, ask, { choice, ...(picks ? { picks } : {}) });
    if (out) process.stdout.write(out);
  }
  process.exit(0);
}

if (what === "setup") {
  const tool = a, mode = b as Mode, dir = c;
  if ((tool !== "claude" && tool !== "codex") || !MODES.includes(mode) || !dir) usage();
  mkdirSync(join(dir!, ".capture"), { recursive: true });
  writeFileSync(join(dir!, "hello.txt"), "hello\nworld\n");
  const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const command = `M114_TOOL=${tool} ${sq(process.execPath)} ${sq(import.meta.path)} reply ${mode} ${sq(dir!)}`;
  const entry = { hooks: [{ type: "command", command, timeout: 130 }] };
  const hooks: Record<string, unknown> = { PermissionRequest: [entry] };
  if (tool === "claude") hooks.PreToolUse = [{ matcher: "AskUserQuestion", ...entry }];
  const file = tool === "claude" ? join(dir!, ".claude/settings.local.json") : join(dir!, ".codex/hooks.json");
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ hooks }, null, 2)}\n`);
  console.log(`Hook written to: ${file}`);
  process.exit(0);
}

if (what === "check") {
  const dir = a;
  if (!dir) usage();
  const cap = join(dir!, ".capture");
  let names: string[] = [];
  try { names = readdirSync(cap).filter((n) => n.endsWith(".json")).sort(); } catch { /* none */ }
  if (!names.length) { console.log(`No requests yet in ${cap}. Ask the tool to run a command it must ask about, then run this again.`); process.exit(1); }
  let shown = 0;
  for (const n of names) {
    const text = readFileSync(join(cap, n), "utf8");
    let o: Record<string, unknown> = {};
    try { o = JSON.parse(text); } catch { console.log(`${n}: not JSON (${text.length} bytes)`); continue; }
    const ext = o.hook_event_name === "PreToolUse" ? "question" : "perm";
    const ask = parseAsk(text, ext, dir!);
    console.log(`${n}: event ${String(o.hook_event_name ?? "?")}, tool ${String(o.tool_name ?? "(none)")}, keys [${Object.keys(o).sort().join(", ")}], suggestions ${Array.isArray(o.permission_suggestions) ? o.permission_suggestions.length : "none"}`);
    if (!ask) { console.log("   the notch shows nothing for this request (the tool asks in its own window)"); continue; }
    shown++;
    const { kind, action, target, always, questions } = ask;
    console.log(`   the notch shows: ${JSON.stringify({ kind, action, target, always, questions: questions?.map((q) => `${q.question} [${q.options.map((x) => x.label).join(" | ")}]${q.multi ? " (several)" : ""}`) })}`);
  }
  console.log(shown ? `PASS: ${shown} card(s) would show.` : "FAIL: no request became a card. Send the keys above to the build session.");
  process.exit(shown ? 0 : 1);
}
usage();
