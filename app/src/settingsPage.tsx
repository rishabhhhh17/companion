// Settings (the registry, protocol/settings.json, T16): a search box, then every setting in its section, in the
// registry's order, each row with its usual value and Reset when it differs; Reset this section and Reset all settings
// to usual (each naming what changes first, then Undo for ten seconds); then the parts that are not settings (permissions, the key, practice, the folders made for you, what
// Companion keeps with Delete everything, acknowledgements, logs). Every change goes to the shell through settingsStore.ts
// (settings_set), which checks it, keeps it, applies it and tells every window. Every word is in strings.ts. Keyboard and
// VoiceOver reach everything: each row is a named group, switches are role switch, choices a radio group with the arrows.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { HomeCharacter } from "./homeCharacter.tsx";
import { Waterline } from "./waterline.tsx";
import { characterName } from "./companion.ts";
import { showFirstRunAgain } from "./firstRunAgain.ts";
import { livelyOf, livelySettings, waterOf, WATERS, WATER_TINTS } from "./lookfeel.ts";
import { ConfirmStep } from "./confirm.tsx";
import { focusBack, focusIfLost, takeIfLost } from "./focus.ts";
import { keyChangedLine, keyRows, pickerLines, resetLine, talkCost, DELETE_PHRASE, deletableLines, keyStatus, numbersLines, type NumbersSummary, permissionLesson, permissionRow, REMOVE_KEY_PHRASE, spendingLine, submitKey, type Inventory, type PermissionKind, type PermissionState } from "./settings.ts";
import { VOICE_START, languageLabel, micDefaultLabel, micLine, noteSpeed, soundLine, speedLabel, voiceAsk, voiceLabel, voiceLine, voiceProblem, voiceSettingsFrom, type Sound, type VoiceSettings } from "./voicesettings.ts";
import { inspectProject, listMemory, metricsErase, metricsShow, NO_PROJECT, showSpending } from "./commands.ts";
import { addRule, afterPressShown, factsFrom, installNote, picturesGoing, picturesResetGoing, proofLines, removeRule, ruleKindOptions, skipItems, startOptions, type CheckFacts } from "./checkRows.ts";
import type { Spending } from "./model.ts";
import { CUSTOM_KEYS, canPick, choicesFrom, chordLabel, customChord, keyProblem, keysFrom, setKeysNow, type Choices, type Job, type Keys, type Ticked } from "./keys.ts";
import { useKeys } from "./useKeys.ts";
import { afterInstallFailed, canInstall, found, updateLine, type UpdateState } from "./updates.ts";
import { S } from "./strings.ts";
import { failNote } from "./failwords.ts";
import { invoke, listen } from "./tauri.ts";
import { levelSections } from "./settingsLevel.ts";
import { FIRST_PAGE, PAGES, isPage, type PageId } from "./settingsPages.ts";
import { defOf, defaultOf, validate, type Def, type RuleKind } from "../../protocol/settings.ts";
import { changedNow, changeSetting, notHeard, resetSetting, resetWithUndo, setting, snapshotNow, undoReset, usualOf, useSetting, type Done } from "./settingsStore.ts";
import { floorWords, homeSizeHint, numberFrom, PLACE_KEYS, problemWords, rowModel, searchSettings, shownNow, wordsOf, type FixedGroup } from "./settingsRows.ts";
import { offeredOptions, shownSettings } from "./modelChoice.ts";
import { GroupsPanel } from "./groupsPanel.tsx";
import { MadePanel } from "./madePanel.tsx";
import { buttonShown, permissionNeeded, type Permission } from "./groups.ts";
import { answerOp, appAnswersFrom, forgetAllCount, needsConfirm, neverFrontOp, type Answer, type AppRow } from "./appanswers.ts";
import { addCallApp, callAppRows, toggleCallApp } from "./callapps.ts";

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
    void invoke("save_api_key", { key: r.send }).then(() => { setNote(S.keySavedNote); setStep("idle"); onChanged(); }).catch((e) => { setProblem(failNote(e, "key")); setStep("replace"); });
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
      <AnyKeys busy={busy} pick={pick} />
    </>)}
    {problem && <div className="error" role="alert">{problem}</div>}
  </div>);
}

