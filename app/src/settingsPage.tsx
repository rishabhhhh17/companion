// Settings, inside Home (the overhaul spec, section 3; F28 and T17: one Settings, the separate window retired). A sidebar
// of eight pages with search at its top, and one page at a time: a title, one line, then Groups of Rows built only from
// the parts (ui/parts.tsx). Every setting in protocol/settings.json has one place (settingsPages.ts) and search finds every
// one (settingsSearch.ts). Every change goes to the shell through settingsStore.ts (settings_set), which checks it, keeps
// it, applies it and tells every window. Every word is in strings.ts. Keyboard and VoiceOver reach everything: each row is
// a named group, switches are role switch, choices a radio group with the arrows or a menu past three.
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { HomeCharacter } from "./homeCharacter.tsx";
import { Icon } from "./icons.tsx";
import { stripEdges } from "./ui/strip.ts";
import { FlowMini } from "./flowflowMini.tsx";
import { WaterDrop } from "./waterDrop.tsx";
import { Waterline } from "./waterline.tsx";
import { showFirstRunAgain } from "./firstRunAgain.ts";
import { LIVELINESS, livelinessOf, waterOf, WATERS, type Liveliness } from "./lookfeel.ts";
import type { Pose } from "./characters.ts";
import { ConfirmStep } from "./confirm.tsx";
import { takeIfLost } from "./focus.ts";
import { cutNoticeLine, droppedLine, googleParts, keyChangedLine, keyRows, pickerLines, resetLine, talkCost, DELETE_PHRASE, deletableLines, numbersLines, type NumbersSummary, permissionLesson, permissionRow, REMOVE_KEY_PHRASE, spendingLine, submitKey, type Inventory, type PermissionKind, type PermissionState } from "./settings.ts";
import { VOICE_START, languageLabel, micDefaultLabel, micLine, noteSpeed, soundLine, speedLabel, voiceAsk, voiceLabel, voiceLine, voiceProblem, voiceSettingsFrom, type Sound, type VoiceSettings } from "./voicesettings.ts";
import { eraseMemory, inspectProject, listMemory, metricsErase, metricsShow, NO_PROJECT, showSpending } from "./commands.ts";
import { addRule, afterPressShown, factsFrom, installNote, picturesGoing, picturesResetGoing, proofLines, removeRule, ruleKindOptions, skipItems, startOptions, type CheckFacts } from "./checkRows.ts";
import type { Spending } from "./model.ts";
import { CUSTOM_KEYS, canPick, choicesFrom, chordLabel, customChord, keyProblem, keysFrom, setKeysNow, type Choices, type Job, type Keys, type Ticked } from "./keys.ts";
import { useKeys } from "./useKeys.ts";
import { afterInstallFailed, canInstall, found, updateLine, type UpdateState } from "./updates.ts";
import { S } from "./strings.ts";
import { failNote } from "./failwords.ts";
import { invoke, listen } from "./tauri.ts";
import { AT_REST, atRestOf, atRestWrites, CHILD_OF, FIRST_PAGE, HAIRLINE_BEFORE, HIDDEN_OPTIONS, isPage, mainKeys, MORE_SECTIONS, moreKeys, PAGES, placeOf, rowAnchor, shownValue, SIDEBAR, type AtRest, type Fixed, type Item, type PageId, type Topic } from "./settingsPages.ts";
import { groupResults, searchSettingsFor, type Hit } from "./settingsSearch.ts";
import { defOf, defaultOf, validate, type Def, type RuleKind } from "../../protocol/settings.ts";
import { changedNow, changeSetting, notHeard, resetKeysWithUndo, resetSetting, resetWithUndo, setting, snapshotNow, undoReset, usualOf, useSetting, useSettings, type Done } from "./settingsStore.ts";
import { PartBoundary } from "./partBoundary.tsx";
import { floorWords, homeSizeHint, PLACE_KEYS, problemWords, rowModel, shownNow, valueWords, wordsOf } from "./settingsRows.ts";
import { offeredOptions, shownSettings } from "./modelChoice.ts";
import { Button, Card, Disclosure, Field, Group, KeyLabel, Menu, PageHead, PictureChoice, ProofChip, Row, Segmented, Sheet, SidebarItem, Stepper, Switch, Toast, type ChipKind } from "./ui/parts.tsx";
import { choiceControl, controlFor } from "./ui/controlRule.ts";
import { GroupsPanel } from "./groupsPanel.tsx";
import { MadePanel } from "./madePanel.tsx";
import { buttonShown, permissionNeeded, type Permission } from "./groups.ts";
import { answerOp, appAnswersFrom, forgetAllCount, needsConfirm, neverFrontOp, type Answer, type AppRow } from "./appanswers.ts";
import { addCallApp, callAppRows, toggleCallApp } from "./callapps.ts";
import { askTurnOffPro, deleteGoesPro, deleteKeeps, proDeleteProblem, proInventoryFrom, proOnly, proTag, type Usage } from "./plan.ts";
import { LimitPanel, PlanCardView, ProTag } from "./planCard.tsx";
import { usePlan } from "./usePlan.ts";
import { resetUsed, risen, useUsedOften, wayLabel } from "./usedOften.ts";
import "./ui/chrome.css";

const send = (cmd: unknown) => invoke("send_command", { cmd });

// ---------- what every row can reach ----------

type Ctx = {
  project: string; working: boolean; practiceBusy: boolean; keys: Keys; facts: CheckFacts | null; inv: Inventory | null; spending: Spending | null;
  /** This month's free fixes (plan.usage), only ever heard while payments are on. */
  usage: Usage | null;
  /** Go to a page, a group, a topic or a row (scrolls to it and flashes it). */
  go: (what: string) => void;
  /** One short line at the foot of the panel, with an optional Undo. */
  say: (text: string, undo?: () => void) => void;
  reload: () => void;
  onLesson: (lesson: string) => void; onPracticeList: () => void; onMemory: () => void; onPickFolder: () => void; onStepAside: () => void;
};
const SetCtx = createContext<Ctx | null>(null);
const useCtx = (): Ctx => useContext(SetCtx)!;

/** One line under a row: the page's own words, or the first sentence of its help when that is short. Never more than about
 *  two lines (settingsPages.test.ts); the rest is behind Learn more. */
export const LINE_MAX = 120;
export function rowLine(key: string): string {
  const own = (S.short as Record<string, string>)[key];
  if (own !== undefined) return own;
  const help = wordsOf(key).help;
  const first = /^[^]*?[.!?](?=\s|$)/.exec(help)?.[0] ?? help;
  return first.length <= LINE_MAX ? first : "";
}
/** What Learn more shows: the full help and the part that never changes, when they say more than the row's line. */
export function moreWords(key: string): string[] {
  const help = wordsOf(key).help, line = rowLine(key), d = defOf(key);
  return [...(help && help !== line ? [help] : []), ...(d?.floor && floorWords(d.floor) ? [floorWords(d.floor)] : [])];
}
/** The words a choice shows: short ones side by side (a Segmented control never wraps), the full ones in a menu. */
const segWords = (key: string, id: string, full: string): string => (S.setSeg as Record<string, Record<string, string>>)[key]?.[id] ?? full;

/** Learn more: a quiet press that shows the longer words under a row. */
function LearnMore({ words }: { words: string[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!words.length) return null;
  return (<div className="set-more">
    <Button kind="quiet" size="sm" expanded={open} controls={id} onClick={() => setOpen(!open)}>{open ? S.setFrame.learnLess : S.setFrame.learnMore}</Button>
    {open && <div id={id} className="set-more-words">{words.map((w, i) => <p key={i}>{w}</p>)}</div>}
  </div>);
}

/** A problem said under the row it belongs to: what is wrong, then the fix. */
const Problem = ({ text }: { text: string }) => (text ? <p className="set-problem" role="alert">{text}</p> : null);
/** A short status line under a row (a mic away, a key fell back). */
const Note = ({ text, live }: { text: string; live?: boolean }) => (text ? <p className="set-note" role={live ? "status" : undefined}>{text}</p> : null);

// ---------- the controls of one setting ----------

/** A number, typed or stepped with minus and plus. Kept only when Return is pressed or the box is left, and only when it
 *  passes the setting's rules (then put on its step); otherwise the plain reason shows and nothing is sent. */
function NumberControl({ d, value, labelId, disabled, onChange, onProblem, inputId }: { d: Def; value: number; labelId: string; disabled: boolean; onChange: (v: number) => void; onProblem: (p: string) => void; inputId?: string }) {
  const label = wordsOf(d.key).label;
  // The Stepper part reads the typed number and keeps it inside the range (and says so); the setting's own rules still
  // decide, and a value they refuse is never sent.
  const commit = (n: number) => {
    const c = validate(d, n);
    if (!c.ok) { onProblem(problemWords(c.reason, d)); return; }
    onProblem("");
    if (c.value !== value) onChange(c.value as number);
  };
  return <Stepper id={inputId} value={value} min={d.min} max={d.max} step={d.step} unit={d.unit ? S.ui.unitWord[d.unit] : undefined} label={label} labelledBy={labelId}
    disabled={disabled} onChange={commit} onNote={onProblem} />;
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
  // An empty name shows the name it falls back to, so the box never looks broken (31 Oct).
  const hint = (S.set[d.key as keyof typeof S.set] as { placeholder?: string } | undefined)?.placeholder;
  return <Field value={text} maxLength={d.maxLength} disabled={disabled} labelledBy={labelId} placeholder={hint}
    onChange={(t) => { editing.current = true; setText(t); }} onBlur={() => { if (editing.current) commit(); }}
    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); } }} />;
}

/** A choice, drawn by the control choice rule (ui/controlRule.ts, the spec's 3.5): two or three options side by side (the
 *  arrows move and pick, as macOS does), four or more as a menu. A choice that grows with the project is always a menu. */
function ChoiceControl({ d, value, options, labelId, disabled, onChange }: { d?: Def; value: string; options: { id: string; label: string }[]; labelId: string; disabled: boolean; onChange: (v: string) => void }) {
  const kind = d ? controlFor(d, options.length) : choiceControl(options.length);
  if (kind === "menu") return <Menu labelledBy={labelId} value={value} options={options} disabled={disabled} onChange={onChange} />;
  const short = d ? options.map((o) => ({ id: o.id, label: segWords(d.key, o.id, o.label) })) : options;
  return <Segmented labelledBy={labelId} value={value} options={short} disabled={disabled} onChange={onChange} />;
}

/** A list from a fixed set (Also say out loud, Checks to leave out): one child row with a switch for each item. */
function AllowedList({ d, value, items, words, disabled, onChange, switchLabel }: { d: Def; value: string[]; items?: readonly string[]; words?: Record<string, string>; disabled: boolean; onChange: (v: string[]) => void; switchLabel?: (name: string) => string }) {
  const w = wordsOf(d.key);
  const all = items ?? d.allowedItems ?? [];
  const names = words ?? w.options ?? {};
  return (<>
    {all.map((id) => {
      const on = value.includes(id), name = names[id] ?? id;
      return <Row key={id} indent label={name} disabled={disabled || undefined}
        control={<Switch checked={on} label={switchLabel ? switchLabel(name) : name} disabled={disabled} onChange={() => onChange(all.filter((x) => (x === id ? !on : value.includes(x))))} />} />;
    })}
  </>);
}

