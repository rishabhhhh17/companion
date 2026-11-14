// M86 (a), Watch what changed, the pages' side: the review's replay (built and checked by the engine, runner/src/review/
// replay.ts) checked again here, laid out on a small board, and timed. Each beat draws one thing with the hand drawn pen
// (sketch.ts) in a meaning colour: the whole list of files, a changed file, a part of the app, a check (green passed, red
// failed), or the verdict (last, once). The proof screenshot has no box until the board can show the picture itself.
// Pure, so the same review always plays the same way.
import { REPLAY_DRAWS, REPLAY_PARTS, type ReviewRating, type ReviewReplay } from "../../protocol/index.ts";
import type { Colour } from "./meaning.ts";
import { fitLabel } from "./layout.ts";
import { sketchEllipse, sketchLine, sketchRect } from "./sketch.ts";

export type ReplayView = ReviewReplay;
export const REPLAY_BOARD = { w: 320, h: 180 } as const;
/** The board fills the card's text column, from 320 to this wide, drawn one to one so its words keep their size. */
export const REPLAY_MAX_W = 640;
export const REPLAY_SPEEDS = { slow: 1.4, normal: 1, fast: 0.7 } as const;
export type ReplaySpeed = keyof typeof REPLAY_SPEEDS;
/** Words a second when nothing is spoken (OpenClicky's default clock, research visuals.md 1c). */
export const WORDS_A_SECOND = 2.6;
const MIN_BEAT_MS = 1400;
const ROWS = 5;

const plain = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[<>\u0000-\u001f]/.test(v);

/** The replay as the protocol has it, or undefined when anything in it is off (a beat drawing what its sheet does not have). */
export function replayOf(v: unknown): ReplayView | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  if (!Array.isArray(r.files) || r.files.length > 8 || !Array.isArray(r.checks) || r.checks.length > 4 || !Array.isArray(r.beats) || r.beats.length < 3 || r.beats.length > 6) return undefined;
  if ((r.by !== "rules" && r.by !== "model") || !Number.isInteger(r.count) || !Number.isInteger(r.more) || (r.shot !== undefined && typeof r.shot !== "string")) return undefined;
  const files: ReplayView["files"] = [];
  for (const f of r.files as Record<string, unknown>[]) {
    if (!f || !plain(f.file, 1000) || !["added", "modified", "deleted"].includes(f.kind as string) || !(REPLAY_PARTS as readonly string[]).includes(f.part as string)) return undefined;
    files.push({ file: f.file, kind: f.kind as ReplayView["files"][number]["kind"], part: f.part as ReplayView["files"][number]["part"] });
  }
  const checks: ReplayView["checks"] = [];
  for (const c of r.checks as Record<string, unknown>[]) {
    if (!c || !plain(c.label, 40) || !["passed", "failed", "skipped"].includes(c.status as string) || (c.exit !== undefined && !Number.isInteger(c.exit))) return undefined;
    checks.push({ label: c.label, status: c.status as "passed" | "failed" | "skipped", ...(c.exit !== undefined ? { exit: c.exit as number } : {}) });
  }
  const names = new Set(files.map((f) => f.file)), parts = new Set<string>(files.map((f) => f.part)), labels = new Set(checks.map((c) => c.label));
  const beats: ReplayView["beats"] = [];
  const all = r.beats as Record<string, unknown>[];
  if (all.filter((b) => b?.draw === "verdict").length !== 1 || all[all.length - 1]?.draw !== "verdict") return undefined;
  for (const b of all) {
    if (!b || !plain(b.say, 120) || !(REPLAY_DRAWS as readonly string[]).includes(b.draw as string)) return undefined;
    const draw = b.draw as ReplayView["beats"][number]["draw"];
    if (draw === "file" && !names.has(b.ref as string)) return undefined;
    if (draw === "part" && !parts.has(b.ref as string)) return undefined;
    if (draw === "check" && !labels.has(b.ref as string)) return undefined;
    beats.push({ say: b.say, draw, ...(typeof b.ref === "string" ? { ref: b.ref } : {}) });
  }
  return { beats, by: r.by, files, count: r.count as number, more: r.more as number, checks, ...(typeof r.shot === "string" ? { shot: r.shot } : {}) };
}

export type SceneRow = { name: string; part: string; x: number; y: number; w: number; h: number; file: string | null };
export type SceneChip = { label: string; status: "passed" | "failed" | "skipped"; exit?: number; x: number; y: number; w: number; h: number };
export type SceneMark = { beat: number; d: string; colour: Colour };
/** width: the board's own width (320 to 640). height: only as tall as what it shows (the verdict line just under the
 *  lowest thing), at most 180. */
export type Scene = { width: number; rows: SceneRow[]; chips: SceneChip[]; marks: SceneMark[]; height: number };

const base = (f: string) => f.split("/").pop() ?? f;
const RATING_COLOUR: Record<ReviewRating, Colour> = { safe: "green", worth_a_look: "orange", stop: "red" };
const CHECK_COLOUR = { passed: "green", failed: "red", skipped: "grey" } as const;

