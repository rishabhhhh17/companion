import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ApprovalCard, DoctorItem, Model } from "./model.ts";
import type { Command } from "../../protocol/index.ts";
import { addMemory, AGENT, checkMac, stopAgent } from "./commands.ts";
import { changeSetting, setting as getSetting, useSetting } from "./settingsStore.ts";
import { STEPS, canContinue, checkAnnounce, checkEndLine, checkStage, commandsFor, countOf, DEFAULT_ANSWERS, DEFAULT_YOURS, effectsOf, FIRST_KEYS, firstCheckVerdict, groupSettingsFor, honestLines, installAsks, keyCheck, keyShownFirst, keyLooksRight, KEY_PAGE, LEVEL, NAME_MAX, next, back, QUESTIONS, settingsFor, skipTo, yoursSettings, type Answers, type Edge, type PointNow, type Step, type Yours } from "./onboarding.ts";
import { livelinessOf, type Liveliness } from "./lookfeel.ts";
import { whatOf } from "./approvals.ts";
import { keyRows, talkSharedNote } from "./settings.ts";
import { useKeys } from "./useKeys.ts";
import { invoke, listen } from "./tauri.ts";
import { shouldTakeFocus } from "./cardlogic.ts";
import { S, NAMES } from "./strings.ts";
import { failNote } from "./failwords.ts";
import { offGroups, SWITCHED, type SwitchedId } from "./groups.ts";
import { FIRST_PRACTICE, needsMacCheck, nodeMissing, practiceOf } from "./practice.ts";
import { FirstLook } from "./firstLook.tsx";
import { HomeCharacter } from "./homeCharacter.tsx";
import { Waterline } from "./waterline.tsx";
import { usePlan } from "./usePlan.ts";
import { planCard, type Usage } from "./plan.ts";
import { Button, Card, Disclosure, Field, KeyLabel, Menu, Row, Segmented, Switch, VerdictLine } from "./ui/parts.tsx";
import type { CharacterState } from "./model.ts";

/** A headline as its first sentence and the rest (M41): "Your AI built it." and "Let's finish it.". One sentence: all first. */
export function twoTone(text: string): [string, string] {
  const at = text.search(/[.!?]\s/);
  return at < 0 ? [text, ""] : [text.slice(0, at + 1), text.slice(at + 2)];
}

// The first run (M49; onboarding.ts has the order and the rules): three screens and a first check, on Home's black with the
// water at the foot rising with every step (the progress, also said in words) and Flowflow riding on it. One silver button
// per screen, always in the same place at the bottom; every step has Skip and a way back. Built from the shared parts
// (ui/parts.tsx). startPractice: copy a practice and open it (the first run ends there). firstCheck: the free check of the
// real project, with a safety copy first and installs set to ask (the engine's problem.find with first).
type Props = {
  doctor: DoctorItem[] | null; connected: string; keyTested: Model["keyTested"]; project: string; send: (c: unknown) => unknown;
  pickFolder: () => void; startPractice: (id: string) => void; onDone: () => void;
  point: PointNow; approvals: readonly ApprovalCard[]; usage: Usage | null;
  firstCheck: () => void; answer: (approval: string, allow: boolean) => void;
  cloneLink: (url: string) => Promise<void>; copying: boolean; cloneNote: string | null;
  /** Why the first check could not run, when the engine or the shell said (Home's error or notice line, which the first run
   *  covers): cleared when the check is pressed, so only this press's reason shows. */
  why: string | null;
};

const EDGES: Edge[] = ["left", "right", "top", "bottom"];
const LIVELY: Liveliness[] = ["still", "gentle", "lively"];
/** The choices in force for Make it yours, so a first run shown again starts from them and writes only what is changed. */
const yoursNow = (): Pick<Yours, "name" | "lively" | "edge"> => {
  const name = getSetting("character.name"), edge = getSetting("character.edge");
  return { name: typeof name === "string" ? name : "", lively: livelinessOf(getSetting("character.lively")), edge: EDGES.includes(edge as Edge) ? (edge as Edge) : null };
};
const folderName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
type Fold = "how" | "yours" | "powers" | "keys" | "questions";

