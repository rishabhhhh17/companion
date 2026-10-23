// The shared files row in the Memory tab (M14): the page side. In a folder Squibby made, the engine writes AGENTS.md and
// CLAUDE.md (notes other AI coding tools read) only after a yes. The shell says whether the project open now is such a folder
// and what state the two files are in (app/src-tauri/src/sharedfiles.rs; the answers are the shared cases in
// protocol/fixtures/shared-files.jsonl); this file reads that answer, picks the words, and builds the one command the button
// sends: the same yes the existing question card sends. The page never sends the shell a path.
import { answerAgents } from "./commands.ts";
import type { Command } from "../../protocol/index.ts";
import { S } from "./strings.ts";

export type Shared = "no" | "offer" | "added" | "own";
const STATES: readonly string[] = ["no", "offer", "added", "own"];

/** The shell's answer to shared_files_state, or null when it is not one (then no row is drawn and nothing is offered). */
export function sharedFrom(v: unknown): Shared | null {
  const s = (v as { state?: unknown } | null)?.state;
  return typeof s === "string" && STATES.includes(s) ? (s as Shared) : null;
}

/** The row: its words, and the button if there is one. `asked`: Add them was pressed in this visit. Null draws nothing. */
export function sharedRow(state: Shared | null, asked: boolean): { text: string; button: string | null } | null {
  switch (state) {
    case "offer": return asked ? { text: S.sharedFiles.saved, button: null } : { text: S.sharedFiles.offer, button: S.sharedFiles.add };
    case "added": return { text: S.sharedFiles.added, button: null };
    case "own": return { text: S.sharedFiles.own, button: null };
    default: return null;
  }
}

/** What Add them sends: a yes to the shared files question for this project (the existing command, commands.ts). */
export const addSharedFilesCommand = (project: string): Command => answerAgents(project, "yes");
