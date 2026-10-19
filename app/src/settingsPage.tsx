// Settings (the registry, protocol/settings.json, T16): a search box, then every setting in its section, in the
// registry's order, each row with its usual value and Reset when it differs; Reset this section and Reset all settings
// to usual (each naming what changes first, then Undo for ten seconds); then the parts that are not settings (permissions, the key, practice, what
// Companion keeps with Delete everything, acknowledgements, logs). Every change goes to the shell through settingsStore.ts
// (settings_set), which checks it, keeps it, applies it and tells every window. Every word is in strings.ts. Keyboard and
// VoiceOver reach everything: each row is a named group, switches are role switch, choices a radio group with the arrows.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ConfirmStep } from "./confirm.tsx";
import { focusBack, focusIfLost, takeIfLost } from "./focus.ts";
import { keyChangedLine, keyRows, pickerLines, resetLine, talkCost, DELETE_PHRASE, deletableLines, keyStatus, numbersLines, type NumbersSummary, permissionLesson, permissionRow, REMOVE_KEY_PHRASE, spendingLine, submitKey, type Inventory, type PermissionKind, type PermissionState } from "./settings.ts";
import { VOICE_START, languageLabel, micDefaultLabel, micLine, noteSpeed, soundLine, speedLabel, voiceAsk, voiceLabel, voiceLine, voiceProblem, voiceSettingsFrom, type Sound, type VoiceSettings } from "./voicesettings.ts";
import { inspectProject, listMemory, metricsErase, metricsShow, NO_PROJECT, showSpending } from "./commands.ts";
import { addRule, afterPressShown, factsFrom, installNote, picturesGoing, proofLines, removeRule, ruleKindOptions, skipItems, startOptions, type CheckFacts } from "./checkRows.ts";
import type { PracticeKind, Spending } from "./model.ts";
import { canPick, choicesFrom, chordLabel, keyProblem, keysFrom, setKeysNow, type Choices, type Job, type Keys } from "./keys.ts";
import { useKeys } from "./useKeys.ts";
import { canInstall, found, updateLine, type UpdateState } from "./updates.ts";
import { S } from "./strings.ts";
import { invoke, listen } from "./tauri.ts";
import { defOf, validate, type Def, type RuleKind } from "../../protocol/settings.ts";
import { changedNow, changeSetting, notHeard, resetSetting, resetWithUndo, setting, snapshotNow, undoReset, usualOf, useSetting, type Done } from "./settingsStore.ts";
import { floorWords, numberFrom, problemWords, rowModel, searchSettings, wordsOf, type FixedGroup } from "./settingsRows.ts";

const send = (cmd: unknown) => invoke("send_command", { cmd });

// A settings group with a name: VoiceOver says which group it is in, and the keyboard is put back on the group when a
// control in it goes away (focus.ts).
function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <div role="group" aria-labelledby={id}><h3 id={id}>{title}</h3>{children}</div>;
}

/// The person's own key: replace it (same checks as the first run, the box emptied at once) or remove it (asked first).
function KeySection({ keySaved, working, onChanged }: { keySaved: boolean; working: boolean; onChanged: () => void }) {
  const [step, setStep] = useState<"idle" | "replace" | "confirmRemove" | "working">("idle");
  const [key, setKey] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const save = () => {
    const r = submitKey(key);
    setKey("");   // emptied at once, whatever happens next; nothing on the page keeps a copy
    if (!r.send) { setProblem(r.problem ?? ""); return; }
    setProblem(""); setStep("working");
    void invoke("save_api_key", { key: r.send }).then(() => { setNote(S.keySavedNote); setStep("idle"); onChanged(); }).catch((e) => { setProblem(String(e)); setStep("replace"); });
  };
  const remove = () => {
    setProblem(""); setStep("working");
    void invoke("remove_api_key", { confirm: REMOVE_KEY_PHRASE }).then(() => { setNote(S.keyRemovedNote); setStep("idle"); onChanged(); }).catch((e) => { setProblem(String(e)); setStep("confirmRemove"); });
  };
  const cancel = () => { setKey(""); setProblem(""); setStep("idle"); };
  const replaceId = useId(), removeId = useId();
  return (
    <Group title={S.keyTitle}>
      <div className="line">{keyStatus(keySaved)}</div>
      {note && <div className="line" role="status">{note}</div>}
      {step === "idle" && <div className="row">
        <button id={replaceId} className="btn" type="button" onClick={() => { setNote(""); setStep("replace"); }}>{keySaved ? S.keyReplace : S.keyAdd}</button>
        {keySaved && <button id={removeId} className="btn danger" type="button" disabled={working} onClick={() => { setNote(""); setStep("confirmRemove"); }}>{S.keyRemove}</button>}
      </div>}
      {step === "idle" && keySaved && working && <div className="line muted">{S.keyBusy}</div>}
      {step === "replace" && (<>
        <div className="line muted">{S.keyNewHelp}</div>
        <div className="row">
          <input type="password" autoComplete="off" spellCheck={false} ref={focusIfLost} value={key} aria-label={S.obKeyLabel} placeholder="sk-ant-..." onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(); if (e.key === "Escape") { e.stopPropagation(); cancel(); focusBack(replaceId); } }} />
          <button className="btn primary" type="button" onClick={save}>{S.keySaveNew}</button>
          <button className="btn" type="button" onClick={() => { cancel(); focusBack(replaceId); }}>{S.planCancel}</button>
        </div>
      </>)}
      {step === "confirmRemove" && (
        <ConfirmStep className="line" label={S.keyRemoveSure} back={removeId} onCancel={cancel}>
          <div className="line">{S.keyRemoveSure}</div>
          <div className="row">
            <button className="btn danger" type="button" disabled={working} onClick={remove}>{S.keyRemoveYes}</button>
            <button className="btn" type="button" data-cancel onClick={cancel}>{S.planCancel}</button>
          </div>
        </ConfirmStep>
      )}
      {problem && <div className="error" role="alert">{problem}</div>}
    </Group>
  );
}