/** A list a person types (check.mustSee): each item with Remove, and an Add box. Inside its sheet; every change applies. */
function ListEditor({ d, value, disabled, onChange }: { d: Def; value: string[]; disabled: boolean; onChange: (v: string[]) => Promise<Done> }) {
  const [adding, setAdding] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const label = wordsOf(d.key).label;
  const baseId = useId();
  const done = (p: Promise<Done>) => void p.then((x) => { if (!x.ok) setProblem(problemWords(x.code, d)); });
  const add = () => {
    const c = validate(d, [...value, adding]);
    if (!c.ok) { setProblem(problemWords(c.reason, d)); return; }
    setProblem(""); setAdding(""); done(onChange(c.value as string[]));
  };
  const remove = (item: string) => { setAsking(null); done(onChange(value.filter((x) => x !== item))); };
  return (<div className="set-sheet-list">
    <Group>
      {value.length === 0 && <Row label={S.setNone} />}
      {value.map((item, i) => (
        <Row key={item} label={item} control={asking !== item ? <Button id={`${baseId}-${i}`} size="sm" disabled={disabled} label={S.setRemoveItem(item)} onClick={() => (d.protective ? setAsking(item) : remove(item))}>{S.attachRemoveShort}</Button> : null}>
          {asking === item && (
            <ConfirmStep className="set-confirm" label={S.setRemoveSure(item)} back={`${baseId}-${i}`} onCancel={() => setAsking(null)}>
              <p>{S.setRemoveSure(item)}</p>
              <div className="set-buttons"><Button kind="danger" onClick={() => remove(item)}>{S.setRemoveYes}</Button><CancelButton onClick={() => setAsking(null)} /></div>
            </ConfirmStep>
          )}
        </Row>
      ))}
    </Group>
    <div className="set-add">
      <Field value={adding} maxLength={d.item?.maxLength} disabled={disabled || value.length >= (d.maxItems ?? 0)} label={S.setAddLabel(label)} wide
        onChange={setAdding} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
      <Button disabled={disabled || !adding.trim() || value.length >= (d.maxItems ?? 0)} onClick={add}>{S.setAdd}</Button>
    </div>
    <Problem text={problem} />
  </div>);
}

/** Apps that count as a call (calls.apps): the call apps Squibby knows, each on or off, and apps added with Add the app in
 *  front (the shell names the app in front: its id and name only), each with Remove. Every change goes to the shell. */
function CallApps({ value, disabled, onChange }: { value: string[]; disabled: boolean; onChange: (v: string[]) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const rows = callAppRows(value, names);
  const addedKey = rows.added.map((a) => a.id).join("|");
  useEffect(() => {
    const ids = rows.added.map((a) => a.id);
    if (!ids.length) return;
    void invoke("app_names", { ids }).then((v) => setNames((n) => ({ ...n, ...(v as Record<string, string>) }))).catch(() => {});
  }, [addedKey]);
  const addFront = () => {
    setNote(""); setProblem("");
    void invoke("front_app").then((v) => {
      const f = v as { id: string; name: string };
      const r = addCallApp(value, f.id);
      if (!r.ok) { setProblem(r.why === "full" ? S.callApps.full : r.why === "already" ? S.callApps.already : S.callApps.ownApp); return; }
      setNames((n) => ({ ...n, [f.id]: f.name || f.id }));
      onChange(r.list);
      setNote(S.callApps.addedNote(f.name || f.id));
    }).catch((e) => setProblem(String(e) === "ownApp" ? S.callApps.ownApp : problemWords(String(e))));
  };
  return (<>
    <Group title={S.callApps.builtIn}>
      {rows.builtIn.map((b) => <Row key={b.id} label={b.name} control={<Switch checked={b.on} label={b.name} disabled={disabled} onChange={() => onChange(toggleCallApp(value, b.id, !b.on))} />} />)}
    </Group>
    {rows.added.length > 0 && (
      <Group title={S.callApps.added}>
        {rows.added.map((a) => <Row key={a.id} label={a.name} control={<Button size="sm" label={S.callApps.removeFor(a.name)} disabled={disabled} onClick={() => onChange(value.filter((x) => x !== a.id))}>{S.attachRemoveShort}</Button>} />)}
      </Group>
    )}
    <div className="set-buttons"><Button disabled={disabled} onClick={addFront}>{S.callApps.addFront}</Button></div>
    <Note text={note} live />
    <Problem text={problem} />
  </>);
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
  return (<>
    <Group>
      {rows.length === 0 && <Row label={S.appAnswers.none} />}
      {rows.map((r, i) => (
        <Row key={r.id} label={r.name} labelId={`${baseId}-l${i}`}
          control={<span className="set-pair">
            <ChoiceControl value={r.answer} options={[...options]} labelId={`${baseId}-l${i}`} disabled={!!asking} onChange={(x) => pick(r, x as Answer)} />
            <Button id={`${baseId}-f${i}`} kind="quiet" size="sm" label={S.appAnswers.forgetFor(r.name)} disabled={!!asking} onClick={() => pick(r, "forget")}>{S.appAnswers.forget}</Button>
          </span>}>
          {asking?.row.id === r.id && (
            <ConfirmStep className="set-confirm" label={S.appAnswers.loosenSure(r.name)} back={`${baseId}-f${i}`} onCancel={() => setAsking(null)}>
              <p>{S.appAnswers.loosenSure(r.name)}</p>
              <div className="set-buttons"><Button kind="danger" onClick={yes}>{S.appAnswers.loosenYes}</Button><CancelButton onClick={() => setAsking(null)} /></div>
            </ConfirmStep>
          )}
        </Row>
      ))}
    </Group>
    <div className="set-buttons">
      {!askFront && <Button id={frontId} onClick={front}>{S.appAnswers.neverFront}</Button>}
      {forgettable > 0 && !askAll && <Button id={allId} kind="quiet" onClick={() => setAskAll(true)}>{S.appAnswers.forgetAll}</Button>}
    </div>
    {askFront && (
      <ConfirmStep className="set-confirm" label={S.appAnswers.neverFrontSure(askFront.name)} back={frontId} onCancel={() => setAskFront(null)}>
        <p>{S.appAnswers.neverFrontSure(askFront.name)}</p>
        <div className="set-buttons"><Button onClick={frontYes}>{S.appAnswers.neverFrontYes}</Button><CancelButton onClick={() => setAskFront(null)} /></div>
      </ConfirmStep>
    )}
    {askAll && (
      <ConfirmStep className="set-confirm" label={S.appAnswers.forgetAll} back={allId} onCancel={() => setAskAll(false)}>
        <p>{S.appAnswers.forgetAllSure(forgettable)}</p>
        <div className="set-buttons"><Button onClick={() => { setAskAll(false); done(changeSetting("ph.appAnswers", { op: "forgetAll" })); }}>{S.appAnswers.forgetAllYes}</Button><CancelButton onClick={() => setAskAll(false)} /></div>
      </ConfirmStep>
    )}
    <Note text={note} live />
    <Problem text={problem} />
  </>);
}
// end AppAnswers

/** The safe choice of an are you sure (ConfirmStep takes the keyboard to it: data-cancel). */
function CancelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <Button cancel disabled={disabled} onClick={onClick}>{S.planCancel}</Button>;
}

/** House rules (rules.house): the project's own .companion/rules.txt, in a sheet. Rules are built from the five kinds, taken
 *  off only after an inline confirm, and nothing is written until Save; the shell keeps every line of the file it does not
 *  understand exactly as it was. No reset ever touches them. Drawn once per project (keyed by it), so a list not saved yet
 *  goes when the folder changes, and Save says which project's list it is: the shell refuses it for any other. */
