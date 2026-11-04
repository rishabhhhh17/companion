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
import { glanceDue, visorMotion, visorPose, type Ring } from "../characters.ts";
import type { CharacterState } from "../model.ts";
import { meterScales, VISOR_BAND, VISOR_BAND_VIEWBOX, VISOR_GLASS, VISOR_GLASS_GRADIENT, VISOR_METER, VISOR_NEEDS, VISOR_REST, VISOR_SCAN, VISOR_SMILE, VISOR_VIEWBOX, type Box } from "../visorArt.ts";
import { clampTo, commitText, leaveThen, menuOpensUp, moveIndex, Presence, stepBy, tabWrap, typeahead, verdictMark, type PresenceState, type Range, type Stepped } from "./partsLogic.ts";
import { EXIT_MS, VISOR_MS, type ExitKind } from "../motionTokens.ts";
import { reducedMotion, watchReducedMotion } from "../motion.ts";

export type Option<T extends string = string> = { id: T; label: string };

// ---------- Presence (M66 fix 9): what comes and goes leaves on its exit, never blinks out ----------

/** How long a part's exit plays: its own time (motionTokens.ts EXIT_MS), or none with reduced motion, when it goes at once. */
export const exitMs = (kind: ExitKind): number => (reducedMotion() ? 0 : EXIT_MS[kind]);

/** Keeps a part that is told to go in the page, marked leaving (data-leaving), until its exit has played. */
export function usePresence(open: boolean, kind: ExitKind): PresenceState {
  const [state, setState] = useState<PresenceState>({ mounted: open, leaving: false });
  const p = useRef<Presence | null>(null);
  if (!p.current) p.current = new Presence(open, { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) }, setState);
  useLayoutEffect(() => { p.current!.set(open, exitMs(kind)); }, [open]);
  useEffect(() => () => p.current?.stop(), []);
  return { mounted: open || state.mounted, leaving: !open && state.leaving };
}

