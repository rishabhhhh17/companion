// Beta numbers: how often the main things happen, as counts per day, kept only on this Mac and only if the person turned
// them on. Never words, names, paths, ids or anything from a screen: a fixed list of counters and nothing else. The
// person can look at the numbers, copy them to send by hand, and erase them. Nothing is sent anywhere by Companion.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command, Event } from "../../protocol/index.ts";

export const NOTES = [
  "session", "hero_press", "soft_ring_corrected", "anywhere_use", "builder_use",
  "walk_started", "walk_step", "walk_other_way", "walk_help", "walk_done", "walk_stopped",
  "proof_passed", "proof_failed", "proof_gaps", "diagram_made", "diagram_none", "practice_done",
] as const;
type Name = typeof NOTES[number];
const KEEP_DAYS = 120;

type Days = Record<string, Partial<Record<Name, number>>>;
export type Summary = {
  enabled: boolean; days: Days; totals: Partial<Record<Name, number>>;
  rates: { walkCompletion: number | null; stepSuccess: number | null; anywhereShare: number | null; proofPass: number | null; softRingCorrections: number };
};

const ratio = (a: number, b: number): number | null => (b > 0 ? Math.min(1, Math.round((a / b) * 1000) / 1000) : null);
// The day is the person's own day, not UTC midnight.
const dayOf = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

export class Metrics {
  private enabled = false;
  private days: Days = {};
  constructor(private file: string, private now: () => Date = () => new Date()) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      this.enabled = j?.enabled === true;
      for (const [d, row] of Object.entries(j?.days ?? {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || typeof row !== "object" || !row) continue;
        const clean: Partial<Record<Name, number>> = {};
        for (const n of NOTES) { const v = (row as Record<string, unknown>)[n]; if (typeof v === "number" && Number.isFinite(v) && v > 0) clean[n] = Math.floor(v); }
        this.days[d] = clean;
      }
    } catch { /* no file, or a damaged one: empty and off */ }
  }

  setEnabled(on: boolean) { this.enabled = on; this.save(); }
  private save() {
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ enabled: this.enabled, days: this.days }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch { /* numbers are a nicety; never in the way */ }
  }
  private bump(n: Name) {
    if (!this.enabled) return;
    const t = this.now(), day = dayOf(t);
    (this.days[day] ??= {})[n] = (this.days[day][n] ?? 0) + 1;
    const cutoff = dayOf(new Date(t.getTime() - KEEP_DAYS * 86_400_000));
    for (const d of Object.keys(this.days)) if (d < cutoff) delete this.days[d];
    this.save();
  }

  /** A fixed name from the app. Anything else is refused. */
  note(name: string): boolean { if (!(NOTES as readonly string[]).includes(name)) return false; try { this.bump(name as Name); } catch { /* never in the way */ } return true; }

  /** Looks only at the kind of event and a few fixed words (a verdict, a variant); nothing else is read or kept. */
  observe(e: Event) { try { this.look(e); } catch { /* never in the way of the real event */ } }
  private look(e: Event) {
    const x = e as unknown as Record<string, unknown>;
    switch (e.type) {
      case "walk.step": this.bump("walk_step"); if (x.variant === "instead") this.bump("walk_other_way"); return;
      case "walk.help": this.bump("walk_help"); return;
      case "walk.done": this.bump("walk_done"); return;
      case "walk.stopped": this.bump("walk_stopped"); return;
      case "proof.result": if (x.verdict === "passed") this.bump("proof_passed"); else if (x.verdict === "failed") this.bump("proof_failed"); else if (x.verdict === "passed_with_gaps") this.bump("proof_gaps"); return;
      case "diagram.ready": this.bump(x.made === true ? "diagram_made" : "diagram_none"); return;
    }
  }
  observeCommand(c: Command) { try { if (c.type === "walk.start") this.bump("walk_started"); } catch { /* never in the way */ } }

  /** Erases every count. If counting is on it stays on (the setting is kept), so a restart does not quietly turn it off. */
  erase() {
    this.days = {};
    if (this.enabled) this.save(); else { try { rmSync(this.file, { force: true }); } catch { /* already gone */ } }
  }

  summary(): Summary {
    const totals: Partial<Record<Name, number>> = {};
    for (const row of Object.values(this.days)) for (const [k, v] of Object.entries(row)) totals[k as Name] = (totals[k as Name] ?? 0) + (v ?? 0);
    const t = (n: Name) => totals[n] ?? 0;
    return {
      enabled: this.enabled, days: JSON.parse(JSON.stringify(this.days)), totals,
      rates: {
        walkCompletion: ratio(t("walk_done"), t("walk_started")),
        stepSuccess: t("walk_step") > 0 ? ratio(t("walk_step") - t("walk_other_way"), t("walk_step")) : null,
        anywhereShare: ratio(t("anywhere_use"), t("anywhere_use") + t("builder_use")),
        proofPass: ratio(t("proof_passed"), t("proof_passed") + t("proof_failed")),
        softRingCorrections: t("soft_ring_corrected"),
      },
    };
  }
}
