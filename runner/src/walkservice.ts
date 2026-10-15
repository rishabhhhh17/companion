// Runs walkthroughs for the app: commands in, events out. The place is saved after every move. The project is only read.
import type { Command, Event } from "../../protocol/index.ts";
import { FileWalkStore, loadLessons, NO_PROJECT, Walkthrough, type Checker, type Lesson, type Settled } from "./walk.ts";

type Active = { walk: string; project: string; lesson: Lesson; w: Walkthrough; busy: boolean; asked: boolean };
type WalkCmd = Extract<Command, { type: `walk.${string}` }>;

export class WalkService {
  private active = new Map<string, Active>();   // by walk id
  constructor(private o: { emit: (e: Event) => void; lessonDirs: string[]; store: FileWalkStore; checker: (project: string) => Checker; now: () => string }) {}
  private emit(e: Record<string, unknown>) { this.o.emit({ v: 1, id: `walk-${Date.now().toString(36)}`, ...e } as never); }

  stopAll() {
    for (const a of [...this.active.values()]) { a.w.stop(); this.save(a); this.emit({ type: "walk.stopped", walk: a.walk, reason: "Stopped. Your place is saved." }); }
    this.active.clear();
  }

  async handle(cmd: WalkCmd): Promise<void> {
    switch (cmd.type) {
      case "walk.list": {
        const { lessons, problems } = loadLessons(this.o.lessonDirs);
        this.emit({ type: "walk.lessons", project: cmd.project, problems: problems.length, lessons: lessons.map((l) => ({ id: l.id, title: l.title, app: l.app, goal: l.goal, status: l.status, needsProject: l.needsProject, steps: l.steps.length, saved: this.o.store.load(cmd.project, l.id) !== null })) });
        return;
      }
      case "walk.start": return this.start(cmd);
      default: {
        const a = this.active.get(cmd.walk);
        if (!a) return;
        // Stop is never dropped, even while a step is being proven: it ends the walk at once and nothing more is drawn.
        if (cmd.type === "walk.stop") { a.w.stop(); this.save(a); this.active.delete(a.walk); this.emit({ type: "walk.stopped", walk: a.walk, reason: "Stopped. Your place is saved." }); return; }
        if (a.busy) return;
        // A command for a step that is no longer the current one (a late click, a double press) is dropped.
        if ("index" in cmd && !a.w.at(cmd.index)) return;
        a.busy = true;
        try {
          if (cmd.type === "walk.skip") { a.w.skip(); this.after(a, a.w.progress().done ? "done" : "advance"); return; }
          if (cmd.type === "walk.answer") {
            const need = a.w.needs();
            // After a pause the same Yes and No answer "Did you already do this?" (asked before anything is pointed at).
            if (need === "already") { const r = await a.w.confirm(cmd.worked, this.o.checker(a.project)); if (this.active.get(a.walk) === a) this.after(a, r); return; }
            if (need !== "ask") return;
            const r = await a.w.answer(cmd.worked); if (this.active.get(a.walk) === a) this.after(a, r); return;
          }
          if (cmd.type === "walk.acted") {
            if (a.w.needs() === "already") return;   // nothing is pointed at while that question waits, so a click means nothing
            if (a.w.needs() === "ask") { if (a.asked) return; a.asked = true; this.emit({ type: "walk.ask", walk: a.walk, index: a.w.current()!.index }); return; }
            if (!a.w.current()) return;   // nothing is shown, so a click means nothing
            const r = await a.w.settle(cmd.how, this.o.checker(a.project));
            if (this.active.get(a.walk) === a) this.after(a, r);
          }
        } finally { a.busy = false; }
      }
    }
  }

  private async start(cmd: Extract<WalkCmd, { type: "walk.start" }>) {
    const lesson = loadLessons(this.o.lessonDirs).lessons.find((l) => l.id === cmd.lesson);
    if (!lesson) { this.emit({ type: "walk.stopped", walk: cmd.id, reason: "I could not find that lesson." }); return; }
    // A lesson that reads the project needs a real one; a lesson that needs none uses the stand in and nothing else.
    if (lesson.needsProject && cmd.project === NO_PROJECT) { this.emit({ type: "walk.stopped", walk: cmd.id, reason: "Choose your project folder first, then start this lesson." }); return; }
    for (const a of [...this.active.values()]) if (a.project === cmd.project || a.walk === cmd.id) { a.w.stop(); this.save(a); this.active.delete(a.walk); }
    const saved = cmd.fresh ? null : this.o.store.load(cmd.project, lesson.id);
    const w = new Walkthrough(lesson, saved, { now: this.o.now, project: cmd.project });
    const a: Active = { walk: cmd.id, project: cmd.project, lesson, w, busy: true, asked: false };
    this.active.set(a.walk, a);
    try {
      if (saved) { try { await w.resume(this.o.checker(cmd.project)); } catch { this.o.store.forget(cmd.project, lesson.id); } }
      if (this.active.get(a.walk) !== a) return;   // Stop came while it was looking
      this.after(a, w.progress().done ? "done" : w.progress().blocked ? "help" : "advance");
    } finally { a.busy = false; }
  }

  private save(a: Active) { try { this.o.store.save(a.project, a.w.progress()); } catch { /* the place is a nicety; the walk goes on */ } }

  private after(a: Active, r: Settled) {
    a.asked = false;
    if (r === "stopped") return;
    const l = a.lesson;
    if (r === "done") {
      this.o.store.forget(a.project, l.id); this.active.delete(a.walk);
      this.emit({ type: "walk.done", walk: a.walk, project: a.project, lesson: l.id, title: l.title, steps: l.steps.length });
      return;
    }
    this.save(a);
    if (r === "help") {
      const p = a.w.progress(), s = l.steps.find((x) => x.id === p.blocked) ?? l.steps[p.index];
      this.emit({ type: "walk.help", walk: a.walk, say: `I could not tell that this worked: ${s.say} I will not point at it again. What to look for: ${s.find}. When you have done it yourself, press "I did it myself".` });
      return;
    }
    const c = a.w.current(); if (!c) return;
    this.emit({ type: "walk.step", walk: a.walk, project: a.project, lesson: l.id, title: l.title, index: c.index, total: c.total, variant: c.variant, say: c.step.say, find: c.step.find, ask: c.step.check.kind === "ask", ...(c.already ? { already: true } : {}), log: a.w.history() });
  }
}