// Keys to remember (M11 wave 4): every job with its keys, and Change for a short list of keys free on this Mac (the app
// tries each when Change is pressed, keymap::free). The app registers new keys at once and keeps them only if they work,
// saved on this Mac (keymap.rs); Reset puts every job back on its usual keys. Nothing here reads key presses: the person
// picks from the list. Hold to talk's other chords each say what they give up.
function KeysSection({ keys }: { keys: Keys }) {
  const [open, setOpen] = useState<Job | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Each row's Change button, so the keyboard can go back to it when the list closes (the button it was on is gone).
  const changeButtons = useRef<Partial<Record<Job, HTMLButtonElement | null>>>({});
  const openNow = useRef(open);
  openNow.current = open;
  // The row whose list just closed from inside it (a key picked, or its Cancel).
  const closedFrom = useRef<Job | null>(null);
  const close = (job: Job, changed: Keys | null) => {
    if (changed) setNote(keyChangedLine(job, changed));
    // A late answer, after another job's list was opened, neither closes that list nor moves the keyboard.
    if (openNow.current !== job) return;
    closedFrom.current = job;
    setOpen(null);
  };
  // The button the keyboard was on went with the list, so the keyboard goes back to the row's Change button, only by the
  // rule every move in Home follows (focus.ts takeIfLost: Home has the keyboard and nothing in it does). Never when the
  // person has gone on to another control, another app or a box.
  useLayoutEffect(() => { const job = closedFrom.current; closedFrom.current = null; if (job && open === null) takeIfLost(() => changeButtons.current[job]); }, [open]);
  const reset = () => {
    if (busy) return;
    setBusy(true); setNote(""); setOpen(null);
    void invoke("reset_keys").then((v) => { setKeysNow(keysFrom(v)); setNote(resetLine(v)); }).catch((e) => setNote(keyProblem(String(e)))).finally(() => setBusy(false));
  };
  return (<>
    <div className="line muted">{S.keysSettingsHelp}</div>
    {keyRows(keys).map((r) => (
      <div key={r.job}>
        <div className="row">
          <span className="line"><b>{r.name}:</b> {r.keys}</span>
          <button className="btn" type="button" ref={(b) => { changeButtons.current[r.job] = b; }} disabled={busy} aria-expanded={open === r.job} aria-label={S.keysChangeFor(r.name)} onClick={() => { setNote(""); setOpen(open === r.job ? null : r.job); }}>{S.keysChange}</button>
        </div>
        {r.line && <div className={r.problem ? "line" : "line muted"} role={r.problem ? "alert" : undefined}>{r.line}</div>}
        {open === r.job && <KeyPicker job={r.job} keys={keys} onDone={(changed) => close(r.job, changed)} />}
      </div>
    ))}
    <div className="row"><button className="btn" type="button" disabled={busy} onClick={reset}>{S.keysReset}</button></div>
    {note && <div className="line" role="status">{note}</div>}
  </>);
}

// One job's short list, asked of the app when Change is pressed. Only keys the app says are free on this Mac and that no
// other job has can be pressed (keys.ts canPick); the app counts the keys registered for the job as free, so the keys in
// use after a fall back can be pressed again to keep them.
function KeyPicker({ job, keys, onDone }: { job: Job; keys: Keys; onDone: (changed: Keys | null) => void }) {
  const [c, setC] = useState<Choices | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const load = () => { void invoke("key_choices", { action: job }).then((v) => { if (live.current) setC(choicesFrom(v, job)); }).catch((e) => { if (live.current) setProblem(keyProblem(String(e))); }); };
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, [job]);
  const pick = (id: string) => {
    if (busy) return;
    setBusy(true); setProblem("");
    void invoke("set_key", { action: job, id }).then((v) => { const k = keysFrom(v); setKeysNow(k); onDone(k); })
      .catch((e) => {
        const code = String(e);
        setProblem(keyProblem(code));
        // Another app took them since the list was asked for: ask again, so they show as taken.
        if (code === "taken") load();
      })
      .finally(() => setBusy(false));
  };
  return (<div>
    {!c && !problem && <div className="line muted" role="status">{S.keysChecking}</div>}
    {c && (<>
      <div className="row" role="group" aria-label={S.keysPickFor((S.keyJobs as Record<Job, string>)[job])}>
        {c.choices.map((id) => <button key={id} className={keys.using[job] === id ? "btn primary" : "btn"} type="button" disabled={busy || !canPick(c, id)} aria-pressed={keys.using[job] === id} aria-describedby={talkCost(id) ? `key-cost-${id}` : undefined} onClick={() => pick(id)}>{chordLabel(id)}</button>)}
        <button className="btn" type="button" onClick={() => onDone(null)}>{S.planCancel}</button>
      </div>
      {pickerLines(c, keys).map((l) => <div className="line muted" key={l}>{l}</div>)}
      {c.choices.map((id) => talkCost(id) && <div className="line muted" id={`key-cost-${id}`} key={id}>{talkCost(id)}</div>)}
    </>)}
    {problem && <div className="error" role="alert">{problem}</div>}
  </div>);
}

