// Which task broke it? Companion keeps a saved version of the project before and after every task (checkpoints.ts, never
// the person's git). When a check fails now, earlier versions are checked one at a time, in a private copy (agent.ts does
// the copying), and a binary search finds the first task after which the same check fails. This file is the search
// itself, in plain code with no git and no checks, so it can be tested on its own.
import type { LadderResult, Rung } from "./proof/ladder.ts";
import type { TaskRow } from "./tasklog.ts";

/** At most this many checks in one search, the check of the project as it is now included. Each uses the ladder's own time limits. */
export const MAX_RUNS = 6;
/** The most recent tasks one search looks through: with the check of now and one check between two tasks, they fit in MAX_RUNS. */
export const WINDOW = 14;

export type Verdict = "good" | "bad" | "skip" | "cancelled";

/** How a check of an earlier version stands against the step that fails now. A version that failed at an earlier step never
 *  got that far, so it says nothing either way ("skip"). A step that was not there yet (no tests then) cannot have failed. A
 *  step that is there but could not run (a package not installed, pytest finding no tests: the ladder's `unclear`) says
 *  nothing either: read as a pass, it would move the search past the version that broke it, onto an innocent task. */
export function classify(res: LadderResult | null, target: Rung): Verdict {
  if (!res) return "skip";
  if (res.verdict === "cancelled") return "cancelled";
  const at = res.steps.find((s) => s.rung === target);
  if (at?.status === "failed") return "bad";
  if (at && res.unclear?.includes(target)) return "skip";
  if (at) return "good";
  return res.verdict === "failed" ? "skip" : "good";
}

/** One task that changed the project: the saved version from before it and the last one saved after it. */
export type TaskPoint = { id: number; label: string; at: string; before: string; after: string };

const num = (id: string) => (/^cp_\d+$/.test(id) ? Number(id.slice(3)) : NaN);

/** The tasks that changed this project, oldest first. `rows` is the task log (any order), `checkpoints` the saved versions.
 *  A task's after version is the last "After:" version saved before the next task started; without one it is left out. */
export function taskPoints(rows: TaskRow[], checkpoints: { id: string; label: string }[]): TaskPoint[] {
  const cps = checkpoints.map((c) => ({ ...c, n: num(c.id) })).filter((c) => Number.isFinite(c.n)).sort((a, b) => a.n - b.n);
  const known = new Set(cps.map((c) => c.id));
  const starts = rows.filter((r) => r.checkpoint && known.has(r.checkpoint)).map((r) => num(r.checkpoint!)).sort((a, b) => a - b);
  const out: TaskPoint[] = [];
  for (const r of rows) {
    if (!r.checkpoint || !known.has(r.checkpoint) || r.changed === 0) continue;
    const b = num(r.checkpoint);
    const next = starts.find((s) => s > b) ?? Infinity;
    const after = cps.filter((c) => c.n > b && c.n < next && c.label.startsWith("After: ")).at(-1);
    if (after) out.push({ id: r.id, label: r.label, at: r.startedAt, before: r.checkpoint, after: after.id });
  }
  return out.sort((a, b) => num(a.before) - num(b.before));
}

export type Outcome =
  | { kind: "found"; task: TaskPoint }
  | { kind: "already_failing"; oldest: TaskPoint }
  | { kind: "after_last_task"; last: TaskPoint }
  | { kind: "outside_change"; earlier: TaskPoint; later: TaskPoint }
  | { kind: "unsure"; earlier?: TaskPoint; later?: TaskPoint }
  | { kind: "cancelled" };

export type SearchOptions = {
  points: TaskPoint[];
  /** The version saved just now, which is known to fail. */
  nowId: string;
  probe: (checkpoint: string, at: { side: "before" | "after"; label: string }) => Promise<Verdict>;
  /** Do two saved versions hold different files? (Something changed between two tasks that no task did.) */
  differs: (a: string, b: string) => Promise<boolean>;
  maxProbes: number;
  /** Can this version be checked at all? One that cannot (it needs other packages than the ones installed now) is stepped
   *  round like a skip, without spending a check. Every version can be when this is left out. */
  usable?: (checkpoint: string) => Promise<boolean>;
};

// The files that decide which packages a version needs. Lockfiles are compared whole; a package.json only by its package
// lists, so a change to its scripts or name does not stop an earlier version being checked. A Python project's requirement
// files, Pipfile, setup.py and lockfiles are compared whole too; its pyproject.toml and setup.cfg without the parts that only
// set up tools or describe the project (pythonPackageText).
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "pnpm-workspace.yaml", "bun.lock", "bun.lockb", "Pipfile", "Pipfile.lock", "poetry.lock", "uv.lock", "pdm.lock", "setup.py"]);
const PACKAGE_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies", "overrides", "resolutions", "workspaces", "pnpm", "packageManager"];
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
/** requirements.txt and its kin (requirements-dev.txt, dev-requirements.txt, constraints.txt, requirements/base.txt), and
 *  pip-tools' inputs (requirements.in), which a pyproject.toml can name as its package list. */