function HouseRules({ project, saved, disabled, onClose }: { project: string; saved: string[]; disabled: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [kind, setKind] = useState<RuleKind>("never_edit");
  const [what, setWhat] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [focusTo, setFocusTo] = useState<string | null>(null);
  const baseId = useId(), addId = useId();
  const list = draft ?? saved;
  const removeId = (i: number) => `${baseId}-${i}`;
  // A rule taken off, or the list saved or put back, takes its button away: the keyboard goes to the next rule's Remove (or
  // the one before), else to the Add box, and only when it was lost (focus.ts).
  useLayoutEffect(() => { if (!focusTo) return; const id = focusTo; setFocusTo(null); takeIfLost(() => document.getElementById(id)); }, [focusTo]);
  const add = () => { setNote(""); const r = addRule(list, kind, what); if (!r.ok) { setProblem(r.problem); return; } setProblem(""); setWhat(""); setDraft(r.list); };
  const remove = (rule: string) => { const at = list.indexOf(rule), rest = removeRule(list, rule); setFocusTo(rest.length ? removeId(Math.min(at, rest.length - 1)) : addId); setAsking(null); setNote(""); setDraft(rest); };
  const save = () => { setProblem(""); void changeSetting("rules.house", list, project).then((x) => { if (x.ok) { setDraft(null); setNote(S.rulesSaved); onClose(); } else setProblem(problemWords(x.code, defOf("rules.house"))); }); };
  // One polite region, always there, whose words change: VoiceOver reads a region that changes, not always one that appears.
  const said = draft ? S.rulesUnsaved : note;
  return (
    <Sheet title={wordsOf("rules.house").label} dirty={!!draft && !disabled} onSave={save} onClose={onClose} saveLabel={S.rulesSave}>
      <Group footer={S.rulesKept}>
        {list.length === 0 && <Row label={S.rulesNone} />}
        {list.map((rule, i) => (
          <Row key={rule} label={rule} control={asking !== rule ? <Button id={removeId(i)} size="sm" disabled={disabled} label={S.setRemoveItem(rule)} onClick={() => setAsking(rule)}>{S.attachRemoveShort}</Button> : null}>
            {asking === rule && (
              <ConfirmStep className="set-confirm" label={S.rulesRemoveSure(rule)} back={removeId(i)} onCancel={() => setAsking(null)}>
                <p>{S.rulesRemoveSure(rule)}</p>
                <div className="set-buttons"><Button kind="danger" onClick={() => remove(rule)}>{S.setRemoveYes}</Button><CancelButton onClick={() => setAsking(null)} /></div>
              </ConfirmStep>
            )}
          </Row>
        ))}
      </Group>
      <div className="set-add">
        <Menu id={addId} label={S.rulesKindLabel} value={kind} disabled={disabled} onChange={(k) => setKind(k as RuleKind)} options={ruleKindOptions()} />
        {kind !== "ask_install" && <Field value={what} maxLength={200} disabled={disabled} label={S.rulesWhat} placeholder={S.rulesWhat} wide
          onChange={setWhat} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />}
        <Button disabled={disabled} onClick={add}>{S.rulesAdd}</Button>
      </div>
      <div className={said ? "set-note" : "sr"} role="status">{said}</div>
      <Problem text={problem} />
    </Sheet>
  );
}

/** Pictures to keep (pictures.keep): lowering it below the pictures kept now says first how many will go. */
function PicturesKeep({ d, value, count, labelId, disabled, onChange, onProblem, inputId }: { d: Def; value: number; count: number | undefined; labelId: string; disabled: boolean; onChange: (v: number) => void; onProblem: (p: string) => void; inputId: string }) {
  const [pending, setPending] = useState<{ to: number; go: number } | null>(null);
  const [fresh, setFresh] = useState(0);   // shows the kept value again when the change is not confirmed
  const want = (to: number) => { const go = picturesGoing(count, value, to); if (go > 0) setPending({ to, go }); else onChange(to); };
  return (<span className="set-pair">
    <NumberControl key={fresh} inputId={inputId} d={d} value={value} labelId={labelId} disabled={disabled} onChange={want} onProblem={onProblem} />
    {pending && (
      <ConfirmStep className="set-confirm" label={S.chkPicturesGo(pending.go, pending.to)} back={inputId} onCancel={() => { setPending(null); setFresh((n) => n + 1); }}>
        <p>{S.chkPicturesGo(pending.go, pending.to)}</p>
        <div className="set-buttons"><Button kind="danger" onClick={() => { const to = pending.to; setPending(null); onChange(to); }}>{S.chkPicturesGoYes}</Button><CancelButton onClick={() => { setPending(null); setFresh((n) => n + 1); }} /></div>
      </ConfirmStep>
    )}
  </span>);
}

/** A list or an editor of its own, as a row: what it holds now, and Edit, which opens a sheet. */
function EditorRow({ d, summary, disabled, sheet, extra }: { d: Def; summary: string; disabled: boolean; sheet: (close: () => void) => ReactNode; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  return (
    <Row id={rowAnchor(d.key)} label={wordsOf(d.key).label} labelId={labelId} description={summary} scope={d.scope === "project" ? "project" : null} disabled={disabled || undefined} more={moreWords(d.key)}
      control={<Button size="sm" disabled={disabled} expanded={open} describedBy={labelId} onClick={() => setOpen(true)}>{S.setFrame.edit}</Button>}>
      {extra}
      {open && sheet(() => setOpen(false))}
    </Row>
  );
}

/** One setting: its name, one line on what changes, its control on the right; Learn more for the rest. Changed from usual:
 *  the dot, whose menu holds Restore usual. A project's own setting: the This project tag. */
function SettingRow({ d, parentOff = "", indent }: { d: Def; parentOff?: string; indent?: boolean }) {
  const c = useCtx();
  const { project, facts, inv } = c;
  useSetting(d.key);
  // A value kept from before that reads as another option (a saved "night" is Graphite, settingsPages.ts OPTION_ALIASES).
  const value = shownValue(d.key, d.kind === "custom" ? snapshotNow()?.values[d.key] : setting(d.key));
  const usual = usualOf(d.key);
  const r = rowModel(d, value, usual, project);
  // A model row offers only the options whose real smoke test has passed (modelChoice.ts); the usual one always. A hidden
  // option (the old Night theme, read as Graphite) is not offered, though a value already set to it still works.
  const offered = offeredOptions(d.key);
  const hidden = HIDDEN_OPTIONS[d.key] ?? [];
  const options = (r.options ?? []).filter((o) => (!offered || offered.includes(o.id)) && !hidden.includes(o.id));
  const labelId = useId(), helpId = useId(), switchId = useId(), inputId = useId();
  const [problem, setProblem] = useState("");
  const done = (p: Promise<{ ok: boolean; code?: string }>) => void p.then((x) => { if (!x.ok) setProblem(problemWords(x.code ?? "other", d)); else if (r.later) c.say(S.setFrame.nextTask); });
  // A project's setting says which project the page was shown it for; the shell refuses it for any other.
  const shownFor = snapshotNow()?.project ?? project;
  const change = (v: unknown): Promise<Done> => { setProblem(""); const p = changeSetting(d.key, v, d.scope === "project" && shownFor ? shownFor : undefined); done(p); return p; };
  const reset = () => { setProblem(""); setAskReset(false); done(resetSetting(d.key)); };
  // Restore usual of Pictures to keep while more are kept: says first how many go, as lowering the number does.
  const [askReset, setAskReset] = useState(false);
  const resetGo = d.key === "pictures.keep" ? picturesResetGoing([d.key], inv?.receiptPictures, value) : 0;
  // Checking your project: the project's own .claude/proof.json or .claude/launch.json wins, and the row shows that, read
  // only; the words after pressing need a button to press; a house rule can make installing ask first.
  const facts_ = facts && facts.project === project ? facts : null;
  const fromFile = proofLines(d.key, facts_);
  const launchWins = d.key === "check.start" && !!facts_?.launchFile;
  const pressNow = useSetting("check.press");
  const rulesNow = useSetting("rules.house");
  const rulesBlocked = (snapshotNow()?.problems ?? []).some((p) => p.key === "rules.house");
  // Home size: Large is suggested while the text is larger than usual.
  const hint = d.key === "home.size" ? homeSizeHint(setting("display.textSize"), value) : null;
  if (d.key === "check.afterPress" && !afterPressShown(pressNow, facts_)) return null;
  const off = r.disabled || fromFile.length > 0 || launchWins || !!parentOff;
  const list = Array.isArray(value) ? (value as string[]) : [];
  // The line under the row: its own words, then what it needs right now (one line each, never a wall). While its parent is
  // off, a child row's one line becomes "Turn on {parent} to use this" (the spec, 2.3), never that note under its own words.
  const line = parentOff ? parentOff : d.key === "spend.dailyLimit" ? S.setFrame.limitLine(valueWords(d, value)) : rowLine(d.key);
  const notes = [
    ...fromFile, ...(launchWins ? [S.chkLaunchFile] : []), ...(d.key === "check.install" ? [installNote(value, rulesNow)] : []),
    hint, d.scope === "project" && !project ? S.setNeedsProject : null,
  ].filter((x): x is string => !!x);
  const changed = r.changed ? { usual: valueWords(d, usual), onRestore: r.canReset ? (resetGo > 0 ? () => setAskReset(true) : reset) : undefined } : null;
  const anchor = rowAnchor(d.key);

  // Lists and editors: a summary and Edit, which opens a sheet (the spec, 3.5).
  if (d.key === "rules.house") {
    return <EditorRow d={d} summary={S.setFrame.rules(list.length)} disabled={r.disabled || rulesBlocked}
      sheet={(close) => <HouseRules key={shownFor} project={shownFor} saved={list} disabled={r.disabled || rulesBlocked} onClose={close} />} />;
  }
  if (d.key === "calls.apps") {
    return <EditorRow d={d} summary={valueWords(d, value)} disabled={off}
      sheet={(close) => <Sheet title={wordsOf(d.key).label} dirty={false} instant onSave={close} onClose={close}><CallApps value={list} disabled={off} onChange={(v) => void change(v)} /><LearnMore words={moreWords(d.key)} /></Sheet>} />;
  }
  if (d.key === "ph.appAnswers") {
    return <EditorRow d={d} summary={S.setFrame.apps(appAnswersFrom(value, {}).length)} disabled={off}
      sheet={(close) => <Sheet title={wordsOf(d.key).label} dirty={false} instant onSave={close} onClose={close}><AppAnswers /><LearnMore words={moreWords(d.key)} /></Sheet>} />;
  }
  if (d.kind === "list" && !d.allowedItems) {
    return <EditorRow d={d} summary={list.length ? list.join(", ") : S.setFrame.items(0)} disabled={off}
      sheet={(close) => <Sheet title={wordsOf(d.key).label} dirty={false} instant onSave={close} onClose={close}><ListEditor d={d} value={list} disabled={off} onChange={change} /></Sheet>} />;
  }

  const control = (() => {
    // M30: the water's colour is a row of pictures, as HeyClicky shows its cursor colours; how lively too (F28).
    if (d.key === "look.water") return <WaterSwatches value={String(value)} onChange={change} labelId={labelId} />;
    if (d.key === "character.lively") return <LivelyPictures value={String(value)} onChange={change} labelId={labelId} disabled={off} />;
    if (d.key in LOOK_PICTURE) return <LookPictures d={d} value={String(value)} onChange={change} labelId={labelId} disabled={off} />;
    if (d.key === "check.start") return <ChoiceControl d={d} value={String(value)} options={startOptions(value, facts_)} labelId={labelId} disabled={off} onChange={change} />;
    if (d.key === "pictures.keep") return <PicturesKeep d={d} value={typeof value === "number" ? value : (d.default as number)} count={inv?.receiptPictures} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} inputId={inputId} />;
    switch (d.kind) {
      case "switch": return <Switch id={switchId} checked={value === true} labelledBy={labelId} describedBy={helpId} disabled={off} onChange={change} />;
      case "choice": return <ChoiceControl d={d} value={String(value)} options={options} labelId={labelId} disabled={off} onChange={change} />;
      case "number": return <NumberControl d={d} value={typeof value === "number" ? value : (d.default as number)} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} inputId={inputId} />;
      case "text": return <TextControl d={d} value={typeof value === "string" ? value : ""} labelId={labelId} disabled={off} onChange={change} onProblem={setProblem} />;
      default: return null;
    }
  })();
  // A choice made by looking (the water, how lively) is a row of pictures under the words; every other control sits on
  // the right of the row (ui/controlRule.ts).
  const under = controlFor(d) === "pictures";
  // A list from a fixed set (Also say out loud, Checks to leave out): its items are child rows with a switch each.
  const children = d.kind === "list" && d.allowedItems
    ? (d.key === "check.skip"
      ? (skipItems(facts_, list).length ? <AllowedList d={d} value={list} items={skipItems(facts_, list)} disabled={off} onChange={change} switchLabel={S.chkLeaveOut} /> : <Row indent label={S.chkNoChecks} />)
      : <AllowedList d={d} value={list} disabled={off} onChange={change} />)
    : null;
  const extras = [
    under && control ? <div key="pictures">{control}</div> : null,
    ...notes.map((n) => <Note key={`note-${n}`} text={n} />),
    askReset && resetGo > 0 ? (
      <ConfirmStep key="ask" className="set-confirm" label={S.chkPicturesGo(resetGo, Number(usual))} back={inputId} onCancel={() => setAskReset(false)}>
        <p>{S.chkPicturesGo(resetGo, Number(usual))}</p>
        <div className="set-buttons"><Button kind="danger" onClick={reset}>{S.chkPicturesGoYes}</Button><CancelButton onClick={() => setAskReset(false)} /></div>
      </ConfirmStep>
    ) : null,
    problem ? <Problem key="problem" text={problem} /> : null,
  ].filter(Boolean);
  return (<>
    <Row id={anchor} label={r.label} description={line || undefined} labelId={labelId} descriptionId={helpId} indent={indent}
      controlId={d.kind === "switch" ? switchId : d.kind === "number" ? inputId : undefined} control={under ? null : control} disabled={off || undefined}
      changed={changed} scope={d.scope === "project" ? "project" : null} more={moreWords(d.key)}>
      {extras.length ? extras : null}
    </Row>
    {children}
  </>);
}

// ---------- rows the page draws itself ----------

/** At rest (the spec, 3.4): Show, Half or Hidden, one control for Tuck into the edge and Stick to the edge. */
function AtRestRow() {
  const peek = useSetting("character.peek"), stick = useSetting("character.stick");
  const labelId = useId();
  const [problem, setProblem] = useState("");
  const v = atRestOf(peek, stick);
  const pick = async (to: AtRest) => {
    setProblem("");
    for (const [k, val] of atRestWrites(to)) { const r = await changeSetting(k, val); if (!r.ok) { setProblem(problemWords(r.code)); return; } }
  };
  const changed = changedNow().some((k) => k === "character.peek" || k === "character.stick");
  const usual = atRestOf(defaultOf("character.peek"), defaultOf("character.stick"));
  return (
    <Row id={rowAnchor("character.peek")} label={S.setRows.atRest.label} labelId={labelId} description={S.setRows.atRest.desc}
      changed={changed ? { usual: S.setRows.atRest.options[usual], onRestore: () => { void resetSetting("character.peek").then(() => resetSetting("character.stick")); } } : null}
      more={[wordsOf("character.peek").help, wordsOf("character.stick").help]}
      control={<Segmented labelledBy={labelId} value={v} options={AT_REST.map((id) => ({ id, label: S.setRows.atRest.options[id] }))} onChange={(x) => void pick(x)} />}>
      <Problem text={problem} />
    </Row>
  );
}

/** The one line a key row says under the job (the spec, 3.4), then why it has no keys or fell back, when it did. */
const F28_JOBS: readonly Job[] = ["problem", "talk", "read", "stop", "accept"];
/** Keys (keys.hotkeys, rendered as rows): each job with its keys as the Mac's own caps and Change, which opens a sheet with
 *  a short list of keys free on this Mac and any keys you like. The app registers new keys at once and keeps them only if
 *  they work, saved on this Mac (keymap.rs). Nothing here reads key presses (rule 8): the person picks. */
