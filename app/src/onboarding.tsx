import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DoctorItem, Model } from "./model.ts";
import type { Command } from "../../protocol/index.ts";
import { addMemory, checkMac } from "./commands.ts";
import { changeSetting } from "./settingsStore.ts";
import { STEPS, canContinue, commandsFor, countOf, DEFAULT_ANSWERS, DEFAULT_YOURS, effectsOf, groupSettingsFor, keyCheck, keyLooksRight, KEY_PAGE, LEVEL, NAME_MAX, next, back, QUESTIONS, settingsFor, yoursSettings, type Answers, type Edge, type Follow, type Lively, type Step, type Yours } from "./onboarding.ts";
import { keyHints, keyRows, talkSharedNote } from "./settings.ts";
import { useKeys } from "./useKeys.ts";
import { invoke, listen } from "./tauri.ts";
import { shouldTakeFocus } from "./cardlogic.ts";
import { S, NAMES } from "./strings.ts";
import { failNote } from "./failwords.ts";
import { SWITCHED, type SwitchedId } from "./groups.ts";
import { FIRST_PRACTICE, needsMacCheck, nodeMissing, practiceOf } from "./practice.ts";
import { FirstLook } from "./firstLook.tsx";
import { HomeCharacter } from "./homeCharacter.tsx";
import { Waterline } from "./waterline.tsx";
import { COMPANIONS } from "./companion.ts";
import { FlowMini } from "./flowflowMini.tsx";

/** A headline as its first sentence and the rest (M41): "Your AI built it." and "Let's finish it.". One sentence: all first. */
export function twoTone(text: string): [string, string] {
  const at = text.search(/[.!?]\s/);
  return at < 0 ? [text, ""] : [text.slice(0, at + 1), text.slice(at + 2)];
}

// The first run (M18, the whole flow; onboarding.ts has the order and the rules). Home's black, with water at the foot that
// rises with every step (the progress, also said in words), and the one lime button always in the same place at the bottom.
// The hello and the recorded fix come before anything is asked; choosing, naming, the powers, Connect and the folder follow;
// the last screen has the real keys, the practice project and the optional questions. startPractice: copy a practice and
// open it (the first run ends there).
type Props = { doctor: DoctorItem[] | null; connected: string; keyTested: Model["keyTested"]; project: string; send: (c: unknown) => unknown; pickFolder: () => void; startPractice: (id: string) => void; onDone: () => void };