/** False once the part has left the page, so an exit that ends after its owner took it away tells nobody. */
function useAlive(): { current: boolean } {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return alive;
}

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
  const pop = usePresence(menu, "menu");
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
        {pop.mounted && restore && (
          <div className="ui-pop" role="menu" id={menuId} data-leaving={pop.leaving || undefined} aria-hidden={pop.leaving || undefined} aria-label={S.ui.changed(changed!.usual)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false); } }}>
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
export function Menu<T extends string>({ value, options, onChange, label, labelledBy, describedBy, id, disabled, placeholder = "", size = "sm", title }: Named & { value: T | ""; options: readonly Option<T>[]; onChange: (v: T) => void; placeholder?: string; size?: ButtonSize; /** The whole value as a tooltip, when its words may be cut (Home's folder menu). */ title?: string }) {
  const [open, setOpen] = useState(false);
  const shownList = usePresence(open, "menu");
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
    // M66: inside Home the room is Home's own frame (its window is bigger than Home and mostly clear), elsewhere the window.
    const b = btn.current.getBoundingClientRect(), f = btn.current.closest(".home-frame")?.getBoundingClientRect();
    setUp(menuOpensUp(f ? { top: b.top - f.top, bottom: b.bottom - f.top } : b, list.current.offsetHeight, f ? f.height : window.innerHeight));
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
      <button ref={btn} id={id} type="button" className={btnClass("secondary", size, "ui-menu-btn")} disabled={disabled} title={title}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={labelledBy ? undefined : label ? `${label}: ${shown}` : undefined} aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined} aria-describedby={describedBy}
        onClick={() => (open ? close() : show(at >= 0 ? at : 0))} onKeyDown={onButtonKey}>
        <span className="ui-menu-value" id={valueId}>{shown}</span>
        <Icon name="updown" size={12} />
      </button>
      {shownList.mounted && (
        <ul ref={list} className="ui-menu-list" id={listId} role="listbox" tabIndex={-1} data-up={up || undefined} data-leaving={shownList.leaving || undefined} aria-hidden={shownList.leaving || undefined}
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
export function KeyLabel({ chord, hidden, down, label }: { chord: string | null | undefined; hidden?: boolean; down?: boolean; /** What the keys do, said before them ("Hold to talk: Option and Space"). */ label?: string }) {
  const caps = keycaps(chord);
  if (!caps.length) return null;
  // `down`: the talk keys are held (the app's own voice state, never a key being read): the caps press.
  const cs = caps.map((c, i) => <kbd key={i} className="ui-key" data-down={down ? "" : undefined}>{c}</kbd>);
  return hidden ? <span className="ui-keys" aria-hidden="true">{cs}</span> : <span className="ui-keys" role="img" aria-label={label ? `${label}: ${chordLabel(chord!)}` : chordLabel(chord!)}>{cs}</span>;
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
export function RecentRow({ verdict, name, meta, cost, onOpen, running }: { verdict: Verdict; name: string; meta: string; cost: string; onOpen: () => void; running?: boolean }) {
  // A task still at work has the working mark, as in the side list and History, never the dot of a finished one (item 31).
  const { tone } = verdictMark(verdict);
  const mark = running ? "spin" : verdictMark(verdict).mark;
  return (
    <button type="button" className="ui-recent" data-tone={tone} aria-label={`${S.ui.openReceipt(name)}. ${verdict.headline}. ${meta}. ${cost}`} onClick={onOpen}>
      <span className="ui-recent-mark" aria-hidden="true"><Icon name={mark} size={16} /></span>
      <span className="ui-recent-text"><span className="ui-recent-name">{name}</span><span className="ui-recent-meta">{meta}</span></span>
      {/* What it cost, as plain quiet words at the row's end: an outlined pill here looked like a button that did nothing (M51 polish). */}
      <span className="ui-recent-cost" aria-hidden="true">{cost}</span>
    </button>
  );
}

// ---------- M65, the Instrument look's parts ----------

export type StatusKind = keyof typeof S.ui.status;
const STATUS_TONE: Record<StatusKind, string> = { needs: "needs", proven: "proven", notChecked: "plain", working: "working", stop: "stop", fixFirst: "stop" };
/** The small status line over a headline: a 6 px dot and its words, in the meaning's colour (amber needs you, green
 *  proven, red stop, the accent working, grey not checked). The words always say it, never the colour alone. */
export function StatusLine({ kind }: { kind: StatusKind }) {
  return <p className="ui-status" data-tone={STATUS_TONE[kind]}><span className="ui-status-dot" aria-hidden="true" />{S.ui.status[kind]}</p>;
}
/** M69: the same status as a dot alone, before the project's name in the top bar (the YC benchmark spec 3). A picture
 *  only: the status tag on the page says it in words. */
export function StatusDot({ kind }: { kind: StatusKind }) {
  return <span className="ui-dot" data-tone={STATUS_TONE[kind]} aria-hidden="true" />;
}

/** The faceless glass orb (the Instrument character): the water's glass from orbArt.ts with a thin ring whose colour says
 *  the state (characters.ts ringOf). It is a picture only: the status line beside it says the state in words. */
export function Orb({ src, ring }: { src: string; ring: Ring | null }) {
  return <span className="ui-orb" data-ring={ring ?? undefined} aria-hidden="true"><img src={src} alt="" draggable={false} /></span>;
}

/** A rounded box of the Visor's drawing (visorArt.ts), as an SVG rect. */
const VisorRect = ({ b, style, className }: { b: Box; style?: CSSProperties; className?: string }) => <rect className={className} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.rx} style={style} />;

/** The Visor (M68, the founder's pick on 4 Nov 2026): a glass orb with a dark band across the middle and light behind it.
 *  It sits in the same ring span as the orb, so the M65 ring is untouched. Its lights follow the ring (characters.ts
 *  visorPose); every pose is always in the page and the one in force fades in over the last, so a state change is a cross
 *  fade and never a new node. Its moves (characters.ts visorMotion) are CSS on transform and opacity only, paused while the
 *  page is hidden and stopped with Reduce motion, Less motion, rest or `still`. `band`: the band alone (the notch's wing).
 *  `level`: a voice level (0 to 1) when one reaches the page; until then the meter is a gentle pulse. The page never reads
 *  audio. `glance`: changes when something new appears, and the lights glance once toward `toward` (-1 left, 1 right). It
 *  is a picture only: the status line beside it says the state in words. */
export function Visor({ state, ring, band, level, still, lively = "lively", reacts = true, glance, toward = 1 }: {
  state: CharacterState; ring: Ring | null; band?: boolean; level?: number | null; still?: boolean;
  lively?: "still" | "gentle" | "lively"; reacts?: boolean; glance?: number | string | null; toward?: -1 | 1;
}) {
  const gid = `visor${useId().replace(/[^\w-]/g, "")}`;
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  // A hidden page (a closed window, another Space) holds every loop on its pose, and plays no glance or hop.
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const h = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  const pose = visorPose(state, ring);
  const moves = visorMotion(pose, { reduced, still: !!still, lively, reacts, band: !!band });
  // The hop: once, on arriving at proven, never on a loop and never on opening at proven.
  const [hop, setHop] = useState(false);
  const was = useRef(pose.lights);
  useEffect(() => {
    if (pose.lights === "smile" && was.current !== "smile" && moves.hop && !hidden) setHop(true);
    if (pose.lights !== "smile") setHop(false);
    was.current = pose.lights;
  }, [pose.lights]);
  // The glance: once toward something new, at most once every few seconds.
  const [glancing, setGlancing] = useState(false);
  const lastGlance = useRef<number | null>(null);
  const firstGlance = useRef(glance);
  useEffect(() => {
    if (glance === firstGlance.current || glance == null || !moves.glance) return;
    const now = Date.now();
    if (!glanceDue(now, lastGlance.current, hidden, VISOR_MS.glanceGap)) return;
    lastGlance.current = now;
    setGlancing(true);
  }, [glance]);
  // The blink rests: three blinks, then still, until something new (a glance, or coming back to rest) arms three more.
  // It is cleared when the three end, so the next arming always starts afresh.
  const [blinking, setBlinking] = useState(true);
  const restKey = `${pose.lights}:${pose.tone}`;
  const firstRest = useRef(restKey);
  useEffect(() => { if (restKey !== firstRest.current) setBlinking(true); }, [restKey]);
  useEffect(() => { if (glance !== firstGlance.current && glance != null) setBlinking(true); }, [glance]);
  // Heard on the span: the hop and the lean run on it, and the blink and the glance bubble up to it.
  const ended = (e: { animationName: string }) => {
    if (e.animationName === "visor-hop") setHop(false);
    if (e.animationName === "visor-glance") setGlancing(false);
    if (e.animationName === "visor-blink") setBlinking(false);
  };
  const levelOn = moves.meter && typeof level === "number" && Number.isFinite(level);
  const bars = levelOn ? meterScales(level as number) : null;
  const glassStops = VISOR_GLASS_GRADIENT.stops;
  return (
    <span className="ui-orb ui-visor" data-ring={ring ?? undefined} data-pose={pose.lights} data-tone={pose.tone} data-band={band ? "" : undefined}
      data-blink={moves.blink && blinking ? "" : undefined} data-scan={moves.scan ? "" : undefined} data-meter={moves.meter ? "" : undefined}
      data-lean={moves.lean ? "" : undefined} data-hop={hop && moves.hop ? "" : undefined} data-glance={glancing && moves.glance ? "" : undefined}
      data-level={levelOn ? "" : undefined} data-paused={hidden ? "" : undefined} data-still={still ? "" : undefined}
      style={toward === -1 ? ({ "--visor-dir": "-1" } as CSSProperties) : undefined} aria-hidden="true" onAnimationEnd={ended}>
      <svg viewBox={band ? VISOR_BAND_VIEWBOX : VISOR_VIEWBOX} focusable="false">
        <defs>
          <radialGradient id={gid} cx={VISOR_GLASS_GRADIENT.cx} cy={VISOR_GLASS_GRADIENT.cy} r={VISOR_GLASS_GRADIENT.r}>
            {glassStops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
          </radialGradient>
        </defs>
        <g className="visor-body">
          <circle className="visor-glass" cx={VISOR_GLASS.cx} cy={VISOR_GLASS.cy} r={VISOR_GLASS.r} fill={`url(#${gid})`} />
          <VisorRect className="visor-band" b={VISOR_BAND} />
          <g className="visor-lights">
            <g className="visor-rest">{VISOR_REST.map((b) => <VisorRect key={b.x} b={b} />)}</g>
            <g className="visor-scan"><VisorRect b={VISOR_SCAN} /></g>
            <g className="visor-meter">{VISOR_METER.map((b, i) => <VisorRect key={b.x} b={b} style={bars ? { transform: `scaleY(${bars[i]})` } : undefined} />)}</g>
            <g className="visor-needs">{VISOR_NEEDS.map((b) => <VisorRect key={b.x} b={b} />)}</g>
            <path className="visor-smile" d={VISOR_SMILE.d} strokeWidth={VISOR_SMILE.width} strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </span>
  );
}

/** One changed file: its name, its folder in quiet words, a short tag, and the lines added and taken away. */
export function FileRow({ name, dir, tag, stop, added = 0, removed = 0 }: { name: string; dir?: string; tag?: string; stop?: boolean; added?: number; removed?: number }) {
  return (
    <li className="ui-file">
      <span className="ui-file-name">{name}{dir ? <span className="ui-file-dir">{dir}</span> : null}</span>
      {tag ? <span className="ui-tag" data-tone={stop ? "stop" : undefined}>{tag}</span> : <span />}
      <span className="ui-file-diff">
        <span className="sr">{S.ui.fileDiff(added, removed)}</span>
        {added ? <span className="ui-file-plus" aria-hidden="true">+{added}</span> : null}
        {removed ? <span className="ui-file-minus" aria-hidden="true">{"\u2212"}{removed}</span> : null}
      </span>
    </li>
  );
}

/** Words that differ between the looks (M65 step 6): Instrument's `text`, and Friendly's own where they are not the same.
 *  Both are on the page and a token shows one (ui/home.css .say-friendly, .say-instrument), so no page reads the style and
 *  Friendly keeps the words it had. A hidden one is display: none, so VoiceOver reads only the one shown. */
export function Said({ text, friendly }: { text: string; friendly?: string }) {
  if (friendly === undefined || friendly === text) return <>{text}</>;
  return <><span className="say-instrument">{text}</span><span className="say-friendly">{friendly}</span></>;
}

/** The footer line under a view: when it was last checked on one side, and whether Undo is ready on the other. */
export function FootLine({ start, end, className }: { start?: ReactNode; end?: ReactNode; className?: string }) {
  return <p className={className ? `ui-foot ${className}` : "ui-foot"}><span>{start}</span><span>{end}</span></p>;
}

// ---------- Settings' frame ----------

/** A page in Settings' sidebar: a drawing and its name; the open page is a filled row (no stripe, no coloured dot). */
export function SidebarItem({ icon, label, selected, attention, onClick, id, count }: { icon: IconName; label: string; selected: boolean; attention?: boolean; onClick: () => void; id?: string; count?: number }) {
  return (
    <button id={id} type="button" className="sb-item" aria-current={selected ? "page" : undefined} onClick={onClick}>
      <Icon name={icon} size={16} /><span className="sb-label">{label}</span>
      {/* M69 step 2: a count of what waits there (amber, count only), said in words for VoiceOver. */}
      {count && count > 0 ? <span className="sb-count" role="img" aria-label={S.homeNow.nowCount(count)}>{count}</span> : attention ? <span className="sb-dot" role="img" aria-label={S.ui.needsAttention} /> : null}
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
  const [leaving, setLeaving] = useState(false);
  const alive = useAlive();
  const box = useRef<HTMLDivElement>(null);
  // The button that opened it gets the keyboard back when it closes, only by the rule every move in Home follows (focus.ts).
  const opener = useRef<HTMLElement | null>(typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null));
  useEffect(() => { head.current?.focus(); return () => { takeIfLost(() => opener.current); }; }, []);
  // It slides back out before its owner hears it closed (M66 fix 9); with reduced motion it goes at once.
  const close = () => { if (!leaving) leaveThen(setLeaving, exitMs("sheet"), () => { if (alive.current) onClose(); }); };
  const leave = () => { if (dirty && !instant) setAsking(true); else close(); };
  return (
    <div className="ui-sheet-layer" data-leaving={leaving || undefined}>
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
            <Button onClick={close}>{S.ui.discardChanges}</Button>
          </>) : instant ? <Button kind="primary" onClick={close}>{S.ui.done}</Button> : <Button kind="primary" disabled={!dirty} onClick={onSave}>{saveLabel}</Button>}
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
  const [leaving, setLeaving] = useState(false);
  // When its time is up it sinks and fades (M66 fix 9) before its owner takes it away.
  const going = useRef(false), alive = useAlive();
  const go = () => { going.current = true; leaveThen(setLeaving, exitMs("toast"), () => { if (alive.current && going.current) onDone(); }); };
  const run = () => { if (going.current) return; since.current = Date.now(); timer.current = setTimeout(go, left.current); };
  const hold = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; left.current = Math.max(0, left.current - (Date.now() - since.current)); };
  useEffect(() => { left.current = ms; going.current = false; setLeaving(false); run(); return hold; }, [text]);
  return (
    <div className="ui-toast" role="status" data-leaving={leaving || undefined} onPointerEnter={hold} onPointerLeave={run}>
      <span className="ui-toast-text">{text}</span>
      {action && onAction ? <Button kind="quiet" size="sm" onClick={onAction}>{action}</Button> : null}
    </div>
  );
}
