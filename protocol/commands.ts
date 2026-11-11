// Must fix 30 (M59): the one command list. protocol/commands.json has one row per protocol command with its facts (how the
// plan gates it, whether a page may send it, whether it may name only the chosen folder, whether it is the engine's own
// work). The runner reads it here, the shell with include_str! (app/src-tauri/src/runner.rs), the pages through this file.
// Before, the same facts were kept by hand in seven lists in three places.
import table from "./commands.json";
import type { Command } from "./index.ts";

export type Gate = "fix" | "pro" | "never";
export type CommandRow = { gate: Gate; page?: boolean; project?: boolean; own?: "edits" | "light" };
type Rows = typeof table.commands;
export type CommandType = keyof Rows;

export const COMMAND_ROWS: Readonly<Record<CommandType, CommandRow>> = table.commands as Record<CommandType, CommandRow>;
export const COMMAND_NAMES = Object.freeze(Object.keys(COMMAND_ROWS) as CommandType[]);
/** The commands whose row says so, in the file's order. */
export const commandsWhere = (f: (r: CommandRow) => boolean): CommandType[] => COMMAND_NAMES.filter((t) => f(COMMAND_ROWS[t]));
export const rowOf = (type: string): CommandRow | undefined => (Object.hasOwn(COMMAND_ROWS, type) ? COMMAND_ROWS[type as CommandType] : undefined);

/** A web page may send it (the shell refuses every other command from a page). */
export const PAGE_COMMANDS: readonly CommandType[] = commandsWhere((r) => r.page === true);
/** It may name only the project folder the person chose. */
export const PROJECT_BOUND: readonly CommandType[] = commandsWhere((r) => r.project === true);

// Every Command type has a row, and every row is a Command type: either one missing fails to compile.
type Missing = Exclude<Command["type"], CommandType>;
type Extra = Exclude<CommandType, Command["type"]>;
const everyCommandHasARow: [Missing] extends [never] ? true : Missing = true;
const everyRowIsACommand: [Extra] extends [never] ? true : Extra = true;
void everyCommandHasARow; void everyRowIsACommand;
