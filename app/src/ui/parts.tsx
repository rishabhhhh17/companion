// The parts every screen is built from (the overhaul spec, 2.3), each defined once: its look in ui/parts.css, its
// values in ui/tokens.css, its words in strings.ts (S.ui), and its logic, where it has any, in ui/partsLogic.ts. A screen
// never draws its own switch, menu or main button; it uses these. The props are typed and never spread onto a control, so
// a11y.test.ts can read every name. Motion is CSS only, so the Mac's Reduce motion and Less motion stop it (style.css).
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from "react";
import { Icon, type IconName } from "../icons.tsx";
import { chordLabel, keycaps } from "../keys.ts";
import { takeIfLost } from "../focus.ts";
import { S } from "../strings.ts";
import type { Verdict } from "../verdict.ts";
import { clampTo, commitText, menuOpensUp, moveIndex, stepBy, tabWrap, typeahead, verdictMark, type Range, type Stepped } from "./partsLogic.ts";

export type Option<T extends string = string> = { id: T; label: string };

// ---------- Button ----------

export type ButtonKind = "primary" | "secondary" | "quiet" | "danger" | "icon";
export type ButtonSize = "sm" | "md" | "lg";
/** The class names of a button, for markup that cannot use <Button> yet: "btn secondary", "btn primary lg". */
export const btnClass = (kind: ButtonKind = "secondary", size: ButtonSize = "md", extra = ""): string =>
  ["btn", kind, size === "md" ? "" : size, extra].filter(Boolean).join(" ");

export type ButtonProps = {
  kind?: ButtonKind; size?: ButtonSize; className?: string; id?: string; disabled?: boolean;
  /** The name VoiceOver reads when the words inside are not enough (an icon button must have one). */
  label?: string; title?: string; pressed?: boolean; expanded?: boolean; controls?: string; describedBy?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void; buttonRef?: Ref<HTMLButtonElement>; children?: ReactNode;
  /** The safe choice of an are you sure (ConfirmStep puts the keyboard on it first). */
  cancel?: boolean;
  /** -1 inside a panel that is laid out but not shown (the notch's hover panel), so Tab never lands on it. */
  tabIndex?: number;
};
/** One button. Primary is the flat silver (one per screen), secondary has a hairline edge, quiet is words only, danger is
 *  for the danger zone only, icon is a 28 point square around a 16 point drawing (give it a label). */
export function Button({ kind = "secondary", size = "md", className = "", id, disabled, label, title, pressed, expanded, controls, describedBy, onClick, buttonRef, cancel, tabIndex, children }: ButtonProps) {
  return (
    <button ref={buttonRef} id={id} type="button" className={btnClass(kind, size, className)} disabled={disabled} aria-label={label} title={title} tabIndex={tabIndex}
      aria-pressed={pressed} aria-expanded={expanded} aria-controls={controls} aria-describedby={describedBy} data-cancel={cancel || undefined} onClick={onClick}>{children}</button>
  );
}

// ---------- Row and Group ----------

export type RowProps = {
  label: ReactNode; description?: ReactNode; control?: ReactNode;
  /** The control's id: a click on the label presses a switch or puts the keyboard in a field (a label's own behaviour). */
  controlId?: string; labelId?: string; descriptionId?: string; id?: string;
  /** A child setting: indented, and dimmed while its parent is off (say why in the description: S.ui.turnOnFirst). */
  indent?: boolean; disabled?: boolean;
  /** Changed from the usual: a small dot before the label whose menu holds Restore usual. */
  changed?: { usual: string; onRestore?: () => void } | null;
  scope?: "project" | null;
  /** The longer words (a setting's full help, the part that never changes): behind a small info button beside the
   *  control, never a wall under the row (the founder, 31 Oct). */
  more?: readonly string[];
  /** What still sits under a row until it becomes a sheet (an editor, a note, a question). Full width, under the text. */
  children?: ReactNode;
};
/** One setting: its name and one line on what changes on the left, its control on the right (under the words when the
 *  card is narrow). Named for VoiceOver by its label. */