function KeysRows({ keys }: { keys: Keys }) {
  const c = useCtx();
  const [open, setOpen] = useState<Job | null>(null);
  const [others, setOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = keyRows(keys);
  const row = (job: Job) => {
    const r = rows.find((x) => x.job === job)!;
    return (
      <Row key={job} id={`set-key-${job}`} label={r.name} description={(S.keyJobLines as Record<string, string>)[job]} more={r.line && !r.problem ? [r.line] : undefined}
        control={<span className="set-pair"><KeyLabel chord={keys.using[job]} />{!keys.using[job] && <span className="set-quiet">{r.none ? S.keysNoKeyYet : S.keysNone}</span>}
          <Button size="sm" disabled={busy} label={S.keysChangeFor(r.name)} expanded={open === job} onClick={() => setOpen(job)}>{keys.using[job] ? S.keysChange : S.setFrame.addKey}</Button></span>}>
        {r.line && r.problem && <p className="set-problem" role="alert">{r.line}</p>}
        {talkCost(keys.using[job] ?? "") && <Note text={talkCost(keys.using[job] ?? "")} />}
      </Row>
    );
  };
  const reset = () => {
    if (busy) return;
    setBusy(true); setOpen(null);
    void invoke("reset_keys").then((v) => { setKeysNow(keysFrom(v)); c.say(resetLine(v)); }).catch((e) => c.say(keyProblem(String(e)))).finally(() => setBusy(false));
  };
  const rest = rows.map((r) => r.job).filter((j) => !F28_JOBS.includes(j));
  // F28, once after the update: the jobs on this Mac that lost their old usual keys (never a key the person picked).
  const dropped = droppedLine(keys);
  const seen = () => { void invoke("keys_notice_seen").then((v) => setKeysNow(keysFrom(v))).catch(() => {}); };
  return (<>
    <Group id="keys.keys" title={S.setGroupTitles["keys.keys"]} footer={<Button size="sm" disabled={busy} onClick={reset}>{S.setRows.restoreKeys}</Button>}>
      {dropped && <div className="set-pair" role="status"><Note text={dropped} /><Button size="sm" onClick={seen}>{S.keysDroppedOk}</Button></div>}
      {F28_JOBS.map(row)}
    </Group>
    <Disclosure id="keys.others" title={S.setRows.otherJobs} open={others} onToggle={setOthers}>
      <Group>{rest.map(row)}</Group>
    </Disclosure>
    {open && <KeySheet job={open} keys={keys} onClose={(changed) => { const job = open; setOpen(null); if (changed) c.say(keyChangedLine(job, changed)); }} />}
  </>);
}

/** One job's keys in a sheet: the short list the app says is free on this Mac (keys another job has cannot be picked), and
 *  any keys you like. A pick applies at once; the sheet closes. */
function KeySheet({ job, keys, onClose }: { job: Job; keys: Keys; onClose: (changed: Keys | null) => void }) {
  const [c, setC] = useState<Choices | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const name = (S.keyJobs as Record<Job, string>)[job];
  const load = () => { void invoke("key_choices", { action: job }).then((v) => { if (live.current) setC(choicesFrom(v, job)); }).catch((e) => { if (live.current) setProblem(keyProblem(String(e))); }); };
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, [job]);
  const pick = (id: string) => {
    if (busy) return;
    setBusy(true); setProblem("");
    void invoke("set_key", { action: job, id }).then((v) => { const k = keysFrom(v); setKeysNow(k); onClose(k); })
      .catch((e) => {
        const code = String(e);
        setProblem(keyProblem(code));
        // Another app took them since the list was asked for: ask again, so they show as taken.
        if (code === "taken") load();
      })
      .finally(() => setBusy(false));
  };
  return (
    <Sheet title={S.setRows.keyChangeSheet(name)} dirty={false} instant onSave={() => onClose(null)} onClose={() => onClose(null)}>
      {!c && !problem && <p className="set-note" role="status">{S.keysChecking}</p>}
      {c && (<>
        <div className="set-buttons" role="group" aria-label={S.keysPickFor(name)}>
          {c.choices.map((id) => <Button key={id} pressed={keys.using[job] === id} disabled={busy || !canPick(c, id)} label={chordLabel(id)} describedBy={talkCost(id) ? `key-cost-${id}` : undefined} onClick={() => pick(id)}><KeyLabel chord={id} hidden /></Button>)}
        </div>
        {pickerLines(c, keys).map((l) => <Note key={l} text={l} />)}
        {c.choices.map((id) => talkCost(id) && <p className="set-note" id={`key-cost-${id}`} key={id}>{talkCost(id)}</p>)}
        <AnyKeys busy={busy} pick={pick} />
      </>)}
      <Problem text={problem} />
    </Sheet>
  );
}

// Any keys, not only the short list (finding L): turn on Control, Option, Shift and Command and choose the key from a menu.
// Nothing here listens to the keyboard (rule 8): the page builds the chord's id, says in plain words why one is not enough,
// and the app checks it again and tries it like any other (taken by another app, used by another job).
function AnyKeys({ busy, pick }: { busy: boolean; pick: (id: string) => void }) {
  const [t, setT] = useState<Ticked>({ control: false, option: false, shift: false, command: false });
  const [key, setKey] = useState("");
  const built = key ? customChord(t, key) : null;
  const id = built && "id" in built ? built.id : "";
  const why = built && "problem" in built ? (built.problem === "reserved" ? S.keysReserved : built.problem === "not_enough" ? S.keysNotEnough : "") : "";
  return (
    <Group title={S.keysCustomTitle} footer={S.keysCustomHelp}>
      {(["control", "option", "shift", "command"] as const).map((mod) => (
        <Row key={mod} label={S.keyWords[mod]} control={<Switch checked={t[mod]} label={S.keyWords[mod]} disabled={busy} onChange={(on) => setT({ ...t, [mod]: on })} />} />
      ))}
      <Row label={S.keysCustomKey} control={<Menu label={S.keysCustomKey} value={key} placeholder={S.keysCustomKey} disabled={busy} onChange={setKey}
        options={CUSTOM_KEYS.map((k) => ({ id: k, label: k.length === 1 ? k.toUpperCase() : S.keyWords.space }))} />} />
      <Row label={id ? <KeyLabel chord={id} /> : S.keysCustomTitle} description={why || undefined}
        control={<Button disabled={busy || !id} onClick={() => { if (id) pick(id); }}>{S.keysCustomUse}</Button>} />
    </Group>
  );
}

// Talking and listening (M11 wave 4, item 2): the microphone, the language, the voice and its speed (the registry's
// talk.voice, drawn as rows). The app lists the Mac's voices and microphones and keeps the choices on this Mac (voiceset.rs,
// voice.json); one that is away says so, and when the Mac's sound is off it says spoken lines are shown as words only. Read
// again whenever the card comes back to the front (headphones may have been switched on or off meanwhile).
/** The id a menu uses for "the Mac's own" microphone or voice (the shell's null). */
const MAC_DEFAULT = "mac-default";
function VoiceRows({ parentOff }: { parentOff: string }) {
  const [v, setV] = useState<VoiceSettings>(VOICE_START);
  const [problem, setProblem] = useState("");
  const [tried, setTried] = useState("");
  const micId = useId(), langId = useId(), voiceId = useId();
  const load = () => void invoke("voice_settings").then((x) => setV(noteSpeed(voiceSettingsFrom(x)))).catch(() => {});
  useEffect(() => { load(); const f = () => load(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  // Put back by Restore usual or Undo (the registry's talk.voice): read the lists again.
  const saved = JSON.stringify(useSetting("talk.voice") ?? null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } load(); }, [saved]);
  const change = (c: Parameters<typeof voiceAsk>[1]) => { setProblem(""); setTried(""); void invoke("set_voice_settings", voiceAsk(v, c)).then((x) => setV(noteSpeed(voiceSettingsFrom(x)))).catch((e) => setProblem(voiceProblem(String(e)))); };
  const heard = (r: unknown) => { const o = (r ?? {}) as { said?: boolean; why?: string; sound?: Sound }; setTried(o.said === false && o.why === "sound" ? soundLine(o.sound ?? "muted") : o.said === false && o.why === "quiet" ? S.voiceQuietNow : ""); };
  const off = !!parentOff;
  // The speeds are a choice like any other: two or three side by side, more in a menu (ui/controlRule.ts).
  const speeds = v.speeds.map((n) => ({ id: String(n), label: speedLabel(n) }));
  const speed = (id: string) => change({ speed: Number(id) });
  return (<>
    <Row id={rowAnchor("talk.voice")} indent label={S.setRows.microphone} labelId={micId} description={parentOff || micLine(v) || undefined} disabled={off || undefined}
      control={<Menu labelledBy={micId} value={v.mic ?? MAC_DEFAULT} disabled={off} onChange={(id) => change({ mic: id === MAC_DEFAULT ? null : id })}
        options={[{ id: MAC_DEFAULT, label: micDefaultLabel(v) }, ...(v.mic && v.micMissing ? [{ id: v.mic, label: S.notConnected(v.micMissing) }] : []), ...v.inputs.map((i) => ({ id: i.id, label: i.name }))]} />}
      more={[S.micHelp, S.voiceSettingsHelp]} />
    <Row indent label={S.setRows.language} labelId={langId} description={parentOff || S.voiceLanguageHelp} disabled={off || undefined}
      control={<Menu labelledBy={langId} value={v.language} disabled={off} onChange={(l) => change({ language: l })} options={v.languages.map((l) => ({ id: l, label: languageLabel(l) }))} />}
      more={[S.voiceWordsHelp]} />
    <Row indent label={S.setRows.voiceAndSpeed} labelId={voiceId} description={parentOff || voiceLine(v) || soundLine(v.sound) || undefined} disabled={off || undefined} more={[S.voiceMoreHelp]}
      control={<span className="set-pair">
        <Menu labelledBy={voiceId} value={v.voice ?? MAC_DEFAULT} disabled={off} onChange={(id) => change({ voice: id === MAC_DEFAULT ? null : id })}
          options={[{ id: MAC_DEFAULT, label: S.voiceMacDefault }, ...(v.voice && v.voiceMissing ? [{ id: v.voice, label: S.notOnThisMac(v.voiceMissing) }] : []), ...v.voices.map((x) => ({ id: x.id, label: voiceLabel(x) }))]} />
        {choiceControl(speeds.length) === "segmented"
          ? <Segmented label={S.voiceSpeedGroup} value={String(v.speed)} options={speeds} disabled={off} onChange={speed} />
          : <Menu label={S.voiceSpeedGroup} value={String(v.speed)} options={speeds} disabled={off} onChange={speed} />}
      </span>}>
      {buttonShown("voiceTry") && <div className="set-buttons"><Button size="sm" disabled={off} onClick={() => void invoke("speak", { text: S.voiceSample }).then(heard).catch(() => {})}>{S.voiceTry}</Button></div>}
      {tried && tried !== soundLine(v.sound) && <Note text={tried} live />}
      <Problem text={problem} />
    </Row>
  </>);
}

/** Reads every key a group's items own, so a change anywhere draws the group again. */
const keyOf = (i: Item): string | null => (typeof i === "string" ? i : null);

/** One item of a group: a setting's row (or the rows a custom setting draws), or a part that is not a setting. */
function ItemRows({ item, parentOff = "", indent }: { item: Item; parentOff?: string; indent?: boolean }) {
  if (typeof item !== "string") return <FixedRows fixed={item.fixed} />;
  const d = defOf(item);
  if (!d || d.hidden || !shownSettings().some((x) => x.key === item) || !shownNow(item, setting)) return null;
  const parentKey = CHILD_OF[item];
  const parentWords = parentKey && setting(parentKey) !== true ? S.ui.turnOnFirst(wordsOf(parentKey).label) : parentOff;
  if (item === "keys.hotkeys") return null;   // drawn as its own groups (KeysRows)
  if (item === "talk.voice") return <VoiceRows parentOff={parentWords} />;
  if (item === "character.peek") return <AtRestRow />;
  return <SettingRow d={d} parentOff={parentWords} indent={indent ?? !!parentKey} />;
}

/** A page's group: its title, its rows, its footer. A group with nothing to show is left out. */
function GroupView({ id, items }: { id: string; items: readonly Item[] }) {
  const c = useCtx();
  useSettings([...items.map(keyOf).filter((k): k is string => !!k), "groups.cutNotice"]);
  if (items.length === 1 && typeof items[0] === "string" && items[0] === "keys.hotkeys") return <KeysRows keys={c.keys} />;
  const only = items.length === 1 && typeof items[0] !== "string" ? items[0].fixed : null;
  // A few parts are a whole group on their own, with their own card.
  if (only === "plan") return <PlanGroup />;
  if (only === "preview") return <FlowflowPreview />;
  if (only === "setup") return <SetupGroup />;
  if (only === "danger") return <DangerZone />;
  const title = (S.setGroupTitles as Record<string, string>)[id];
  const foot = (S.setGroupFoot as Record<string, string>)[id];
  // F28, once after the update: the tools that now start off and that this Mac had not used (settings.rs launch_cut).
  const cut = id === "general.tools" ? cutNoticeLine() : "";
  return (
    <Group id={id} title={title || undefined} footer={foot}>
      {cut && <div className="set-pair" role="status"><Note text={cut} /><Button size="sm" onClick={() => void changeSetting("groups.cutNotice", [])}>{S.cutNoticeOk}</Button></div>}
      {items.map((i) => <ItemRows key={typeof i === "string" ? i : `fixed:${i.fixed}`} item={i} />)}
    </Group>
  );
}

// ---------- the parts that are not settings ----------

function FixedRows({ fixed }: { fixed: Fixed }) {
  switch (fixed) {
    case "key": return <KeyRow />;
    case "permissions": return <PermissionRows />;
    case "kept": return <KeptRow />;
    case "updates": return <UpdatesRow />;
    case "replay": return <ReplayRow />;
    case "practice": return <PracticeRow />;
    case "made": return <MadeRow />;
    case "logs": return <LogsRow />;
    case "acknowledgements": return <AckRow />;
    case "usedOften": return <UsedOftenRow />;
    // An account already connected always shows, to be seen and disconnected; connecting a new one needs watch routines on.
    case "google": return placeShown("google") ? <GoogleSection connecting={setting("watch.on") === true} /> : null;
    default: return null;
  }
}
const fixedAnchor = (fx: Fixed): string => `set-fixed-${fx}`;

/** The Plan card (the payments spec, 9a; T17): from the shell's license_status and the engine's free fix count. With
 *  payments off it says Early access and offers nothing to buy (planCard.tsx draws it, plan.ts decides it). */
function PlanGroup() {
  const c = useCtx();
  const status = usePlan();
  return (
    <Group id="account.plan" title={S.setGroupTitles["account.plan"]} footer={S.setGroupFoot["account.plan"]} pad>
      <PlanCardView status={status} usage={c.usage} say={(l) => c.say(l)} anchor={fixedAnchor("plan")} />
    </Group>
  );
}

/** The person's own key (the spec, 3.4): saved in the Keychain with Replace (a sheet), or a field and Save key when there is
 *  none. The box is emptied at once, whatever happens next; nothing on the page keeps a copy. Remove is in the danger zone. */
function KeyRow() {
  const c = useCtx();
  const saved = !!c.inv?.keySaved;
  const [key, setKey] = useState("");
  const [sheet, setSheet] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const labelId = useId();
  const save = () => {
    const r = submitKey(key);
    setKey("");   // emptied at once, whatever happens next; nothing on the page keeps a copy
    if (!r.send) { setProblem(r.problem ?? ""); return; }
    setProblem(""); setBusy(true);
    void invoke("save_api_key", { key: r.send }).then(() => { setSheet(false); c.say(S.keySavedNote); c.reload(); }).catch((e) => setProblem(failNote(e, "key"))).finally(() => setBusy(false));
  };
  const field = <Field type="password" value={key} label={S.obKeyLabel} placeholder="sk-ant-..." disabled={busy} error={problem || undefined}
    onChange={setKey} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(); }} />;
  if (!c.inv) return null;
  return (<>
    <Row id={fixedAnchor("key")} label={S.setRows.keyLabel} labelId={labelId} description={S.setRows.keyDesc}
      control={saved
        ? <span className="set-pair"><ProofChip kind="pass" label={S.setRows.keySavedChip} /><Button size="sm" onClick={() => { setProblem(""); setSheet(true); }}>{S.setRows.keyReplace}</Button></span>
        : <span className="set-pair">{field}<Button kind="primary" size="sm" disabled={busy || !key} onClick={save}>{S.setRows.keySave}</Button></span>} />
    {sheet && (
      <Sheet title={S.setRows.keySheet} dirty={!!key} onSave={save} onClose={() => { setKey(""); setProblem(""); setSheet(false); }} saveLabel={S.setRows.keySave}>
        <p className="set-note">{S.keyNewHelp}</p>
        {field}
      </Sheet>
    )}
  </>);
}