// Talking and listening (M11 wave 4, item 2): the microphone, the language, the voice and its speed (the registry's
// talk.voice; Speak to me and Answer out loud are its own rows now). The app lists the Mac's voices and microphones and keeps the choices on this Mac (voiceset.rs, voice.json); one
// that is away says so, and when the Mac's sound is off it says spoken lines are shown as words only. Read again whenever
// the card comes back to the front (headphones may have been switched on or off meanwhile).
function VoiceRows() {
  const [v, setV] = useState<VoiceSettings>(VOICE_START);
  const [problem, setProblem] = useState("");
  const [tried, setTried] = useState("");
  const load = () => void invoke("voice_settings").then((x) => setV(noteSpeed(voiceSettingsFrom(x)))).catch(() => {});
  useEffect(() => { load(); const f = () => load(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  // Put back by Reset or Undo (the registry's talk.voice): read the lists again.
  const saved = JSON.stringify(useSetting("talk.voice") ?? null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } load(); }, [saved]);
  const change = (c: Parameters<typeof voiceAsk>[1]) => { setProblem(""); setTried(""); void invoke("set_voice_settings", voiceAsk(v, c)).then((x) => setV(noteSpeed(voiceSettingsFrom(x)))).catch((e) => setProblem(voiceProblem(String(e)))); };
  const heard = (r: unknown) => { const o = (r ?? {}) as { said?: boolean; why?: string; sound?: Sound }; setTried(o.said === false && o.why === "sound" ? soundLine(o.sound ?? "muted") : o.said === false && o.why === "quiet" ? S.voiceQuietNow : ""); };
  return (<>
    <div className="line muted">{S.voiceSettingsHelp}</div>
    <div className="row">
      <select aria-label={S.micPickLabel} value={v.mic ?? ""} onChange={(e) => change({ mic: e.target.value || null })}>
        <option value="">{S.micPickLabel}: {micDefaultLabel(v)}</option>
        {v.mic && v.micMissing && <option value={v.mic}>{S.micPickLabel}: {S.notConnected(v.micMissing)}</option>}
        {v.inputs.map((i) => <option key={i.id} value={i.id}>{S.micPickLabel}: {i.name}</option>)}
      </select>
    </div>
    <div className="line muted">{S.micHelp}</div>
    {micLine(v) && <div className="line" role="status">{micLine(v)}</div>}
    <div className="row">
      <select aria-label={S.voiceLanguageLabel} value={v.language} onChange={(e) => change({ language: e.target.value })}>
        {v.languages.map((l) => <option key={l} value={l}>{S.voiceLanguageLabel}: {languageLabel(l)}</option>)}
      </select>
    </div>
    <div className="line muted">{S.voiceLanguageHelp}</div>
    <div className="line muted">{S.voiceWordsHelp}</div>
    <div className="row">
      <select aria-label={S.voicePickLabel} value={v.voice ?? ""} onChange={(e) => change({ voice: e.target.value || null })}>
        <option value="">{S.voicePickLabel}: {S.voiceMacDefault}</option>
        {v.voice && v.voiceMissing && <option value={v.voice}>{S.voicePickLabel}: {S.notOnThisMac(v.voiceMissing)}</option>}
        {v.voices.map((x) => <option key={x.id} value={x.id}>{S.voicePickLabel}: {voiceLabel(x)}</option>)}
      </select>
      <button className="btn" type="button" onClick={() => void invoke("speak", { text: S.voiceSample }).then(heard).catch(() => {})}>{S.voiceTry}</button>
    </div>
    {voiceLine(v) && <div className="line" role="status">{voiceLine(v)}</div>}
    <div className="line muted">{S.voiceMoreHelp}</div>
    <div className="row" role="group" aria-label={S.voiceSpeedGroup}>
      {v.speeds.map((n) => <button key={n} className={v.speed === n ? "btn primary" : "btn"} type="button" aria-pressed={v.speed === n} onClick={() => change({ speed: n })}>{speedLabel(n)}</button>)}
    </div>
    {soundLine(v.sound) && <div className="line" role="status">{soundLine(v.sound)}</div>}
    {tried && tried !== soundLine(v.sound) && <div className="line" role="status">{tried}</div>}
    {problem && <div className="error" role="alert">{problem}</div>}
  </>);
}

// ---------- one row per setting ----------

/** A number, typed or stepped with minus and plus. Kept only when Return is pressed or the box is left, and only when it
 *  passes the setting's rules (then put on its step); otherwise the plain reason shows and nothing is sent. */
function NumberControl({ d, value, labelId, disabled, onChange, onProblem, inputId }: { d: Def; value: number; labelId: string; disabled: boolean; onChange: (v: number) => void; onProblem: (p: string) => void; inputId?: string }) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(String(value)); }, [value]);
  const label = wordsOf(d.key).label;
  const commit = (n: number | null) => {
    editing.current = false;
    if (n === null) { onProblem(problemWords("notNumber", d)); return; }
    const c = validate(d, n);
    if (!c.ok) { onProblem(problemWords(c.reason, d)); return; }
    onProblem("");
    setText(String(c.value));
    if (c.value !== value) onChange(c.value as number);
  };
  const step = (dir: 1 | -1) => commit(Math.min(d.max ?? value, Math.max(d.min ?? value, value + dir * (d.step ?? 1))));
  return (
    <span className="row">
      <button className="btn" type="button" disabled={disabled || value <= (d.min ?? -Infinity)} aria-label={S.setLess(label)} onClick={() => step(-1)}>-</button>
      <input id={inputId} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} size={6} value={text} disabled={disabled} aria-labelledby={labelId}
        onChange={(e) => { editing.current = true; setText(e.target.value); }}
        onBlur={() => { if (editing.current) commit(numberFrom(text)); }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(numberFrom(text)); } }} />
      <button className="btn" type="button" disabled={disabled || value >= (d.max ?? Infinity)} aria-label={S.setMore(label)} onClick={() => step(1)}>+</button>
    </span>
  );
}

/** One line of text, kept on Return or when the box is left, only when it passes the rules. */
function TextControl({ d, value, labelId, disabled, onChange, onProblem }: { d: Def; value: string; labelId: string; disabled: boolean; onChange: (v: string) => void; onProblem: (p: string) => void }) {
  const [text, setText] = useState(value);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(value); }, [value]);
  const commit = () => {
    editing.current = false;
    const c = validate(d, text);
    if (!c.ok) { onProblem(problemWords(c.reason, d)); return; }
    onProblem("");
    if (c.value !== value) onChange(c.value as string);
  };
  return <input type="text" autoComplete="off" value={text} maxLength={d.maxLength} disabled={disabled} aria-labelledby={labelId}
    onChange={(e) => { editing.current = true; setText(e.target.value); }} onBlur={() => { if (editing.current) commit(); }}
    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); } }} />;
}