export function Row({ label, description, control, controlId, labelId, descriptionId, id, indent, disabled, changed, scope, more, children }: RowProps) {
  const ownLabel = useId(), ownDesc = useId(), menuId = useId(), moreId = useId();
  const lid = labelId ?? ownLabel, did = descriptionId ?? ownDesc;
  const [menu, setMenu] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const hasMore = !!more && more.length > 0;
  const hasControl = control !== undefined && control !== null;
  const restore = changed?.onRestore;
  return (
    <div role="group" aria-labelledby={lid} className="ui-row" id={id} data-indent={indent || undefined} data-disabled={disabled || undefined}
      onContextMenu={restore ? (e) => { e.preventDefault(); setMenu(true); } : undefined}>
      <div className="ui-row-text">
        <span className="ui-row-head">
          {changed && <button type="button" className="ui-row-dot" aria-label={S.ui.changed(changed.usual)} title={S.ui.changed(changed.usual)}
            aria-haspopup={restore ? "menu" : undefined} aria-expanded={restore ? menu : undefined} aria-controls={restore ? menuId : undefined}
            onClick={() => { if (restore) setMenu((x) => !x); }} />}
          {controlId ? <label className="ui-row-label" id={lid} htmlFor={controlId}>{label}</label> : <span className="ui-row-label" id={lid}>{label}</span>}
          {scope === "project" && <span className="ui-tag">{S.ui.thisProject}</span>}
          {/* The longer words sit behind a small info button after the name, seen when the row is pointed at or reached by
              the keyboard, so a page is not a column of icons (the founder, 31 Oct). */}
          {hasMore && <Button kind="icon" size="sm" className="ui-row-info" label={S.ui.learnMore} describedBy={lid} expanded={showMore} controls={moreId} onClick={() => setShowMore(!showMore)}><Icon name="info" size={14} /></Button>}
        </span>
        {description ? <span className="ui-row-desc" id={did}>{description}</span> : null}
        {menu && restore && (
          <div className="ui-pop" role="menu" id={menuId} aria-label={S.ui.changed(changed!.usual)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false); } }}>
            <button type="button" role="menuitem" className="ui-pop-item" onClick={() => { setMenu(false); restore(); }}>{S.ui.restoreUsual}</button>
          </div>
        )}
      </div>
      {hasControl && <div className="ui-row-control">
        {hasControl ? control : null}
      </div>}
      {children || (hasMore && showMore) ? <div className="ui-row-extra">
        {hasMore && showMore ? <div className="ui-row-more" id={moreId}>{more!.map((m, i) => <p key={i}>{m}</p>)}</div> : null}
        {children}
      </div> : null}
    </div>
  );
}

/** A titled card of rows. `id` is its anchor (#account.spending). `pad`: the card holds free text, not rows. `danger`: the
 *  danger zone, the one card with a red edge (its title stays quiet). */
export function Group({ id, title, footer, pad, danger, children }: { id?: string; title?: ReactNode; footer?: ReactNode; pad?: boolean; danger?: boolean; children?: ReactNode }) {
  const hid = useId();
  return (
    <section className="ui-group" id={id} aria-labelledby={title ? hid : undefined} data-tone={danger ? "danger" : undefined}>
      {title ? <h3 className="ui-group-title" id={hid}>{title}</h3> : null}
      <div className={pad ? "ui-group-card pad" : "ui-group-card"}>{children}</div>
      {footer ? <p className="ui-group-foot">{footer}</p> : null}
    </section>
  );
}

/** A closed topic (More options): its title, how many rows it holds and a chevron; opened, its rows. */
export function Disclosure({ id, title, count, open, onToggle, disabledNote, children }: { id?: string; title: string; count?: number; open: boolean; onToggle: (open: boolean) => void; disabledNote?: string; children?: ReactNode }) {
  const bodyId = useId();
  return (
    <section className="ui-disc" id={id} data-open={open || undefined}>
      <button type="button" className="ui-disc-head" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(!open)}>
        <span className="ui-disc-title">{title}</span>
        {count !== undefined ? <span className="ui-disc-count">{count}</span> : null}
        <span className="ui-disc-chev" aria-hidden="true"><Icon name="chevron" size={12} /></span>
      </button>
      {open ? <div className="ui-disc-body" id={bodyId}>{disabledNote ? <p className="ui-disc-note">{disabledNote}</p> : null}{children}</div> : null}
    </section>
  );
}

/** A page's title and the one line on what it is for. */
export function PageHead({ title, line }: { title: ReactNode; line?: ReactNode }) {
  return <header className="ui-page-head"><h2 className="ui-page-title">{title}</h2>{line ? <p className="ui-page-line">{line}</p> : null}</header>;
}

// ---------- Controls ----------

type Named = { label?: string; labelledBy?: string; describedBy?: string; id?: string; disabled?: boolean };

