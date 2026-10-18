// The settings the engine applies (the registry, protocol/settings.json, T16). Only the shell sends them, as settings.apply:
// the first line after every start, again after each change the engine applies, and when the project folder changes.
// Each value is checked again with the same rules the shell and the pages use (protocol/settings.ts); anything refused is
// its usual value. They are kept in memory only, never written. A task reads what it needs when it starts, so a change
// reaches the next task, never one already running.
import { resolve } from "node:path";
import type { Command } from "../../protocol/index.ts";
import { defOf, validate, type Def } from "../../protocol/settings.ts";

type Apply = Extract<Command, { type: "settings.apply" }>;
/** A setting the engine applies from settings.apply: kept in settings.json, and read by the engine. */
const ours = (d: Def) => d.store === "settings" && d.kind !== "custom" && d.applies.includes("runner");

export class RunnerSettings {
  private app = new Map<string, unknown>();
  private project: { path: string; values: Map<string, unknown> } | null = null;

  /** Replaces what was applied before. Names this version does not know are ignored; a setting the engine does not apply,
   *  or a value that breaks its rules, is refused (and stays at its usual value). Names only in the answer. */
  apply(cmd: Apply): { accepted: string[]; refused: string[] } {
    const accepted: string[] = [], refused: string[] = [];
    const take = (values: Record<string, unknown> | undefined, scope: "app" | "project") => {
      const out = new Map<string, unknown>();
      for (const k of Object.keys(values ?? {})) {
        if (!Object.hasOwn(values!, k)) continue;
        const d = defOf(k);
        if (!d) continue;
        if (!ours(d) || d.scope !== scope) { refused.push(k); continue; }
        const c = validate(d, values![k]);
        if (c.ok) { out.set(k, c.value); accepted.push(k); } else refused.push(k);
      }
      return out;
    };
    this.app = take(cmd.values, "app");
    this.project = cmd.project ? { path: resolve(cmd.project), values: take(cmd.projectValues, "project") } : null;
    return { accepted, refused };
  }

  /** The value in force: for a project setting, the named project's own (only the project the shell named), else the
   *  usual value; for an app setting, what was applied, else the usual value. Undefined for a name that does not exist. */
  get(key: string, project?: string): unknown {
    const d = defOf(key);
    if (!d) return undefined;
    if (d.scope === "project") {
      const p = this.project;
      return project && p && resolve(project) === p.path && p.values.has(key) ? p.values.get(key) : d.default;
    }
    return this.app.has(key) ? this.app.get(key) : d.default;
  }
}