// Any keys, not only the short list (finding L): tick Control, Option, Shift and Command and choose the key from a list. Nothing
// here listens to the keyboard (rule 8): the page builds the chord's id, says in plain words why one is not enough, and the
// app checks it again and tries it like any other (taken by another app, used by another job). The preset buttons stay as they are.
function AnyKeys({ busy, pick }: { busy: boolean; pick: (id: string) => void }) {
  const [t, setT] = useState<Ticked>({ control: false, option: false, shift: false, command: false });
  const [key, setKey] = useState("");
  const built = key ? customChord(t, key) : null;
  const id = built && "id" in built ? built.id : "";
  const why = built && "problem" in built ? (built.problem === "reserved" ? S.keysReserved : built.problem === "not_enough" ? S.keysNotEnough : "") : "";
  return (<div role="group" aria-label={S.keysCustomTitle}>
    <div className="line"><b>{S.keysCustomTitle}</b></div>
    <div className="line muted">{S.keysCustomHelp}</div>
    <div className="row">
      {(["control", "option", "shift", "command"] as const).map((mod) => <label key={mod} className="check"><input type="checkbox" checked={t[mod]} disabled={busy} onChange={(e) => setT({ ...t, [mod]: e.target.checked })} /> {S.keyWords[mod]}</label>)}
      <select aria-label={S.keysCustomKey} value={key} disabled={busy} onChange={(e) => setKey(e.target.value)}>
        <option value="">{S.keysCustomKey}</option>
        {CUSTOM_KEYS.map((k) => <option key={k} value={k}>{k.length === 1 ? k.toUpperCase() : S.keyWords.space}</option>)}
      </select>
      <button className="btn" type="button" disabled={busy || !id} onClick={() => { if (id) pick(id); }}>{S.keysCustomUse}</button>
    </div>
    {id && <div className="line muted" role="status">{chordLabel(id)}</div>}
    {why && <div className="line" role="status">{why}</div>}
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
      {buttonShown("voiceTry") && <button className="btn" type="button" onClick={() => void invoke("speak", { text: S.voiceSample }).then(heard).catch(() => {})}>{S.voiceTry}</button>}
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

/** A list from a fixed set (Also say out loud): each item a switch, in the set's own order. */
function AllowedList({ d, value, disabled, onChange }: { d: Def; value: string[]; disabled: boolean; onChange: (v: string[]) => void }) {
  const w = wordsOf(d.key);
  const all = d.allowedItems ?? [];
  return (
    <div className="row" role="group" aria-label={w.label}>
      {all.map((id) => {
        const on = value.includes(id);
        return <button key={id} className={on ? "btn primary" : "btn"} type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(all.filter((x) => (x === id ? !on : value.includes(x))))}>{w.options?.[id] ?? id}</button>;
      })}
    </div>
  );
}

/** Apps that count as a call (calls.apps): the call apps Companion knows, each on or off, and apps added with Add the app
 *  in front (the shell names the app in front: its id and name only), each with Remove. Every change goes to the shell. */
function CallApps({ value, disabled, onChange, onProblem }: { value: string[]; disabled: boolean; onChange: (v: string[]) => void; onProblem: (p: string) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const rows = callAppRows(value, names);
  const addedKey = rows.added.map((a) => a.id).join("|");
  useEffect(() => {
    const ids = rows.added.map((a) => a.id);
    if (!ids.length) return;
    void invoke("app_names", { ids }).then((v) => setNames((n) => ({ ...n, ...(v as Record<string, string>) }))).catch(() => {});
  }, [addedKey]);
  const addFront = () => {
    setNote(""); onProblem("");
    void invoke("front_app").then((v) => {
      const f = v as { id: string; name: string };
      const r = addCallApp(value, f.id);
      if (!r.ok) { onProblem(r.why === "full" ? S.callApps.full : r.why === "already" ? S.callApps.already : S.callApps.ownApp); return; }
      setNames((n) => ({ ...n, [f.id]: f.name || f.id }));
      onChange(r.list);
      setNote(S.callApps.addedNote(f.name || f.id));
    }).catch((e) => onProblem(String(e) === "ownApp" ? S.callApps.ownApp : problemWords(String(e))));
  };
  return (<div>
    <div role="group" aria-label={S.callApps.builtIn}>
      <div className="line muted">{S.callApps.builtIn}</div>
      {rows.builtIn.map((b) => (
        <div className="row" key={b.id}>
          <span className="line">{b.name}</span>
          <button className="btn" type="button" role="switch" aria-checked={b.on} aria-label={b.name} disabled={disabled} onClick={() => onChange(toggleCallApp(value, b.id, !b.on))}>{b.on ? S.on : S.off}</button>
        </div>
      ))}
    </div>
    {rows.added.length > 0 && (
      <div role="group" aria-label={S.callApps.added}>
        <div className="line muted">{S.callApps.added}</div>
        {rows.added.map((a) => (
          <div className="row" key={a.id}>
            <span className="line">{a.name}</span>
            <button className="btn" type="button" aria-label={S.callApps.removeFor(a.name)} disabled={disabled} onClick={() => onChange(value.filter((x) => x !== a.id))}>{S.attachRemoveShort}</button>
          </div>
        ))}
      </div>
    )}
    <div className="row"><button className="btn" type="button" disabled={disabled} onClick={addFront}>{S.callApps.addFront}</button></div>
    {note && <div className="line" role="status">{note}</div>}
  </div>);
}

/** Apps Prompt help and the error explainer may read (ph.appAnswers): each app the person answered for, with Allow always,
 *  Ask each time or Never, and Forget; Forget all (never the apps never to read); Add the app in front to never read. The
 *  rules are the shell's (prompthelp.rs): an app said never to read is loosened only after the inline confirm here, and
 *  the built in never list is not in this list at all. It is protective, so no reset ever changes it. */
function AppAnswers() {
  const v = useSetting("ph.appAnswers");
  const [names, setNames] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState<{ row: AppRow; next: Answer | "forget" } | null>(null);
  const [askAll, setAskAll] = useState(false);
  const [askFront, setAskFront] = useState<{ id: string; name: string } | null>(null);
  const [problem, setProblem] = useState("");
  const [note, setNote] = useState("");
  const baseId = useId(), allId = useId(), frontId = useId();
  const idsKey = appAnswersFrom(v, {}).map((r) => r.id).join("|");
  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    if (!ids.length) return;
    void invoke("app_names", { ids }).then((x) => setNames(x as Record<string, string>)).catch(() => {});
  }, [idsKey]);
  const rows = appAnswersFrom(v, names);
  const done = (p: Promise<Done>, after = "") => { setProblem(""); setNote(""); void p.then((d) => { if (!d.ok) setProblem(problemWords(d.code)); else if (after) setNote(after); }); };
  const pick = (r: AppRow, next: Answer | "forget") => {
    if (next === r.answer) return;
    if (needsConfirm(r.answer, next)) { setAsking({ row: r, next }); return; }
    done(changeSetting("ph.appAnswers", answerOp(r.id, next, false)));
  };
  const yes = () => { const a = asking; setAsking(null); if (a) done(changeSetting("ph.appAnswers", answerOp(a.row.id, a.next, true))); };
  // Add the app in front to never read: name the app first (only its id and name are read), then change only that one.
  const front = () => {
    setProblem(""); setNote("");
    void invoke("front_app").then((x) => { const f = x as { id: string; name: string }; setAskFront({ id: f.id, name: f.name || f.id }); })
      .catch((e) => setProblem(problemWords(String(e))));
  };
  const frontYes = () => { const f = askFront; setAskFront(null); if (f) done(changeSetting("ph.appAnswers", neverFrontOp(f.id)), S.appAnswers.neverFrontDone(f.name)); };
  const options = (["always", "ask", "never"] as const).map((id) => ({ id, label: S.appAnswers.choices[id] }));
  const forgettable = forgetAllCount(rows);
  return (<div>
    {rows.length === 0 && <div className="line muted">{S.appAnswers.none}</div>}
    {rows.map((r, i) => (
      <div key={r.id} role="group" aria-label={S.appAnswers.answerFor(r.name)}>
        <div className="row">
          <span className="line" id={`${baseId}-l${i}`}>{r.name}</span>
          <ChoiceControl value={r.answer} options={[...options]} labelId={`${baseId}-l${i}`} disabled={!!asking} onChange={(x) => pick(r, x as Answer)} />
          <button id={`${baseId}-f${i}`} className="btn" type="button" aria-label={S.appAnswers.forgetFor(r.name)} disabled={!!asking} onClick={() => pick(r, "forget")}>{S.appAnswers.forget}</button>
        </div>
        {asking?.row.id === r.id && (
          <ConfirmStep className="line" label={S.appAnswers.loosenSure(r.name)} back={`${baseId}-f${i}`} onCancel={() => setAsking(null)}>
            <div className="line">{S.appAnswers.loosenSure(r.name)}</div>
            <div className="row"><button className="btn danger" type="button" onClick={yes}>{S.appAnswers.loosenYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsking(null)}>{S.planCancel}</button></div>
          </ConfirmStep>
        )}
      </div>
    ))}
    <div className="row">
      {!askFront && <button id={frontId} className="btn" type="button" onClick={front}>{S.appAnswers.neverFront}</button>}
      {forgettable > 0 && !askAll && <button id={allId} className="btn" type="button" onClick={() => setAskAll(true)}>{S.appAnswers.forgetAll}</button>}
    </div>
    {askFront && (
      <ConfirmStep className="line" label={S.appAnswers.neverFrontSure(askFront.name)} back={frontId} onCancel={() => setAskFront(null)}>
        <div className="line">{S.appAnswers.neverFrontSure(askFront.name)}</div>
        <div className="row"><button className="btn" type="button" onClick={frontYes}>{S.appAnswers.neverFrontYes}</button><button className="btn" type="button" data-cancel onClick={() => setAskFront(null)}>{S.planCancel}</button></div>
      </ConfirmStep>
    )}
    {askAll && (
      <ConfirmStep className="line" label={S.appAnswers.forgetAll} back={allId} onCancel={() => setAskAll(false)}>
        <div className="line">{S.appAnswers.forgetAllSure(forgettable)}</div>
        <div className="row"><button className="btn" type="button" onClick={() => { setAskAll(false); done(changeSetting("ph.appAnswers", { op: "forgetAll" })); }}>{S.appAnswers.forgetAllYes}</button><button className="btn" type="button" data-cancel onClick={() => setAskAll(false)}>{S.planCancel}</button></div>
      </ConfirmStep>
    )}
    {note && <div className="line" role="status">{note}</div>}
    {problem && <div className="error" role="alert">{problem}</div>}
  </div>);
}
// end AppAnswers

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
function SettingRow({ d, project, keys, facts, pictures, compact = false }: { d: Def; project: string; keys: Keys; facts: CheckFacts | null; pictures: number | undefined; compact?: boolean }) {
  useSetting(d.key);
  const value = d.kind === "custom" ? snapshotNow()?.values[d.key] : setting(d.key);
  const usual = usualOf(d.key);
  const r = rowModel(d, value, usual, project);
  // Home size: Large is suggested while the text is larger than usual.
  const hint = d.key === "home.size" ? homeSizeHint(setting("display.textSize"), value) : null;
  // A model row offers only the options whose real smoke test has passed (modelChoice.ts); the usual one always.
  const offered = offeredOptions(d.key);
  const options = (r.options ?? []).filter((o) => !offered || offered.includes(o.id));
  const labelId = useId(), helpId = useId();
  const [problem, setProblem] = useState("");
  const done = (p: Promise<{ ok: boolean; code?: string }>) => void p.then((x) => { if (!x.ok) setProblem(problemWords(x.code ?? "other", d)); });
  // A project's setting says which project the page was shown it for; the shell refuses it for any other.
  const shownFor = snapshotNow()?.project ?? project;
  const change = (v: unknown) => { setProblem(""); done(changeSetting(d.key, v, d.scope === "project" && shownFor ? shownFor : undefined)); };
  const reset = () => { setProblem(""); setAskReset(false); done(resetSetting(d.key)); };
  // Reset of Pictures to keep while more are kept: says first how many go, as lowering the number does.
  const [askReset, setAskReset] = useState(false);
  const resetId = useId();
  const resetGo = d.key === "pictures.keep" ? picturesResetGoing([d.key], pictures, value) : 0;
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
    // M30: the water's colour is a row of swatches, as HeyClicky shows its cursor colours.
    if (d.key === "look.water") return <WaterSwatches value={String(value)} onChange={change} labelId={labelId} />;
    if (d.key === "check.skip") return null;
    if (d.key === "check.start") return <ChoiceControl value={String(value)} options={startOptions(value, facts_)} labelId={labelId} disabled={off} onChange={change} />;
    if (d.key === "pictures.keep") return <PicturesKeep d={d} value={typeof value === "number" ? value : (d.default as number)} count={pictures} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} />;
    switch (d.kind) {
      case "switch": return <button className="btn" type="button" role="switch" aria-checked={value === true} aria-labelledby={labelId} aria-describedby={helpId} disabled={off} onClick={() => change(value !== true)}><span className="sr">{r.shown}</span></button>;
      case "choice": return <ChoiceControl value={String(value)} options={options} labelId={labelId} disabled={off} onChange={change} />;
      case "number": return <NumberControl d={d} value={typeof value === "number" ? value : (d.default as number)} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} />;
      case "text": return <TextControl d={d} value={typeof value === "string" ? value : ""} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} />;
      // A list from a fixed set (Also say out loud) is a row of switches; the call apps have their own editor below.
      case "list": return d.allowedItems ? <AllowedList d={d} value={Array.isArray(value) ? (value as string[]) : []} disabled={off} onChange={change} /> : d.key === "calls.apps" ? null : <ListControl d={d} value={Array.isArray(value) ? (value as string[]) : []} disabled={off} onChange={change} onProblem={setProblem} />;
      default: return null;
    }
  })();
  // The keys and the voice keep their own editors; the keys' editor has its own Reset to the usual keys.
  // The per app answers have their own editor too (protective: no Reset), and the call apps their own list.
  const editor = d.key === "keys.hotkeys" ? <KeysSection keys={keys} /> : d.key === "talk.voice" ? <VoiceRows /> : d.key === "rules.house" ? <HouseRules key={shownFor} project={shownFor} saved={Array.isArray(value) ? (value as string[]) : []} disabled={r.disabled || rulesBlocked} />
    : d.key === "check.skip" ? <SkipControl d={d} value={Array.isArray(value) ? (value as string[]) : []} facts={facts_} disabled={off} onChange={change} />
    : d.key === "ph.appAnswers" ? <AppAnswers />
    : d.key === "calls.apps" ? <CallApps value={Array.isArray(value) ? (value as string[]) : []} disabled={off} onChange={change} onProblem={setProblem} /> : null;
  return (
    <div role="group" aria-labelledby={labelId} className="setting">
      {/* M30: on a page each row is its name and one short line, the control on the right; the long help is for search. */}
      {compact ? (
        <div className="sp-row"><span className="sp-text"><b id={labelId}>{S.shortLabel[d.key] ?? r.label}</b>{S.short[d.key] ? <span id={helpId}>{S.short[d.key]}</span> : null}</span>{control}</div>
      ) : (<>
        <div className="row"><span className="line" id={labelId}><b>{r.label}</b></span>{control}</div>
        <div className="line muted" id={helpId}>{r.help}</div>
      </>)}
      {hint && <div className="line">{hint}</div>}
      {editor}
      {notes.map((n) => <div className="line muted" key={n}>{n}</div>)}
      {r.projectLine && <div className="line muted">{r.projectLine}</div>}
      {/* What it usually is, and Reset, only once it was changed: an untouched row is its title, its words and its control. */}
      {r.changed && <div className="row">
        <span className="line muted">{r.usualLine}</span>
        {r.canReset && d.key !== "keys.hotkeys" && !askReset && <button id={resetId} className="btn" type="button" aria-label={r.resetLabel} onClick={resetGo > 0 ? () => setAskReset(true) : reset}>{S.setReset}</button>}
      </div>}
      {askReset && resetGo > 0 && (
        <ConfirmStep className="line" label={S.chkPicturesGo(resetGo, Number(usual))} back={resetId} onCancel={() => setAskReset(false)}>
          <div className="line">{S.chkPicturesGo(resetGo, Number(usual))}</div>
          <div className="row"><button className="btn danger" type="button" onClick={reset}>{S.chkPicturesGoYes}</button><button className="btn" type="button" data-cancel onClick={() => setAskReset(false)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {r.later && <div className="line muted">{S.setNextTask}</div>}
      {r.floor && !compact && <div className="line muted">{floorWords(r.floor)}</div>}
      {problem && <div className="error" role="alert">{problem}</div>}
    </div>
  );
}

const PERM_OF: Record<PermissionKind, Permission> = { screen_recording: "screenRecording", accessibility: "accessibility", microphone: "microphone" };
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
function SettingsSection({ id, title, keys, project, allKeys, extra, facts, pictures, alone = false }: { id: string; title: string; keys: string[]; project: string; allKeys: Keys; extra?: ReactNode; facts: CheckFacts | null; pictures: number | undefined; alone?: boolean }) {
  useSetting(keys[0] ?? "");
  const headId = useId(), resetId = useId();
  const [asking, setAsking] = useState(false);
  const toast = useUndoToast();
  const changed = changedNow(id);
  const unheard = notHeard(id);
  const go = picturesResetGoing(changed, pictures, setting("pictures.keep"));
  const yes = () => { setAsking(false); void resetWithUndo(id).then(({ done, back }) => toast.show(done, back)); };
  return (
    <section aria-labelledby={headId} className="settings-section">
      {/* Shown alone, the section's name is already the title at the top of Home, so its heading is for VoiceOver only. */}
      <h3 id={headId} className={alone ? "sr" : undefined}>{title}</h3>
      {id === "home" && <CompanionHero />}
      <div className="group">
      {keys.map((k) => { const d = defOf(k); return d ? <SettingRow key={k} d={d} project={project} keys={allKeys} facts={facts} pictures={pictures} /> : null; })}
      </div>
      {extra}
      {changed.length > 0 && !asking && <div className="row"><button id={resetId} className="btn" type="button" onClick={() => setAsking(true)}>{S.setResetSection}</button></div>}
      {asking && (
        <ConfirmStep className="line" label={S.setResetSection} back={resetId} onCancel={() => setAsking(false)}>
          <div className="line">{S.setResetSectionSure(names(changed))}</div>
          {go > 0 && <div className="line">{S.setPicturesGo(go, Number(defaultOf("pictures.keep")))}</div>}
          {unheard.length > 0 && <div className="line muted">{S.setNotHeard(names(unheard))}</div>}
          <div className="row"><button className="btn" type="button" onClick={yes}>{S.setResetSectionYes}</button><button className="btn" type="button" data-cancel onClick={() => setAsking(false)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {toast.view}
    </section>
  );
}

// working: a task or a check works (isBusy). practiceBusy: that, or a lesson or a practice's own checks (practice.ts
// workingOn), so the practice copy open now is never moved to the Trash under them.
// onStepAside: the email for Report a problem, or Finder showing the support log, opened (home.stepAside decides).
/** The parts of Settings, in page order, for the side list: each section of settings, then the parts that are not settings
 *  (what it may do on this Mac, your key, practice and the rest). An id is a section's id, or "fixed:" and the part's name. */
/** M28: Google shows in Settings only once this build has Google set up (or an account is already kept), so nobody meets a
 *  section whose buttons cannot work. Learned once from the shell when the page loads. */
let googleShown = false;
export const googleInSettings = (): boolean => googleShown;
void invoke("google_accounts").then((v) => { const o = v as { ready?: boolean; accounts?: unknown[] } | null; googleShown = !!o?.ready || (o?.accounts?.length ?? 0) > 0; }).catch(() => {});
export const placeShown = (fixed: string, google = googleShown): boolean => fixed !== "google" || google;

export function settingsPlaces(): { id: string; title: string }[] {
  const all = searchSettings("", shownSettings().filter((x) => shownNow(x.key, setting)));
  void all;
  return (Object.keys(PAGES) as PageId[]).map((id) => ({ id, title: S.pages[id].title }));
}

// place: the part open in the side list. A search looks through every part, as before.
export function SettingsPage({ place = "", working, practiceBusy, project, spending, onClose, onPracticeList, onLesson, onStepAside = () => {} }: { place?: string; working: boolean; practiceBusy: boolean; project: string; spending: Spending | null; onClose: () => void; onPracticeList: () => void; onLesson: (lesson: string) => void; onStepAside?: () => void }) {
  useSetting("fun.reactions");   // any change in any window draws the page again
  const [q, setQ] = useState("");
  // Every setting, except a model row that could offer only one option so far (modelChoice.ts), and a row that only
  // means something with another setting's value, which shows only then (settingsRows.ts shownNow).
  const results = searchSettings(q, shownSettings().filter((x) => shownNow(x.key, setting)));
  const [inv, setInv] = useState<Inventory | null>(null);
  const [perms, setPerms] = useState<Record<PermissionKind, PermissionState> | null>(null);
  const [step, setStep] = useState<"idle" | "confirm" | "deleting">("idle");
  const [withProjects, setWithProjects] = useState(false);
  const [withPractice, setWithPractice] = useState(false);
  // Move all my practice copies to the Trash: asked first, then what happened in one line.
  const [askPractice, setAskPractice] = useState(false);
  const [practiceSaid, setPracticeSaid] = useState("");
  const practiceAllId = useId();
  const trashPractice = () => { setAskPractice(false); void invoke("remove_all_practices", { busy: practiceBusy }).then((v) => { const r = v as { moved?: number; kept?: string[] }; setPracticeSaid(S.practiceRemovedAll(Number(r.moved) || 0, Array.isArray(r.kept) ? r.kept.map(String) : [])); load(); }).catch((e) => setPracticeSaid(failNote(e, "practice"))); };
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
  const [upNote, setUpNote] = useState("");
  const installNow = () => {
    if (!canInstall(working)) return;
    const prev = found.update; setUpNote(""); setUp({ stage: "installing" });
    // The shell keeps the update when an install fails, so it is put back and Install can be pressed again.
    void invoke("install_update").catch((e) => { const r = afterInstallFailed(prev, String(e)); found.update = r.update; setUp(r.state); setUpNote(r.note); });
  };
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
    void invoke("delete_everything", { confirm: DELETE_PHRASE, withProjects, withPractice }).catch((e) => { busy.current = false; setProblem(String(e)); setStep("confirm"); });
  };
  // Reset all settings to usual, asked first, naming every setting that changes; then Undo for ten seconds puts every
  // value back through the shell.
  const [askAll, setAskAll] = useState(false);
  const allToast = useUndoToast();
  const changedAll = changedNow();
  const unheardAll = notHeard();
  const goAll = picturesResetGoing(changedAll, inv?.receiptPictures, setting("pictures.keep"));
  const resetEverything = () => { setAskAll(false); void resetWithUndo().then(({ done, back }) => allToast.show(done, back)); };
  const problems = (snapshotNow()?.problems ?? []).map((p) => (p.code === "damaged" ? S.setDamaged : p.code === "unreadable" ? S.setUnreadable : p.code === "rulesUnreadable" ? S.setRulesUnreadable : p.key ? S.setBadValue(wordsOf(p.key).label) : "")).filter(Boolean);
  const onePart = !q && !!place;
  // M28: the main Settings shows the main choices; Advanced shows every other one, grouped as before; search finds all.
  // M30: one page at a time (settingsPages.ts); a search looks through every setting, Advanced shows the rest by section.
  const page: PageId = isPage(place) ? place : FIRST_PAGE;
  const advanced = !q && page === "advanced";
  const onPage = !q && !advanced;
  const mainIds = new Set(levelSections(results.sections, false).map((s) => s.id));
  const pageKeys = onPage ? PAGES[page].keys.filter((k) => { const d = defOf(k); return !!d && !d.hidden && shownNow(k, setting); }) : [];
  const fixedShown = (g: FixedGroup) => placeShown(g) && (q ? results.fixed.includes(g) : !advanced && PAGES[page].fixed.includes(g));
  const sectionsShown = q ? results.sections : advanced ? levelSections(results.sections, true) : [];
  void onePart;
  // The character's place (its edge, its position and Same place on every display) put back with one press.
  const placeChanged = changedNow("home").filter((k) => (PLACE_KEYS as readonly string[]).includes(k));
  const resetPlace = async () => { for (const k of placeChanged) await resetSetting(k); };
  const extras: Record<string, ReactNode> = {
    groups: <GroupsPanel />,
    home: (<>
      <div className="line muted">{S.dragHint}</div>
      {placeChanged.length > 0 && <div className="row"><button className="btn" type="button" onClick={() => void resetPlace()}>{S.setResetPlace}</button></div>}
    </>),
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
      {up.stage === "found" && upNote && <div className="line" role="alert">{upNote}</div>}
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
    <section className="panel settings" aria-label={S.settingsTitle}>
      <div className="row" role="search">
        <input type="search" autoComplete="off" spellCheck={false} value={q} placeholder={S.setSearch} aria-label={S.setSearch}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && !e.nativeEvent.isComposing && q) { e.preventDefault(); e.stopPropagation(); setQ(""); } }} />
        {q && <button className="btn" type="button" onClick={() => setQ("")}>{S.setSearchClear}</button>}
      </div>
      <div className={q ? "line muted" : "sr"} role="status" aria-live="polite">{q ? (results.count ? S.setMatches(results.count) : S.setNoMatch) : ""}</div>
      {problems.map((p, i) => <div className="line blocked" key={i}>{p}</div>)}
      {!q && <header className="sp-head"><h2>{S.pages[page].title}</h2><p>{S.pages[page].sub}</p></header>}
      {onPage && page === "character" && <CompanionHero />}
      {pageKeys.length > 0 && <div className="sp-card">
        {pageKeys.map((k) => <SettingRow key={k} d={defOf(k)!} project={project} keys={keys} facts={facts} pictures={inv?.receiptPictures} compact />)}
      </div>}
      {onPage && page === "account" && extras.spending}
      {onPage && page === "general" && extras.updates}
      {sectionsShown.map((s) => <SettingsSection key={s.id} id={s.id} title={s.title} keys={s.keys} project={project} allKeys={keys} extra={advanced && mainIds.has(s.id) ? undefined : extras[s.id]} facts={facts} pictures={inv?.receiptPictures} alone={onePart && !advanced} />)}
      {fixedShown("permissions") && <Group title={S.settingsPermissions}>
      <div className="line muted">{S.settingsPermissionsHelp}</div>
      {perms && (["screen_recording", "accessibility", "microphone"] as PermissionKind[]).map((k) => {
        const r = permissionRow(k, perms[k]);
        return (
          <div className="line" key={k}>
            <b>{r.label}:</b> {r.state}.{r.todo ? ` ${r.todo}` : ""} <span className="muted">{r.why}</span>
            {!permissionNeeded(PERM_OF[k]) && <span className="muted"> {S.groups.permissionNotNeeded}</span>}
            {r.button && <> <button className="btn" type="button" onClick={() => void invoke("open_permission_page", { which: k })}>{S.settingsOpenSystem}</button> <button className="btn" type="button" onClick={() => onLesson(permissionLesson(k))}>{S.settingsWalkMe}</button></>}
          </div>
        );
      })}
      </Group>}
      {fixedShown("key") && inv && <KeySection keySaved={inv.keySaved} working={working} onChanged={load} />}
      {fixedShown("google") && <GoogleSection />}
      {fixedShown("practice") && <Group title={S.fixedGroups.practice.title}>
      <div className="line muted">{S.practiceListHelp}</div>
      {!askPractice && <div className="row">
        <button className="btn" type="button" onClick={onPracticeList}>{S.practiceOpenList}</button>
        {(inv?.practiceCopies ?? 0) > 0 && <button id={practiceAllId} className="btn" type="button" onClick={() => { setPracticeSaid(""); setAskPractice(true); }}>{S.practiceRemoveAll}</button>}
      </div>}
      {askPractice && (
        <ConfirmStep className="line" label={S.practiceRemoveAllSure} back={practiceAllId} onCancel={() => setAskPractice(false)}><div>{S.practiceRemoveAllSure}</div>
          <div className="row"><button className="btn danger" type="button" onClick={trashPractice}>{S.practiceRemoveAllYes}</button><button className="btn" type="button" data-cancel onClick={() => setAskPractice(false)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {practiceSaid && <div className="line" role="status">{practiceSaid}</div>}
      </Group>}
      {fixedShown("made") && <Group title={S.fixedGroups.made.title}><MadePanel busy={practiceBusy} project={project} /></Group>}
      {fixedShown("kept") && <Group title={S.settingsKept}>
      {inv && inv.items.length === 0 && !inv.keySaved && <div className="line muted">{S.settingsNothingKept}</div>}
      {inv && deletableLines(inv).map((l, i) => <div className="line" key={i}>{l}</div>)}
      {step === "idle" && <div className="row"><button id={deleteId} className="btn danger" type="button" onClick={() => setStep("confirm")}>{S.deleteEverything}</button></div>}
      {step !== "idle" && (
        <ConfirmStep className="line" label={S.deleteSure} back={deleteId} onCancel={() => { if (step !== "deleting") setStep("idle"); }}>
          <b>{S.deleteSure}</b>
          <div className="line">{S.deleteExplain}</div>
          {inv && inv.projectsWithNotes > 0 && <label className="check"><input type="checkbox" checked={withProjects} onChange={(e) => setWithProjects(e.target.checked)} /> {S.deleteProjects.replace("{n}", String(inv.projectsWithNotes))}</label>}
          {inv && (inv.practiceCopies ?? 0) > 0 && <label className="check"><input type="checkbox" checked={withPractice} onChange={(e) => setWithPractice(e.target.checked)} /> {S.deletePractice.replace("{n}", String(inv.practiceCopies))}</label>}
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
      <div className="row"><button className="btn" type="button" disabled={exporting} onClick={() => { setExporting(true); setExported(""); void invoke("export_logs").then((n) => { setExported(S.exportLogsDone.replace("{name}", String(n))); onStepAside(); }).catch((e) => setExported(failNote(e, "logs"))).finally(() => setExporting(false)); }}>{S.exportLogs}</button></div>
      <div className="line muted">{S.reportHelp}</div>
      <div className="row"><button className="btn" type="button" disabled={exporting} onClick={() => { setExporting(true); setExported(""); void invoke("report_problem", { subject: S.reportSubject, body: S.reportBody }).then((n) => { setExported(S.reportOpened(String(n))); onStepAside(); }).catch((e) => setExported(failNote(e, "report"))).finally(() => setExporting(false)); }}>{S.reportButton}</button></div>
      {exported && <div className="line" role="status">{exported}</div>}
      </Group>}
      {results.all && advanced && !askAll && <div className="row"><button id={resetAllId} className="btn" type="button" disabled={changedAll.length === 0} onClick={() => setAskAll(true)}>{S.setResetAll}</button></div>}
      {results.all && advanced && changedAll.length === 0 && <div className="line muted">{S.setResetAllNone}</div>}
      {askAll && (
        <ConfirmStep className="line" label={S.setResetAll} back={resetAllId} onCancel={() => setAskAll(false)}>
          <div className="line">{S.setResetAllSure(names(changedAll))}</div>
          {goAll > 0 && <div className="line">{S.setPicturesGo(goAll, Number(defaultOf("pictures.keep")))}</div>}
          {unheardAll.length > 0 && <div className="line muted">{S.setNotHeard(names(unheardAll))}</div>}
          <div className="row"><button className="btn danger" type="button" onClick={resetEverything}>{S.setResetAllYes}</button><button className="btn" type="button" data-cancel onClick={() => setAskAll(false)}>{S.planCancel}</button></div>
        </ConfirmStep>
      )}
      {allToast.view}
      {q && <div className="row"><button className="btn" type="button" onClick={onClose}>{S.onlineClose}</button></div>}
    </section>
  );
}

/** M30: the water's colours as swatches, the chosen one ringed and ticked. */
function WaterSwatches({ value, onChange, labelId }: { value: string; onChange: (v: string) => void; labelId: string }) {
  const now = waterOf(value);
  return (
    <div className="sp-swatches" role="radiogroup" aria-labelledby={labelId}>
      {WATERS.map((w) => <button key={w} type="button" role="radio" className="sp-swatch" aria-checked={now === w} title={S.set["look.water"].options?.[w]} aria-label={S.set["look.water"].options?.[w]}
        style={{ "--pick": WATER_TINTS[w].mid, "--pick-deep": WATER_TINTS[w].deep } as React.CSSProperties} onClick={() => onChange(w)} />)}
    </div>
  );
}

/** The character on the water at the top of its own part of Settings (M18): alive, with its name, shown resting, working or
 *  done on a press so a change here (how lively, the motion) can be seen. A picture, not a control: the states are buttons. */
const HERO_STATES = ["idle", "working", "done"] as const;
function CompanionHero() {
  const [as, setAs] = useState<(typeof HERO_STATES)[number]>("idle");
  const name = characterName(useSetting("character.name"));
  // One tap changes it, and the character above shows it at once (M19).
  const lively = livelyOf(useSetting("fun.reactions"), useSetting("character.motion"));
  return (<>
    <div className="companion-hero">
      <div className="ch-water" aria-hidden="true"><Waterline under /></div>
      <div className="ch-char" aria-hidden="true"><HomeCharacter as={as} /></div>
      <b className="ch-name">{name}</b>
      <div className="ch-states" role="group" aria-label={S.heroStatesLabel}>
        {HERO_STATES.map((st) => <button key={st} type="button" aria-pressed={as === st} onClick={() => setAs(st)}>{S.heroStates[st]}</button>)}
      </div>
      <button className="ch-again" type="button" onClick={() => { showFirstRunAgain(); void invoke("open_card_cmd").catch(() => {}); }}>{S.firstRunAgain}</button>
    </div>
    <div className="ch-look">
      <div className="ch-lively" role="group" aria-label={S.livelyLabel}>
        {(["lively", "calm", "still"] as const).map((l) => <button key={l} type="button" aria-pressed={lively === l} onClick={() => { for (const [k, v] of livelySettings(l)) void changeSetting(k, v); }}>{S.lively[l]}</button>)}
      </div>
    </div>
  </>);
}

/** Google (M21, google.rs): sign in with Google, and the Google accounts connected for Gmail, Calendar and Drive. The
 *  shell runs the sign in in the person's browser and keeps the tokens; this page sees only who and what (never a token). */
type GoogleAccount = { id: string; email: string; name: string; label: string; apps: string[]; signin: boolean };
const GOOGLE_APPS = ["gmail", "calendar", "drive"] as const;
function GoogleSection() {
  const [st, setSt] = useState<{ ready: boolean; busy: boolean; accounts: GoogleAccount[] } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [problem, setProblem] = useState("");
  const [pick, setPick] = useState<string[]>([...GOOGLE_APPS]);
  const [label, setLabel] = useState("");
  const load = () => void invoke("google_accounts").then((v) => setSt(v as { ready: boolean; busy: boolean; accounts: GoogleAccount[] })).catch(() => {});
  useEffect(() => {
    load();
    const a = listen("google-changed", () => { setWaiting(false); setProblem(""); load(); });
    const b = listen("google-failed", (e) => { setWaiting(false); setProblem(S.google.failed(String(e.payload ?? ""))); load(); });
    return () => { a.then((f) => f()); b.then((f) => f()); };
  }, []);
  const start = (signin: boolean) => {
    setProblem("");
    void invoke("google_start", { signin, apps: signin ? [] : pick, label: signin ? null : label }).then(() => setWaiting(true))
      .catch((e) => setProblem(String(e) === "busy" ? S.google.busy : String(e) === "notSetUp" ? S.google.notSetUp : S.google.failed(String(e))));
  };
  const drop = (id: string, signOutOnly: boolean) => void invoke("google_disconnect", { id, signOutOnly }).then(load).catch(() => load());
  if (!st) return null;
  const me = st.accounts.find((a) => a.signin);
  const connected = st.accounts.filter((a) => a.apps.length > 0);
  return (
    <Group title={S.fixedGroups.google.title}>
      {!st.ready && <div className="line muted">{S.google.notSetUp}</div>}
      <h3 className="google-head">{S.google.signInTitle}</h3>
      {me ? (
        <div className="row google-me"><span className="google-dot" aria-hidden="true">{(me.name || me.email).slice(0, 1).toUpperCase()}</span><span className="line">{S.google.signedIn(me.name, me.email)}</span>
          <button className="btn" type="button" onClick={() => drop(me.id, true)}>{S.google.signOut}</button></div>
      ) : (<>
        <div className="line muted">{S.google.signInLine}</div>
        <div className="row"><button className="btn primary" type="button" disabled={!st.ready || waiting} onClick={() => start(true)}>{S.google.signIn}</button></div>
      </>)}
      <h3 className="google-head">{S.google.connectTitle}</h3>
      <div className="line muted">{S.google.connectLine}</div>
      {connected.length === 0 && <div className="line muted">{S.google.none}</div>}
      {connected.map((a) => (
        <div className="row google-acct" key={a.id}>
          <span className="google-dot" aria-hidden="true">{(a.name || a.email).slice(0, 1).toUpperCase()}</span>
          <span className="line"><b>{a.label}</b> {a.email}<br /><span className="muted">{a.apps.map((x) => S.google.apps[x]).join(", ")}</span></span>
          <button className="btn danger" type="button" onClick={() => drop(a.id, false)}>{S.google.disconnect}</button>
        </div>
      ))}
      <div className="google-new" role="group" aria-label={S.google.connect}>
        {GOOGLE_APPS.map((x) => (
          <label className="check" key={x}><input type="checkbox" checked={pick.includes(x)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, x] : p.filter((y) => y !== x)))} /> <b>{S.google.apps[x]}</b> <span className="muted">{S.google.appLines[x]}</span></label>
        ))}
        <div className="row">
          <input type="text" value={label} maxLength={24} placeholder={S.google.label} aria-label={S.google.label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn primary" type="button" disabled={!st.ready || waiting || pick.length === 0} onClick={() => start(false)}>{S.google.connect}</button>
        </div>
      </div>
      {waiting && <div className="line" role="status">{S.google.waiting}</div>}
      {problem && <div className="error" role="alert">{problem}</div>}
    </Group>
  );
}