/** On or off, and nothing else. On is filled, off is hollow, so it reads by shape as well as by tone. */
export function Switch({ checked, onChange, label, labelledBy, describedBy, id, disabled }: Named & { checked: boolean; onChange: (on: boolean) => void }) {
  return <button id={id} type="button" role="switch" className="ui-switch" aria-checked={checked} aria-label={label} aria-labelledby={labelledBy}
    aria-describedby={describedBy} disabled={disabled} onClick={() => onChange(!checked)} />;
}

/** Two or three choices side by side (four or more are a Menu: ui/controlRule.ts). The arrows move the choice. */
export function Segmented<T extends string>({ value, options, onChange, label, labelledBy, describedBy, id, disabled }: Named & { value: T; options: readonly Option<T>[]; onChange: (v: T) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const found = options.findIndex((o) => o.id === value), at = Math.max(0, found);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = moveIndex(e.key, at, options.length);
    if (to === null || disabled) return;
    e.preventDefault();
    onChange(options[to].id);
    box.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[to]?.focus();
  };
  return (
    <div className="ui-seg" role="radiogroup" id={id} aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-disabled={disabled || undefined}
      ref={box} onKeyDown={onKeyDown} data-none={found < 0 || undefined} style={{ "--n": options.length, "--i": at } as CSSProperties}>
      <span className="ui-seg-thumb" aria-hidden="true" />
      {options.map((o, i) => <button key={o.id} type="button" role="radio" className="ui-seg-opt" aria-checked={o.id === value} tabIndex={i === at ? 0 : -1} disabled={disabled} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

/** Four or more choices: a button showing the choice, which opens a list with a tick by the one chosen. Never a plain
 *  select. `placeholder`: the words when nothing is chosen (an action menu keeps value ""). */
export function Menu<T extends string>({ value, options, onChange, label, labelledBy, describedBy, id, disabled, placeholder = "", size = "sm" }: Named & { value: T | ""; options: readonly Option<T>[]; onChange: (v: T) => void; placeholder?: string; size?: ButtonSize }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null), wrap = useRef<HTMLSpanElement>(null);
  const listId = useId(), valueId = useId(), optId = (i: number) => `${listId}-${i}`;
  const at = options.findIndex((o) => o.id === value);
  const shown = at >= 0 ? options[at].label : placeholder;
  const show = (i: number) => { if (disabled || !options.length) return; setActive(Math.max(0, i)); setOpen(true); };
  const close = (back = true) => { setOpen(false); if (back) btn.current?.focus(); };
  const pick = (i: number) => { const o = options[i]; close(); if (o && o.id !== value) onChange(o.id); };
  // Opened by the person's own press, the list takes the keyboard (rule 9 is about other apps, and this is inside the
  // panel they are using). It opens upward when there is no room under its button.
  useLayoutEffect(() => {
    if (!open || !list.current || !btn.current) return;
    setUp(menuOpensUp(btn.current.getBoundingClientRect(), list.current.offsetHeight, window.innerHeight));
    list.current.focus();
  }, [open]);
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`#${CSS.escape(optId(active))}`)?.scrollIntoView({ block: "nearest" }); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(at >= 0 ? at : 0); }
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Tab") { close(false); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); return; }
    const to = moveIndex(e.key, active, options.length, false) ?? (e.key.length === 1 ? typeahead(options.map((o) => o.label), active, e.key) : null);
    if (to !== null) { e.preventDefault(); setActive(to); }
  };
  return (
    <span className="ui-menu" ref={wrap}>
      <button ref={btn} id={id} type="button" className={btnClass("secondary", size, "ui-menu-btn")} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={labelledBy ? undefined : label ? `${label}: ${shown}` : undefined} aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined} aria-describedby={describedBy}
        onClick={() => (open ? close() : show(at >= 0 ? at : 0))} onKeyDown={onButtonKey}>
        <span className="ui-menu-value" id={valueId}>{shown}</span>
        <Icon name="updown" size={12} />
      </button>
      {open && (
        <ul ref={list} className="ui-menu-list" id={listId} role="listbox" tabIndex={-1} data-up={up || undefined}
          aria-label={label} aria-labelledby={labelledBy} aria-activedescendant={optId(active)} onKeyDown={onListKey}>
          {options.map((o, i) => (
            <li key={o.id} id={optId(i)} role="option" className="ui-menu-item" aria-selected={o.id === value} data-active={i === active || undefined}
              onPointerEnter={() => setActive(i)} onClick={() => pick(i)}>
              <span className="ui-menu-tick" aria-hidden="true">{o.id === value ? <Icon name="tick" size={12} /> : null}</span>{o.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** A number: minus, the value (typed or stepped with the arrows), plus, and its unit. A value past an end is set to the
 *  end, and `onNote` says so ("Set to 10, the most it can be."). */
export function Stepper({ value, min, max, step, unit, label, labelledBy, describedBy, id, disabled, onChange, onNote }: Named & Range & { value: number; unit?: string; label: string; onChange: (n: number) => void; onNote?: (words: string) => void }) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(String(value)); }, [value]);
  const r: Range = { min, max, step };
  const keep = (s: Stepped | null) => {
    editing.current = false;
    if (!s) { setText(String(value)); onNote?.(S.ui.notANumber); return; }
    setText(String(s.value));
    if (s.value !== value) onChange(s.value);
    // Said after the change, so a page that clears its message on a change still shows this one.
    if (s.note) onNote?.(s.note === "max" ? S.ui.setToMax(String(s.value)) : S.ui.setToMin(String(s.value)));
  };
  const by = (dir: 1 | -1) => keep(clampTo(stepBy(value, dir, r), r));
  return (
    <span className="ui-stepper" data-disabled={disabled || undefined}>
      <span className="ui-stepper-box">
      <button type="button" className="ui-stepper-btn" aria-label={S.ui.stepLess(label)} disabled={disabled || (min !== undefined && value <= min)} onClick={() => by(-1)}>{"−"}</button>
      <input id={id} className="ui-stepper-value" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={text} disabled={disabled}
        aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} aria-describedby={describedBy}
        onChange={(e) => { editing.current = true; setText(e.target.value); }}
        onBlur={() => { if (editing.current) keep(commitText(text, r)); }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") { e.preventDefault(); keep(commitText(text, r)); }
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); by(e.key === "ArrowUp" ? 1 : -1); }
        }} />
      <button type="button" className="ui-stepper-btn" aria-label={S.ui.stepMore(label)} disabled={disabled || (max !== undefined && value >= max)} onClick={() => by(1)}>+</button>
      </span>
      {unit ? <span className="ui-stepper-unit">{unit}</span> : null}
    </span>
  );
}