const PERM_OF: Record<PermissionKind, Permission> = { screen_recording: "screenRecording", accessibility: "accessibility", microphone: "microphone" };
/** What Squibby may see (the spec, 3.4; rule 8): each permission's state, why it is asked, and Open System Settings when it
 *  is not allowed. "Not needed yet" until a feature first asks; nothing is asked here. */
function PermissionRows() {
  const c = useCtx();
  const [perms, setPerms] = useState<Record<PermissionKind, PermissionState> | null>(null);
  const load = () => void invoke("permission_overview").then((v) => setPerms(v as Record<PermissionKind, PermissionState>)).catch(() => {});
  useEffect(() => { load(); const f = () => load(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  if (!perms) return null;
  return (<>
    {(["accessibility", "screen_recording", "microphone"] as PermissionKind[]).map((k) => {
      const r = permissionRow(k, perms[k]);
      const chip: ChipKind = perms[k] === "allowed" ? "allowed" : perms[k] === "not_asked" || !permissionNeeded(PERM_OF[k]) ? "notNeeded" : "notAllowed";
      return (
        <Row key={k} id={k === "accessibility" ? fixedAnchor("permissions") : undefined} label={r.label} description={r.why}
          control={<span className="set-pair"><ProofChip kind={chip} />{r.button && <Button size="sm" onClick={() => void invoke("open_permission_page", { which: k })}>{S.settingsOpenSystem}</Button>}</span>}>
          {r.button && <div className="set-buttons"><Button kind="quiet" size="sm" onClick={() => c.onLesson(permissionLesson(k))}>{S.settingsWalkMe}</Button></div>}
        </Row>
      );
    })}
  </>);
}

function KeptRow() {
  const c = useCtx();
  return <Row id={fixedAnchor("kept")} label={S.setRows.keptLabel} description={S.setRows.keptDesc} control={<Button size="sm" onClick={c.onMemory}>{S.setRows.openMemory}</Button>} />;
}

/** Finish setting up (Retool): the three things a new person still needs, each with one button, gone for good once done.
 *  No permission is listed here: each is asked the first time its feature is used (rule 8). */
const SETUP_DONE = "companion.setupDone", STOP_LEARNED = "companion.stopKeyLearned";
const stored = (k: string): boolean => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const store = (k: string): void => { try { localStorage.setItem(k, "1"); } catch { /* storage may be unavailable */ } };
function SetupGroup() {
  const c = useCtx();
  const [stop, setStop] = useState(() => stored(STOP_LEARNED));
  const [gone] = useState(() => stored(SETUP_DONE));
  if (gone || !c.inv) return null;
  const items = [
    // M69 (F29): no key step; nobody adds a key (it stays a developer tool under Account).
    { id: "folder", label: S.setRows.setupFolder, done: !!c.project, button: S.setRows.setupPick, act: c.onPickFolder },
    { id: "stop", label: S.setRows.setupStop, done: stop, button: S.setRows.setupLearn, act: () => { store(STOP_LEARNED); setStop(true); c.go("keys.keys"); }, desc: c.keys.using.stop ? S.setRows.setupStopDesc(chordLabel(c.keys.using.stop)) : undefined },
  ];
  if (items.every((i) => i.done)) { store(SETUP_DONE); return null; }
  return (
    <Group id="general.setup" title={S.setGroupTitles["general.setup"]}>
      {items.map((i) => <Row key={i.id} id={i.id === "folder" ? fixedAnchor("setup") : undefined} label={i.label} description={i.desc}
        control={i.done ? <span className="set-done"><Icon name="tick" size={12} />{S.setRows.setupDone}</span> : <Button size="sm" onClick={i.act}>{i.button}</Button>} />)}
    </Group>
  );
}

/** Updates (About): the state now, Check now, Install once one is found (the one main button), and its notes. */
function UpdatesRow() {
  const c = useCtx();
  const [up, setUp] = useState<UpdateState>(found.update ?? { stage: "idle" });
  const [upInfo, setUpInfo] = useState<{ configured: boolean; version: string }>({ configured: false, version: "" });
  const [notes, setNotes] = useState(false);
  const [upNote, setUpNote] = useState("");
  useEffect(() => { void invoke("update_status").then((v) => { const o = (v ?? {}) as { configured?: boolean; version?: string }; setUpInfo({ configured: !!o.configured, version: String(o.version ?? "") }); }).catch(() => {}); }, []);
  const checkNow = () => {
    setUp({ stage: "checking" });
    void invoke("check_update").then((v) => {
      try { localStorage.setItem("companion.updateChecked", String(Date.now())); } catch { /* storage may be unavailable */ }
      const r = v as { available: boolean; version?: string; notes?: string };
      found.update = r.available ? { stage: "found", version: r.version ?? "", notes: r.notes ?? "" } : null;
      setUp(found.update ?? { stage: "none" });
    }).catch((e) => setUp({ stage: "failed", reason: String(e) }));
  };
  const installNow = () => {
    if (!canInstall(c.working)) return;
    const prev = found.update; setUpNote(""); setUp({ stage: "installing" });
    // The shell keeps the update when an install fails, so it is put back and Install can be pressed again.
    void invoke("install_update").catch((e) => { const r = afterInstallFailed(prev, String(e)); found.update = r.update; setUp(r.state); setUpNote(r.note); });
  };
  return (
    <Row id={fixedAnchor("updates")} label={<span role="status">{updateLine(up, upInfo.version, upInfo.configured)}</span>}
      description={up.stage === "found" && !canInstall(c.working) ? S.updatesBusy : undefined} more={[S.updatesHelp]}
      control={upInfo.configured ? <span className="set-pair">
        <Button size="sm" disabled={up.stage === "checking" || up.stage === "installing"} onClick={checkNow}>{S.setRows.updatesNow}</Button>
        {up.stage === "found" && <Button kind="primary" size="sm" disabled={!canInstall(c.working)} onClick={installNow}>{S.updatesInstall}</Button>}
      </span> : undefined}>
      {up.stage === "found" && up.notes && <div className="set-buttons"><Button kind="quiet" size="sm" expanded={notes} onClick={() => setNotes(!notes)}>{S.setRows.releaseNotes}</Button></div>}
      {up.stage === "found" && up.notes && notes && <Note text={up.notes} />}
      {up.stage === "found" && upNote && <p className="set-problem" role="alert">{upNote}</p>}
    </Row>
  );
}

function ReplayRow() {
  // The first run comes back in Home (firstRunAgain.ts): Home is open already, so it shows at once.
  return <Row id={fixedAnchor("replay")} label={S.setRows.replay}
    control={<Button size="sm" onClick={() => { showFirstRunAgain(); void invoke("open_card_cmd").catch(() => {}); }}>{S.setRows.replayButton}</Button>} />;
}

function PracticeRow() {
  const c = useCtx();
  // Move all my practice copies to the Trash: asked first, then what happened in one line.
  const [askPractice, setAskPractice] = useState(false);
  const [practiceSaid, setPracticeSaid] = useState("");
  const practiceAllId = useId();
  const trashPractice = () => { setAskPractice(false); void invoke("remove_all_practices", { busy: c.practiceBusy }).then((v) => { const r = v as { moved?: number; kept?: string[] }; setPracticeSaid(S.practiceRemovedAll(Number(r.moved) || 0, Array.isArray(r.kept) ? r.kept.map(String) : [])); c.reload(); }).catch((e) => setPracticeSaid(failNote(e, "practice"))); };
  return (
    <Row id={fixedAnchor("practice")} label={S.setRows.practice} description={rowLineOf(S.practiceListHelp)}
      control={<Button size="sm" onClick={c.onPracticeList}>{S.setFrame.open}</Button>}>
      {!askPractice && (c.inv?.practiceCopies ?? 0) > 0 && <div className="set-buttons"><Button id={practiceAllId} kind="quiet" size="sm" onClick={() => { setPracticeSaid(""); setAskPractice(true); }}>{S.practiceRemoveAll}</Button></div>}
      {askPractice && (
        <ConfirmStep className="set-confirm" label={S.practiceRemoveAllSure} back={practiceAllId} onCancel={() => setAskPractice(false)}><p>{S.practiceRemoveAllSure}</p>
          <div className="set-buttons"><Button kind="danger" onClick={trashPractice}>{S.practiceRemoveAllYes}</Button><CancelButton onClick={() => setAskPractice(false)} /></div>
        </ConfirmStep>
      )}
      <Note text={practiceSaid} live />
    </Row>
  );
}
/** The first sentence of a longer line, for a row's one line. */
const rowLineOf = (text: string): string => { const f = /^[^]*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text; return f.length <= LINE_MAX ? f : ""; };

function MadeRow() {
  const c = useCtx();
  const [open, setOpen] = useState(false);
  return (
    <Row id={fixedAnchor("made")} label={S.setRows.made} control={<Button size="sm" expanded={open} onClick={() => setOpen(true)}>{S.setFrame.open}</Button>}>
      {open && <Sheet title={S.setRows.made} dirty={false} instant onSave={() => setOpen(false)} onClose={() => setOpen(false)}><MadePanel busy={c.practiceBusy} project={c.project} /></Sheet>}
    </Row>
  );
}

function LogsRow() {
  const c = useCtx();
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState("");
  // M69 step 3: Save a log for support is a row of its own with its own button, not a stray link under Report a problem.
  return (<>
    <Row id={fixedAnchor("logs")} label={S.setRows.report} more={[S.reportHelp]}
      control={<Button size="sm" disabled={exporting} onClick={() => { setExporting(true); setExported(""); void invoke("report_problem", { subject: S.reportSubject, body: S.reportBody }).then((n) => { setExported(S.reportOpened(String(n))); c.onStepAside(); }).catch((e) => setExported(failNote(e, "report"))).finally(() => setExporting(false)); }}>{S.reportButton}</Button>}>
      <Note text={exported} live />
    </Row>
    <Row label={S.exportLogs} more={[S.exportLogsHelp]}
      control={<Button size="sm" disabled={exporting} onClick={() => { setExporting(true); setExported(""); void invoke("export_logs").then((n) => { setExported(S.exportLogsDone.replace("{name}", String(n))); c.onStepAside(); }).catch((e) => setExported(failNote(e, "logs"))).finally(() => setExporting(false)); }}>{S.setRows.saveLog}</Button>} />
  </>);
}

function AckRow() {
  return <Row id={fixedAnchor("acknowledgements")} label={S.setRows.acknowledgements} description={rowLineOf(S.acknowledgementsHelp)}
    control={<Button kind="quiet" size="sm" onClick={() => void invoke("open_acknowledgements").catch(() => {})}>{S.setFrame.view}</Button>} />;
}

/** M55, adapts to you: what More ways to ask learned from the person's own presses (usedOften.ts), said in words, and
 *  Reset, which forgets all of it at once. Nothing else is kept, and none of it leaves this Mac. */
function UsedOftenRow() {
  const counts = useUsedOften();
  const first = risen(counts);
  const [said, setSaid] = useState("");
  const line = said || (first.length ? S.setRows.usedOftenNow(first.map(wayLabel).join(", ")) : S.setRows.usedOftenNone);
  return <Row id={fixedAnchor("usedOften")} label={S.setRows.usedOften} description={<span role="status">{line}</span>}
    control={<Button size="sm" disabled={Object.keys(counts).length === 0} onClick={() => { resetUsed(); setSaid(S.setRows.usedOftenDone); }}>{S.setRows.usedOftenReset}</Button>} />;
}

/** The counts kept on this Mac (numbers.on): shown, copied or erased on a press. Nothing is sent. */
function NumbersRows() {
  const [nums, setNums] = useState<NumbersSummary | null>(null);
  const [showNums, setShowNums] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const off = listen("runner-event", (e) => { const ev = e.payload as { type?: string } & Partial<NumbersSummary>; if (ev.type === "metrics.summary") setNums({ enabled: !!ev.enabled, totals: ev.totals ?? {}, rates: ev.rates ?? {} }); });
    return () => { off.then((f) => f()); };
  }, []);
  return (<div className="set-buttons-block">
    <div className="set-buttons">
      <Button size="sm" expanded={showNums} onClick={() => { setShowNums((v) => !v); void send(metricsShow()); }}>{S.numbersShow}</Button>
      {nums && showNums && <Button kind="quiet" size="sm" onClick={() => { setCopied(false); void (navigator.clipboard?.writeText(numbersLines(nums).join("\n")) ?? Promise.reject(new Error("no clipboard"))).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {}); }}>{copied ? S.numbersCopied : S.numbersCopy}</Button>}
      <Button kind="quiet" size="sm" onClick={() => { setShowNums(false); void send(metricsErase()); }}>{S.numbersErase}</Button>
    </div>
    {nums && showNums && numbersLines(nums).map((l, i) => <Note key={i} text={l} />)}
  </div>);
}