/** A list: each item with Remove (asked first when the list holds protections), and an Add box. */
function ListControl({ d, value, disabled, onChange, onProblem }: { d: Def; value: string[]; disabled: boolean; onChange: (v: string[]) => void; onProblem: (p: string) => void }) {
  const [adding, setAdding] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const label = wordsOf(d.key).label;
  const baseId = useId();
  const add = () => {
    const c = validate(d, [...value, adding]);
    if (!c.ok) { onProblem(problemWords(c.reason, d)); return; }
    onProblem(""); setAdding(""); onChange(c.value as string[]);
  };
  const remove = (item: string) => { setAsking(null); onChange(value.filter((x) => x !== item)); };
  return (<div>
    {value.map((item, i) => (
      <div className="row" key={item}>
        <span className="line">{item}</span>
        {asking !== item && <button id={`${baseId}-${i}`} className="btn" type="button" disabled={disabled} aria-label={S.setRemoveItem(item)} onClick={() => (d.protective ? setAsking(item) : remove(item))}>{S.attachRemoveShort}</button>}
        {asking === item && (
          <ConfirmStep className="line" label={S.setRemoveSure(item)} back={`${baseId}-${i}`} onCancel={() => setAsking(null)}>
            <div className="line">{S.setRemoveSure(item)}</div>
            <div className="row"><button className="btn danger" type="button" onClick={() => remove(item)}>{S.setRemoveYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsking(null)}>{S.planCancel}</button></div>
          </ConfirmStep>
        )}
      </div>
    ))}
    <div className="row">
      <input type="text" autoComplete="off" value={adding} maxLength={d.item?.maxLength} disabled={disabled || value.length >= (d.maxItems ?? 0)} aria-label={S.setAddLabel(label)} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
      <button className="btn" type="button" disabled={disabled || !adding.trim() || value.length >= (d.maxItems ?? 0)} onClick={add}>{S.setAdd}</button>
    </div>
  </div>);
}