/** One line of text. `error` names the problem, then the fix, under the field. `ask`: the ask field's larger size. `wide`:
 *  as wide as its row (a search box). */
export function Field({ value, onChange, onBlur, onKeyDown, label, labelledBy, describedBy, id, disabled, placeholder, error, type = "text", ask, wide, maxLength, inputRef }: Named & {
  value: string; onChange: (v: string) => void; onBlur?: () => void; onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string; error?: string; type?: "text" | "search" | "password"; ask?: boolean; wide?: boolean; maxLength?: number; inputRef?: Ref<HTMLInputElement>;
}) {
  const errId = useId();
  return (
    <span className={wide ? "ui-field-wrap wide" : "ui-field-wrap"}>
      <input ref={inputRef} id={id} className={ask ? "ui-field ask" : "ui-field"} type={type} autoComplete="off" spellCheck={false} value={value} disabled={disabled}
        placeholder={placeholder} maxLength={maxLength} aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}
        aria-invalid={error ? true : undefined} aria-describedby={error ? errId : describedBy}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} />
      {error ? <span className="ui-field-error" id={errId} role="alert">{error}</span> : null}
    </span>
  );
}

/** A choice made by looking (the water, how lively): a card each, the chosen one ringed and ticked. */
export function PictureChoice<T extends string>({ value, options, onChange, label, labelledBy, disabled }: Named & { value: T; options: readonly (Option<T> & { picture: ReactNode; style?: CSSProperties })[]; onChange: (v: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, options.findIndex((o) => o.id === value));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = moveIndex(e.key, at, options.length);
    if (to === null || disabled) return;
    e.preventDefault();
    onChange(options[to].id);
    refs.current[to]?.focus();
  };
  return (
    <div className="ui-pics" role="radiogroup" aria-label={label} aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button key={o.id} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" className="ui-pic" aria-checked={o.id === value}
          tabIndex={i === at ? 0 : -1} disabled={disabled} style={o.style} onClick={() => onChange(o.id)}>
          <span className="ui-pic-stage" aria-hidden="true">{o.picture}</span>
          <span className="ui-pic-label">{o.label}</span>
          {o.id === value ? <span className="ui-pic-tick" aria-hidden="true"><Icon name="tick" size={12} /></span> : null}
        </button>
      ))}
    </div>
  );
}

// ---------- Home and the notch ----------

