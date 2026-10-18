import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DoctorItem } from "./model.ts";
import type { Command } from "../../protocol/index.ts";
import { addMemory, checkMac, setExplain } from "./commands.ts";
import { canContinue, commandsFor, DEFAULT_ANSWERS, effectsOf, FIRST_TASKS, keyLooksRight, next, back, QUESTIONS, STEPS, type Answers, type Step } from "./onboarding.ts";
import { keyHints, talkSharedNote } from "./settings.ts";
import { useKeys } from "./useKeys.ts";
import { invoke } from "./tauri.ts";
import { shouldTakeFocus } from "./cardlogic.ts";
import { S } from "./strings.ts";

type Props = { doctor: DoctorItem[] | null; connected: string; project: string; send: (c: unknown) => unknown; pickFolder: () => void; setAutoSend: (on: boolean) => void; useTask: (prompt: string) => void; startPractice: () => void; onDone: () => void };

export function Onboarding({ doctor, connected, project, send, pickFolder, setAutoSend, useTask, startPractice, onDone }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [key, setKey] = useState("");
  const [keyNote, setKeyNote] = useState("");
  // The keys every job uses now (the person may have picked others, or another app may hold the usual ones). The card
  // asks the app for them when it opens.
  const keys = useKeys();
  const ok = connected === "api_key" || connected === "plan";
  const ctx = { connected: ok, project };
  const go = (to: Step | null) => { if (to) setStep(to); };
  const finish = () => {
    for (const c of commandsFor(answers, project, (scope, text, source) => addMemory(project, scope, text, source) as Command, (on) => setExplain(project, on) as Command)) void send(c);
    setAutoSend(answers.autoSend);
    onDone();
  };
  const saveKey = () => {
    const problem = keyLooksRight(key);
    if (problem) { setKeyNote(problem); return; }
    // The key goes straight to the Keychain; the box is emptied at once and nothing keeps a copy.
    const k = key; setKey("");
    void invoke("save_api_key", { key: k }).then(() => setKeyNote("")).catch((e) => setKeyNote(String(e)));
  };
  useEffect(() => { if (step === "permissions") void send(checkMac()); }, [step]);
  // After Continue, Back or Skip (the person's own press; nothing else changes the step) the keyboard goes to the new step's
  // heading, so VoiceOver reads where they are. By the rule a question follows: Home has the keyboard, nobody is typing.
  const box = useRef<HTMLElement>(null), shown = useRef(step);
  useLayoutEffect(() => {
    if (shown.current === step) return;   // the first run just opened: nothing was pressed yet
    shown.current = step;
    const a = document.activeElement as HTMLElement | null, h = box.current?.querySelector<HTMLElement>("h2");
    if (!h || !shouldTakeFocus(a && a !== document.body ? { tag: a.tagName, editable: a.isContentEditable } : null, document.hasFocus())) return;
    h.setAttribute("tabindex", "-1"); h.focus();
  }, [step]);
  const n = STEPS.indexOf(step) + 1;
  return (
    <section className="panel" aria-label={S.obTitle} ref={box}>
      <div className="line muted">Step {n} of {STEPS.length}</div>
      {step === "welcome" && (<>
        <h2>{S.obTitle}</h2><div className="line">{S.obWelcome1}</div><div className="line">{S.obWelcome2}</div>
      </>)}
      {step === "connect" && (<>
        <h2>{S.obConnectTitle}</h2>
        {ok ? <div className="line"><b>{S.obConnected}</b></div> : (<>
          <div className="line">{S.obKeyHelp}</div>
          <div className="row">
            <input type="password" autoComplete="off" spellCheck={false} value={key} aria-label={S.obKeyLabel} placeholder="sk-ant-..." onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveKey(); }} />
            <button className="btn primary" type="button" onClick={saveKey}>{S.obKeySave}</button>
          </div>
          {keyNote && <div className="error" role="alert">{keyNote}</div>}
          <div className="line muted">{S.obPlanLater}</div>
        </>)}
      </>)}
      {step === "folder" && (<>
        <h2>{S.obFolderTitle}</h2><div className="line">{S.obFolderHelp}</div>
        <div className="line"><b>{project ? project : "-"}</b></div>
        <div className="row"><button className="btn primary" type="button" onClick={pickFolder}>{S.folderChange}</button></div>
      </>)}
      {step === "questions" && (<>
        <h2>{S.obQuestionsTitle}</h2><div className="line muted">{S.obQuestionsHelp}</div>
        {QUESTIONS.map((q) => (
          <div key={q.key}>
            <div className="line"><b>{q.ask}</b></div>
            <div className="row">
              <button className={`btn ${answers[q.key] ? "primary" : ""}`} type="button" aria-pressed={answers[q.key]} onClick={() => setAnswers({ ...answers, [q.key]: true })}>{q.yes}</button>
              <button className={`btn ${!answers[q.key] ? "primary" : ""}`} type="button" aria-pressed={!answers[q.key]} onClick={() => setAnswers({ ...answers, [q.key]: false })}>{q.no}</button>
            </div>
          </div>
        ))}
        <div className="line muted">{effectsOf(answers).join(" ")}</div>
      </>)}
      {step === "permissions" && (<>
        <h2>{S.obPermTitle}</h2><div className="line">{S.obPerm1}</div><div className="line">{S.obPerm2}</div><div className="line">{S.obPerm3}</div><div className="line muted">{S.obPermNone}</div>
        {doctor && (<>
          <h2>{S.obMacTitle}</h2>
          {doctor.map((d) => <div className={`line ${d.ok ? "" : "blocked"}`} key={d.id}><b>{d.label}:</b> {d.detail}{d.fix ? <span className="muted"> {d.fix}</span> : null}</div>)}
        </>)}
      </>)}
      {step === "first" && (<>
        <h2>{S.obFirstTitle}</h2>
        <div className="line">{S.obPracticeHelp}</div>
        <div className="row"><button className="btn primary" type="button" onClick={() => { finish(); startPractice(); }}>{S.obPractice}</button></div>
        <div className="line muted">{S.obOrOwn}</div>
        <div className="row">{FIRST_TASKS.map((t) => <button key={t.label} className="btn" type="button" onClick={() => { finish(); useTask(t.prompt); }}>{t.label}</button>)}</div>
        <h2>{S.keysTitle}</h2>
        <div className="line muted">{S.keysHelp}</div>
        {keyHints(keys).map((l, i) => <div className="line" key={i}>{l}</div>)}
        {talkSharedNote(keys) && <div className="line muted">{talkSharedNote(keys)}</div>}
      </>)}
      <div className="row">
        {back(step) && <button className="btn" type="button" onClick={() => go(back(step))}>{S.obBack}</button>}
        {step === "welcome" && <button className="btn primary" type="button" onClick={() => go(next(step))}>{S.obStart}</button>}
        {step !== "welcome" && step !== "first" && <button className="btn primary" type="button" disabled={!canContinue(step, ctx)} onClick={() => go(next(step))}>{S.obContinue}</button>}
        {step === "questions" && <button className="btn" type="button" onClick={() => { setAnswers(DEFAULT_ANSWERS); go("permissions"); }}>{S.obSkip}</button>}
        {step === "first" && <button className="btn primary" type="button" onClick={finish}>{S.obFinish}</button>}
      </div>
    </section>
  );
}