export function Onboarding({ doctor, connected, keyTested, project, send, pickFolder, startPractice, onDone, point, approvals, usage, firstCheck, answer, cloneLink, copying, cloneNote, why }: Props) {
  const [step, setStep] = useState<Step>("hello");
  // The recorded fix, watched again from the hello (firstLook.tsx). It is a picture of a run: nothing is asked or changed.
  const [watching, setWatching] = useState(false);
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  // The questions the person answered here: only their own answers are kept (rule 15), so a skip saves none of them, and
  // a pre-filled answer they never touched is never saved as theirs.
  const [answered, setAnswered] = useState<ReadonlySet<keyof Answers>>(() => new Set());
  const [yours, setYours] = useState<Yours>(() => ({ ...DEFAULT_YOURS, ...yoursNow() }));
  // The groups switched off here (F20), starting from the values in force (F28: the non hero groups start off).
  const [groupsOff, setGroupsOff] = useState<SwitchedId[]>(() => offGroups());
  const [key, setKey] = useState("");
  const [keyNote, setKeyNote] = useState("");
  // When the key was saved: setup shows Anthropic's answer for this save only (onboarding.ts keyCheck).
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkNote, setLinkNote] = useState("");
  // The first check was asked for on this screen (only an answer to this press is shown, onboarding.ts checkStage).
  const [asked, setAsked] = useState(false);
  // The person stopped the check themselves (Stop the check, Back, Skip): only then does it say it was stopped.
  const [stoppedByMe, setStoppedByMe] = useState(false);
  const [open, setOpen] = useState<Fold | null>(null);
  // The keys every job uses now (the person may have picked others, or another app may hold the usual ones).
  const keys = useKeys();
  const plan = planCard(usePlan(), usage);
  const limit = Number(useSetting("spend.dailyLimit"));
  const honest = honestLines({ limitUsd: Number.isFinite(limit) ? limit : 10, plan });
  const ok = connected === "api_key" || connected === "plan";
  // Which way the last move went, so the next screen slides in from the right going on and from the left going back.
  const [dir, setDir] = useState<"on" | "back">("on");
  // Anthropic's Claude (M22): asked about as the first run opens, and fetched in the background at once if it is missing, so
  // it is usually ready by the time it is needed. Its progress shows on Your Claude.
  const [claude, setClaude] = useState<{ state: string; received?: number; total?: number | null; message?: string } | null>(null);
  useEffect(() => {
    void invoke("claude_status").then((v) => { const s = v as { state: string }; setClaude(s); if (s.state === "missing") void invoke("claude_install_now").catch(() => {}); }).catch(() => setClaude({ state: "ready" }));
    const off = listen("claude-install", (e) => setClaude(e.payload as { state: string }));
    return () => { off.then((f) => f()); };
  }, []);
  const ctx = { connected: ok, project, claude: claude ? claude.state === "ready" : undefined };
  const go = (target: Step | null) => {
    if (!target) return;
    // A fold left open belongs to the screen it was on: the next one starts with every fold closed, and Flowflow shown.
    setDir(STEPS.indexOf(target) >= STEPS.indexOf(step) ? "on" : "back"); setWatching(false); setOpen(null); setStep(target);
  };
  const own = NAMES.character;
  const name = yours.name.trim() || own;
  // What was chosen on the way (the name, how lively, the edge, the groups) is kept however the first run ends; the answers
  // to the questions only when the person gave them and then finishes (Go to my project, or a skip after answering).
  const keepChoices = () => {
    for (const [k, v] of yoursSettings(yours, own, yoursNow())) void changeSetting(k, v);
    for (const [key, on] of groupSettingsFor(groupsOff)) void changeSetting(key, on);
  };
  const finish = () => {
    keepChoices();
    if (answered.size > 0) {
      for (const c of commandsFor(answers, project, (scope, text, source) => addMemory(project, scope, text, source) as Command, answered)) void send(c);
      for (const [key, on] of settingsFor(answers, answered)) void changeSetting(key, on);
    }
    onDone();
  };
  const skip = () => { const to = skipTo(step); if (to === "done") finish(); else go(to); };
  const saveKey = () => {
    const problem = keyLooksRight(key);
    if (problem) { setKeyNote(problem); return; }
    // The key goes straight to the Keychain; the box is emptied at once and nothing keeps a copy. The engine then checks it
    // once with Anthropic (free) and says what it heard.
    const k = key; setKey("");
    void invoke("save_api_key", { key: k }).then(() => { setKeyNote(""); setSavedAt(Date.now()); }).catch((e) => setKeyNote(failNote(e, "key")));
  };
  const check = keyCheck(savedAt, keyTested);
  // The first check: on the person's press only (Check <name>), never by itself. The engine saves a safety copy before
  // anything runs and asks before installing anything (runner/test/first-check.test.ts).
  const startCheck = () => { setAsked(true); setStoppedByMe(false); firstCheck(); go("check"); };
  const stopCheck = () => { setStoppedByMe(true); void send(stopAgent()); };
  const asks = installAsks(approvals, AGENT);
  const stage = checkStage(asked, point, asks.length > 0);
  const result = stage === "done" && point ? firstCheckVerdict(point, folderName(project)) : null;
  const endLine = checkEndLine(stoppedByMe, why);
  const announce = checkAnnounce(stage, folderName(project), result, endLine);
  const openLink = () => {
    const u = link.trim();
    if (!u || copying) return;
    setLinkNote("");
    void cloneLink(u).then(() => setLink("")).catch((e) => { if (e !== "") setLinkNote(failNote(e, "folder")); });
  };
  // The Mac check, on Your project where the practice is offered (it waits only when Node is missing).
  useEffect(() => { if (step === "project" && needsMacCheck(doctor)) void send(checkMac()); }, [step]);
  // Node was installed while Home stayed open: coming back to Squibby checks again, only while Node is flagged missing.
  useEffect(() => {
    if (step !== "project" || !nodeMissing(doctor)) return;
    const again = () => void send(checkMac());
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [step, doctor]);
  const first = practiceOf(FIRST_PRACTICE)!, noNode = nodeMissing(doctor);
  // After Continue, Back or Skip (the person's own press; nothing else changes the step) the keyboard goes to the new step's
  // heading, so VoiceOver reads where they are. By the rule a question follows: Home has the keyboard, nobody is typing.
  const view = watching ? "look" : step;
  const box = useRef<HTMLElement>(null), shown = useRef<string>(view);
  useLayoutEffect(() => {
    if (shown.current === view) return;   // the first run just opened: nothing was pressed yet
    shown.current = view;
    const a = document.activeElement as HTMLElement | null, h = box.current?.querySelector<HTMLElement>("h2");
    if (!h || !shouldTakeFocus(a && a !== document.body ? { tag: a.tagName, editable: a.isContentEditable } : null, document.hasFocus())) return;
    h.setAttribute("tabindex", "-1"); h.focus();
  }, [view]);
  const count = countOf(step);
  const level = { "--level": `${LEVEL[step]}%` } as React.CSSProperties;

  // The recorded fix, from the hello: Back returns to the hello, and its last button carries on to Your Claude.
  if (watching) return (
    <section className="panel onboarding look" aria-label={S.obTitle} ref={box}>
      <div className="fr-top"><Button kind="quiet" size="sm" onClick={() => setWatching(false)}>{S.obBack}</Button></div>
      <FirstLook goLabel={S.obContinue} onGo={() => go(next(step))} />
    </section>
  );

  // The one main button (the flat silver, ui/parts.css), always at the bottom in the same place.
  const main = (label: string, onClick: () => void, disabled = false) => <Button kind="primary" size="lg" className="fr-key" disabled={disabled} onClick={onClick}>{label}</Button>;
  // Flowflow on its water (out of the way while a folded section is open): how it looks follows the first check (working while it checks, asking for an answer, waiting
  // after a failure). A passing check of the project as it is is not a proven fix, so it rests rather than celebrates.
  const look: CharacterState = stage === "checking" ? "checking" : stage === "asking" || (stage === "done" && point?.stage === "found") ? "needsYou" : "idle";
  const fold = (id: Fold, title: string, body: React.ReactNode) => <Disclosure title={title} open={open === id} onToggle={(o) => setOpen(o ? id : null)}>{body}</Disclosure>;
  const firstKeys = keyRows(keys).filter((r) => FIRST_KEYS.includes(r.job) && !r.none && keys.using[r.job as keyof typeof keys.using] && keyShownFirst(r.job, groupsOff));
  return (
    <section className="panel onboarding fr" data-step={step} aria-label={S.obTitle} ref={box} style={level}>
      <div className="fr-tank" aria-hidden="true"><Waterline under />{step !== "hello" && open === null && <div className="fr-float"><HomeCharacter as={look} /></div>}</div>
      <div className="fr-top">
        {back(step) && <button className="fr-back" type="button" aria-label={S.obBack} onClick={() => { if (stage === "checking" || stage === "asking") stopCheck(); go(back(step)); }}>&#8592;</button>}
        {count && <span className="fr-count">{S.fr.count(count.n, count.of)}</span>}
      </div>

      <div className="fr-slide" key={step} data-dir={dir}>
      {step === "hello" && (<>
        <div className="fr-hello" aria-hidden="true"><span className="fr-drop" /><span className="fr-ripple" /><div className="fr-rise"><HomeCharacter as="idle" /></div></div>
        {/* M41 (Supabase's two tone headlines): the statement bright, its answer in grey on the line below. */}
        <h2 className="fr-title">{twoTone(S.fr.helloTitle)[0]}<span className="fr-title-2">{twoTone(S.fr.helloTitle)[1]}</span></h2>
        <p className="fr-line">{S.fr.helloLine}</p>
        <Button kind="secondary" className="fr-watch" onClick={() => setWatching(true)}>{S.firstLook.watch}</Button>
        <div className="fr-grow" />
        <Button kind="quiet" className="fr-link fr-skip" onClick={finish}>{S.fr.skipSetup}</Button>
        {main(S.obContinue, () => go(next(step)))}
      </>)}

      {step === "claude" && (<>
        <h2 className="fr-title">{S.fr.claudeTitle}</h2>
        <p className="fr-line">{S.fr.claudeLine}</p>
        {/* The honest lines, each true now: where the key goes, what it costs (the limit in force), and the plan from the
            Plan card's own state. No Claude login form here, ever (rule 2): only Anthropic's own key page, on a press. */}
        <ul className="fr-honest">
          <li>{honest.privacy}</li>
          <li>{honest.cost}</li>
          <li>{honest.plan}</li>
        </ul>
        {claude?.state === "installing" && (() => {
          const mb = Math.round((claude.received ?? 0) / 1e6), pct = claude.total ? Math.min(100, Math.round(((claude.received ?? 0) / claude.total) * 100)) : null;
          return <div className="fr-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-valuetext={S.fr.claudeGetting(mb, pct)}>
            <div className="fr-bar"><i style={{ width: `${pct ?? 30}%` }} data-unknown={pct === null ? "yes" : undefined} /></div><span>{S.fr.claudeGetting(mb, pct)}</span></div>;
        })()}
        {claude?.state === "failed" && <><div className="error" role="alert">{claude.message}</div>
          <Button kind="quiet" className="fr-link" onClick={() => { setClaude({ state: "installing", received: 0 }); void invoke("claude_install_now").catch(() => {}); }}>{S.fr.claudeAgain}</Button></>}
        {claude?.state === "missing" && <><p className="fr-small">{S.fr.claudeMissing}</p><Button kind="quiet" className="fr-link" onClick={() => void invoke("claude_install_now").catch(() => {})}>{S.fr.claudeInstall}</Button></>}
        {ok && check !== "refused" ? <p className="fr-ok" role="status">{check ? S.obKeyCheck[check] : S.obConnected}</p> : (<>
          <div className="fr-keyrow">
            <Field type="password" wide value={key} label={S.obKeyLabel} placeholder="sk-ant-..." error={keyNote || (check === "refused" ? S.obKeyCheck.refused : undefined)} onChange={setKey} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveKey(); }} />
            <Button kind="secondary" className="fr-save" onClick={saveKey}>{S.fr.keyTest}</Button>
          </div>
          {fold("how", S.fr.keyHow, <ol className="fr-steps">{S.obKeySteps.map((t) => <li key={t}>{t}</li>)}</ol>)}
          <Button kind="quiet" className="fr-link" onClick={() => void invoke("open_link", { url: KEY_PAGE }).catch(() => setKeyNote(S.obLinkFailed))}>{S.obGetKey}</Button>
          {/* M28: no dead end without a key. Home then says "Add your Claude key" with a button that goes straight there. */}
          <Button kind="quiet" className="fr-link fr-skip" onClick={skip}>{S.fr.skipKey}</Button>
        </>)}
        <div className="fr-grow" />
        {main(S.obContinue, () => go(next(step)), !canContinue(step, ctx) || check === "refused")}
      </>)}

      {step === "project" && (<>
        <h2 className="fr-title">{S.fr.folderTitle}</h2>
        <p className="fr-line">{S.obFolderHelp}</p>
        {project ? (<>
          <div className="fr-folder" role="status"><b>{folderName(project)}</b><span>{project}</span></div>
          <p className="fr-small">{S.fr.checkPromise}</p>
          <Button kind="quiet" className="fr-link" onClick={pickFolder}>{S.fr.otherFolder}</Button>
        </>) : (
          <div className="fr-choices" role="group" aria-label={S.fr.folderTitle}>
            <Button kind="secondary" className="fr-choice" onClick={pickFolder}><b>{S.fr.pickFolder}</b><span>{S.fr.pickFolderLine}</span></Button>
            <Button kind="secondary" className="fr-choice" expanded={linkOpen} onClick={() => setLinkOpen(!linkOpen)}><b>{S.fr.pickLink}</b><span>{S.fr.pickLinkLine}</span></Button>
            {linkOpen && (<div className="fr-linkbox">
              <div className="fr-keyrow">
                <Field wide value={link} label={S.openLinkLabel} placeholder="https://github.com/name/project" error={linkNote || cloneNote || undefined} onChange={setLink} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) openLink(); }} />
                <Button kind="secondary" disabled={copying} onClick={openLink}>{S.openLinkGo}</Button>
              </div>
              <p className="fr-small">{copying ? S.copying : S.fr.linkLovable}</p>
            </div>)}
            {/* Taking the practice ends the first run here: the practice opens its own folder. The choices made on the way are kept. */}
            <Button kind="secondary" className="fr-choice" disabled={first.needsNode && !!noNode} onClick={() => { keepChoices(); onDone(); startPractice(first.id); }}><b>{S.fr.pickPractice}</b><span>{S.fr.pickPracticeLine}</span></Button>
            {first.needsNode && noNode && <p className="fr-small" role="status">{S.fr.practiceNeedsNode(noNode.fix ?? "")}</p>}
          </div>
        )}
        <div className="fr-grow" />
        {project ? <Button kind="quiet" className="fr-link fr-skip" onClick={finish}>{S.fr.skipCheck}</Button> : <Button kind="quiet" className="fr-link fr-skip" onClick={skip}>{S.fr.skipProject}</Button>}
        {main(project ? S.fr.checkGo(folderName(project)) : S.obContinue, startCheck, !canContinue(step, ctx))}
      </>)}

      {step === "check" && (<>
        <h2 className="fr-title">{result ? <VerdictLine verdict={result} size="headline" inline /> : stage === "stopped" ? S.home.notChecked : S.fr.checking(folderName(project))}</h2>
        {/* One live line, always there on this screen, so VoiceOver hears each change: the check running, the question, the
            verdict's own words (headline and line), or why it ended. The lines below are what the eye reads. */}
        <p className="sr" role="status" aria-live="polite">{announce}</p>
        {(stage === "checking" || stage === "asking") && <p className="fr-line">{S.fr.checkPromise}</p>}
        {result?.line && <p className="fr-line">{result.line}</p>}
        {stage === "stopped" && <p className="fr-line">{endLine}</p>}
        {/* The install question, on this screen while the first run covers Home: "Don't allow" first, neither one silver. */}
        {asks.map((a) => (
          <Card key={a.id} title={S.fr.checkAsk} className="fr-ask">
            <p>{a.title}</p>
            {(() => { const what = whatOf(a.action, project); return what && <code className="fr-cmd">{what}</code>; })()}
            <div className="row">
              <Button kind="secondary" cancel label={`${S.dontAllow}: ${a.title}`} onClick={() => answer(a.id, false)}>{S.dontAllow}</Button>
              <Button kind="secondary" label={`${S.allow}: ${a.title}`} onClick={() => answer(a.id, true)}>{S.allow}</Button>
            </div>
          </Card>
        ))}
        {(stage === "checking" || stage === "asking") && <Button kind="quiet" className="fr-link" onClick={stopCheck}>{S.fr.checkStop}</Button>}
        {stage === "stopped" && <Button kind="secondary" className="fr-again" onClick={() => { setAsked(true); setStoppedByMe(false); firstCheck(); }}>{S.fr.checkAgain}</Button>}

        {/* Flowflow's choices and the optional questions (F05) stay in the first run, folded here, until the founder says
            when they move (M49). The groups too (F20: each has its place in the first run). */}
        {(stage === "done" || stage === "stopped") && (<div className="fr-folds">
          {fold("yours", S.fr.yoursTitle(own), (<>
            <Row label={S.fr.nameLabel} control={<Field value={yours.name} label={S.fr.nameLabel} placeholder={own} maxLength={NAME_MAX} onChange={(v) => setYours({ ...yours, name: v })} />} />
            <Row label={S.fr.livelyLabel} description={S.fr.livelyLine[yours.lively ?? "still"]} control={<Segmented label={S.fr.livelyLabel} value={yours.lively ?? "still"} options={LIVELY.map((l) => ({ id: l, label: S.fr.lively[l] }))} onChange={(l) => setYours({ ...yours, lively: l })} />} />
            <Row label={S.fr.edgeLabel} control={<Menu label={S.fr.edgeLabel} value={yours.edge ?? "right"} options={EDGES.map((e) => ({ id: e, label: S.fr.edges[e] }))} onChange={(e) => setYours({ ...yours, edge: e })} />} />
          </>))}
          {fold("powers", S.fr.powersTitle, (<>
            <p className="fr-small">{S.fr.powersLine}</p>
            {SWITCHED.map((g) => {
              const id = g.id as SwitchedId, on = !groupsOff.includes(id);
              return <Row key={id} label={S.groups.names[id]} description={S.fr.asks[id] ? `${S.groups.short[id]} ${S.fr.asks[id]}.` : S.groups.short[id]}
                control={<Switch checked={on} label={S.groups.names[id]} onChange={() => setGroupsOff((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))} />} />;
            })}
            <p className="fr-small">{S.groups.core}</p>
          </>))}
          {fold("questions", S.fr.howYouLike, (<>
            {QUESTIONS.map((q) => <Row key={q.key} label={q.ask} control={<Segmented label={q.ask} value={answers[q.key] ? "yes" : "no"} options={[{ id: "yes", label: q.yes }, { id: "no", label: q.no }]} onChange={(v) => { setAnswered((s) => new Set(s).add(q.key)); setAnswers({ ...answers, [q.key]: v === "yes" }); }} />} />)}
            <p className="fr-small">{effectsOf(answers).join(" ")}</p>
          </>))}
          {/* The keys to remember first, those that can be pressed now (F28's four), in the Mac's own caps; every job and its
              key is in Settings, Keys. */}
          {firstKeys.length > 0 && fold("keys", S.keysTitle, (<>
            <div className="fr-tips">{firstKeys.map((r) => <div key={r.job} className="fr-tip"><KeyLabel chord={keys.using[r.job as keyof typeof keys.using]} /><span>{r.name}</span></div>)}</div>
            {talkSharedNote(keys) && <p className="fr-small">{talkSharedNote(keys)}</p>}
          </>))}
        </div>)}
        <div className="fr-grow" />
        {(stage === "checking" || stage === "asking") && <Button kind="quiet" className="fr-link fr-skip" onClick={() => { stopCheck(); finish(); }}>{S.fr.skipCheck}</Button>}
        {stage === "idle" && main(S.fr.checkGo(folderName(project)), startCheck, !project)}
        {stage !== "idle" && main(S.fr.goProject, finish, stage === "checking" || stage === "asking")}
      </>)}
      </div>
    </section>
  );
}