/** A card on Home or in the notch: one hairline, 12 point corners, no rim of light and no glow. */
export function Card({ title, id, className = "", labelId, children }: { title?: ReactNode; id?: string; className?: string; labelId?: string; children?: ReactNode }) {
  const own = useId(), tid = labelId ?? own;
  return (
    <section className={className ? `ui-card ${className}` : "ui-card"} id={id} aria-labelledby={title ? tid : undefined}>
      {title ? <h2 className="ui-card-title" id={tid}>{title}</h2> : null}
      {children}
    </section>
  );
}

/** A key chord as the Mac's own caps (⌃ ⌥ ⌘ F), one cap each. VoiceOver reads the words ("Control, Option, Command and
 *  F"), or nothing when `hidden` (inside a control whose own name already says it). Nothing for a chord the app does not
 *  write. */
export function KeyLabel({ chord, hidden, down }: { chord: string | null | undefined; hidden?: boolean; down?: boolean }) {
  const caps = keycaps(chord);
  if (!caps.length) return null;
  // `down`: the talk keys are held (the app's own voice state, never a key being read): the caps press.
  const cs = caps.map((c, i) => <kbd key={i} className="ui-key" data-down={down ? "" : undefined}>{c}</kbd>);
  return hidden ? <span className="ui-keys" aria-hidden="true">{cs}</span> : <span className="ui-keys" role="img" aria-label={chordLabel(chord!)}>{cs}</span>;
}

export type VerdictSize = "card" | "headline" | "small";
/** A result in words, from M45's verdict function only (verdict.ts): its mark in the result's colour, its headline, and an
 *  optional quiet line under it ("Checked 2 hours ago"). The colour is on the mark only, never on the words. */
export function VerdictLine({ verdict, size = "small", sub, inline }: { verdict: Verdict; size?: VerdictSize; sub?: ReactNode; inline?: boolean }) {
  const { mark, tone } = verdictMark(verdict);
  // `inline`: inside a heading (the first run's first check), so the line is a span and the heading stays a heading.
  const Tag = inline ? "span" : "div";
  // A headline that is not a result (Not checked yet, Pick a project folder) has no mark: a lone grey dot before big words
  // read as a stray bullet (M51 polish). A result keeps its tick or cross.
  const bare = size === "headline" && tone === "plain";
  return (
    <Tag className="ui-verdict" data-size={size} data-tone={tone} data-bare={bare || undefined}>
      {!bare && <span className="ui-verdict-mark" aria-hidden="true"><Icon name={mark} size={size === "small" ? 16 : 20} /></span>}
      <span className="ui-verdict-words">{verdict.headline}</span>
      {sub ? <span className="ui-verdict-sub">{sub}</span> : null}
    </Tag>
  );
}

export type ChipKind = "pass" | "fail" | "notRun" | "cost" | "allowed" | "notAllowed" | "notNeeded";
const CHIP_ICON: Partial<Record<ChipKind, IconName>> = { pass: "tick", fail: "cross", notRun: "dash", allowed: "tick", notAllowed: "wait" };
/** A small fact that cannot be pressed: a check that ran (pass or fail), one that did not, a cost, or a permission. */
export function ProofChip({ kind, label = "" }: { kind: ChipKind; label?: string }) {
  const words = kind === "notRun" ? S.ui.notRun(label) : kind === "allowed" ? S.ui.allowed : kind === "notAllowed" ? S.ui.notAllowed : kind === "notNeeded" ? S.ui.notNeededYet : label;
  const icon = CHIP_ICON[kind];
  return <span className="ui-chip" data-kind={kind}>{icon ? <span className="ui-chip-mark" aria-hidden="true"><Icon name={icon} size={12} /></span> : null}<span>{words}</span></span>;
}

/** A recent fix on Home or in What I did: its result's mark, its name, when, and what it cost. The whole row opens its
 *  receipt. */
export function RecentRow({ verdict, name, meta, cost, onOpen }: { verdict: Verdict; name: string; meta: string; cost: string; onOpen: () => void }) {
  const { mark, tone } = verdictMark(verdict);
  return (
    <button type="button" className="ui-recent" data-tone={tone} aria-label={`${S.ui.openReceipt(name)}. ${verdict.headline}. ${meta}. ${cost}`} onClick={onOpen}>
      <span className="ui-recent-mark" aria-hidden="true"><Icon name={mark} size={16} /></span>
      <span className="ui-recent-text"><span className="ui-recent-name">{name}</span><span className="ui-recent-meta">{meta}</span></span>
      {/* What it cost, as plain quiet words at the row's end: an outlined pill here looked like a button that did nothing (M51 polish). */}
      <span className="ui-recent-cost" aria-hidden="true">{cost}</span>
    </button>
  );
}