const isRequirements = (path: string) => { const b = baseName(path); return /^(?:requirements|constraints)[\w.-]*\.(?:txt|in)$/.test(b) || /^[\w.-]+-requirements\.(?:txt|in)$/.test(b) || /(?:^|\/)requirements\/[^/]+\.(?:txt|in)$/.test(path); };
/** A package.json at any depth (workspaces have their own), and a Python project's pyproject.toml or setup.cfg. */
export const isManifest = (path: string) => ["package.json", "pyproject.toml", "setup.cfg"].includes(baseName(path));
export const isLockfile = (path: string) => LOCKFILES.has(baseName(path)) || isRequirements(path);

const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v);

// The parts of a pyproject.toml or setup.cfg that never change which packages are installed: the settings of tools that only
// check or format code, and what the project is called and says about itself. Everything else counts, a section Companion
// does not know included, so a package list kept by some other tool is never missed. (A project's own commands, its
// scripts and entry points, count: an editable install of the project makes them in the virtual environment.)
const PY_TOOL_SECTION = /^(?:tool[.:])?(?:ruff|black|isort|mypy|pytest|coverage|pylint|pyright|flake8|bandit|codespell|pydocstyle|pycodestyle|autopep8|yapf|djlint|commitizen|semantic_release|bumpversion|towncrier|interrogate|vulture)(?:$|[.:-])/i;
const PY_ABOUT_SECTION = /^(?:metadata|project\.urls)$/;
const PY_ABOUT_KEYS = new Set(["name", "version", "description", "readme", "authors", "maintainers", "license", "license-files", "keywords", "classifiers", "urls", "homepage", "repository", "documentation"]);

/** What in a pyproject.toml (TOML) or setup.cfg (INI) decides the packages, as one string: each kept setting with the lines it
 *  spans, comments and blank lines left out, settings and sections in a fixed order. Read just enough, never fully parsed:
 *  anything it cannot place is kept, so two files that differ in their packages never get the same text. */
