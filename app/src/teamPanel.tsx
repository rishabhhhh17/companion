// M124: Your team, in History. Make or join a team, turn sharing on, see the team's receipts (the admin view: every change
// from every person and every AI tool), keep the team's house rules (admins edit), leave. Each press sends one command;
// nothing is sent before a press, and the page shows only what the engine answered (teamState.ts).
import { useEffect, useRef, useState } from "react";
import { teamInvite, teamJoin, teamLeave, teamMake, teamRemove, teamRules, teamShare, teamShow } from "./commands.ts";
import { S } from "./strings.ts";
import { listen } from "./tauri.ts";
import { Button, ListGroup, ListRow, Menu, Switch } from "./ui/parts.tsx";
import { lastWords, ruleLine, teamFrom, type TeamPage } from "./teamState.ts";

const KINDS = ["never_edit", "never_run", "ask_edit", "ask_run", "ask_install"] as const;

export function TeamPart({ send }: { send: (cmd: unknown) => unknown }) {
  const t = S.team;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<TeamPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", me: "", invite: "", kind: "never_edit" as string, pattern: "" });
  const [draft, setDraft] = useState<{ kind: string; pattern: string }[] | null>(null);
  const listening = useRef(false);
  useEffect(() => {
    const off = listen("runner-event", (e) => {
      if (!listening.current) return;
      const p = teamFrom(e.payload);
      if (!p) return;
      setBusy(false);
      setPage((old) => ({ ...p, receipts: p.receipts ?? old?.receipts, invite: p.invite ?? (p.team ? old?.invite : undefined) }));
      if (p.last?.did === "rules" && p.last.ok) setDraft(null);
    });
    return () => { void off.then((g) => g()); };
  }, []);
  const go = (cmd: unknown) => { listening.current = true; setBusy(true); void send(cmd); };
  const press = () => { if (open) { setOpen(false); return; } setOpen(true); go(teamShow(true)); };
  const team = page?.team ?? null, admin = team?.role === "admin";
  const said = lastWords(page?.last);
  const rules = draft ?? team?.rules ?? [];
  // The app's Button is type="button" (ui/parts.tsx), so each press needs its own onClick; the forms keep Enter working.
  const addRule = () => { if (f.kind === "ask_install" || f.pattern.trim()) { setDraft([...rules, { kind: f.kind, pattern: f.kind === "ask_install" ? "packages" : f.pattern.trim() }]); setF({ ...f, pattern: "" }); } };
  return (
    <div className="hist-week-part team-part" role="group" aria-label={t.rowTitle}>
      <ListGroup label={t.rowTitle}>
        <ListRow colour="blue" icon="grid" title={team ? team.name : t.rowTitle} line={t.rowLine} expanded={open}
          action={{ label: open ? t.close : t.open, colour: "blue", ariaLabel: open ? t.close : t.rowTitle, onClick: press }} />
      </ListGroup>
      {open && (
        <section className="week-page team-page" aria-label={t.rowTitle}>
          {said && <p className="line" role="status">{said}</p>}
          {!team && (<>
            <p className="line muted">{t.intro}</p>
            <form className="team-form" onSubmit={(e) => { e.preventDefault(); if (f.name.trim() && f.me.trim()) go(teamMake(f.name, f.me)); }}>
              <p className="ui-lead-title" role="heading" aria-level={3}>{t.makeTitle}</p>
              <label>{t.teamName}<input type="text" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label>{t.yourName}<input type="text" value={f.me} maxLength={40} onChange={(e) => setF({ ...f, me: e.target.value })} /></label>
              <Button size="sm" kind="primary" disabled={busy || !f.name.trim() || !f.me.trim()} onClick={() => go(teamMake(f.name, f.me))}>{t.make}</Button>
            </form>
            <form className="team-form" onSubmit={(e) => { e.preventDefault(); if (f.invite.trim() && f.me.trim()) go(teamJoin(f.invite, f.me)); }}>
              <p className="ui-lead-title" role="heading" aria-level={3}>{t.joinTitle}</p>
              <label>{t.invite}<input type="text" value={f.invite} maxLength={120} spellCheck={false} onChange={(e) => setF({ ...f, invite: e.target.value })} /></label>
              <label>{t.yourName}<input type="text" value={f.me} maxLength={40} onChange={(e) => setF({ ...f, me: e.target.value })} /></label>
              <Button size="sm" disabled={busy || !f.invite.trim() || !f.me.trim()} onClick={() => go(teamJoin(f.invite, f.me))}>{t.join}</Button>
            </form>
          </>)}
          {team && (<>
            <label className="team-share"><Switch checked={team.share} label={t.share} onChange={(on) => go(teamShare(on))} /><span>{t.share}</span></label>
            <p className="line muted">{t.shareLine}</p>
            {page?.invite && <p className="line team-invite"><code>{page.invite}</code><br /><span className="muted">{t.inviteLine}</span></p>}
            {admin && <Button size="sm" disabled={busy} onClick={() => go(teamInvite())}>{t.newInviteBtn}</Button>}

            <p className="ui-lead-title" role="heading" aria-level={3}>{t.receipts}</p>
            {!page?.receipts?.length ? <p className="line muted">{t.noReceipts}</p> : (
              <ul className="team-receipts">
                {page.receipts.map((r) => (
                  <li key={r.seq} data-verdict={r.verdict}>
                    <p className="line"><b>{r.by}</b> · {r.project} · {r.tool} · <span className="team-verdict">{t.verdict[r.verdict]}</span></p>
                    {r.lines.map((l, i) => <p className="line muted" key={i}>{l}</p>)}
                    {r.checks.length > 0 && <p className="line muted">{r.checks.map((c) => `${c.label}: ${c.result}`).join(" · ")}</p>}
                    {r.asked && <p className="line muted">{t.asked(r.asked.kept, r.asked.missing)}</p>}
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" disabled={busy} onClick={() => go(teamShow(true))}>{t.refresh}</Button>

            <p className="ui-lead-title" role="heading" aria-level={3}>{t.rules}</p>
            <p className="line muted">{t.rulesLine}</p>
            {rules.length === 0 ? <p className="line muted">{t.noRules}</p> : (
              <ul className="team-rules">{rules.map((r, i) => <li key={i}><span>{ruleLine(r)}</span>{admin && <Button size="sm" onClick={() => setDraft(rules.filter((_, j) => j !== i))}>{t.removeRule}</Button>}</li>)}</ul>
            )}
            {admin && (
              <form className="team-form" onSubmit={(e) => { e.preventDefault(); addRule(); }}>
                <Menu label={t.ruleKind} size="md" value={f.kind as (typeof KINDS)[number]} options={KINDS.map((k) => ({ id: k, label: t.ruleKinds[k] }))} onChange={(k) => setF({ ...f, kind: k })} />
                {f.kind !== "ask_install" && <label>{t.rulePattern}<input type="text" value={f.pattern} maxLength={200} onChange={(e) => setF({ ...f, pattern: e.target.value })} /></label>}
                <Button size="sm" onClick={addRule}>{t.addRule}</Button>
                {draft && <Button size="sm" kind="primary" disabled={busy} onClick={() => go(teamRules(draft))}>{t.saveRules}</Button>}
              </form>
            )}

            <p className="ui-lead-title" role="heading" aria-level={3}>{t.members}</p>
            <ul className="team-members">{(team.members ?? []).map((m) => <li key={m.name}><span>{m.name}{m.role === "admin" ? ` (${t.admin})` : ""}</span>{admin && m.name !== team.me && <Button size="sm" onClick={() => go(teamRemove(m.name))}>{t.removeMember}</Button>}</li>)}</ul>
            <Button size="sm" disabled={busy} onClick={() => go(teamLeave())}>{t.leave}</Button>
          </>)}
        </section>
      )}
    </div>
  );
}
