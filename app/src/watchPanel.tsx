import { useId, useState } from "react";
import { WATCH_KINDS, type WatchKind, type WatchView } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { useSetting } from "./settingsStore.ts";
import { Button, Field, Menu, Stepper } from "./ui/parts.tsx";
import { SCHEDULE_CHOICES, choiceOf, nameOf, scheduleOf, stateLine, whenText } from "./watch.ts";

// Home's Now tab: the project's watches, as plain rows (F21). One line for the state, one for the schedule, and the buttons.
// Nothing here is a popup, takes the keyboard, scores or counts; built from the parts (ui/parts.tsx): a Menu, never a plain
// select, a Stepper for the hour, and no silver button, since Home's one main button is the hero's (the overhaul spec, 2.2).
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
  const kindId = useId(), targetId = useId(), scheduleId = useId(), hourId = useId();
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
            {w.state !== "paused" && <Button disabled={w.checking} onClick={() => h.onCheck(w)}>{S.watch.checkNow}</Button>}
            {w.state === "failing" && fixOn && <Button disabled={asked === w.watch} onClick={() => h.onFix(w)}>{asked === w.watch ? S.watch.fixing : S.watch.fixIt}</Button>}
            <Button onClick={() => h.onPause(w, w.state !== "paused")}>{w.state === "paused" ? S.watch.resume : S.watch.pause}</Button>
            <Button onClick={() => h.onRemove(w)}>{S.watch.remove}</Button>
          </div>
        </div>
      ))}
      {adding ? (
        <div className="watchform">
          <div className="row"><span id={kindId}>{S.watch.kindLabel}</span>
            <Menu labelledBy={kindId} value={kind} options={WATCH_KINDS.map((k) => ({ id: k, label: S.watch.kinds[k] }))} onChange={setKind} />
          </div>
          <div className="line muted">{S.watch.kindHelp[kind]}</div>
          {kind === "site_up" && (
            <div className="row"><span id={targetId}>{S.watch.targetLabel}</span>
              <Field labelledBy={targetId} value={target} placeholder={S.watch.targetHint} onChange={setTarget} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }} />
            </div>
          )}
          <div className="row"><span id={scheduleId}>{S.watch.scheduleLabel}</span>
            <Menu labelledBy={scheduleId} value={pick} options={SCHEDULE_CHOICES.map((c) => ({ id: c, label: S.watch.schedules[c] }))} onChange={setChoice} />
          </div>
          {pick === "daily" && (
            <div className="row"><span id={hourId}>{S.watch.hourLabel}</span>
              <Stepper labelledBy={hourId} label={S.watch.hourLabel} value={at} min={0} max={23} step={1} onChange={(n) => setHour(String(n))} />
            </div>
          )}
          <div className="row">
            <Button disabled={!canAdd} onClick={add}>{S.watch.addOne}</Button>
            <Button onClick={() => setAdding(false)}>{S.watch.cancel}</Button>
          </div>
        </div>
      ) : (
        <div className="row"><Button onClick={() => setAdding(true)}>{S.watch.add}</Button></div>
      )}
    </section>
  );
}
