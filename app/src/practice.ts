// The practice projects on the pages: one catalog (app/sample/practices.json, shared with the shell and the tests), the
// failure each one is about, where the person is in each (the shell's practice record, practice.rs), the list on the Learn
// tab, what comes next, and the beta numbers they count. Plain code, tested in practice.test.ts; card.tsx and
// practicePanel.tsx only draw what this decides. The words are in strings.ts (S.practices), never in the catalog.
import catalogJson from "../sample/practices.json";
import type { DoctorItem, Practice, Problem } from "./model.ts";
import { S, NAMES } from "./strings.ts";
import { isBusy } from "./updates.ts";
import { noTableOpen } from "../../runner/src/ship/opentables.ts";

export type PracticeEntry = {
  id: string; folder: string; order: number; copyName: string;
  // find: the project's own checks (Point at the problem), or the check before going live (a ship gate, the files only).
  find: "checks" | "gate";
  expect: { file: string; line: number; about?: string; gate?: string; findings?: string[] };
  // fix: a small checked task, or a lesson (the value is the person's to put in place). prove: what says it is done.
  fix: "task" | "lesson"; prove: "receipt" | "checks" | "gate";
  protect: string[]; needsNode: boolean; budgetUsd: number; minutes: number; costUsd: number;
};
export const CATALOG: readonly PracticeEntry[] = [...(catalogJson as { practices: PracticeEntry[] }).practices].sort((a, b) => a.order - b.order);
/** The start of every copy's folder name (practiceCopyBase in protocol/names.json), a placeholder like every name (rule 21). */
export const COPY_BASE: string = NAMES.practiceCopyBase;
/** Every start a copy's folder name may have: today's, then the names it had before a rename (copies made earlier). */
const COPY_BASES: string[] = [COPY_BASE, ...NAMES.earlierPracticeCopyBases];
const looksLikeCopy = (folder: string) => { const last = folder.split("/").filter(Boolean).at(-1) ?? ""; return COPY_BASES.some((b) => last.startsWith(`${b} `) || last === b); };
export const practiceOf = (id: unknown): PracticeEntry | undefined => CATALOG.find((e) => e.id === id);
/** The first practice: the first run's recommended one. */
export const FIRST_PRACTICE = CATALOG[0].id;