/** A choice of up to four as a radio group (the arrows move and pick, as macOS does), more as a menu. */
function ChoiceControl({ value, options, labelId, disabled, onChange }: { value: string; options: { id: string; label: string }[]; labelId: string; disabled: boolean; onChange: (v: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  if (options.length > 4) {
    return <select aria-labelledby={labelId} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
  }
  const at = Math.max(0, options.findIndex((o) => o.id === value));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let to: number | null = e.key in move ? (at + move[e.key] + options.length) % options.length : e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : null;
    if (to === null || disabled) return;
    e.preventDefault();
    onChange(options[to].id);
    box.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[to]?.focus();
  };
  return (
    <div className="row" role="radiogroup" aria-labelledby={labelId} ref={box} onKeyDown={onKeyDown}>
      {options.map((o, i) => <button key={o.id} className={i === at ? "btn primary" : "btn"} type="button" role="radio" aria-checked={o.id === value} tabIndex={i === at ? 0 : -1} disabled={disabled} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

/** Checks to leave out (check.skip): one switch for each check this project has. The start and browser checks are never in
 *  the list: they always run (the row's fixed part says so). */
function SkipControl({ d, value, facts, disabled, onChange }: { d: Def; value: string[]; facts: CheckFacts | null; disabled: boolean; onChange: (v: string[]) => void }) {
  const items = skipItems(facts, value);
  const words = wordsOf(d.key).options ?? {};
  if (!items.length) return <div className="line muted">{S.chkNoChecks}</div>;
  return (<div>
    {items.map((item) => {
      const out = value.includes(item);
      return (
        <div className="row" key={item}>
          <span className="line">{words[item] ?? item}</span>
          <button className="btn" type="button" role="switch" aria-checked={out} aria-label={S.chkLeaveOut(words[item] ?? item)} disabled={disabled} onClick={() => onChange(out ? value.filter((x) => x !== item) : [...value, item])}>{out ? S.chkLeftOut : S.chkRun}</button>
        </div>
      );
    })}
  </div>);
}

/** House rules (rules.house): the project's own .companion/rules.txt. Rules are built from the five kinds, taken off only
 *  after an inline confirm, and nothing is written until Save; the shell keeps every line of the file it does not
 *  understand exactly as it was. No reset ever touches them. Drawn once per project (keyed by it), so a list not saved yet
 *  goes when the folder changes, and Save says which project's list it is: the shell refuses it for any other. */
function HouseRules({ project, saved, disabled }: { project: string; saved: string[]; disabled: boolean }) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [kind, setKind] = useState<RuleKind>("never_edit");
  const [what, setWhat] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [focusTo, setFocusTo] = useState<string | null>(null);
  const baseId = useId(), whatId = useId(), addId = useId();
  const list = draft ?? saved;
  const removeId = (i: number) => `${baseId}-${i}`;
  // A rule taken off, or the list saved or put back, takes its button away: the keyboard goes to the next rule's Remove (or
  // the one before), else to the Add box, and only when it was lost (focus.ts).
  useLayoutEffect(() => { if (!focusTo) return; const id = focusTo; setFocusTo(null); takeIfLost(() => document.getElementById(id)); }, [focusTo]);
  const add = () => { setNote(""); const r = addRule(list, kind, what); if (!r.ok) { setProblem(r.problem); return; } setProblem(""); setWhat(""); setDraft(r.list); };
  const remove = (rule: string) => { const at = list.indexOf(rule), rest = removeRule(list, rule); setFocusTo(rest.length ? removeId(Math.min(at, rest.length - 1)) : addId); setAsking(null); setNote(""); setDraft(rest); };
  const save = () => { setProblem(""); void changeSetting("rules.house", list, project).then((x) => { if (x.ok) { setDraft(null); setNote(S.rulesSaved); setFocusTo(addId); } else setProblem(problemWords(x.code, defOf("rules.house"))); }); };
  const putBack = () => { setDraft(null); setProblem(""); setFocusTo(addId); };
  // One polite region, always there, whose words change: VoiceOver reads a region that changes, not always one that appears.
  const said = draft ? S.rulesUnsaved : note;
  return (<div>
    {list.length === 0 && <div className="line muted">{S.rulesNone}</div>}
    {list.map((rule, i) => (
      <div className="row" key={rule}>
        <span className="line">{rule}</span>
        {asking !== rule && <button id={removeId(i)} className="btn" type="button" disabled={disabled} aria-label={S.setRemoveItem(rule)} onClick={() => setAsking(rule)}>{S.attachRemoveShort}</button>}
        {asking === rule && (
          <ConfirmStep className="line" label={S.rulesRemoveSure(rule)} back={removeId(i)} onCancel={() => setAsking(null)}>
            <div className="line">{S.rulesRemoveSure(rule)}</div>
            <div className="row"><button className="btn danger" type="button" onClick={() => remove(rule)}>{S.setRemoveYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsking(null)}>{S.planCancel}</button></div>
          </ConfirmStep>
        )}
      </div>
    ))}
    <div className="row">
      <select id={addId} aria-label={S.rulesKindLabel} value={kind} disabled={disabled} onChange={(e) => setKind(e.target.value as RuleKind)}>{ruleKindOptions().map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      {kind !== "ask_install" && <input id={whatId} type="text" autoComplete="off" spellCheck={false} value={what} maxLength={200} disabled={disabled} aria-label={S.rulesWhat} placeholder={S.rulesWhat} onChange={(e) => setWhat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />}
      <button className="btn" type="button" disabled={disabled} onClick={add}>{S.rulesAdd}</button>
    </div>
    <div className={said ? "line" : "sr"} role="status">{said}</div>
    {draft && <div className="row"><button className="btn primary" type="button" disabled={disabled} onClick={save}>{S.rulesSave}</button><button className="btn" type="button" onClick={putBack}>{S.rulesCancel}</button></div>}
    <div className="line muted">{S.rulesKept}</div>
    {problem && <div className="error" role="alert">{problem}</div>}
  </div>);
}

/** Pictures to keep (pictures.keep): lowering it below the pictures kept now says first how many will go. */
function PicturesKeep({ d, value, count, labelId, disabled, onChange, onProblem }: { d: Def; value: number; count: number | undefined; labelId: string; disabled: boolean; onChange: (v: number) => void; onProblem: (p: string) => void }) {
  const [pending, setPending] = useState<{ to: number; go: number } | null>(null);
  const [fresh, setFresh] = useState(0);   // shows the kept value again when the change is not confirmed
  // The keyboard comes back to the number box when the question closes: it is the same box after it is drawn again.
  const inputId = useId();
  const want = (to: number) => { const go = picturesGoing(count, value, to); if (go > 0) setPending({ to, go }); else onChange(to); };
  return (<span>
    <NumberControl key={fresh} inputId={inputId} d={d} value={value} labelId={labelId} disabled={disabled} onChange={want} onProblem={onProblem} />
    {pending && (
      <ConfirmStep className="line" label={S.chkPicturesGo(pending.go, pending.to)} back={inputId} onCancel={() => { setPending(null); setFresh((n) => n + 1); }}>
        <div className="line">{S.chkPicturesGo(pending.go, pending.to)}</div>
        <div className="row"><button className="btn danger" type="button" onClick={() => { const to = pending.to; setPending(null); onChange(to); }}>{S.chkPicturesGoYes}</button><button className="btn" type="button" data-cancel onClick={() => { setPending(null); setFresh((n) => n + 1); }}>{S.planCancel}</button></div>
      </ConfirmStep>
    )}
  </span>);
}

/** One setting: its name, its control, one or two lines of help, the usual value, Reset when it differs, when it takes
 *  effect, the fixed part, and for a project setting which project. */
function SettingRow({ d, project, keys, facts, pictures }: { d: Def; project: string; keys: Keys; facts: CheckFacts | null; pictures: number | undefined }) {
  useSetting(d.key);
  const value = d.kind === "custom" ? snapshotNow()?.values[d.key] : setting(d.key);
  const usual = usualOf(d.key);
  const r = rowModel(d, value, usual, project);
  const labelId = useId(), helpId = useId();
  const [problem, setProblem] = useState("");
  const done = (p: Promise<{ ok: boolean; code?: string }>) => void p.then((x) => { if (!x.ok) setProblem(problemWords(x.code ?? "other", d)); });
  // A project's setting says which project the page was shown it for; the shell refuses it for any other.
  const shownFor = snapshotNow()?.project ?? project;
  const change = (v: unknown) => { setProblem(""); done(changeSetting(d.key, v, d.scope === "project" && shownFor ? shownFor : undefined)); };
  const reset = () => { setProblem(""); done(resetSetting(d.key)); };
  // Checking your project: the project's own .claude/proof.json or .claude/launch.json wins, and the row shows that, read
  // only; the words after pressing need a button to press; a house rule can make installing ask first.
  const facts_ = facts && facts.project === project ? facts : null;
  const fromFile = proofLines(d.key, facts_);
  const launchWins = d.key === "check.start" && !!facts_?.launchFile;
  const pressNow = useSetting("check.press");
  const rulesNow = useSetting("rules.house");
  const rulesBlocked = (snapshotNow()?.problems ?? []).some((p) => p.key === "rules.house");
  if (d.key === "check.afterPress" && !afterPressShown(pressNow, facts_)) return null;
  const off = r.disabled || fromFile.length > 0 || launchWins;
  const notes = [...fromFile, ...(launchWins ? [S.chkLaunchFile] : []), ...(d.key === "check.install" ? [installNote(value, rulesNow)].filter((x): x is string => !!x) : [])];
  const control = (() => {
    if (d.key === "rules.house") return null;
    if (d.key === "check.skip") return null;
    if (d.key === "check.start") return <ChoiceControl value={String(value)} options={startOptions(value, facts_)} labelId={labelId} disabled={off} onChange={change} />;
    if (d.key === "pictures.keep") return <PicturesKeep d={d} value={typeof value === "number" ? value : (d.default as number)} count={pictures} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} />;
    switch (d.kind) {
      case "switch": return <button className="btn" type="button" role="switch" aria-checked={value === true} aria-labelledby={labelId} aria-describedby={helpId} disabled={off} onClick={() => change(value !== true)}>{r.shown}</button>;
      case "choice": return <ChoiceControl value={String(value)} options={r.options ?? []} labelId={labelId} disabled={off} onChange={change} />;
      case "number": return <NumberControl d={d} value={typeof value === "number" ? value : (d.default as number)} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} />;
      case "text": return <TextControl d={d} value={typeof value === "string" ? value : ""} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} />;
      case "list": return <ListControl d={d} value={Array.isArray(value) ? (value as string[]) : []} disabled={off} onChange={change} onProblem={setProblem} />;
      default: return null;
    }
  })();
  // The keys and the voice keep their own editors; the keys' editor has its own Reset to the usual keys.
  const editor = d.key === "keys.hotkeys" ? <KeysSection keys={keys} /> : d.key === "talk.voice" ? <VoiceRows /> : d.key === "rules.house" ? <HouseRules key={shownFor} project={shownFor} saved={Array.isArray(value) ? (value as string[]) : []} disabled={r.disabled || rulesBlocked} />
    : d.key === "check.skip" ? <SkipControl d={d} value={Array.isArray(value) ? (value as string[]) : []} facts={facts_} disabled={off} onChange={change} /> : null;
  return (
    <div role="group" aria-labelledby={labelId} className="setting">
      <div className="row"><span className="line" id={labelId}><b>{r.label}</b></span>{control}</div>
      <div className="line muted" id={helpId}>{r.help}</div>
      {editor}
      {notes.map((n) => <div className="line muted" key={n}>{n}</div>)}
      {r.projectLine && <div className="line muted">{r.projectLine}</div>}
      <div className="row">
        <span className="line muted">{r.usualLine}</span>
        {r.canReset && d.key !== "keys.hotkeys" && <button className="btn" type="button" aria-label={r.resetLabel} onClick={reset}>{S.setReset}</button>}
      </div>
      {r.later && <div className="line muted">{S.setNextTask}</div>}
      {r.floor && <div className="line muted">{floorWords(r.floor)}</div>}
      {problem && <div className="error" role="alert">{problem}</div>}
    </div>
  );
}

const names = (keys: string[]) => keys.map((k) => wordsOf(k).label).join(", ");

/** After Reset this section or Reset all: a line saying what happened, and Undo for ten seconds, which puts back the
 *  values kept just before the reset (exactly what the shell reset, settingsStore.ts undoValues) through the shell. */
function useUndoToast() {
  const [toast, setToast] = useState<{ text: string; back: [string, unknown][] | null } | null>(null);
  useEffect(() => { if (!toast?.back) return; const t = setTimeout(() => setToast((x) => (x && x.back ? { ...x, back: null } : x)), 10_000); return () => clearTimeout(t); }, [toast?.back]);
  const show = (done: Done, back: [string, unknown][]) => setToast(done.ok ? { text: done.notReset?.length ? S.setNotAllBack : S.setResetDone(back.length), back } : { text: problemWords(done.code), back: null });
  const undo = (back: [string, unknown][]) => { setToast(null); void undoReset(back).then((failed) => setToast({ text: failed.length ? S.setNotAllBack : S.setUndone, back: null })); };
  const view = toast && <div className="row" role="status"><span className="line">{toast.text}</span>{toast.back && toast.back.length > 0 && <button className="btn" type="button" onClick={() => undo(toast.back!)}>{S.setUndo}</button>}</div>;
  return { show, view };
}

/** A section: its title, its rows (or the ones a search found), what else belongs there, and Reset this section, which
 *  asks first and names what will change, then offers Undo. Protective settings are never in it. */
function SettingsSection({ id, title, keys, project, allKeys, extra, facts, pictures }: { id: string; title: string; keys: string[]; project: string; allKeys: Keys; extra?: ReactNode; facts: CheckFacts | null; pictures: number | undefined }) {
  useSetting(keys[0] ?? "");
  const headId = useId(), resetId = useId();
  const [asking, setAsking] = useState(false);
  const toast = useUndoToast();
  const changed = changedNow(id);
  const unheard = notHeard(id);
  const yes = () => { setAsking(false); void resetWithUndo(id).then(({ done, back }) => toast.show(done, back)); };
  return (
    <section aria-labelledby={headId} className="settings-section">
      <h3 id={headId}>{title}</h3>
      {keys.map((k) => { const d = defOf(k); return d ? <SettingRow key={k} d={d} project={project} keys={allKeys} facts={facts} pictures={pictures} /> : null; })}
      {extra}
      {changed.length > 0 && !asking && <div className="row"><button id={resetId} className="btn" type="button" onClick={() => setAsking(true)}>{S.setResetSection}</button></div>}
      {asking && (
        <ConfirmStep className="line" label={S.setResetSection} back={resetId} onCancel={() => setAsking(false)}>
          <div className="line">{S.setResetSectionSure(names(changed))}</div>
          {unheard.length > 0 && <div className="line muted">{S.setNotHeard(names(unheard))}</div>}
          <div className="row"><button className="btn" type="button" onClick={yes}>{S.setResetSectionYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsking(false)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {toast.view}
    </section>
  );
}

export function SettingsPage({ working, project, spending, onClose, onPractice, onLesson }: { working: boolean; project: string; spending: Spending | null; onClose: () => void; onPractice: (kind?: PracticeKind) => void; onLesson: (lesson: string) => void }) {
  useSetting("fun.reactions");   // any change in any window draws the page again
  const [q, setQ] = useState("");
  const results = searchSettings(q);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [perms, setPerms] = useState<Record<PermissionKind, PermissionState> | null>(null);
  const [step, setStep] = useState<"idle" | "confirm" | "deleting">("idle");
  const [withProjects, setWithProjects] = useState(false);
  const [problem, setProblem] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState("");
  // The keys every job uses now, asked again each time Settings opens.
  const keys = useKeys();
  // Asked again whenever the keys kept change (a change here, Reset this section, Reset all, Undo).
  const keysKept = JSON.stringify(useSetting("keys.hotkeys") ?? null);
  useEffect(() => { void invoke("key_map").then((v) => setKeysNow(keysFrom(v))).catch(() => {}); }, [keysKept]);
  // The engine's own settings (the daily limit, Explain, pausing, beta numbers) for every project: asked for the project in
  // use, or the stand in when no folder is chosen. Their answers come back as the engine's events (settingsStore.ts).
  useEffect(() => { const p = project || NO_PROJECT; void send(showSpending(p)); void send(listMemory(p)); void send(metricsShow()); }, [project]);
  // What the rows for checking this project need to know (its scripts, its checks, its own .claude files): the engine's
  // project report, asked for again each time Settings opens, so an edited package.json shows.
  const [facts, setFacts] = useState<CheckFacts | null>(null);
  useEffect(() => {
    setFacts(null);
    if (project) void send(inspectProject(project));
    const off = listen("runner-event", (e) => { const f = factsFrom(e.payload); if (f && f.project === project) setFacts(f); });
    return () => { off.then((f) => f()); };
  }, [project]);
  const [up, setUp] = useState<UpdateState>(found.update ?? { stage: "idle" });
  const [upInfo, setUpInfo] = useState<{ configured: boolean; version: string }>({ configured: false, version: "" });
  useEffect(() => { void invoke("update_status").then((v) => setUpInfo(v as { configured: boolean; version: string })).catch(() => {}); }, []);
  const checkNow = () => {
    setUp({ stage: "checking" });
    void invoke("check_update").then((v) => {
      try { localStorage.setItem("companion.updateChecked", String(Date.now())); } catch { /* storage may be unavailable */ }
      const r = v as { available: boolean; version?: string; notes?: string };
      found.update = r.available ? { stage: "found", version: r.version ?? "", notes: r.notes ?? "" } : null;
      setUp(found.update ?? { stage: "none" });
    }).catch((e) => setUp({ stage: "failed", reason: String(e) }));
  };
  const installNow = () => { if (!canInstall(working)) return; setUp({ stage: "installing" }); found.update = null; void invoke("install_update").catch((e) => setUp({ stage: "failed", reason: String(e) })); };
  const [nums, setNums] = useState<NumbersSummary | null>(null);
  const [showNums, setShowNums] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const off = listen("runner-event", (e) => { const ev = e.payload as { type?: string } & Partial<NumbersSummary>; if (ev.type === "metrics.summary") setNums({ enabled: !!ev.enabled, totals: ev.totals ?? {}, rates: ev.rates ?? {} }); });
    return () => { off.then((f) => f()); };
  }, []);
  const load = () => { void invoke("data_inventory").then((v) => setInv(v as Inventory)); void invoke("permission_overview").then((v) => setPerms(v as Record<PermissionKind, PermissionState>)); };
  useEffect(load, []);
  // The permission page is where the person changes things; coming back should show the new state.
  useEffect(() => { const f = () => load(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  const busy = useRef(false);   // a second click while macOS is asking must not start a second delete
  const deleteId = useId(), resetAllId = useId();
  const remove = () => {
    if (busy.current) return;
    busy.current = true; setStep("deleting"); setProblem("");
    void invoke("delete_everything", { confirm: DELETE_PHRASE, withProjects }).catch((e) => { busy.current = false; setProblem(String(e)); setStep("confirm"); });
  };
  // Reset all settings to usual, asked first, naming every setting that changes; then Undo for ten seconds puts every
  // value back through the shell.
  const [askAll, setAskAll] = useState(false);
  const allToast = useUndoToast();
  const changedAll = changedNow();
  const unheardAll = notHeard();
  const resetEverything = () => { setAskAll(false); void resetWithUndo().then(({ done, back }) => allToast.show(done, back)); };
  const problems = (snapshotNow()?.problems ?? []).map((p) => (p.code === "damaged" ? S.setDamaged : p.code === "unreadable" ? S.setUnreadable : p.code === "rulesUnreadable" ? S.setRulesUnreadable : p.key ? S.setBadValue(wordsOf(p.key).label) : "")).filter(Boolean);
  const fixedShown = (g: FixedGroup) => results.fixed.includes(g);
  const extras: Record<string, ReactNode> = {
    home: <div className="line muted">{S.dragHint}</div>,
    spending: (<>
      {project
        ? (spending && spending.project === project ? <div className="line" role="status">{spendingLine(spending)}</div> : null)
        : <div className="line muted">{S.setSpendingNoProject}</div>}
      {/* Why the engine did not keep a new limit (the limit shown is the one still in force). */}
      {spending?.problem && spending.project === (project || NO_PROJECT) && <div className="error" role="alert">{spending.problem}</div>}
    </>),
    updates: (<>
      <div className="line muted">{S.updatesHelp}</div>
      <div className="line" role="status">{updateLine(up, upInfo.version, upInfo.configured)}</div>
      {up.stage === "found" && up.notes && <div className="line muted">{up.notes}</div>}
      {upInfo.configured && <div className="row">
        <button className="btn" type="button" disabled={up.stage === "checking" || up.stage === "installing"} onClick={checkNow}>{S.updatesCheck}</button>
        {up.stage === "found" && <button className="btn primary" type="button" disabled={!canInstall(working)} onClick={installNow}>{S.updatesInstall}</button>}
      </div>}
      {up.stage === "found" && !canInstall(working) && <div className="line muted">{S.updatesBusy}</div>}
    </>),
    numbers: (<>
      <div className="row">
        <button className="btn" type="button" onClick={() => { setShowNums((v) => !v); void send(metricsShow()); }}>{S.numbersShow}</button>
        {nums && showNums && <button className="btn" type="button" onClick={() => { setCopied(false); void (navigator.clipboard?.writeText(numbersLines(nums).join("\n")) ?? Promise.reject(new Error("no clipboard"))).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {}); }}>{copied ? S.numbersCopied : S.numbersCopy}</button>}
        <button className="btn" type="button" onClick={() => { setShowNums(false); void send(metricsErase()); }}>{S.numbersErase}</button>
      </div>
      {nums && showNums && numbersLines(nums).map((l, i) => <div className="line" key={i}>{l}</div>)}
    </>),
  };
  return (
    <section className="panel" aria-label={S.settingsTitle}>
      <h2>{S.settingsTitle}</h2>
      <div className="row" role="search">
        <input type="search" autoComplete="off" spellCheck={false} value={q} placeholder={S.setSearch} aria-label={S.setSearch}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && !e.nativeEvent.isComposing && q) { e.preventDefault(); e.stopPropagation(); setQ(""); } }} />
        {q && <button className="btn" type="button" onClick={() => setQ("")}>{S.setSearchClear}</button>}
      </div>
      <div className={q ? "line muted" : "sr"} role="status" aria-live="polite">{q ? (results.count ? S.setMatches(results.count) : S.setNoMatch) : ""}</div>
      {problems.map((p, i) => <div className="line blocked" key={i}>{p}</div>)}
      {results.sections.map((s) => <SettingsSection key={s.id} id={s.id} title={s.title} keys={s.keys} project={project} allKeys={keys} extra={extras[s.id]} facts={facts} pictures={inv?.receiptPictures} />)}
      {fixedShown("permissions") && <Group title={S.settingsPermissions}>
      <div className="line muted">{S.settingsPermissionsHelp}</div>
      {perms && (["screen_recording", "accessibility", "microphone"] as PermissionKind[]).map((k) => {
        const r = permissionRow(k, perms[k]);
        return (
          <div className="line" key={k}>
            <b>{r.label}:</b> {r.state}.{r.todo ? ` ${r.todo}` : ""} <span className="muted">{r.why}</span>
            {r.button && <> <button className="btn" type="button" onClick={() => void invoke("open_permission_page", { which: k })}>{S.settingsOpenSystem}</button> <button className="btn" type="button" onClick={() => onLesson(permissionLesson(k))}>{S.settingsWalkMe}</button></>}
          </div>
        );
      })}
      </Group>}
      {fixedShown("key") && inv && <KeySection keySaved={inv.keySaved} working={working} onChanged={load} />}
      {fixedShown("practice") && <Group title={S.fixedGroups.practice.title}>
      <div className="row"><button className="btn" type="button" onClick={() => onPractice("signup")}>{S.practiceAgainFromSettings}</button> <button className="btn" type="button" onClick={() => onPractice("setting")}>{S.practiceSettingFromSettings}</button></div>
      </Group>}
      {fixedShown("kept") && <Group title={S.settingsKept}>
      {inv && inv.items.length === 0 && !inv.keySaved && <div className="line muted">{S.settingsNothingKept}</div>}
      {inv && deletableLines(inv).map((l, i) => <div className="line" key={i}>{l}</div>)}
      {step === "idle" && <div className="row"><button id={deleteId} className="btn danger" type="button" onClick={() => setStep("confirm")}>{S.deleteEverything}</button></div>}
      {step !== "idle" && (
        <ConfirmStep className="line" label={S.deleteSure} back={deleteId} onCancel={() => { if (step !== "deleting") setStep("idle"); }}>
          <b>{S.deleteSure}</b>
          <div className="line">{S.deleteExplain}</div>
          {inv && inv.projectsWithNotes > 0 && <label className="check"><input type="checkbox" checked={withProjects} onChange={(e) => setWithProjects(e.target.checked)} /> {S.deleteProjects.replace("{n}", String(inv.projectsWithNotes))}</label>}
          <div className="row">
            <button className="btn danger" type="button" disabled={step === "deleting"} onClick={remove}>{step === "deleting" ? S.deleting : S.deleteYes}</button>
            <button className="btn" type="button" data-cancel disabled={step === "deleting"} onClick={() => setStep("idle")}>{S.planCancel}</button>
          </div>
          {problem && <div className="error" role="alert">{problem}</div>}
        </ConfirmStep>
      )}
      </Group>}
      {fixedShown("acknowledgements") && <Group title={S.acknowledgements}>
      <div className="line muted">{S.acknowledgementsHelp}</div>
      <div className="row"><button className="btn" type="button" onClick={() => void invoke("open_acknowledgements").catch(() => {})}>{S.acknowledgements}</button></div>
      </Group>}
      {fixedShown("logs") && <Group title={S.exportLogsTitle}>
      <div className="line muted">{S.exportLogsHelp}</div>
      <div className="row"><button className="btn" type="button" disabled={exporting} onClick={() => { setExporting(true); setExported(""); void invoke("export_logs").then((n) => setExported(S.exportLogsDone.replace("{name}", String(n)))).catch((e) => setExported(String(e))).finally(() => setExporting(false)); }}>{S.exportLogs}</button></div>
      <div className="line muted">{S.reportHelp}</div>
      <div className="row"><button className="btn" type="button" disabled={exporting} onClick={() => { setExporting(true); setExported(""); void invoke("report_problem", { subject: S.reportSubject, body: S.reportBody }).then((n) => setExported(S.reportOpened(String(n)))).catch((e) => setExported(String(e))).finally(() => setExporting(false)); }}>{S.reportButton}</button></div>
      {exported && <div className="line" role="status">{exported}</div>}
      </Group>}
      {results.all && !askAll && <div className="row"><button id={resetAllId} className="btn" type="button" disabled={changedAll.length === 0} onClick={() => setAskAll(true)}>{S.setResetAll}</button></div>}
      {results.all && changedAll.length === 0 && <div className="line muted">{S.setResetAllNone}</div>}
      {askAll && (
        <ConfirmStep className="line" label={S.setResetAll} back={resetAllId} onCancel={() => setAskAll(false)}>
          <div className="line">{S.setResetAllSure(names(changedAll))}</div>
          {unheardAll.length > 0 && <div className="line muted">{S.setNotHeard(names(unheardAll))}</div>}
          <div className="row"><button className="btn danger" type="button" onClick={resetEverything}>{S.setResetAllYes}</button><button className="btn" type="button" data-cancel onClick={() => setAskAll(false)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {allToast.view}
      <div className="row"><button className="btn" type="button" onClick={onClose}>{S.onlineClose}</button></div>
    </section>
  );
}