/** The danger zone, the last group on Privacy (the spec, 3.9): each row says exactly what happens, with one Danger button
 *  and an are you sure; the two that cannot be taken back ask for their words to be typed. */
function DangerZone() {
  const c = useCtx();
  const [step, setStep] = useState<"" | "forget" | "key" | "delete" | "reset">("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [withProjects, setWithProjects] = useState(false);
  const [withPractice, setWithPractice] = useState(false);
  // Also turn off Pro on this Mac (the payments spec, section 10): asked only while payments are on and a Pro key is saved.
  const [withPro, setWithPro] = useState(false);
  const pro = proInventoryFrom(c.inv?.pro);
  const forgetId = useId(), keyId = useId(), deleteId = useId(), resetAllId = useId();
  const deleting = useRef(false);   // a second click while macOS is asking must not start a second delete
  const close = () => { if (busy) return; setStep(""); setTyped(""); setProblem(""); };
  const open = (s: typeof step) => { setTyped(""); setProblem(""); setStep(s); };
  const forget = () => {
    const p = c.project || NO_PROJECT;
    void send(eraseMemory(p, "project")); void send(eraseMemory(p, "profile"));
    setStep(""); c.say(S.danger.forgetDone);
  };
  const removeKey = () => {
    setProblem(""); setBusy(true);
    void invoke("remove_api_key", { confirm: REMOVE_KEY_PHRASE }).then(() => { setStep(""); c.say(S.keyRemovedNote); c.reload(); }).catch((e) => setProblem(String(e))).finally(() => setBusy(false));
  };
  const remove = () => {
    if (deleting.current) return;
    deleting.current = true; setBusy(true); setProblem("");
    void invoke("delete_everything", { confirm: DELETE_PHRASE, withProjects, withPractice, ...(askTurnOffPro(pro) ? { withPro } : {}) })
      .catch((e) => { deleting.current = false; setBusy(false); setProblem(proDeleteProblem(e) ?? String(e)); });
  };
  // Reset all settings to usual, asked first, naming every setting that changes; then Undo for ten seconds puts every
  // value back through the shell.
  const changedAll = changedNow();
  const unheardAll = notHeard();
  const goAll = picturesResetGoing(changedAll, c.inv?.receiptPictures, setting("pictures.keep"));
  const resetEverything = () => {
    setStep("");
    void resetWithUndo().then(({ done, back }) => {
      if (!done.ok) { c.say(problemWords(done.code)); return; }
      c.say(done.notReset?.length ? S.setNotAllBack : S.setResetDone(back.length), () => void undoReset(back).then((failed) => c.say(failed.length ? S.setNotAllBack : S.setUndone)));
    });
  };
  const typeBox = (phrase: string) => (<>
    <p className="set-note">{S.danger.typeToConfirm(phrase)}</p>
    <Field value={typed} label={S.danger.typeLabel} disabled={busy} onChange={setTyped} />
  </>);
  const row = (id: string, label: string, desc: string, button: string, s: typeof step, extra?: ReactNode) => (
    <Row label={label} description={desc} control={step !== s ? <Button id={id} kind="danger" size="sm" disabled={busy} onClick={() => open(s)}>{button}</Button> : null}>{step === s && extra}</Row>
  );
  const keySaved = !!c.inv?.keySaved;
  return (
    <Group id="privacy.danger" title={S.setGroupTitles["privacy.danger"]} danger>
      <span id={fixedAnchor("danger")} />
      {row(forgetId, S.danger.forgetLabel, S.danger.forgetDesc, S.danger.forgetButton, "forget", (
        <ConfirmStep className="set-confirm" label={S.danger.forgetSure} back={forgetId} onCancel={close}>
          <p>{S.danger.forgetSure}</p>
          <div className="set-buttons"><Button kind="danger" onClick={forget}>{S.danger.forgetYes}</Button><CancelButton onClick={close} /></div>
        </ConfirmStep>
      ))}
      {keySaved && row(keyId, S.danger.removeKeyLabel, S.danger.removeKeyDesc, S.danger.removeKeyButton, "key", (
        <ConfirmStep className="set-confirm" label={S.keyRemoveSure} back={keyId} onCancel={close}>
          <p>{S.keyRemoveSure}</p>
          {c.working && <p className="set-note">{S.keyBusy}</p>}
          {typeBox(REMOVE_KEY_PHRASE)}
          <div className="set-buttons"><Button kind="danger" disabled={busy || c.working || typed.trim().toLowerCase() !== REMOVE_KEY_PHRASE} onClick={removeKey}>{S.keyRemoveYes}</Button><CancelButton disabled={busy} onClick={close} /></div>
          <Problem text={problem} />
        </ConfirmStep>
      ))}
      {row(deleteId, S.danger.deleteLabel, S.danger.deleteDesc, S.danger.deleteButton, "delete", (
        <ConfirmStep className="set-confirm" label={S.deleteSure} back={deleteId} onCancel={close}>
          <p><b>{S.deleteSure}</b></p>
          {c.inv && <p className="set-note">{S.danger.goesTitle} {[...deletableLines(c.inv), ...deleteGoesPro(pro)].join("; ")}</p>}
          <p>{S.deleteExplain}</p>
          <p className="set-note">{S.danger.keptTitle} {deleteKeeps(pro, withPro).join(" ")}</p>
          {askTurnOffPro(pro) && <Row label={S.plan.turnOffPro} description={S.plan.turnOffProHelp} control={<Switch checked={withPro} label={S.plan.turnOffPro} onChange={setWithPro} />} />}
          {c.inv && c.inv.projectsWithNotes > 0 && <Row label={S.deleteProjects.replace("{n}", String(c.inv.projectsWithNotes))} control={<Switch checked={withProjects} label={S.deleteProjects.replace("{n}", String(c.inv.projectsWithNotes))} onChange={setWithProjects} />} />}
          {c.inv && (c.inv.practiceCopies ?? 0) > 0 && <Row label={S.deletePractice.replace("{n}", String(c.inv.practiceCopies))} control={<Switch checked={withPractice} label={S.deletePractice.replace("{n}", String(c.inv.practiceCopies))} onChange={setWithPractice} />} />}
          {typeBox(DELETE_PHRASE)}
          <div className="set-buttons"><Button kind="danger" disabled={busy || typed.trim().toLowerCase() !== DELETE_PHRASE} onClick={remove}>{busy ? S.deleting : S.deleteYes}</Button><CancelButton disabled={busy} onClick={close} /></div>
          <Problem text={problem} />
        </ConfirmStep>
      ))}
      {row(resetAllId, S.danger.resetLabel, changedAll.length ? S.danger.resetDesc : S.setResetAllNone, S.danger.resetButton, "reset", (
        <ConfirmStep className="set-confirm" label={S.setResetAll} back={resetAllId} onCancel={close}>
          <p>{S.setResetAllSure(names(changedAll))}</p>
          {goAll > 0 && <p>{S.setPicturesGo(goAll, Number(defaultOf("pictures.keep")))}</p>}
          {unheardAll.length > 0 && <p className="set-note">{S.setNotHeard(names(unheardAll))}</p>}
          <div className="set-buttons"><Button kind="danger" disabled={changedAll.length === 0} onClick={resetEverything}>{S.setResetAllYes}</Button><CancelButton onClick={close} /></div>
        </ConfirmStep>
      ))}
    </Group>
  );
}
const names = (keys: string[]) => keys.map((k) => wordsOf(k).label).join(", ");

/** The water's colour (look.water): a Picture choice, one card per water with Flowflow, the drop seen in Home, drawn still in
 *  that water (waterDrop.tsx), its name under it. */
/** On a plan that does not cover Pro (payments on only), every water but the usual one has a small Pro tag, and choosing one
 *  shows the card behind it under the choices instead of changing the colour (the payments spec, section 3). A colour
 *  chosen before stays. With payments off there is no tag and every water is a plain choice, as before. */
function WaterSwatches({ value, onChange, labelId }: { value: string; onChange: (v: string) => void; labelId: string }) {
  const c = useCtx();
  const status = usePlan();
  const tagged = proTag("looks", status);
  const [card, setCard] = useState(false);
  const pick = (w: string) => { if (tagged && proOnly("look.water", w)) { setCard(true); return; } setCard(false); onChange(w); };
  return (<>
    <PictureChoice labelledBy={labelId} value={waterOf(value)} onChange={pick}
      options={WATERS.map((w) => ({ id: w, label: S.set["look.water"].options?.[w] ?? w, picture: <>
        <WaterDrop water={w} className="pic-drop" />{tagged && proOnly("look.water", w) && <ProTag corner />}
      </> }))} />
    {tagged && !card && <p className="set-note">{S.plan.partOfPro.looks}</p>}
    {card && <LimitPanel view={{ reason: "looks" }} status={status} usage={c.usage} say={(l) => c.say(l)} onClose={() => setCard(false)} />}
  </>);
}

/** Home's layout, theme, colour, main button and corners, chosen by looking (M51 polish; ui/controlRule.ts VISUAL_CHOICES): a small
 *  drawing of each option, in the colours it gives and with the water chosen in it, its name under it. Drawings only, from
 *  tokens (ui/look.css .sw-*): the theme pictures keep each theme's own colours whatever theme is on. */
const LOOK_PICTURE: Readonly<Record<string, (o: string) => ReactNode>> = {
  "look.layout": (o) => <span className="sw-win" data-sw={o}><span className="sw-side" /><span className="sw-main"><i /><i /><b /></span></span>,
  "look.theme": (o) => <span className="sw-win" data-sw={o}><span className="sw-side" /><span className="sw-main"><i /><i /><b /></span></span>,
  "look.colour": (o) => <span className="sw-win sw-room" data-sw={o}><span className="sw-side" /><span className="sw-main"><i /><i /><b /></span></span>,
  "look.gloss": (o) => <span className="sw-pill" data-sw={o} />,
  "look.corners": (o) => <span className="sw-corner" data-sw={o}><i /><i /></span>,
};
function LookPictures({ d, value, onChange, labelId, disabled }: { d: Def; value: string; onChange: (v: string) => void; labelId: string; disabled: boolean }) {
  const opts = (d.options ?? []).filter((o) => !(HIDDEN_OPTIONS[d.key] ?? []).includes(o));
  const words = (o: string) => S.setSeg[d.key]?.[o] ?? (S.set as Record<string, { options?: Record<string, string> }>)[d.key]?.options?.[o] ?? o;
  return <PictureChoice labelledBy={labelId} value={opts.includes(value) ? value : String(d.default)} onChange={onChange} disabled={disabled}
    options={opts.map((o) => ({ id: o, label: words(o), picture: LOOK_PICTURE[d.key](o) }))} />;
}

/** How lively Flowflow is (character.lively, F28): a Picture choice, a calm pose for Still, a turn for Gentle, a splash for
 *  Lively. The preview above the choices shows the real movement. */
const LIVELY_POSE: Record<Liveliness, Pose> = { still: "look", gentle: "glance", lively: "splash" };
function LivelyPictures({ value, onChange, labelId, disabled }: { value: string; onChange: (v: string) => void; labelId: string; disabled: boolean }) {
  return <PictureChoice labelledBy={labelId} value={livelinessOf(value)} onChange={onChange} disabled={disabled}
    options={LIVELINESS.map((l) => ({ id: l, label: S.lively[l], picture: <FlowMini state="idle" className="pic-flow pic-lively" pose={LIVELY_POSE[l]} /> }))} />;
}

/** The Flowflow page opens with the live Flowflow on its water, in the look chosen (the spec, 3.4), shown resting, working
 *  or done on a press so a change can be seen. A picture, not a control: only the states are a choice. */
const HERO_STATES = ["idle", "working", "done"] as const;
function FlowflowPreview() {
  const [as, setAs] = useState<(typeof HERO_STATES)[number]>("idle");
  // How lively is its own row on this page (a Picture choice); the character here follows the choice in force (M19).
  const lively = livelinessOf(useSetting("character.lively"));
  return (
    <Group id="flowflow.preview">
      <div className="companion-hero" id={fixedAnchor("preview")} data-lively={lively}>
        <div className="ch-water" aria-hidden="true"><Waterline under /></div>
        <div className="ch-char" aria-hidden="true"><HomeCharacter as={as} liveliness={lively} /></div>
      </div>
      <Row label={S.heroStatesLabel} control={<Segmented label={S.heroStatesLabel} value={as} options={HERO_STATES.map((st) => ({ id: st, label: S.heroStates[st] }))} onChange={setAs} />} />
    </Group>
  );
}

/** Google (M21, google.rs): sign in with Google, and the Google accounts connected for Gmail, Calendar and Drive. The
 *  shell runs the sign in in the person's browser and keeps the tokens; this page sees only who and what (never a token).
 *  Shown in More options with Watch routines, and only while they are on. */
type GoogleAccount = { id: string; email: string; name: string; label: string; apps: string[]; signin: boolean };
const GOOGLE_APPS = ["gmail", "calendar", "drive"] as const;
function GoogleSection({ connecting }: { connecting: boolean }) {
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
  const parts = googleParts(st.accounts, connecting);
  if (!parts.section) return null;
  return (<>
    {parts.signIn && <Row id={fixedAnchor("google")} label={S.google.signInTitle} description={me ? S.google.signedIn(me.name, me.email) : (st.ready ? S.google.signInLine : S.google.notSetUp)}
      control={me ? <Button size="sm" onClick={() => drop(me.id, true)}>{S.google.signOut}</Button> : <Button size="sm" disabled={!st.ready || waiting} onClick={() => start(true)}>{S.google.signIn}</Button>} />}
    {connected.map((a, i) => (
      <Row key={a.id} id={!parts.signIn && i === 0 ? fixedAnchor("google") : undefined} label={`${a.label} ${a.email}`} description={a.apps.map((x) => S.google.apps[x]).join(", ")}
        control={<Button kind="danger" size="sm" onClick={() => drop(a.id, false)}>{S.google.disconnect}</Button>} />
    ))}
    {!parts.connect && <Note text={S.google.connectOff} />}
    {parts.connect && <>
    <Row label={S.google.connectTitle} description={connected.length === 0 ? S.google.none : undefined} more={[S.google.connectLine]} />
    {GOOGLE_APPS.map((x) => (
      <Row key={x} indent label={S.google.apps[x]} description={S.google.appLines[x]}
        control={<Switch checked={pick.includes(x)} label={S.google.apps[x]} onChange={(on) => setPick((p) => (on ? [...p, x] : p.filter((y) => y !== x)))} />} />
    ))}
    <Row indent label={S.google.label} control={<span className="set-pair">
      <Field value={label} maxLength={24} placeholder={S.google.label} label={S.google.label} onChange={setLabel} />
      <Button size="sm" disabled={!st.ready || waiting || pick.length === 0} onClick={() => start(false)}>{S.google.connect}</Button>
    </span>}>
      {waiting && <Note text={S.google.waiting} live />}
      <Problem text={problem} />
    </Row>
    </>}
  </>);
}

/** M28: Google shows in Settings only once this build has Google set up (or an account is already kept), so nobody meets a
 *  section whose buttons cannot work. Learned once from the shell when the page loads. */
let googleShown = false;
export const googleInSettings = (): boolean => googleShown;
void invoke("google_accounts").then((v) => { const o = v as { ready?: boolean; accounts?: unknown[] } | null; googleShown = !!o?.ready || (o?.accounts?.length ?? 0) > 0; }).catch(() => {});
export const placeShown = (fixed: string, google = googleShown): boolean => fixed !== "google" || google;

// ---------- pages ----------

/** One page: its title and line, its groups, and at the foot the way into its More options. */
function PageView({ page }: { page: PageId }) {
  const c = useCtx();
  const p = PAGES[page];
  const n = moreKeys(page).filter((k) => !defOf(k)?.hidden).length;
  // What the changed dot means, said once on a page that shows one (the review, 2 Nov 2026: it was a dot with no words).
  const keys = mainKeys(page);
  useSettings(keys);
  const changedHere = changedNow().some((k) => keys.includes(k));
  return (<>
    <PageHead title={S.pages[page].title} line={S.pages[page].sub} />
    {changedHere && <p className="set-note set-legend">{S.setFrame.changedLegend}</p>}
    {page === "about" && <AboutHead />}
    {p.groups.map((g) => <GroupView key={g.id} id={g.id} items={g.items} />)}
    {n > 0 && <div className="set-buttons set-foot"><Button kind="quiet" onClick={() => c.go(`more:${page}`)}>{S.setFrame.moreLink(S.pages[page].title, n)}</Button></div>}
  </>);
}

/** About opens with the app's own card: its drawing, its name and its version. */
function AboutHead() {
  const [info, setInfo] = useState({ version: "", commit: "", channel: "" });
  useEffect(() => { void invoke("update_status").then((v) => { const o = (v ?? {}) as { version?: string; commit?: string; channel?: string }; setInfo({ version: String(o.version ?? ""), commit: String(o.commit ?? ""), channel: String(o.channel ?? "") }); }).catch(() => {}); }, []);
  return (
    <Card className="set-about">
      {/* M69 (spec 4): the character, slowly working, beside the version. */}
      <span className="set-about-icon" aria-hidden="true"><HomeCharacter as="checking" /></span>
      {/* M69 step 3: the name and version as one title, the channel under it when the shell says one. */}
      <span className="set-about-words"><b>{info.version ? `${S.product} ${info.version}` : S.product}</b>{info.commit && info.commit !== "unknown" && <span>{S.setRows.build(info.commit)}</span>}{info.channel && <span>{S.setRows.channel(info.channel)}</span>}</span>
    </Card>
  );
}

/** More options: a section per page, in the sidebar's order, each topic closed until opened. A topic whose tool is off is
 *  dimmed and says how to turn it on. Each section ends with Restore usual settings for that page. */
function MorePage({ open, setOpen }: { open: ReadonlySet<string>; setOpen: (id: string, on: boolean) => void }) {
  return (<>
    <PageHead title={S.pages.more.title} line={S.pages.more.sub} />
    {MORE_SECTIONS.map((page) => <MoreSection key={page} page={page} open={open} setOpen={setOpen} />)}
  </>);
}
function MoreSection({ page, open, setOpen }: { page: PageId; open: ReadonlySet<string>; setOpen: (id: string, on: boolean) => void }) {
  const c = useCtx();
  const keys = moreKeys(page);
  useSettings(keys);
  const changed = changedNow().filter((k) => keys.includes(k));
  // Asked first, naming every setting that goes back (T16), and the engine's own settings not heard yet, which stay as they
  // are. Putting Pictures to keep back to usual while more are kept says first how many pictures go, as lowering it does.
  const unheard = notHeard().filter((k) => keys.includes(k));
  const go = picturesResetGoing(changed, c.inv?.receiptPictures, setting("pictures.keep"));
  const [asking, setAsking] = useState(false);
  const restoreId = useId();
  const restore = () => {
    setAsking(false);
    if (!changed.length) { c.say(S.setFrame.restoreNone); return; }
    void resetKeysWithUndo(keys).then(({ done, back }) => {
      if (!done.ok) { c.say(problemWords(done.code)); return; }
      c.say(S.setFrame.restoreDone(back.length), () => void undoReset(back).then((failed) => c.say(failed.length ? S.setNotAllBack : S.setUndone)));
    });
  };
  return (
    <section className="set-more-section" id={`more:${page}`} aria-labelledby={`more-head-${page}`}>
      <h3 className="set-more-head" id={`more-head-${page}`}>{S.pages[page].title}</h3>
      {PAGES[page].more.map((t) => <TopicView key={t.id} topic={t} open={open.has(t.id)} setOpen={(on) => setOpen(t.id, on)} />)}
      {!asking && <div className="set-buttons"><Button id={restoreId} kind="quiet" size="sm" onClick={changed.length > 0 ? () => setAsking(true) : restore}>{S.setFrame.restorePage(S.pages[page].title)}</Button></div>}
      {asking && (
        <ConfirmStep className="set-confirm" label={S.setFrame.restorePage(S.pages[page].title)} back={restoreId} onCancel={() => setAsking(false)}>
          <p>{S.setResetSectionSure(names(changed))}</p>
          {go > 0 && <p>{S.setPicturesGo(go, Number(defaultOf("pictures.keep")))}</p>}
          {unheard.length > 0 && <p className="set-note">{S.setNotHeard(names(unheard))}</p>}
          <div className="set-buttons"><Button kind="danger" onClick={restore}>{S.setResetSectionYes}</Button><CancelButton onClick={() => setAsking(false)} /></div>
        </ConfirmStep>
      )}
    </section>
  );
}
function TopicView({ topic, open, setOpen }: { topic: Topic; open: boolean; setOpen: (on: boolean) => void }) {
  const parent = useSetting(topic.parent ?? "");
  const off = topic.parent && parent !== true ? S.setFrame.turnOnTool(wordsOf(topic.parent).label) : "";
  // M69 (spec 3.9): no counts on the folds ("More General options (56)" read as a chore); the title says what is inside.
  return (
    <Disclosure id={topic.id} title={(S.setGroupTitles as Record<string, string>)[topic.id] ?? topic.id} open={open} onToggle={setOpen} disabledNote={off || undefined}>
      <Group>
        {topic.items.map((i) => <ItemRows key={typeof i === "string" ? i : `fixed:${i.fixed}`} item={i} parentOff={off} indent={false} />)}
        {topic.id === "more.privacy.calls" && <Row label={wordsOf("numbers.on").label}>{<NumbersRows />}</Row>}
      </Group>
      {topic.id === "more.general.tools" && <ToolsMore />}
      {topic.id === "more.flowflow.motion" && <UsualPlace />}
    </Disclosure>
  );
}
/** What each group of tools may do on this Mac (GroupsPanel), behind Learn more: never a wall on the page itself. */
function ToolsMore() {
  const [open, setOpen] = useState(false);
  return (<div className="set-more">
    <Button kind="quiet" size="sm" expanded={open} onClick={() => setOpen(!open)}>{open ? S.setFrame.learnLess : S.setFrame.learnMore}</Button>
    {open && <GroupsPanel />}
  </div>);
}
/** Put the character back in its usual place (its edge, its position and Same place on every display), one press. */
function UsualPlace() {
  useSetting("character.edge"); useSetting("character.position"); useSetting("character.sameEverywhere");
  const placeChanged = changedNow().filter((k) => (PLACE_KEYS as readonly string[]).includes(k));
  if (!placeChanged.length) return null;
  const resetPlace = async () => { for (const k of placeChanged) await resetSetting(k); };
  return <Group><Row label={S.setResetPlace} description={S.dragHint} control={<Button size="sm" onClick={() => void resetPlace()}>{S.setRows.putBack}</Button>} /></Group>;
}

/** Search results (the spec, 3.7): grouped under their page's name; each a live row, so a setting can be changed right
 *  here. The page name jumps to the row on its page. */
function SearchResults({ q }: { q: string }) {
  const c = useCtx();
  const shown = shownSettings().filter((x) => shownNow(x.key, setting));
  const results = searchSettingsFor(q, shown);
  const groups = groupResults(results);
  const heading = (page: PageId, group: string) => S.setFrame.heading(S.pages[page].title, (S.setGroupTitles as Record<string, string>)[group] ?? "");
  const hitRow = (h: Hit) => {
    if ("key" in h) {
      if (h.key === "keys.hotkeys") return <Row key={h.key} label={wordsOf(h.key).label} control={<Button size="sm" onClick={() => c.go("keys.keys")}>{S.setFrame.show}</Button>} />;
      return <ItemRows key={h.key} item={h.key} />;
    }
    return <Row key={h.fixed} label={S.setFixed[h.fixed].title} control={<Button size="sm" onClick={() => c.go(h.fixed)}>{S.setFrame.show}</Button>} />;
  };
  return (<>
    <div className={results.length ? "sr" : "set-note"} role="status" aria-live="polite">{results.length ? S.setFrame.found(results.length) : S.setFrame.noMatch(q.trim())}</div>
    {groups.map((g) => (
      <section key={`${g.page}:${g.group}`} className="set-result">
        <Button kind="quiet" size="sm" className="set-result-head" onClick={() => c.go(g.group || g.page)}>{heading(g.page, g.group)}</Button>
        <Group>{g.hits.map(hitRow)}</Group>
      </section>
    ))}
  </>);
}

// ---------- the frame ----------

const LAST_PAGE = "companion.settingsPage";
/** The last page viewed, so Settings opens there again (Apple HIG). Only a convenience: it may be missing. */
export function lastPage(): PageId {
  try { const p = localStorage.getItem(LAST_PAGE) ?? ""; return isPage(p) ? p : FIRST_PAGE; } catch { return FIRST_PAGE; }
}

export type SettingsProps = {
  /** A page, a group, a topic, a row's setting key or a fixed part to open on (a deep link: openSettings). */
  place?: string; onPlace?: (place: string) => void;
  working: boolean; practiceBusy: boolean; project: string; spending: Spending | null;
  /** This month's free fixes (the engine's plan.usage), from Home's model; null until heard (never with payments off). */
  usage?: Usage | null;
  onClose: () => void; onPracticeList: () => void; onLesson: (lesson: string) => void; onStepAside?: () => void; onMemory?: () => void; onPickFolder?: () => void;
};

/** Settings inside Home: the sidebar with search at its top, and the page (or the search results) beside it. ⌘F goes to
 *  search; Esc clears the search, and with nothing typed closes Home (Home's own Esc); ⌘[ goes back to Now; the arrows move
 *  through the sidebar. Changes apply at once; one that waits for the next task says so in a toast. */
export function SettingsView({ place = "", onPlace = () => {}, working, practiceBusy, project, spending, usage = null, onClose, onPracticeList, onLesson, onStepAside = () => {}, onMemory = () => {}, onPickFolder = () => {} }: SettingsProps) {
  useSetting("fun.reactions");   // any change in any window draws the page again
  const [q, setQ] = useState("");
  const [inv, setInv] = useState<Inventory | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void; n: number } | null>(null);
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState("");
  const [jumps, setJumps] = useState(0);   // each jump (a deep link, a result) scrolls once, even to the page already open
  const search = useRef<HTMLInputElement>(null), content = useRef<HTMLDivElement>(null), side = useRef<HTMLUListElement>(null);
  const keys = useKeys();
  // Asked again whenever the keys kept change (a change here, a restore, Undo).
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
  const load = () => { void invoke("data_inventory").then((v) => setInv(v as Inventory)).catch(() => {}); };
  useEffect(load, []);
  useEffect(() => { const f = () => load(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  const where = placeOf(place);
  const page: PageId = where?.page ?? (isPage(place) ? place : FIRST_PAGE);
  useEffect(() => { try { localStorage.setItem(LAST_PAGE, page); } catch { /* storage may be unavailable */ } }, [page]);
  // A deep link or a search result: the page opens, the topic opens, and the row is scrolled to and flashes for a moment.
  const pending = useRef("");
  const go = (what: string) => {
    const morePage = what.startsWith("more:") ? (what.slice(5) as PageId) : null;
    const p = morePage ? { page: "more" as PageId, group: what, more: true } : placeOf(what);
    if (!p) return;
    setQ("");
    if (p.topic) setOpenTopics((s) => new Set(s).add(p.topic!));
    if (morePage) setOpenTopics((s) => { const n = new Set(s); for (const t of PAGES[morePage].more) n.add(t.id); return n; });
    pending.current = morePage ? what : defOf(what) ? rowAnchor(what) : (S.setFixed as Record<string, unknown>)[what] ? fixedAnchor(what as Fixed) : p.group;
    onPlace(p.page);
    setJumps((n) => n + 1);
  };
  const shownPage = useRef(page);
  useLayoutEffect(() => {
    const id = pending.current;
    const moved = shownPage.current !== page;
    shownPage.current = page;
    if (!id) { if (moved) content.current?.scrollTo({ top: 0 }); return; }
    pending.current = "";
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setFlash(id);
  }, [page, q, openTopics, jumps]);
  useEffect(() => { if (!flash) return; const el = document.getElementById(flash); el?.setAttribute("data-flash", ""); const t = setTimeout(() => { el?.removeAttribute("data-flash"); setFlash(""); }, 1200); return () => clearTimeout(t); }, [flash]);
  // A deep link from Home (the notch's "Add your key", the spending card): open on it once.
  const seenPlace = useRef("");
  useEffect(() => { if (place && place !== seenPlace.current && !isPage(place)) { seenPlace.current = place; go(place); } else seenPlace.current = place; }, [place]);
  // ⌘F searches and ⌘[ goes back to Now, while Settings is open in Home (the person's own keys, in this window only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (e.key === "f") { e.preventDefault(); search.current?.focus(); }
      else if (e.key === "[") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const say = (text: string, undo?: () => void) => setToast((t) => ({ text, undo, n: (t?.n ?? 0) + 1 }));
  const ctx: Ctx = { project, working, practiceBusy, keys, facts, inv, spending, usage, go, say, reload: load, onLesson, onPracticeList, onMemory, onPickFolder, onStepAside };
  const problems = (snapshotNow()?.problems ?? []).map((p) => (p.code === "damaged" ? S.setDamaged : p.code === "unreadable" ? S.setUnreadable : p.code === "rulesUnreadable" ? S.setRulesUnreadable : p.key ? S.setBadValue(wordsOf(p.key).label) : "")).filter(Boolean);
  // Narrow, the sidebar is one strip that scrolls sideways (M51 review: it cut a word with no sign of more). Which ends have
  // more past them, so the page fades that end and shows an arrow there; the open page is always scrolled into the strip.
  const [more, setMore] = useState("");
  const measure = () => { const el = side.current; if (el) setMore(stripEdges(el.scrollLeft, el.scrollWidth, el.clientWidth)); };
  useLayoutEffect(() => {
    side.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [page, q]);
  useEffect(() => {
    const el = side.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const nudge = (way: 1 | -1) => side.current?.scrollBy({ left: way * side.current.clientWidth * 0.7, behavior: "smooth" });
  // Up and down move through the sidebar's pages (the open one follows).
  const sideKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const at = SIDEBAR.indexOf(page), to = SIDEBAR[(at + (e.key === "ArrowDown" ? 1 : SIDEBAR.length - 1)) % SIDEBAR.length];
    e.preventDefault(); setQ(""); onPlace(to);
    side.current?.querySelectorAll<HTMLButtonElement>(".sb-item")[SIDEBAR.indexOf(to)]?.focus();
  };
  const spent = spending && spending.project === (project || NO_PROJECT) ? spending : null;
  return (
    <SetCtx.Provider value={ctx}>
      <div className="settings-frame">
        <nav className="settings-side" aria-label={S.setFrame.sidebar} data-searching={q ? "" : undefined}>
          <div className="settings-search" role="search">
            <Field type="search" wide inputRef={search} value={q} placeholder={S.setFrame.search} label={S.setFrame.search} onChange={setQ}
              onKeyDown={(e) => { if (e.key === "Escape" && !e.nativeEvent.isComposing && q) { e.preventDefault(); e.stopPropagation(); setQ(""); } }} />
          </div>
          <div className="sb-strip" data-more={more || undefined}>
            <ul className="sb-list" ref={side} onKeyDown={sideKey} onScroll={measure}>
              {SIDEBAR.map((id) => (<li key={id}>
                {id === HAIRLINE_BEFORE && <div className="sb-sep" role="separator" />}
                <SidebarItem icon={PAGES[id].icon} label={S.pages[id].title} selected={!q && page === id} onClick={() => { setQ(""); onPlace(id); }} />
              </li>))}
            </ul>
            {/* Out of the tab order: Tab and the arrow keys already bring each page into view (focus scrolls it); these are for the pointer. */}
            <Button kind="icon" className="sb-more sb-more-left" tabIndex={-1} label={S.setFrame.stripBack} onClick={() => nudge(-1)}><Icon name="back" size={12} /></Button>
            <Button kind="icon" className="sb-more sb-more-right" tabIndex={-1} label={S.setFrame.stripMore} onClick={() => nudge(1)}><Icon name="back" size={12} /></Button>
          </div>
        </nav>
        <div className="settings-content" ref={content} role="region" aria-label={q ? S.setFrame.search : S.pages[page].title}>
          {problems.map((p, i) => <p className="set-problem" key={i}>{p}</p>)}
          {spent?.problem && <p className="set-problem" role="alert">{spent.problem}</p>}
          {/* One part that fails to draw never blanks Settings: the sidebar and search stay (must fix 4). */}
          <PartBoundary part="settings" resetKey={page}>
          {q ? <SearchResults q={q} />
            : page === "more" ? <MorePage open={openTopics} setOpen={(id, on) => setOpenTopics((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; })} />
            : <PageView key={page} page={page} />}
          </PartBoundary>
          {!q && page === "account" && spent && <p className="set-note" role="status">{spendingLine(spent)}</p>}
          {!q && page === "account" && !project && <p className="set-note">{S.setSpendingNoProject}</p>}
        </div>
        {toast && <Toast key={toast.n} text={toast.text} action={toast.undo ? S.setUndo : undefined} onAction={() => { const u = toast.undo; setToast(null); u?.(); }} onDone={() => setToast(null)} />}
      </div>
    </SetCtx.Provider>
  );
}
