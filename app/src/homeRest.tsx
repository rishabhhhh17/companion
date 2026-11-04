// M69 step 2, Home at rest is never empty (the YC benchmark spec 3.1, 3.2): the Last fix card (its name, its tag, what it
// changed, its proof ticks, the proof picture when the receipt made one, and a quiet Undo) beside the Since then card (what
// happened after it, each row with one quiet action), or the practice offer for a project with no fixes yet. homeRest.ts
// decides every word; this only draws it. In the wide Home the two cards sit side by side, in the tall Home one under the
// other (ui/homeNow.css).
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons.tsx";
import type { FixProof, LastFix, SinceRow } from "./homeRest.ts";
import { S } from "./strings.ts";
import { Button } from "./ui/parts.tsx";

const TAG_TONE: Record<LastFix["tag"], "proven" | "needs" | "stop" | "plain"> = { proven: "proven", undone: "plain", failed: "stop", partly: "needs", unchecked: "plain" };
const ROW_ICON: Record<SinceRow["kind"], IconName> = { files: "doc", unchecked: "ring", task: "undo" };

/** M69 step 3: the before and after pair, each in a small browser frame with a word under it. Only the after picture when
 *  the earlier version could not be pictured. Pictures of the app being built, made by the hidden browser (never the
 *  person's screen). `host`: the address the browser check really opened, when the engine says one; the bar stays empty
 *  otherwise (step 4: a folder's name there would look like an address the page was loaded from). */
export function ShotPair({ before, after, host, caption, size = "card" }: { before?: string; after: string; host?: string; caption?: string; size?: "card" | "receipt" }) {
  const frame = (img: string, word: string, alt: string) => (
    <figure className="now-shot">
      <div className="now-shot-frame">
        <div className="now-shot-bar" aria-hidden="true"><span /><span /><span />{host && <code>{host}</code>}</div>
        <img src={`data:image/jpeg;base64,${img}`} alt={alt} />
      </div>
      <figcaption>{word}</figcaption>
    </figure>
  );
  return (
    <div className="shot-pair" data-size={size} data-two={before ? "" : undefined}>
      {before && frame(before, S.homeNow.before, S.homeNow.pictureBefore)}
      {frame(after, before ? S.homeNow.after : caption || S.homeNow.after, caption || S.homeNow.picture)}
      {before && caption && <p className="shot-caption">{caption}</p>}
    </div>
  );
}

/** The Last fix card. `undo`: the confirm step and its answer, when Undo is offered for this task (history.ts historyUndo).
 *  M69 step 3: the outcome as its title, a one line why when the receipt said one, the before and after pair, and the proof
 *  ticks (each check that passed, else M45's one tick) with Undo on the right. */
export function LastFixCard({ fix, picture, onOpen, undo }: {
  fix: LastFix; /** kept for callers; the picture's bar never shows it (step 4) */ project?: string; picture: Omit<FixProof, "checkpoint"> | null; onOpen: () => void; undo?: ReactNode;
}) {
  const ticks = picture?.ticks?.length && fix.tag === "proven" ? picture.ticks.map((words) => ({ ok: true as boolean | null, words })) : fix.ticks;
  return (
    <section className="panel now-card now-fix" aria-labelledby="now-fix-title">
      <div className="now-card-head">
        <h2 className="ui-eyebrow">{S.homeNow.lastFix}</h2>
        <p className="ui-status" data-tone={TAG_TONE[fix.tag]}>{S.homeNow.tag[fix.tag]}</p>
      </div>
      <h3 id="now-fix-title" className="now-fix-title"><button type="button" className="now-link" onClick={onOpen}>{fix.title}</button></h3>
      {picture?.why && <p className="now-fix-why">{picture.why}</p>}
      <p className="now-fix-meta">{fix.meta}</p>
      {picture && <ShotPair before={picture.before} after={picture.image} caption={picture.caption} />}
      <div className="now-fix-foot">
        <ul className="now-ticks">
          {ticks.map((t) => (
            <li key={t.words} data-ok={t.ok === true ? "" : undefined} data-bad={t.ok === false ? "" : undefined}>
              <Icon name={t.ok === true ? "tick" : t.ok === false ? "cross" : "dash"} size={14} />{t.words}
            </li>
          ))}
        </ul>
        {undo}
      </div>
    </section>
  );
}

/** The Since then card: up to three rows, each with one quiet action, or one line when nothing happened. */
export function SinceCard({ rows, onAct }: { rows: SinceRow[]; onAct: (r: SinceRow) => void }) {
  return (
    <section className="panel now-card now-since" aria-labelledby="now-since-title">
      <div className="now-card-head"><h2 id="now-since-title" className="ui-eyebrow">{S.homeNow.sinceThen}</h2></div>
      {rows.length === 0
        ? <p className="now-since-none">{S.homeNow.sinceNothing}</p>
        : <ul className="now-rows">
          {/* A row that opens something is one button (its time on the right); Not checked since has Check, in the accent. */}
          {rows.map((r) => (
            <li key={r.id}>
              {r.act === "check"
                ? <div className="now-row">
                  <span className="now-row-mark" aria-hidden="true"><Icon name={ROW_ICON[r.kind]} size={12} /></span>
                  <span className="now-row-words">{r.words}</span>
                  <button type="button" className="now-row-check" onClick={() => onAct(r)}>{S.homeNow.check}</button>
                </div>
                : <button type="button" className="now-row" title={r.act === "look" ? S.homeNow.look : S.homeNow.open} onClick={() => onAct(r)}>
                  <span className="now-row-mark" aria-hidden="true"><Icon name={ROW_ICON[r.kind]} size={12} /></span>
                  <span className="now-row-words">{r.words}</span>
                  {r.meta && <span className="now-row-meta">{r.meta}</span>}
                </button>}
            </li>
          ))}
        </ul>}
    </section>
  );
}

/** A project with no fixes yet: the practice offer in the Last fix card's place (one button). */
export function PracticeCard({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return (
    <section className="panel now-card now-practice" aria-labelledby="now-practice-title">
      <div className="now-card-head"><h2 className="ui-eyebrow">{S.homeNow.noFixesTitle}</h2></div>
      <h3 id="now-practice-title" className="now-fix-title">{S.homeNow.practiceTitle}</h3>
      <p className="now-fix-meta">{S.homeNow.practiceLine}</p>
      <div className="row"><Button kind="secondary" disabled={busy} onClick={onStart}>{S.homeNow.practiceStart}</Button></div>
      <p className="now-since-none">{S.homeNow.noFixesLine}</p>
    </section>
  );
}