export function pythonPackageText(text: string, ini: boolean): string {
  type Entry = { key: string; lines: string[] };
  const sections: { name: string; entries: Entry[] }[] = [];
  let section = { name: "", entries: [] as Entry[] };
  sections.push(section);
  const seen = new Map<string, number>();
  let depth = 0, inMultiline = false, entry: Entry | null = null;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    const continues = inMultiline || depth > 0 || (ini && /^\s/.test(raw) && entry !== null);
    if (!continues) {
      if (!line || line.startsWith("#") || (ini && line.startsWith(";"))) continue;
      const head = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(ini ? line : line.replace(/\s+#.*$/, ""));
      if (head) {
        const name = head[1].replace(/["'\s]/g, "");
        const n = (seen.get(name) ?? 0) + 1;   // each [[table]] of an array of tables is its own section
        seen.set(name, n);
        section = { name: n > 1 ? `${name}#${n}` : name, entries: [] };
        sections.push(section);
        entry = null;
        continue;
      }
      const kv = /^("[^"]*"|'[^']*'|[A-Za-z0-9_.-]+)\s*[=:]/.exec(line);
      entry = { key: kv ? kv[1].replace(/["']/g, "") : line, lines: [] };
      section.entries.push(entry);
    }
    if (!line) continue;
    if (!ini) {
      // Outside multi-line strings ("""), ordinary strings are blanked (same length) to count brackets and to find a
      // comment that is not inside a string. Inside one, nothing counts.
      const pieces = line.split(/("""|''')/);
      let offset = 0, cut = -1;
      for (let i = 0; i < pieces.length && cut < 0; i++) {
        const p = pieces[i];
        if (i % 2 === 1) inMultiline = !inMultiline;
        else if (!inMultiline) {
          const masked = p.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (m) => `"${"x".repeat(m.length - 2)}"`);
          const hash = masked.indexOf("#");
          for (const ch of hash >= 0 ? masked.slice(0, hash) : masked) { if (ch === "[" || ch === "{") depth++; else if (ch === "]" || ch === "}") depth = Math.max(0, depth - 1); }
          if (hash >= 0) cut = offset + hash;   // the rest of the line is a comment
        }
        offset += p.length;
      }
      if (cut >= 0) line = line.slice(0, cut).trimEnd();
    }
    if (line && entry) entry.lines.push(line);
  }
  // A file this reading could not follow to its end (a bracket or a multi-line string left open) is compared whole.
  if (depth !== 0 || inMultiline) return JSON.stringify({ whole: text });
  const base = (name: string) => name.replace(/#\d+$/, "");
  const kept = sections
    .filter((s) => !PY_TOOL_SECTION.test(base(s.name)) && !PY_ABOUT_SECTION.test(base(s.name)))
    .map((s) => ({ name: s.name, entries: s.entries.filter((e) => !((base(s.name) === "project" || base(s.name) === "tool.poetry") && PY_ABOUT_KEYS.has(e.key))) }))
    .filter((s) => s.entries.length > 0)
    .map((s) => [s.name, s.entries.map((e) => e.lines.join("\n")).sort()] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(kept);
}

/** What a version's installed packages have to match, as one string: the package lists of every package.json (text that
 *  cannot be read as JSON is kept as it is), what decides the packages in each pyproject.toml and setup.cfg, and an id of
 *  each lockfile's (and requirement file's) content. Two versions with the same key can be checked with the same installed
 *  packages (node_modules, or the project's own virtual environment). */
export function packagesKey(manifests: Record<string, string>, locks: Record<string, string>): string {
  const lists = Object.keys(manifests).sort().map((path) => {
    const name = baseName(path);
    if (name === "pyproject.toml" || name === "setup.cfg") return [path, { python: pythonPackageText(manifests[path], name === "setup.cfg") }];
    let j: unknown;
    try { j = JSON.parse(manifests[path]); } catch { return [path, { unreadable: manifests[path] }]; }
    const o = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
    return [path, canonical(Object.fromEntries(PACKAGE_FIELDS.filter((f) => o[f] !== undefined).map((f) => [f, o[f]])))];
  });
  return JSON.stringify({ lists, locks: Object.keys(locks).sort().map((p) => [p, locks[p]]) });
}

/**
 * Binary search for the first version that fails. Version 0 is before the oldest task, version k is after task k, and the
 * version now (after the newest task, n + 1) is known to fail. Versions that cannot be checked that far are stepped round.
 * When the answer falls between two tasks with changes in between that no task made, the version before the later task
 * decides whether that task or the change before it broke it. Runs out of checks, or has only unclear answers: unsure.
 */
export async function findFirstBad(o: SearchOptions): Promise<{ outcome: Outcome; probes: number }> {
  const p = o.points, n = p.length;
  let probes = 0;
  const at = (i: number) => (i === 0 ? { cp: p[0].before, side: "before" as const, label: p[0].label } : { cp: p[i - 1].after, side: "after" as const, label: p[i - 1].label });
  let lo = 0, hi = n + 1;
  const skipped = new Set<number>();
  while (lo < hi) {
    const open: number[] = [];
    for (let i = lo; i < hi; i++) if (!skipped.has(i)) open.push(i);
    if (open.length === 0 || probes >= o.maxProbes) break;
    const mid = open[Math.floor((open.length - 1) / 2)];
    const s = at(mid);
    if (o.usable && !(await o.usable(s.cp))) { skipped.add(mid); continue; }   // costs no check
    const v = await o.probe(s.cp, { side: s.side, label: s.label });
    probes++;
    if (v === "cancelled") return { outcome: { kind: "cancelled" }, probes };
    if (v === "bad") hi = mid;
    else if (v === "good") lo = mid + 1;
    else skipped.add(mid);
  }
  // The first failing version is somewhere from lo to hi: the task after the last good version, up to the first bad one's.
  if (lo < hi || n === 0) return { outcome: { kind: "unsure", ...(n ? { earlier: p[Math.max(lo, 1) - 1], later: p[Math.min(hi, n) - 1] } : {}) }, probes };
  const first = hi;
  if (first === 0) return { outcome: { kind: "already_failing", oldest: p[0] }, probes };
  if (first === n + 1) {
    // Passing after the last task but failing now with the very same files means the check itself gives different answers.
    if (!(await o.differs(p[n - 1].after, o.nowId))) return { outcome: { kind: "unsure", earlier: p[n - 1] }, probes };
    return { outcome: { kind: "after_last_task", last: p[n - 1] }, probes };
  }
  const task = p[first - 1];
  if (first >= 2 && (await o.differs(p[first - 2].after, task.before))) {
    const earlier = p[first - 2];
    if (probes >= o.maxProbes || (o.usable && !(await o.usable(task.before)))) return { outcome: { kind: "unsure", earlier, later: task }, probes };
    const v = await o.probe(task.before, { side: "before", label: task.label });
    probes++;
    if (v === "cancelled") return { outcome: { kind: "cancelled" }, probes };
    if (v === "bad") return { outcome: { kind: "outside_change", earlier, later: task }, probes };
    if (v === "skip") return { outcome: { kind: "unsure", earlier, later: task }, probes };
  }
  return { outcome: { kind: "found", task }, probes };
}
