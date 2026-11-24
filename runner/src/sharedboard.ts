// M119 (docs/milestones/M119-multi-agent-board.md): local-first cross-repo shared context board.
// Stored in Squibby's own data folder (never touching user repos' git, rule 10), redacting secrets on write and read (rule 15).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { clip, redact } from "./redact.ts";

export type BoardTaskStatus = "open" | "in_progress" | "review" | "done";
export type BoardTask = {
  id: string;
  repo: string;
  title: string;
  status: BoardTaskStatus;
  owner: string;
  updatedAt: string;
};
export type BoardDecision = {
  id: string;
  repo: string;
  text: string;
  source: string;
  at: string;
};
export type BoardState = {
  v: 1;
  tasks: BoardTask[];
  decisions: BoardDecision[];
};

const FILE = "shared-board.json";
const MAX_START_LINES = 20;

const clean = (s: string, max = 160): string => clip(redact(String(s ?? "")).replace(/\s+/g, " ").trim(), max);

export class SharedBoard {
  private path: string;
  constructor(private dataDir: string) {
    this.path = join(resolve(dataDir), FILE);
  }

  snapshot(): BoardState {
    if (!existsSync(this.path)) return { v: 1, tasks: [], decisions: [] };
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Partial<BoardState>;
      return {
        v: 1,
        tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
        decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
      };
    } catch {
      return { v: 1, tasks: [], decisions: [] };
    }
  }

  private save(state: BoardState): void {
    mkdirSync(resolve(this.dataDir), { recursive: true, mode: 0o700 });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, this.path);
  }

  upsertTask(input: { id: string; repo: string; title: string; status: BoardTaskStatus; owner: string }): BoardTask {
    const state = this.snapshot();
    const task: BoardTask = {
      id: clean(input.id, 40),
      repo: clean(input.repo, 40),
      title: clean(input.title, 140),
      status: input.status,
      owner: clean(input.owner, 40),
      updatedAt: new Date().toISOString(),
    };
    const idx = state.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) state.tasks[idx] = task;
    else state.tasks.push(task);
    this.save(state);
    return task;
  }

  addDecision(input: { repo: string; text: string; source: string }): BoardDecision {
    const state = this.snapshot();
    const dec: BoardDecision = {
      id: `D${state.decisions.length + 1}`,
      repo: clean(input.repo, 40),
      text: clean(input.text, 160),
      source: clean(input.source, 40),
      at: new Date().toISOString(),
    };
    state.decisions.push(dec);
    this.save(state);
    return dec;
  }
}

/** Renders a compact context block (at most 20 lines) of the current repo's own tasks and decisions. One repo's lines never
 *  go into another project's block. Built, not yet used: the session start leaves it out (memory/sessionstart.ts). */
export function formatBoardForStart(board: BoardState, currentRepo: string): string {
  const repo = clean(currentRepo, 40);
  const active = board.tasks.filter((t) => t.status !== "done" && t.repo === repo);
  const decisions = board.decisions.filter((d) => d.repo === repo);
  if (!active.length && !decisions.length) return "";
  const lines: string[] = [`Shared work for ${repo}:`];
  for (const t of active) {
    if (lines.length >= MAX_START_LINES) break;
    lines.push(`- [${t.status}] ${t.repo}: ${t.title} (${t.owner})`);
  }
  for (const d of decisions) {
    if (lines.length >= MAX_START_LINES) break;
    lines.push(`- Decision (${d.repo}): ${d.text}`);
  }
  return lines.slice(0, MAX_START_LINES).join("\n");
}
