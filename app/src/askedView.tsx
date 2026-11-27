// M123: did it do what you asked, as the result card and the review card show it. Each promise with what the hidden browser
// found, and (slice 4, watch it try) the picture it took while trying each one: the app being built, never the screen.
// The broken one opens first. Pictures change only on the person's press; nothing moves by itself.
import { useState } from "react";
import { S } from "./strings.ts";
import type { AskedPromise } from "./asked.ts";

export function AskedList({ ps, say = (t) => t, className = "" }: { ps?: AskedPromise[]; say?: (t: string) => string; className?: string }) {
  const shots = (ps ?? []).map((p, i) => ({ p, i })).filter((x) => !!x.p.image);
  const first = shots.find((x) => x.p.result === "not_kept") ?? shots[0];
  const [pick, setPick] = useState<number | null>(null);
  if (!ps?.length) return null;
  const on = pick ?? first?.i ?? -1;
  const shown = ps[on]?.image ? ps[on] : undefined;
  return (
    <div className={`receipt-asked ${className}`.trim()} role="group" aria-label={S.asked.title}>
      <p className="receipt-asked-title">{S.asked.title}</p>
      <ul>
        {ps.map((p, i) => (
          <li key={i} data-result={p.result} data-on={i === on && shown ? "" : undefined}>
            <span>{say(p.say)}</span> <b>{S.asked.result[p.result]}</b>
            {p.why && p.result !== "kept" ? <small>{say(p.why)}</small> : null}
          </li>
        ))}
      </ul>
      {shown && (
        <figure className="asked-watch">
          <img src={`data:image/jpeg;base64,${shown.image}`} alt={S.asked.pictureOf(say(shown.say))} />
          <figcaption>{S.asked.watchLine}</figcaption>
          {shots.length > 1 && (
            <div className="asked-frames" role="group" aria-label={S.asked.watch}>
              {shots.map(({ p, i }) => (
                <button key={i} type="button" className="btn quiet" data-result={p.result} aria-pressed={i === on} aria-label={S.asked.pictureOf(say(p.say))} onClick={() => setPick(i)}>{i + 1}</button>
              ))}
            </div>
          )}
        </figure>
      )}
    </div>
  );
}