const EDGES: Edge[] = ["left", "right", "top", "bottom"];
const LIVELY: Lively[] = ["lively", "calm"];
const FOLLOWS: Follow[] = ["eyes", "drop", "off"];
/** The keys shown first on the last screen: open the box, show me how, and stop everything. */
const FIRST_KEYS: string[] = ["card", "showme", "stop"];
/** Keys in the Mac's own symbols ("Control, Option, Command and K" is ⌃⌥⌘K); the words stay for VoiceOver. */
export const keySymbols = (words: string) => words.replace(/Control/g, "\u2303").replace(/Option/g, "\u2325").replace(/Command/g, "\u2318").replace(/Shift/g, "\u21E7").replace(/,| and /g, "").replace(/\s+/g, "");
const folderName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function Onboarding({ doctor, connected, keyTested, project, send, pickFolder, startPractice, onDone }: Props) {
  const [step, setStep] = useState<Step>("hello");
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [yours, setYours] = useState<Yours>(DEFAULT_YOURS);
  // The groups switched off here (F20): none unless the person switches one.
  const [groupsOff, setGroupsOff] = useState<SwitchedId[]>([]);
  const [key, setKey] = useState("");
  const [keyNote, setKeyNote] = useState("");
  // When the key was saved: setup shows Anthropic's answer for this save only (onboarding.ts keyCheck).
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // The keys every job uses now (the person may have picked others, or another app may hold the usual ones).
  const keys = useKeys();
  const ok = connected === "api_key" || connected === "plan";
  // Which way the last move went, so the next screen slides in from the right going on and from the left going back.
  const [dir, setDir] = useState<"on" | "back">("on");
  // Anthropic's Claude (M22): asked about as the first run opens, and fetched in the background at once if it is missing, so
  // it is usually ready by the time its step comes. Its step is passed over when it is already ready.
  const [claude, setClaude] = useState<{ state: string; received?: number; total?: number | null; message?: string } | null>(null);
  useEffect(() => {
    void invoke("claude_status").then((v) => { const s = v as { state: string }; setClaude(s); if (s.state === "missing") void invoke("claude_install_now").catch(() => {}); }).catch(() => setClaude({ state: "ready" }));
    const off = listen("claude-install", (e) => setClaude(e.payload as { state: string }));
    return () => { off.then((f) => f()); };
  }, []);
  const claudeReady = claude?.state === "ready";
  const ctx = { connected: ok, project, claude: claude ? claude.state === "ready" : undefined };
  const go = (target: Step | null) => {
    if (!target) return;
    const forward = STEPS.indexOf(target) >= STEPS.indexOf(step);
    const to = target === "claude" && claudeReady ? (forward ? next(target) : back(target)) : target;
    if (!to) return;
    setDir(forward ? "on" : "back"); setStep(to);
  };
  const own = NAMES.character;
  const name = yours.name.trim() || own;
  // What was chosen on the way (the name, how lively, the edge, the groups) is kept however the first run ends; the questions
  // only when the person finishes with them (Go to my project).
  const keepChoices = () => {
    for (const [k, v] of yoursSettings(yours, own)) void changeSetting(k, v);
    for (const [key, on] of groupSettingsFor(groupsOff)) void changeSetting(key, on);
  };
  const finish = () => {
    keepChoices();
    for (const c of commandsFor(answers, project, (scope, text, source) => addMemory(project, scope, text, source) as Command)) void send(c);
    for (const [key, on] of settingsFor(answers)) void changeSetting(key, on);
    onDone();
  };
  const saveKey = () => {
    const problem = keyLooksRight(key);
    if (problem) { setKeyNote(problem); return; }
    // The key goes straight to the Keychain; the box is emptied at once and nothing keeps a copy. The engine then checks it
    // once with Anthropic (free) and says what it heard.
    const k = key; setKey("");
    void invoke("save_api_key", { key: k }).then(() => { setKeyNote(""); setSavedAt(Date.now()); }).catch((e) => setKeyNote(failNote(e, "key")));
  };
  const check = keyCheck(savedAt, keyTested);
  // The Mac check, when the last screen offers the practice (it waits only when Node is missing).
  useEffect(() => { if (step === "ready" && needsMacCheck(doctor)) void send(checkMac()); }, [step]);
  // Node was installed while Home stayed open: coming back to Squibby checks again, only while Node is flagged missing.
  useEffect(() => {
    if (step !== "ready" || !nodeMissing(doctor)) return;
    const again = () => void send(checkMac());
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [step, doctor]);
  const first = practiceOf(FIRST_PRACTICE)!, noNode = nodeMissing(doctor);
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
  const count = countOf(step);
  const level = { "--level": `${LEVEL[step]}%` } as React.CSSProperties;

  if (step === "look") return <section className="panel onboarding look" aria-label={S.obTitle} ref={box}><FirstLook onGo={() => go(next(step))} /></section>;

  // The one lime button, always at the bottom in the same place.
  const main = (label: string, onClick: () => void, disabled = false) => <button className="fr-key" type="button" disabled={disabled} onClick={onClick}>{label}</button>;

  const cast = COMPANIONS.filter((c) => c.ready);   // M28: only the ready ones
  return (
    <section className="panel onboarding fr" data-step={step} aria-label={S.obTitle} ref={box} style={level}>
      <div className="fr-tank" aria-hidden="true"><Waterline under /></div>
      {step !== "hello" && (
        <div className="fr-top">
          {back(step) && <button className="fr-back" type="button" aria-label={S.obBack} onClick={() => go(back(step))}>&#8592;</button>}
          {count && <span className="fr-count">{S.fr.count(count.n, count.of)}</span>}
        </div>
      )}

      <div className="fr-slide" key={step} data-dir={dir}>
      {step === "hello" && (<>
        <div className="fr-hello" aria-hidden="true"><span className="fr-drop" /><span className="fr-ripple" /><div className="fr-rise"><HomeCharacter as="idle" /></div></div>
        {/* M41 (Supabase's two tone headlines): the statement bright, its answer in grey on the line below. */}
        <h2 className="fr-title">{twoTone(S.fr.helloTitle)[0]}<span className="fr-title-2">{twoTone(S.fr.helloTitle)[1]}</span></h2>
        <p className="fr-line">{S.fr.helloLine}</p>
        <div className="fr-grow" />
        {main(S.fr.helloGo, () => go(next(step)))}
      </>)}

      {/* M28 (founder, 29 Oct 2026): only companions that are ready show; the empty slots come back with the founder's art. With
          one ready, the step introduces it rather than offering a choice of one. */}
      {step === "pick" && (<>
        <h2 className="fr-title">{cast.length > 1 ? S.fr.pickTitle : S.fr.meetTitle(name)}</h2>
        <p className="fr-line">{cast.length > 1 ? S.fr.pickLine : S.fr.meetLine}</p>
        <div className={`fr-cast${cast.length === 1 ? " one" : ""}`}>
          {cast.map((c) => <button key={c.id} className="fr-pick" type="button" aria-pressed="true"><FlowMini className="fr-flow" state="idle" /><b>{name}</b><span>{S.fr.pickWater}</span></button>)}
        </div>
        <div className="fr-grow" />
        {main(S.fr.pickGo(name), () => go(next(step)))}
      </>)}

      {step === "yours" && (<>
        <h2 className="fr-title">{S.fr.yoursTitle}</h2>
        <label className="fr-name"><FlowMini className="fr-flow" state="idle" /><span className="sr">{S.fr.nameLabel}</span>
          <input type="text" value={yours.name} maxLength={NAME_MAX} placeholder={own} spellCheck={false} autoComplete="off" onChange={(e) => setYours({ ...yours, name: e.target.value })} /></label>
        <div className="fr-label" id="fr-lively">{S.fr.livelyLabel}</div>
        <div className="fr-seg" role="group" aria-labelledby="fr-lively">
          {LIVELY.map((l) => <button key={l} type="button" aria-pressed={(yours.lively ?? "lively") === l} onClick={() => setYours({ ...yours, lively: l })}><b>{S.fr.lively[l]}</b><span>{S.fr.livelyLine[l]}</span></button>)}
        </div>
        <div className="fr-label" id="fr-edge">{S.fr.edgeLabel}</div>
        <div className="fr-edges" role="group" aria-labelledby="fr-edge">
          {EDGES.map((e) => <button key={e} type="button" className="fr-edge" data-edge={e} aria-label={S.fr.edges[e]} aria-pressed={(yours.edge ?? "right") === e} onClick={() => setYours({ ...yours, edge: e })}><i /></button>)}
        </div>
        <div className="fr-label" id="fr-follow">{S.fr.followLabel}</div>
        <div className="fr-seg three" role="group" aria-labelledby="fr-follow">
          {FOLLOWS.map((f) => <button key={f} type="button" aria-pressed={(yours.follow ?? "eyes") === f} onClick={() => setYours({ ...yours, follow: f })}><b>{S.fr.follow[f]}</b><span>{S.fr.followLine[f]}</span></button>)}
        </div>
        <div className="fr-grow" />
        {main(S.fr.yoursGo, () => go(next(step)))}
      </>)}

      {step === "powers" && (<>
        <h2 className="fr-title">{S.fr.powersTitle}</h2>
        <p className="fr-line">{S.fr.powersLine}</p>
        <div className="fr-powers">
          {SWITCHED.map((g) => {
            const id = g.id as SwitchedId, on = !groupsOff.includes(id);
            return (
              <div key={id} className="fr-power">
                <div><b>{S.groups.names[id]}</b><span>{S.groups.short[id]}</span>{S.fr.asks[id] && <em>{S.fr.asks[id]}</em>}</div>
                <button className="fr-tog" type="button" aria-pressed={on} aria-label={`${S.groups.names[id]}: ${on ? S.groups.isOn : S.groups.isOff}`}
                  onClick={() => setGroupsOff((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))} />
              </div>
            );
          })}
        </div>
        <p className="fr-small">{S.groups.core}</p>
        <div className="fr-grow" />
        {main(S.fr.next, () => go(next(step)))}
      </>)}

      {step === "claude" && (<>
        <h2 className="fr-title">{S.fr.claudeTitle}</h2>
        <p className="fr-line">{S.fr.claudeLine}</p>
        {claude?.state === "installing" && (() => {
          const mb = Math.round((claude.received ?? 0) / 1e6), pct = claude.total ? Math.min(100, Math.round(((claude.received ?? 0) / claude.total) * 100)) : null;
          return <div className="fr-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-valuetext={S.fr.claudeGetting(mb, pct)}>
            <div className="fr-bar"><i style={{ width: `${pct ?? 30}%` }} data-unknown={pct === null ? "yes" : undefined} /></div><span>{S.fr.claudeGetting(mb, pct)}</span></div>;
        })()}
        {claudeReady && <p className="fr-ok" role="status">{S.fr.claudeReady}</p>}
        {claude?.state === "failed" && <><div className="error" role="alert">{claude.message}</div>
          <button className="fr-link" type="button" onClick={() => { setClaude({ state: "installing", received: 0 }); void invoke("claude_install_now").catch(() => {}); }}>{S.fr.claudeAgain}</button></>}
        {claude?.state === "missing" && <button className="fr-link" type="button" onClick={() => void invoke("claude_install_now").catch(() => {})}>{S.fr.claudeInstall}</button>}
        <div className="fr-grow" />
        {main(S.obContinue, () => go(next(step)), !canContinue(step, ctx))}
      </>)}

      {step === "connect" && (<>
        <h2 className="fr-title">{S.fr.connectTitle}</h2>
        {ok && check !== "refused" ? <p className="fr-ok" role="status">{check ? S.obKeyCheck[check] : S.obConnected}</p> : (<>
          <p className="fr-line">{S.obKeyHelp}</p>
          <ol className="fr-steps">{S.obKeySteps.map((t) => <li key={t}>{t}</li>)}</ol>
          <div className="fr-keyrow">
            <input type="password" autoComplete="off" spellCheck={false} value={key} aria-label={S.obKeyLabel} placeholder="sk-ant-..." onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveKey(); }} />
            <button className="fr-save" type="button" onClick={saveKey}>{S.obKeySave}</button>
          </div>
          {check === "refused" && <div className="error" role="alert">{S.obKeyCheck.refused}</div>}
          {keyNote && <div className="error" role="alert">{keyNote}</div>}
          <button className="fr-link" type="button" onClick={() => void invoke("open_link", { url: KEY_PAGE }).catch(() => setKeyNote(S.obLinkFailed))}>{S.obGetKey}</button>
          {/* M28: no dead end without a key. Home then says "Add your Claude key" with a button that goes straight there. */}
          <button className="fr-link fr-skip" type="button" onClick={() => go(next(step))}>{S.fr.skipKey}</button>
        </>)}
        <div className="fr-grow" />
        {main(S.obContinue, () => go(next(step)), !canContinue(step, ctx) || (step === "connect" && check === "refused"))}
      </>)}

      {step === "folder" && (<>
        <h2 className="fr-title">{S.fr.folderTitle}</h2>
        <p className="fr-line">{S.obFolderHelp}</p>
        <button className="fr-folder" type="button" onClick={pickFolder}><b>{project ? folderName(project) : S.fr.folderNone}</b><span>{project || S.folderChange}</span></button>
        <div className="fr-grow" />
        {main(project ? S.fr.folderGo(folderName(project)) : S.obContinue, () => go(next(step)), !canContinue(step, ctx))}
      </>)}

      {step === "ready" && (<>
        <div className="fr-done" aria-hidden="true"><HomeCharacter as="done" /></div>
        <h2 className="fr-title">{S.fr.readyTitle}</h2>
        <div className="fr-label">{S.keysTitle}</div>
        {/* The three keys to remember first (open, show me, stop), with the keys in use now; every key in words folded below. */}
        <div className="fr-tips">{keyRows(keys).filter((r) => FIRST_KEYS.includes(r.job)).map((r) => <div key={r.job} className="fr-tip"><kbd aria-label={r.keys}>{keySymbols(r.keys)}</kbd><span>{r.name}</span></div>)}</div>
        <details className="fr-more">
          <summary>{S.fr.allKeys}</summary>
          <div className="fr-keys">{keyHints(keys).map((l, i) => <div key={i}>{l}</div>)}</div>
          {talkSharedNote(keys) && <p className="fr-small">{talkSharedNote(keys)}</p>}
        </details>
        <details className="fr-more">
          <summary>{S.fr.howYouLike}</summary>
          {QUESTIONS.map((q) => (
            <div key={q.key} className="fr-q">
              <b>{q.ask}</b>
              <div className="fr-seg small">
                <button type="button" aria-pressed={answers[q.key]} onClick={() => setAnswers({ ...answers, [q.key]: true })}>{q.yes}</button>
                <button type="button" aria-pressed={!answers[q.key]} onClick={() => setAnswers({ ...answers, [q.key]: false })}>{q.no}</button>
              </div>
            </div>
          ))}
          <p className="fr-small">{effectsOf(answers).join(" ")}</p>
        </details>
        <div className="fr-grow" />
        {first.needsNode && noNode && <p className="fr-small" role="status">{S.fr.practiceNeedsNode(noNode.fix ?? "")}</p>}
        {/* Taking it ends the first run here: the practice opens its own folder. The choices made on the way are kept. */}
        <button className="fr-key" type="button" disabled={first.needsNode && !!noNode} onClick={() => { keepChoices(); onDone(); startPractice(first.id); }}>{S.fr.practice}</button>
        <button className="fr-quiet" type="button" onClick={finish}>{S.fr.goProject}</button>
      </>)}
      </div>
    </section>
  );
}
