import { useState } from "react";
import { WATCH_KINDS, type WatchKind, type WatchView } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { useSetting } from "./settingsStore.ts";
import { SCHEDULE_CHOICES, choiceOf, nameOf, scheduleOf, stateLine, whenText } from "./watch.ts";

// Home's Now tab: the project's watches, as plain rows (F21). One line for the state, one for the schedule, and the buttons.
// Nothing here is a popup, takes the keyboard, scores or counts; the existing components and classes only.
export type WatchHandlers = {
  onAdd(kind: WatchKind, schedule: string, target: string): void;
  onCheck(w: WatchView): void;
  onPause(w: WatchView, paused: boolean): void;
  onRemove(w: WatchView): void;
  onFix(w: WatchView): void;
};
export function WatchPanel({ watches, asked, fixOn, h }: { watches: WatchView[]; asked: string | null; fixOn: boolean; h: WatchHandlers }) {
  const routinesOn = useSetting("watch.on") !== false;
  const usual = choiceOf(useSetting("watch.schedule"));
  const usualHour = Number(useSetting("watch.dailyHour"));
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<WatchKind>("site_up");
  const [target, setTarget] = useState("");
  const [choice, setChoice] = useState<string>("");
  const [hour, setHour] = useState<string>("");
  const pick = choice || usual;
  const at = hour === "" ? (Number.isInteger(usualHour) ? usualHour : 9) : Number(hour);
  const canAdd = kind !== "site_up" || target.trim().length > 0;
  const add = () => { if (!canAdd) return; h.onAdd(kind, scheduleOf(pick, at), target); setAdding(false); setTarget(""); };
  return (
    <section className="panel" aria-label={S.watch.title}>
      <h2>{S.watch.title}</h2>
      <div className="line muted">{S.watch.intro}</div>
      {!routinesOn && <div className="line" role="status">{S.watch.offNote}</div>}
      {watches.length === 0 && !adding && <div className="line muted">{S.watch.empty}</div>}
      {watches.map((w) => (
        <div key={w.watch} className="watch" role="group" aria-label={nameOf(w)}>
          <div className={`line ${w.state === "failing" ? "blocked" : ""}`} role="status"><b>{nameOf(w)}</b>: {stateLine(w)}</div>
          <div className="line muted">{S.watch.scheduleWords(w.schedule)}{w.lastCheckedAt ? `. ${S.watch.checked(whenText(w.lastCheckedAt))}` : ""}{w.nextAt && w.state !== "paused" ? `. ${S.watch.next(whenText(w.nextAt))}` : ""}</div>
          <div className="row">
            {w.state !== "paused" && <button className="btn" type="button" disabled={w.checking} onClick={() => h.onCheck(w)}>{S.watch.checkNow}</button>}
            {w.state === "failing" && fixOn && <button className="btn primary" type="button" disabled={asked === w.watch} onClick={() => h.onFix(w)}>{asked === w.watch ? S.watch.fixing : S.watch.fixIt}</button>}
            <button className="btn" type="button" onClick={() => h.onPause(w, w.state !== "paused")}>{w.state === "paused" ? S.watch.resume : S.watch.pause}</button>
            <button className="btn" type="button" onClick={() => h.onRemove(w)}>{S.watch.remove}</button>
          </div>
        </div>
      ))}
      {adding ? (
        <div className="watchform">
          <label className="line">{S.watch.kindLabel}{" "}
            <select value={kind} onChange={(e) => setKind(e.target.value as WatchKind)}>
              {WATCH_KINDS.map((k) => <option key={k} value={k}>{S.watch.kinds[k]}</option>)}
            </select>
          </label>
          <div className="line muted">{S.watch.kindHelp[kind]}</div>
          {kind === "site_up" && (
            <label className="line">{S.watch.targetLabel}{" "}
              <input type="text" autoComplete="off" spellCheck={false} value={target} placeholder={S.watch.targetHint} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }} />
            </label>
          )}
          <label className="line">{S.watch.scheduleLabel}{" "}
            <select value={pick} onChange={(e) => setChoice(e.target.value)}>
              {SCHEDULE_CHOICES.map((c) => <option key={c} value={c}>{S.watch.schedules[c]}</option>)}
            </select>
          </label>
          {pick === "daily" && (
            <label className="line">{S.watch.hourLabel}{" "}
              <input type="number" min={0} max={23} step={1} value={hour === "" ? String(at) : hour} onChange={(e) => setHour(e.target.value)} />
            </label>
          )}
          <div className="row">
            <button className="btn primary" type="button" disabled={!canAdd} onClick={add}>{S.watch.addOne}</button>
            <button className="btn" type="button" onClick={() => setAdding(false)}>{S.watch.cancel}</button>
          </div>
        </div>
      ) : (
        <div className="row"><button className="btn" type="button" onClick={() => setAdding(true)}>{S.watch.add}</button></div>
      )}
    </section>
  );
}