/** The board: the files down the left (grouped by part, at most five and a "more" row) and the checks down the right,
 *  with one mark per beat drawn over them, at `width` (the card's text column). */
export function replayScene(r: ReplayView, rating: ReviewRating, width: number = REPLAY_BOARD.w): Scene {
  const W = Math.round(Math.min(REPLAY_MAX_W, Math.max(REPLAY_BOARD.w, Number.isFinite(width) ? width : REPLAY_BOARD.w)));
  const rowW = Math.round((W - 30) * 0.52), chipX = 10 + rowW + 20, chipW = W - 10 - chipX;
  const order: string[] = [];
  for (const f of r.files) if (!order.includes(f.part)) order.push(f.part);
  const sorted = [...r.files].sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part));
  const rows: SceneRow[] = sorted.slice(0, ROWS).map((f, i) => ({ name: fitLabel(base(f.file), rowW - 50, 13), part: f.part, x: 10, y: 12 + i * 26, w: rowW, h: 22, file: f.file }));
  const hidden = r.count - rows.length;
  if (hidden > 0) rows.push({ name: `+${hidden}`, part: "", x: 10, y: 12 + rows.length * 26, w: rowW, h: 22, file: null });
  const chips: SceneChip[] = r.checks.map((c, j) => ({ label: fitLabel(c.label, chipW - 50, 12), status: c.status, ...(c.exit !== undefined ? { exit: c.exit } : {}), x: chipX, y: 12 + j * 26, w: chipW, h: 22 }));
  const lowest = Math.max(...rows.map((x) => x.y + x.h), ...chips.map((x) => x.y + x.h), 34);
  const line = Math.min(REPLAY_BOARD.h - 8, lowest + 12);
  const height = Math.min(REPLAY_BOARD.h, line + 8);
  const rowOf = (file: string) => rows.find((x) => x.file === file) ?? rows[rows.length - 1];
  const around = (box: SceneRow[], seed: string) => {
    const top = Math.min(...box.map((x) => x.y)) - 4, bottom = Math.max(...box.map((x) => x.y + x.h)) + 4;
    return sketchRect(5, top, rowW + 10, bottom - top, seed);
  };
  const marks: SceneMark[] = r.beats.map((b, beat) => {
    const seed = `${beat}:${b.draw}:${b.ref ?? ""}`;
    if (b.draw === "count") return { beat, d: around(rows.length ? rows : [{ name: "", part: "", x: 10, y: 12, w: rowW, h: 22, file: null }], seed), colour: "blue" };
    if (b.draw === "file") { const row = rowOf(b.ref!); return { beat, d: sketchEllipse(row.x + row.w / 2, row.y + row.h / 2, row.w / 2 + 6, row.h / 2 + 3, seed), colour: "blue" }; }
    if (b.draw === "part") {
      const mine = rows.filter((x) => x.part === b.ref);
      return { beat, d: around(mine.length ? mine : [rows[rows.length - 1]], seed), colour: "blue" };
    }
    if (b.draw === "check") {
      const c = chips.find((x) => x.label === fitLabel(b.ref!, chipW - 50, 12)) ?? chips[0];
      const tick = c.status === "passed" ? sketchLine(c.x + 8, c.y + 12, c.x + 12, c.y + 17, `${seed}a`) + " " + sketchLine(c.x + 12, c.y + 17, c.x + 19, c.y + 6, `${seed}b`)
        : sketchLine(c.x + 7, c.y + 6, c.x + 17, c.y + 16, `${seed}a`) + " " + sketchLine(c.x + 17, c.y + 6, c.x + 7, c.y + 16, `${seed}b`);
      return { beat, d: `${sketchRect(c.x, c.y, c.w, c.h, seed)} ${tick}`, colour: CHECK_COLOUR[c.status] };
    }
    return { beat, d: sketchLine(10, line, W - 10, line, seed), colour: RATING_COLOUR[rating] };
  });
  return { width: W, rows, chips, marks, height };
}

/** When each beat starts and how long it lasts: its words at 2.6 words a second (at least 1.4 seconds), at the chosen speed. */
export function replayTimes(r: ReplayView, speed: unknown): { at: number; dur: number }[] {
  const f = REPLAY_SPEEDS[(speed as ReplaySpeed) in REPLAY_SPEEDS ? (speed as ReplaySpeed) : "normal"];
  let at = 0;
  return r.beats.map((b) => {
    const dur = Math.round(Math.max(MIN_BEAT_MS, (b.say.split(/\s+/).filter(Boolean).length / WORDS_A_SECOND) * 1000) * f);
    const out = { at, dur };
    at += dur;
    return out;
  });
}

/** A still picture with every beat drawn (no drawing on, no timing): the Mac's Reduce Motion when following the Mac (the
 *  usual), or the person's own choice either way (replay.reduceMotion). */
export function replayStill(choice: unknown, macReduce: boolean): boolean {
  return choice === "still" ? true : choice === "moving" ? false : macReduce;
}
