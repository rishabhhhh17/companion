// M117: the Money and fines part of the check before going live, drawn with the go live panel's own rows, marks and
// buttons (no new look, no new colour, no motion). What it says is decided in moneyFines.ts (tested there). Nothing here
// starts work by itself: Copy for my AI and Copy this list copy only, I set this up outside the code saves one line in
// What I remember on the person's press, and Check again runs the check again on their press.
import { useState, type ReactNode } from "react";
import type { MoneyPart, MoneyToldKind } from "../../protocol/index.ts";
import { familyTitle, moneyView, type MoneyRow } from "./moneyFines.ts";
import { S } from "./strings.ts";

type Props = {
  money: MoneyPart;
  /** The card's own copy button (card.tsx CopyButton): copies only on a press, keys hidden again first. */
  copy: (text: string, label: string, name: string) => ReactNode;
  /** "I set this up outside the code": saves the line in the project's memory. */
  onTold: (kind: MoneyToldKind, file: string, line: string) => void;
  onCheckAgain: () => void;
};

export function MoneyFinesPart({ money, copy, onTold, onCheckAgain }: Props) {
  const v = moneyView(money);
  const [told, setTold] = useState<Set<string>>(new Set());
  return (
    <div className="ship-finish" role="group" aria-label={S.money.title}>
      <div className="line"><b>{S.money.title}</b> <span className="muted">{v.off ? "" : S.money.summary(v.findings)}</span></div>
      {v.rows.map((r: MoneyRow, i: number) => {
        const first = !v.off && (i === 0 || v.rows[i - 1].family !== r.family);
        const heading = first ? <div key={`h:${r.family}`} className="line muted"><b>{familyTitle(r.family)}</b></div> : null;
        const pressed = told.has(r.key);
        return [heading, (
          <div key={r.key} className="line" role="group" aria-label={`${S.goLive.mark[r.mark]}: ${r.head}`}>
            {r.head} <span className="muted">{S.goLive.mark[r.mark]}</span>
            {r.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}
            {pressed && <div role="status">{S.money.toldSaved}</div>}
            {(r.copy || r.copyList || (r.told && !pressed)) && (
              <div className="row">
                {r.copy && copy(r.copy, S.money.copyForAi, `${S.money.copyForAi}: ${r.head}`)}
                {r.copyList && copy(r.copyList, S.money.copyList, `${S.money.copyList}: ${S.money.listTitle}`)}
                {r.told && !pressed && <button className="btn" type="button" aria-label={`${S.money.toldButton}: ${r.head}`} onClick={() => { const t = r.told!; setTold((s) => new Set(s).add(r.key)); onTold(t.kind, t.file, t.line); }}>{S.money.toldButton}</button>}
              </div>
            )}
          </div>
        )];
      })}
      {!v.off && v.about.map((a, i) => <div key={`a:${i}`} className="line muted">{a}</div>)}
      <div className="row"><button className="btn" type="button" aria-label={`${S.money.checkAgain}: ${S.money.title}`} onClick={onCheckAgain}>{S.money.checkAgain}</button></div>
    </div>
  );
}
