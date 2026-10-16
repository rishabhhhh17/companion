// What the agent is doing right now, in plain words for the card: "Reading signup.js", "Running the tests". A command is
// never shown as itself here (it can carry a secret, and it means little to most people); only what kind of work it is.
import { clip, redact } from "../../runner/src/redact.ts";
import { S } from "./strings.ts";

const PM = "(?:npm|pnpm|yarn|bun)";
const re = (s: string) => new RegExp(s, "i");
// Checked in this order: the first match names the command.
const COMMANDS: [RegExp, string][] = [
  [re(`\\b${PM}\\s+(?:run\\s+)?test\\b|\\b(?:vitest|jest|pytest|mocha)\\b|\\bplaywright\\s+test\\b|\\bnode\\s+--test\\b|\\b(?:cargo|go|deno)\\s+test\\b|\\bpython3?\\s+-m\\s+(?:pytest|unittest)\\b`), S.toolTests],
  [re(`\\b${PM}\\s+(?:install|i|add|ci)\\b|\\bpip3?\\s+install\\b|\\bpoetry\\s+(?:install|add)\\b|\\buv\\s+(?:pip\\s+install|add|sync)\\b`), S.toolInstall],
  [re(`\\btsc\\b[^|;&]*--noEmit|\\b(?:eslint|prettier|ruff|mypy|biome|flake8|pyright)\\b|\\b${PM}\\s+(?:run\\s+)?(?:lint|typecheck|check|format)\\b|\\bcargo\\s+(?:check|clippy)\\b`), S.toolCheckCode],
  [re(`\\b${PM}\\s+(?:run\\s+)?build\\b|\\b(?:tsc|webpack|esbuild|rollup)\\b|\\b(?:vite|next|astro)\\s+build\\b|\\b(?:cargo|go)\\s+build\\b`), S.toolBuild],
  [re(`\\b${PM}\\s+(?:run\\s+)?(?:dev|start|serve|preview)\\b|\\b(?:vite|nodemon|uvicorn)\\b|\\bnext\\s+dev\\b|\\bflask\\s+run\\b|\\bpython3?\\s+-m\\s+http\\.server\\b`), S.toolStartApp],
  [re(`\\bgit\\s+(?:status|diff|log|show|branch|blame)\\b`), S.toolHistory],
  [re(`^(?:ls|find|tree|pwd|du)\\b`), S.toolLooking],
  [re(`^(?:cat|head|tail|less|more|wc)\\b`), S.toolReadingFiles],
  [re(`^(?:grep|rg|ag)\\b`), S.toolSearching],
  [re(`^rm\\b`), S.toolRemoving],
  [re(`^(?:mkdir|touch|cp|mv)\\b`), S.toolFiles],
];
// "cd app && npm test" is about the tests, not the folder change.
const withoutCd = (c: string) => { let s = c.trim(), was = ""; while (s !== was && /^cd\s/.test(s)) { was = s; s = s.replace(/^cd\s+[^&;|]*(?:&&|;)\s*/, ""); } return s; };
function commandWords(command: string): string {
  const c = withoutCd(command);
  for (const [r, words] of COMMANDS) if (r.test(c)) return words;
  return S.toolCommand;
}
// The runner's summary is "Read: /path/to/file". Only the file's own name is shown, with anything secret looking hidden.
function fileName(summary: string): string {
  const path = /^[A-Za-z]+:\s*(.+)$/.exec(summary.trim())?.[1] ?? "";
  const name = path.split("/").filter(Boolean).pop() ?? "";
  return name ? clip(redact(name), 60) : S.aFile;
}

export function activityWords(tool: string, summary: string): string {
  const s = String(summary ?? "");
  switch (tool) {
    case "Read": case "NotebookRead": return S.toolReading(fileName(s));
    case "Write": return S.toolWriting(fileName(s));
    case "Edit": case "MultiEdit": case "NotebookEdit": return S.toolChanging(fileName(s));
    case "Glob": case "LS": return S.toolLooking;
    case "Grep": return S.toolSearching;
    case "WebSearch": return S.toolWeb;
    case "WebFetch": return S.toolWebPage;
    case "TodoWrite": return S.toolPlanning;
    case "Task": case "Agent": return S.toolHelper;
    case "BashOutput": return S.toolRunning;
    case "KillShell": case "KillBash": return S.toolStopping;
    case "Bash": return commandWords(s.replace(/^Running:\s*/, ""));
    default: return tool.startsWith("mcp__") ? S.toolConnected : S.toolWorking;
  }
}