// ---------- Settings' frame ----------

/** A page in Settings' sidebar: a drawing and its name; the open page is a filled row (no stripe, no coloured dot). */
export function SidebarItem({ icon, label, selected, attention, onClick, id }: { icon: IconName; label: string; selected: boolean; attention?: boolean; onClick: () => void; id?: string }) {
  return (
    <button id={id} type="button" className="sb-item" aria-current={selected ? "page" : undefined} onClick={onClick}>
      <Icon name={icon} size={16} /><span className="sb-label">{label}</span>
      {attention ? <span className="sb-dot" role="img" aria-label={S.ui.needsAttention} /> : null}
    </button>
  );
}

/** What Tab can reach inside a dialog: its enabled buttons, fields and links (the heading, tabindex -1, is reached by script). */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** An editor that slides over the content column from the right: a title, Cancel, and Save, which waits until something
 *  changed. Closing with changes not saved asks first. Opened by the person's own press, so it takes the keyboard.
 *  `instant`: every change in it applies at once (a list of apps, the keys), so its one button is Done. */
export function Sheet({ title, dirty, onSave, onClose, saveLabel = S.ui.save, instant, children }: { title: string; dirty: boolean; onSave: () => void; onClose: () => void; saveLabel?: string; instant?: boolean; children?: ReactNode }) {
  const tid = useId();
  const head = useRef<HTMLHeadingElement>(null);
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The button that opened it gets the keyboard back when it closes, only by the rule every move in Home follows (focus.ts).
  const opener = useRef<HTMLElement | null>(typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null));
  useEffect(() => { head.current?.focus(); return () => { takeIfLost(() => opener.current); }; }, []);
  const leave = () => { if (dirty && !instant) setAsking(true); else onClose(); };
  return (
    <div className="ui-sheet-layer">
      <div className="ui-scrim" aria-hidden="true" onPointerDown={leave} />
      <div className="ui-sheet" role="dialog" aria-modal="true" aria-labelledby={tid} ref={box}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (asking) setAsking(false); else leave(); }
          // Tab never leaves the dialog for the covered page: at either end it wraps round.
          if (e.key === "Tab" && !e.nativeEvent.isComposing) {
            const els = [...(box.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? [])];
            const to = tabWrap(els.indexOf(document.activeElement as HTMLElement), els.length, e.shiftKey);
            if (to !== null || els.length === 0) { e.preventDefault(); els[to ?? 0]?.focus(); }
          }
        }}>
        <div className="ui-sheet-head">
          <h2 className="ui-sheet-title" id={tid} ref={head} tabIndex={-1}>{title}</h2>
          <Button kind="quiet" onClick={leave}>{S.ui.cancel}</Button>
        </div>
        <div className="ui-sheet-body">{children}</div>
        <div className="ui-sheet-foot">
          {asking ? (<>
            <span className="ui-sheet-ask" role="status">{S.ui.unsavedQuestion}</span>
            <Button onClick={() => setAsking(false)}>{S.ui.keepEditing}</Button>
            <Button onClick={onClose}>{S.ui.discardChanges}</Button>
          </>) : instant ? <Button kind="primary" onClick={onClose}>{S.ui.done}</Button> : <Button kind="primary" disabled={!dirty} onClick={onSave}>{saveLabel}</Button>}
        </div>
      </div>
    </div>
  );
}

export const TOAST_MS = 10_000;
/** A short line at the foot of the panel, with one optional quiet action ("Undo"). It goes after ten seconds, and waits
 *  while the pointer is on it. */
export function Toast({ text, action, onAction, onDone, ms = TOAST_MS }: { text: string; action?: string; onAction?: () => void; onDone: () => void; ms?: number }) {
  const left = useRef(ms), since = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = () => { since.current = Date.now(); timer.current = setTimeout(onDone, left.current); };
  const hold = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; left.current = Math.max(0, left.current - (Date.now() - since.current)); };
  useEffect(() => { left.current = ms; run(); return hold; }, [text]);
  return (
    <div className="ui-toast" role="status" onPointerEnter={hold} onPointerLeave={run}>
      <span className="ui-toast-text">{text}</span>
      {action && onAction ? <Button kind="quiet" size="sm" onClick={onAction}>{action}</Button> : null}
    </div>
  );
}