/** The failure this practice is about, and only that one: the file, the line and the words the catalog expects. */
export function isExpected(e: PracticeEntry, p: Problem | null | undefined): boolean {
  if (!p || p.kind !== "line" || e.find !== "checks" || !e.expect.about) return false;
  const file = p.file.replace(/^\.\//, "");
  return (file === e.expect.file || file.endsWith(`/${e.expect.file}`)) && p.line === e.expect.line && p.message.toLowerCase().includes(e.expect.about.toLowerCase());
}

export type GateLike = { id: string; label?: string; status: string; detail?: string; findings?: string[]; places?: { table: string; file: string; line: number; lineText: string }[] };
/** What the check before going live says about this practice's gate: blocked on exactly the findings the catalog expects
 *  (found, with the line that makes the table), clear, open some other way (other), or not there at all.
 *  Clear means the check shows no open table (noTableOpen, the same rule real-verify measures), and nothing less (rule
 *  14): the practice's check reads the files only, so a fixed copy answers could_not_check with no findings. A table still
 *  open by a rule that says "true" is could_not_check with that table in its findings, which is not fixed; nor is a copy
 *  that no longer uses Supabase at all (not_applicable), or any answer this does not know. */
export function gateFinding(e: PracticeEntry, gates: unknown): { state: "found" | "clear" | "other" | "missing"; label?: string; detail?: string; problem?: Problem } {
  const g = (Array.isArray(gates) ? gates : []).find((x: GateLike) => !!x && x.id === e.expect.gate) as GateLike | undefined;
  if (!g) return { state: "missing" };
  if (noTableOpen(g)) return { state: "clear", label: g.label, detail: g.detail };
  const findings = Array.isArray(g.findings) ? [...g.findings].sort() : [];
  if (g.status !== "blocked" || JSON.stringify(findings) !== JSON.stringify([...(e.expect.findings ?? [])].sort())) return { state: "other", label: g.label, detail: g.detail };
  const at = (g.places ?? []).find((p) => p && typeof p.file === "string" && Number.isInteger(p.line));
  const message = String(g.detail ?? "");
  return { state: "found", label: g.label, detail: message, problem: { kind: "line", file: at?.file ?? e.expect.file, line: at?.line ?? e.expect.line, lineText: at?.lineText ?? "", message, from: "ship" } };
}

// ---------- the record, as the shell lists it ----------

export type RecordRow = { id: string; path?: string; there: boolean; started?: string; found?: string; done?: string };
export type PracticeRecord = { rows: RecordRow[]; damaged: boolean };
export const NO_RECORD: PracticeRecord = { rows: [], damaged: false };
const day = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
/** practice_list's answer, checked: only catalog ids, only text where text belongs. */
export function recordFrom(v: unknown): PracticeRecord {
  const o = v as { practices?: unknown; damaged?: unknown } | null;
  const rows = (Array.isArray(o?.practices) ? o!.practices : []).flatMap((r: any): RecordRow[] => (r && practiceOf(r.id) ? [{ id: r.id, there: r.there === true, ...(typeof r.path === "string" && r.path ? { path: r.path } : {}), ...(day(r.started) ? { started: r.started } : {}), ...(day(r.found) ? { found: r.found } : {}), ...(day(r.done) ? { done: r.done } : {}) }] : []));
  return { rows, damaged: o?.damaged === true };
}
export type RowState = "notStarted" | "inProgress" | "done";
/** A plain state for each practice (rule 16: a Done, never a score). Done stays done after a fresh copy. */
export function rowState(r: RecordRow | undefined): RowState {
  if (r?.done) return "done";
  return r?.path && r.there ? "inProgress" : "notStarted";
}
/** Node that is not on this Mac at all, with nothing else to run the practices on: only then does a practice wait (its
 *  checks run on an older Node too, and on the engine's own Bun when Node is missing; runner/src/proof/practicerun.ts). */
export const nodeMissing = (doctor: DoctorItem[] | null): DoctorItem | null => doctor?.find((d) => d.id === "node" && d.missing === true && d.practiceRuns !== true) ?? null;
/** Node is not on this Mac, but the practices run without it (on the engine's own Bun): they do not wait, and Learn says
 *  in one calm line that the person's own web projects will still need Node. */
export const practiceWithoutNode = (doctor: DoctorItem[] | null): DoctorItem | null => doctor?.find((d) => d.id === "node" && d.missing === true && d.practiceRuns === true) ?? null;

/** Whether the Mac check should run (again): there is no report yet, or it said Node is missing. A person who installed Node
 *  while Companion was open would otherwise stay blocked until it was restarted. */
export const needsMacCheck = (doctor: DoctorItem[] | null): boolean => doctor === null || nodeMissing(doctor) !== null;

export type ListRow = { entry: PracticeEntry; state: RowState; there: boolean; title: string; teaches: string; time: string; cost: string; needsNode: boolean };
export const timeWords = (e: PracticeEntry) => S.practiceMinutes(e.minutes);
export const costWords = (e: PracticeEntry) => (e.costUsd > 0 ? S.practiceCostKey(Math.round(e.costUsd * 100)) : S.practiceFree);
/** The practice list on Learn, in catalog order. */
export function listRows(rec: PracticeRecord, doctor: DoctorItem[] | null): ListRow[] {
  const noNode = !!nodeMissing(doctor);
  return CATALOG.map((e) => {
    const r = rec.rows.find((x) => x.id === e.id);
    return { entry: e, state: rowState(r), there: !!r?.there, title: S.practices[e.id].title, teaches: S.practices[e.id].teaches, time: timeWords(e), cost: costWords(e), needsNode: e.needsNode && noNode };
  });
}
/** After a practice: the next one in catalog order that is not done yet (the one just finished counts as done). */
export function nextPractice(rec: PracticeRecord, justDone: string): PracticeEntry | null {
  const done = new Set([...rec.rows.filter((r) => r.done).map((r) => r.id), justDone]);
  const at = CATALOG.findIndex((e) => e.id === justDone);
  return [...CATALOG.slice(at + 1), ...CATALOG.slice(0, Math.max(0, at))].find((e) => !done.has(e.id)) ?? null;
}
/** The practice whose recorded copy is this folder, if any. */
export const copyOf = (rec: PracticeRecord, project: string): string | null => (project ? rec.rows.find((r) => r.path === project)?.id ?? null : null);
/** Start, Next and the first run: a practice whose recorded copy is still there opens that copy (Continue); only one with
 *  no copy left gets a new one. The record keeps one copy per practice, so a second copy would be lost to it (the shell
 *  refuses one too, practice.rs create). */
export const startOrOpen = (rec: PracticeRecord, id: string): "start" | "open" => (rec.rows.some((r) => r.id === id && r.path && r.there) ? "open" : "start");
/** A recorded copy opened as the project brings its practice back once per visit to that folder. `seen` is the folder this
 *  visit already handled (the card forgets it only when the folder changes), so the record being read again (after every
 *  practice action and mark, and each time Learn opens) never brings back a practice the person closed, and never runs its
 *  Find again unasked. A record not read yet leaves the visit unhandled, so the copy still comes back once it is read. */
export function resumeOnOpen(project: string, rec: PracticeRecord, open: Practice | null, seen: string): { resume: string | null; seen: string } {
  if (!project || seen === project) return { resume: null, seen };
  const id = copyOf(rec, project);
  if (!id) return { resume: null, seen };
  return { resume: open?.project === project ? null : id, seen: project };
}
/** Back to my project: the folder used before the practice, else the newest recent folder that is not a practice copy. */
export function backTo(previous: string | undefined, recent: string[], rec: PracticeRecord): string | null {
  const own = (f: string) => !copyOf(rec, f) && !looksLikeCopy(f);
  if (previous && recent.includes(previous) && own(previous)) return previous;
  return recent.find(own) ?? null;
}
/** May a practice start now: nothing is working (a practice switches the project), and Node is there when it needs it. */
export const canStart = (busy: boolean, e: PracticeEntry, doctor: DoctorItem[] | null): boolean => !busy && !(e.needsNode && nodeMissing(doctor));

/** The lessons Learn lists. A practice copy is never on Vercel, so its lesson about Vercel settings is left out there. */
export function lessonsShown<T extends { id: string }>(lessons: T[], project: string, rec: PracticeRecord, vercelLesson: string): T[] {
  return copyOf(rec, project) ? lessons.filter((l) => l.id !== vercelLesson) : lessons;
}

/** Beta numbers: which fixed counts this change of the practice makes (started, its problem found, done). Never a name
 *  or a path: the runner keeps only names on its fixed list. A practice opened again (resumed) is not a new start. */
export function practiceNotes(before: Practice | null, after: Practice | null): string[] {
  if (!after) return [];
  const same = !!before && before.kind === after.kind && before.project === after.project;
  const out: string[] = [];
  if (!same && after.stage === "start" && !after.resumed) out.push("practice_started");
  if (after.stage === "found" && !after.undone && (!same || before!.stage !== "found")) out.push("practice_found");
  if (after.stage === "done" && !after.already && (!same || before!.stage !== "done")) out.push("practice_done");
  return out;
}
/** The stage the shell's record keeps for this change ("found" or "done"), if any. */
export function markFor(before: Practice | null, after: Practice | null): "found" | "done" | null {
  if (!after) return null;
  const same = !!before && before.kind === after.kind && before.project === after.project;
  if (after.stage === "done" && (!same || before!.stage !== "done")) return "done";
  if (after.stage === "found" && (!same || before!.stage !== "found")) return "found";
  return null;
}

/** Point at the problem's Fix it uses the same small checked fix as the practices only when Settings says so (point.fixWith,
 *  usual: look deeper first, Rescue) and the problem is one line in the project. */
export const usesSmallFix = (choice: unknown, p: Problem | null | undefined): boolean => choice === "smallFix" && p?.kind === "line";
/** What Point at the problem's Fix it starts. In a practice copy whose problem was found (or whose fix did not pass), it is
 *  the practice's own fix, the same as Fix it with me on Learn, so the two panels never offer two different fixes for the
 *  one problem. Elsewhere: the small checked fix when point.fixWith says so, else look deeper first (Rescue). */
export function pointFixRoute(choice: unknown, p: Problem | null | undefined, pr: Practice | null | undefined, project: string): "practice" | "smallFix" | "rescue" {
  if (pr && project && pr.project === project && practiceOf(pr.kind)?.fix === "task" && (pr.stage === "found" || pr.stage === "failed")) return "practice";
  return usesSmallFix(choice, p) ? "smallFix" : "rescue";
}

// The parts of Home's model that say something is working (updates.ts isBusy reads the same ones), and a lesson.
type Working = Parameters<typeof isBusy>[0] & { walk?: { stage?: string } | null };
/** Something works on the project now, so a practice must not open another folder under it, and its copy must not go to the
 *  Trash: any task or check (isBusy), a lesson that is open, or the practice's own lesson or checks after its fix. */
export const workingOn = (m: Working): boolean =>
  isBusy(m) || (!!m.walk && !["done", "stopped"].includes(m.walk.stage ?? "")) || ["lesson", "proving"].includes(m.practice?.stage ?? "");


// ---------- the thread: find, fix, prove ----------

export type NodeState = "todo" | "now" | "done" | "failed";
export type Thread = { find: NodeState; fix: NodeState; prove: NodeState };
/** Where the person is in find, fix, prove, from the practice's own stage and nothing else: a step is done only when the stage
 *  after it was reached, and the third step is empty ("failed") when the checks did not pass. Plain code, so the picture can
 *  never say more than the model knows (rule 14). */
export function threadOf(p: { stage: string; result?: unknown }): Thread {
  switch (p.stage) {
    case "start": return { find: "now", fix: "todo", prove: "todo" };
    case "found": case "lesson": case "fixing": return { find: "done", fix: "now", prove: "todo" };
    case "proving": return { find: "done", fix: "done", prove: "now" };
    case "done": return { find: "done", fix: "done", prove: "done" };
    // A fix that ended with a receipt but did not pass: the fix happened, its proof did not. No receipt: the fix itself failed.
    case "failed": return p.result ? { find: "done", fix: "done", prove: "failed" } : { find: "done", fix: "failed", prove: "todo" };
    case "blocked": return { find: "failed", fix: "todo", prove: "todo" };
    default: return { find: "todo", fix: "todo", prove: "todo" };
  }
}

/** The kind of work a practice is, for its tile (the audit, item 53: every practice had the same wrench): a check before
 *  going live, a setting to learn, or a fix. */
export const practiceKind = (e: Pick<PracticeEntry, "fix" | "prove">): "live" | "explain" | "fix" => (e.prove === "gate" ? "live" : e.fix === "lesson" ? "explain" : "fix");
