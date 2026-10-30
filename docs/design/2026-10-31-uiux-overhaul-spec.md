# The UI/UX overhaul spec (30 Oct 2026, revised 31 Oct)

**What this is.** A spec for Squibby's interface that is ready to build. It merges M47 (one Settings, the launch cut) and M48 (Home status first, the result card, the notch hover as status), and it adds the Plan card for Dodo. Today the founder said: "even now the chrome sometimes looks weird", Settings "still looks very complicated", and "everything does not look very planned". This spec answers that.

**Sources.** Three research passes (HeyClicky, YC products, Mac settings and notch apps). A read only audit of `/Users/rishabhkapadia17/Developer/companion-wt/m36-type`: `protocol/settings.json`, `app/src/settingsPages.ts`, `app/src/settingsPage.tsx`, `app/src/strings.ts`, `app/src/style.css`, `app/src/card.tsx`, `usage-proxy/src/proxy.ts` and `usage-proxy/src/dodo.ts`. Also F22, F25 and F28, `docs/design/2026-10-30-executive-review.md`, `docs/design/look.md`, `docs/milestones/M45-M49-the-product-it-should-be.md`, and the payments spec written alongside this one.

**Why it looks unplanned today.** The cause is in the structure, not one bad colour:
- Four design passes (M18, M30, M34, M43) are stacked in one 1149 line `style.css`. None of the older ones was removed.
- Settings draws rows two ways.
- One page uses five or more control styles.
- The silver gradient has a hard dark band at 52%, and it is on every switch.
- Account has 1 row. Advanced has 118 settings.

The fix is a small set of parts, each defined once, and a Settings where every page is built from the same row.

**Ground rules this spec keeps** (AGENTS.md):
- Every behaviour keeps a control, and search reaches every one (customizable everything).
- Plain words, sentence case, no em dashes.
- One main button per screen.
- No card form in the app. Payment pages open in the person's browser.
- Never `bypassPermissions`. Never a Claude login form.
- Undo never touches the person's git.
- Permissions are asked the first time a feature is used, never ahead of use (rule 8).
- Panels never take keyboard focus unless the person opened them by hotkey or click (rule 9, T01).
- Pro billing never runs on `usage-proxy`, the server that carries Claude traffic (rule 1, F22).

**Founder calls this spec needs.** Each one needs a yes before it is built. Each is marked where it appears.
1. **Billing design (record it in T17 before M47 starts).** There are two options: the payments spec's license key with a trial kept on the Mac, or a separate billing Worker with an account. Section 3.10 is written for the license key design. Appendix A lists what changes if the Worker wins.
2. **Retire the separate Settings window.**
3. **Hide the Deep theme.** The executive review (lines 405 and 542) also recommends hiding Paper until Night is finished. This spec keeps Paper's tokens defined and tested. The theme choice is shown only if the founder keeps Paper.
4. **Flat silver.** This reverses the founder's own M32 request for "shiny silver… bold and out loud" (`style.css:1001`). Today's "chrome looks weird" supports the change, but it is still a reversal. Show the founder flat and current side by side on a real Mac before `--chrome` is deleted.
5. **The Settings copy voice** (section 3.11).
6. **Remove the menu bar sun** (executive review, M16).
7. **When the trial button first shows.** This spec shows it only after the first proven fix, as the payments spec intends.
8. **Delete everything keeps the trial date.** If yes, the Delete everything screen names it (3.9).

---

## 1. What we take from whom, and why

A company is called YC here only when ycombinator.com confirms it. Ramp, Cal.com, Clerk, Warp (the terminal), Rewind, Linear and Raycast are not YC.

| From | What we take | Why | Where it lands |
|---|---|---|---|
| HeyClicky (YC), changelog v1.0.15 to v1.1.1, https://heyclicky.com/changelog | One entry point: a notch click always opens Home. Esc always closes it. Settings live inside Home. The hover peek was made smaller and can be turned off. Nothing important sits under the hardware notch. | They removed parts of their own UI release after release. This confirms F28's bare notch. | 3.1, 4.3 |
| HeyClicky settings pages (same changelog) | A few pages with a handful of rows each. Each row is a short label and one control. Broken things get an action in the row ("Reconnect"). "Replay the welcome tour" lives in Settings. | Our Settings feels heavy because of how much is on each page, not how many pages there are. | 3.4, 3.8 |
| HeyClicky billing bugs (1.0.30, 1.0.42, 1.0.50, 1.0.51, 1.1.1), https://heyclicky.com/changelog | Their bugs become our test list: a crash on buying, the plan showing Free after payment, a paid plan missing on strict networks, the upgrade card hidden by the notch, no page for a failed payment. | Billing state was the kind of bug they shipped most often. | 3.10, 7.2 |
| HeyClicky pricing, https://heyclicky.com | Two cards with at most three lines each. A monthly or yearly toggle inside the app. "Cancel any time" next to the buy button. | It is a clear shape. Ours is cheaper (F25), and our trial needs no card. | 3.10 |
| What we do not take from HeyClicky | A chat list as Home. "Always approve" as the main button (The Rundown, https://www.therundown.ai/tools/clicky). The lowercase "ai buddy" voice. Glossy chrome. | These break rules 13 and 16, F28's status first Home, and the founder's "chrome looks weird". | |
| Supabase Studio (YC S20), https://github.com/supabase/supabase/blob/master/apps/studio/pages/account/me.tsx | Each page is one narrow column of identical sections: a title, one line on what it is for, then one card. Each section has an anchor. | A fixed rhythm is what makes a page look planned. | 3.3, 3.4 |
| Supabase forms, https://supabase.com/design-system/docs/ui-patterns/forms | The row: label and description on the left, control on the right. It stacks when narrow. A switch is used only for a real on or off. | One row anatomy everywhere. | 2.3 Row |
| Supabase theme cards, https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Account/Preferences/ThemeSettings.tsx | Visual choices are picture cards, not dropdowns. | People choose a look by looking. | Flowflow page |
| Supabase modality and copy, https://supabase.com/design-system/docs/ui-patterns/modality and https://supabase.com/design-system/docs/copywriting | Type to confirm only for the most destructive actions. Longer edits go in a sheet from the right. Buttons start with a verb that names the outcome. No "manage", "simply" or "easily". | How much friction an action gets depends on how much harm it can do, and the copy has a checklist. | 3.9, 3.11 |
| Supabase spend cap, https://supabase.com/docs/guides/platform/cost-control | The spending limit's description says what happens on both sides of the limit. | People trust a limit they can read. | Account page |
| PostHog (YC), https://github.com/PostHog/posthog/blob/master/frontend/src/scenes/settings/settingsSearch.ts | Fuzzy search over each setting's label, help and a written list of plain synonyms. | A non engineer finds "Microphone" by typing "mic". | 3.7 |
| PostHog billing, https://github.com/PostHog/posthog/tree/master/frontend/src/scenes/billing | Plan states with exact dates where we have them. A downgrade lists what stops working. | Exact words prevent support tickets. | 3.10 |
| Replit (YC), https://docs.replit.com/billing/managing-spend | A cost chip on each result. Ask before a paid action. | This fits rule 13. | Proof chip, result card |
| Replit anti pattern, https://replit.discourse.group/t/youve-exceeded-your-usage-limit/9809 | Never a limit wall that has no reset time or blocks in the middle of a task. | Their users were blocked with the usage bar at 38%. | Free limit card |
| Dropbox (YC), https://help.dropbox.com/installs-integrations/desktop/change-preferences | The app shows the plan. Billing forms live in a hosted portal. | Card details never pass through Squibby. | 3.10 |
| Dodo Payments customer portal, https://docs.dodopayments.com/features/customer-portal | "Billing and invoices" opens Dodo's hosted portal in the browser. | The portal covers plan change, cancel, invoices and payment method. | 3.10 |
| Dodo pricing, https://docs.dodopayments.com/features/purchasing-power-parity | Regional prices and currency are applied at checkout. There is no public API to show them earlier. | The app shows US prices and says the local price shows at checkout. | 3.10 |
| Stripe (YC S09), https://docs.stripe.com/customer-management | Make cancel at the end of the period the usual choice. Watch for a plan change that ends a trial. | Our trial has no Dodo object, so nothing in the portal can end it by accident. | 3.10 |
| Retool (YC), https://docs.retool.com/changelog/settings-overview | A "Finish setting up" card that goes away for good once done. | Settings opens on what is missing, then gets out of the way. | General page |
| Mintlify (YC), https://www.mintlify.com/docs/deploy/deployments | One danger zone, the last section, with exact consequences. | Red appears in one place only. | 3.9 |
| Apple HIG Settings, https://developer.apple.com/design/human-interface-guidelines/settings | Few settings, with good defaults. Don't copy system settings. Reopen on the last page viewed. | Cut before you restyle. | 3.1 |
| Apple HIG Toggles and Sidebars, https://developer.apple.com/design/human-interface-guidelines/toggles and https://developer.apple.com/design/human-interface-guidelines/sidebars | One switch size in grouped rows. A parent setting with dimmed children. A pop up menu past 3 to 5 options. Selection is a filled rounded row, with no stripe and no coloured dots. | Our current 3 px stripe and dots are habits from web dashboards. | 2.3 Sidebar item, Switch |
| Apple HIG Typography, https://developer.apple.com/design/human-interface-guidelines/typography | Body 13/16, Subheadline 11/14, nothing below 10. | We go one step larger for non engineers and keep the ratios. | 2.1 |
| Measured AppKit metrics (community), https://docs.rs/crate/gpui-macos/latest/source/docs/native-metrics.json | Sidebar rows 32. Controls 24 tall with a 6 radius. Grouped card radius 10. Hairlines at about 10%. | These are reference numbers. We use controls 28 to 32 tall for pointer comfort (look.md's 32 point minimum). [verify on a screenshot on the founder's Mac] | 2.1 |
| boring.notch, https://github.com/TheBoredTeam/boring.notch/blob/main/boringNotch/components/Settings/SettingsView.swift | A fixed width, a sidebar that cannot be hidden, grouped forms. Each permission shows in its row with one button, and rows that depend on it are disabled. | This is the open source notch app people know. | 3.1, Privacy page |
| Michael Tsai on grouped forms, https://mjtsai.com/blog/2023/06/01/centering-the-macos-ventura-form-layout/ | Cap the content column at about 520 px. Use one row component everywhere. | Labels stay near their controls. | 3.3 |
| Raycast manual, https://manual.raycast.com/settings | Command F focuses search. A search result jumps to its row. All shortcuts sit in one table on one page. | Fast for someone coming back. | 3.7, Keys and voice |
| Linear changelog, https://linear.app/changelog/2024-12-18-personalized-sidebar | Name groups after what the person is asking, not after internal parts. | "Powers", "Flow" and "Groups of tools" go. | 3.2 |
| Superhuman, https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ | Home's ask field can open a setting ("voice" offers "Open Settings, Keys and voice"). | The window can stay small. | 3.7 |
| Granola reference, https://cdn.jsdelivr.net/npm/@agent-native/core@0.124.6/corpus/templates/clips/desktop/design-refs/granola-ux.md | Low chroma, with one accent used only for state. No tour. | A calm surface. | 2.1 |
| NotchNook review, https://digitaltrends.com/computing/app-turns-macbook-notch-into-dynamic-island | A small swell on hover, then one spring that can be interrupted. | A notch that opens suddenly with no feedback first feels "weird". | 5.3 |
| Things and "opinions instead of preferences", https://alternativeto.net/news/2025/9/things-3-22-introduces-refreshed-interface-macos-26-support-and-ipad-windowed-mode | Each page's main level has a few rows. The rest sits behind "More". | Customizable everything without clutter. | 3.4 |

---

## 2. The design system (replaces the layered `style.css`)

**New files.**
- `app/src/ui/tokens.css`: the only place a colour, size, radius or duration literal may appear.
- `app/src/ui/parts.css`: one rule block per part. Each part's class is defined once.
- `app/src/ui/parts.tsx`: React parts with typed props.

`style.css` keeps only the character, the drop ring, the overlay and the first run's water. It imports the two files above.

### 2.1 Tokens

**Colour, Night.** This is the usual theme, used by Home, Settings and the notch panel.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0B0C` | Page (Home, Settings) |
| `--surface-1` | `#141416` | Card |
| `--surface-2` | `#1A1A1D` | Hover fill, menus, sheets, toasts |
| `--surface-3` | `#232327` | Selected sidebar item, segmented thumb, pressed |
| `--inset` | `#08080A` | Inside a field, a segmented track or a stepper |
| `--fg` | `#F5F5F7` | Primary text and icons |
| `--fg-2` | `#A1A1A6` | All other readable text: descriptions, group headers, status chips, secondary text (about 7:1 on `--surface-1`) |
| `--fg-3` | `#6E6E73` | Disabled text and decorative marks only. Never text that must be read. Left out of the AA test (3.63:1 on `--surface-1`). |
| `--line` | `rgba(255,255,255,.08)` | Hairlines, card edges, row separators |
| `--line-strong` | `rgba(255,255,255,.16)` | Control edges (secondary button, field, chip) |
| `--focus` | `rgba(245,245,247,.9)` | Focus ring |
| `--ok` | `#4CC27F` | Proven only |
| `--amber` | `#FFB020` | Needs you only |
| `--bad` | `#FF6B5E` | Not fixed, refused, danger zone only |
| `--water` | `#59D2FF` | "Squibby is acting" only: the working strip fill, the notch ring, the listening glow |
| `--silver` | `#E9ECF1` | The one main button's fill |
| `--silver-hover` | `#F4F6F8` | |
| `--silver-press` | `#D9DDE3` | |
| `--silver-lip` | `rgba(255,255,255,.9)` | 1 px inset top edge |
| `--silver-edge` | `#5C6168` | 1 px bottom edge |
| `--silver-ink` | `#0A0A0B` | Text on silver |
| `--scrim` | `rgba(0,0,0,.5)` | Behind a sheet |
| `--shadow-raised` | `0 12px 32px rgba(0,0,0,.45)` | Menus, sheets, toasts only |

**Colour, Paper.** This is the light theme (`look.theme = paper`) for Home and Settings, shown only if the founder keeps it (founder call 3). The notch and its panel stay black in every theme, because they are the hardware notch.

| Token | Paper value | Note |
|---|---|---|
| `--bg` | `#F2F2F4` | |
| `--surface-1` | `#FFFFFF` | |
| `--surface-2` | `#F7F7F8` | |
| `--surface-3` | `#E6E6EA` | |
| `--inset` | `#ECECEF` | |
| `--fg` | `#1D1D1F` | |
| `--fg-2` | `#6B6B70` | 5.3:1 on white |
| `--fg-3` | `#A1A1A6` | Disabled and decorative only (2.57:1 on white) |
| `--line` | `rgba(0,0,0,.08)` | |
| `--line-strong` | `rgba(0,0,0,.18)` | |
| `--focus` | `rgba(29,29,31,.85)` | |
| `--ok` | `#187A42` | |
| `--amber` | `#B87300` | Dots and marks reach 3:1 on white |
| `--bad` | `#C0392B` | |
| `--water` | `#1676C8` | |
| Main button | Fill `--fg`, text `--bg`, no lip or edge | Silver on white reads as disabled, so Paper uses ink |

**Rules for colour.**
- `prefers-contrast: more` sets `--line` to 24%, `--line-strong` to 40% and `--fg-2` to `#C7C7CC` (Paper: `#4A4A4F`).
- **The Deep theme is hidden** (founder call 3). A stored `deep` reads as Night until Deep has a full, tested look.
- **Lime goes.** `--lime`, `--lime-hi`, `--lime-lo` and `--lime-ink` are deleted. Their uses become `--fg` or `--silver`. The stored `point.caption: lime` is migrated (7.2).
- **One token per role.** The tokens above replace `--sky`, `--card`, `--surface`, `--home-sea` and `--home-sea-deep`.

**Type.** The face is `-apple-system` alone. It switches between the Text and Display optical sizes by itself, so no family name is written out [verify on the Mac]. `var(--round)` and the handwritten faces are deleted. Code type is used only for commands and paths. Every cost, time and count uses `font-variant-numeric: tabular-nums`. Sizes are in rem, so `display.textSize` scales all of them. The values below are at Standard (14 px root).

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--t-caption` | 12 / 16 | 400 or 590 | Row descriptions, chips, key labels, group footers, meta |
| `--t-small` | 13 / 18 | 400 or 590 | Group headers, the page line, sidebar search, segmented labels, toasts |
| `--t-label` | 14 / 20 | 400 | Row labels, sidebar items, buttons (590), fields |
| `--t-body` | 15 / 22 | 400 | Home body, card titles (590), the step line |
| `--t-answer` | 16 / 24 | 400 | Replies, the ask field, sheet titles (590) |
| `--t-display` | 22 / 28 | 700, -0.01em | Page titles in Settings, Home's status headline |
| `--t-verdict` | 28 / 34 | 700, -0.015em | The verdict on a result card |

No other sizes are allowed (the lint in section 6 checks this). Headers have no uppercase and no letter spacing.

**Space.** `--space-1` to `--space-7` are 4, 8, 12, 16, 20, 24 and 32 px. Every gap snaps to these.
- Settings content padding: 24.
- Gap between groups: 24.
- Group header to card: 8.
- Row padding: 10 vertical, 16 horizontal.

**Radii.**

| Token | Value | Use |
|---|---|---|
| `--r-key` | 4 | Key labels |
| `--r-thumb` | 6 | Segmented thumb, proof chips |
| `--r-control` | 8 | Buttons, fields, segmented track, menus, sidebar items, recent rows |
| `--r-card` | 12 | Cards, the ask field, sheets |
| `--r-panel` | 20 | Home panel bottom corners (the notch shape keeps its own 30) |
| `--r-round` | 50% | The status dot only. No pills anywhere else. |

**Sizes.**
- `--h-sm` 28: segmented controls, menus and steppers inside rows, icon buttons, small buttons.
- `--h-md` 32: buttons, fields, sidebar items.
- `--h-lg` 40: Home's one main button and the notch's buttons.
- `--h-row` 44: minimum row height. A row with a description is 58 tall (10 + 20 + 2 + 16 + 10). The label area is the hit target.
- `--h-bar` 44: Home's top bar.
- `--h-ask` 44: the ask field.

**Motion.**
- `--dur-1` 120, `--dur-2` 200, `--dur-3` 280 and `--dur-4` 400 ms (unchanged).
- `--ease-out: cubic-bezier(.2,.8,.2,1)` and `--ease-in: cubic-bezier(.4,0,1,1)`.
- `--ease-spring`: the island's `linear()` curve (unchanged).
- Press: `scale(.97)`, on buttons only.

### 2.2 What the silver becomes (founder call 4)

- **It is flat.** The banded `--chrome` and `--chrome-text` gradients are deleted, once the founder has seen flat and current side by side on a real Mac. A main button is:
  - fill `--silver`;
  - `box-shadow: inset 0 1px 0 var(--silver-lip), 0 1px 0 var(--silver-edge)`;
  - text `--silver-ink`, 14/20, weight 590.

  This keeps the founder's silver with one edge of light, and no stripe.
- **There is one per screen,** chosen by state:
  - Home: Fix it, Check before going live, or Check my project.
  - Notch: only "Add your key", when not connected.
  - First run: Continue.
  - Settings: only the Plan card's main action, or "Save key" when the key is missing. In that case Plan's button drops to secondary.
  - A sheet: its Save button.
- **These are never silver:** switches, knobs, menu hover, page titles, the ring's speech bubble, approval buttons, danger buttons, Learn's Start buttons.
- **Titles are plain `--fg`.** Gradient text (`background-clip: text`) is deleted everywhere.

### 2.3 Parts, defined once

Each part lists its exact values. States are in section 5.

**Button** (`<Button kind size>`)
- **Primary:** silver as in 2.2. 32 tall (40 when `lg`), padding 0 16, `--r-control`, 14/20 weight 590.
- **Secondary:** transparent fill, 1 px `--line-strong` border, text `--fg`. Same size, padding 0 14. Settings uses the same secondary style as Home. The M43 rule `.panel:not(.settings) .btn:not(.primary)` that kept it out of Settings is deleted.
- **Quiet:** no fill and no border, text `--fg-2`, padding 0 8, 32 tall. No negative margins.
- **Danger:** secondary with text `--bad` and a border of `--bad` at 45%. Used only in the danger zone.
- **Icon:** 28 square, `--r-control`, 16 px line icon in `--fg-2`.
- **Cursor:** the default arrow, as on the Mac.
- **Width:** the label never wraps. A button is as wide as its words.

**Row** (`<Row label description control indent? changed? scope? />`)
- Grid: `minmax(0,1fr) auto`, column gap 16, items centred, min height 44, padding 10 16.
- **Label:** 14/20 weight 400 `--fg`.
- **Description:** 12/16 `--fg-2`, 2 px under the label. At most two lines; aim for 60 characters. It says what changes, not what the feature is.
- **Separator:** 1 px `--line`, inset 16 from the left, none after the last row.
- **Child row** (`indent`): the label column is padded 16 more. It is disabled while its parent is off, and its description then says "Turn on {parent} to use this".
- **Changed from the usual:** a 6 px `--fg-2` dot, 6 px before the label, with the tooltip "Changed. Usual: {value}". The row's context menu (right click, or a click on the dot) holds "Restore usual". The row never grows an extra line.
- **Project scope:** a tag styled like a key label, "This project", after the label.
- **Stacked layout** below 440 px content width (Larger text and up): the control moves under the text, aligned left, 8 below it.
- **Hit target:** clicking the label toggles a switch, or focuses the control.
- **Row editors** (lists, house rules, apps, key recorder): the row shows a summary ("3 rules") and a secondary "Edit" button that opens a Sheet. Editors never sit open inside a card.

**Group** (`<Group id title footer?>`)
- Header: 13/18 weight 590 `--fg-2`, sentence case, 8 above the card, aligned with the row text (16 inset).
- Card: `--surface-1`, 1 px `--line`, `--r-card`, no shadow, no rim of light.
- Optional footer: 12/16 `--fg-2`, 8 under the card, 16 inset.
- Group ids are anchors (`#account.spending`).

**Switch**
- Track 36×20, radius 10. Knob 16, inset 2 px.
- **On:** track `--fg`, knob `--bg`.
- **Off:** transparent track with a 1.5 px border of `--fg` at 32%, knob `--fg` at 55%.
- On is filled and off is hollow, so the state reads by shape as well as tone (WCAG 1.4.1). The knob's position and the fill change together, as an inverted pair.
- `role="switch"` with `aria-checked`.
- One size everywhere. A parent setting uses the same switch, and its children dim and indent.

**Segmented** (2 or 3 options only)
- Track 28 tall, `--inset` fill, 1 px `--line`, `--r-control`, padding 2.
- Thumb `--surface-3`, 1 px `--line-strong`, `--r-thumb`.
- Labels 13/18 weight 590: `--fg` on the selected option, `--fg-2` on the rest.
- Every option is at least 56 wide, and all options are the same width.
- `role="radiogroup"`. Arrow keys move the selection.

**Menu** (4 or more options)
- Looks like a secondary button, 28 tall, with the value and a 12 px up and down chevron on the right.
- It opens a list: `--surface-2`, `--r-control`, `--shadow-raised`, items 28 tall, a tick before the selected item, 14/20 text.
- It is never a plain `<select>` with "Microphone: " in front of each option.

**Stepper** (numbers)
- `[−] [value] [+]` joined, 28 tall, `--r-control`, `--inset` fill.
- The value is 56 wide and tabular. The buttons are 28 square and use U+2212 for minus, not "-".
- A unit word follows at 12 `--fg-2` ("a day", "seconds").
- Arrow up and down change the value. A typed value is kept on Enter or when focus leaves. A value out of range is clamped, and a toast says "Set to {max}, the most it can be."

**Field**
- 32 tall, `--inset` fill, 1 px `--line-strong`, `--r-control`, padding 0 10, 14/20.
- Placeholder in `--fg-2`.
- Error: a `--bad` border and a 12/16 `--bad` line under the field that names the problem, then the fix.
- The ask field variant is 44 tall, `--r-card`, 16/24.

**Picture choice** (visual choices: liveliness, water)
- A row of cards inside the group's card, each 96×80, `--r-control`, 1 px `--line`.
- Each card shows the live water or a still of the result, with a 12/16 label under it.
- Selected: a 1.5 px `--fg` border and a 16 px tick at the top right.
- `role="radiogroup"`.

**Card** (Home and the notch)
- `--surface-1`, 1 px `--line`, `--r-card`, padding 16 20.
- The title is 15/22 weight 590, one size under the page title.
- No top rim (M41) and no glow.

**Key label**
- Each key is its own cap: min width 20, 20 tall, padding 0 5, `--r-key`, `--surface-2`, 1 px `--line-strong`, 12/20 weight 590.
- Mac glyphs: ⌃ ⌥ ⌘ ⇧ ⏎ ⎋ and the letter. Caps sit 3 px apart.
- VoiceOver reads the words ("Control Option F").
- It is used everywhere a key shows: Settings, Home, the notch, tooltips. Words like "Control Option F" never appear on screen.

**Verdict line** (it reads M45's one verdict function and never decides on its own)

| Kind | Icon (16, or 20 at verdict size) | Words come from the function |
|---|---|---|
| proven | tick, `--ok` | "Fixed and proven" |
| partial | half circle, `--amber` | "Fixed, not fully proven: {missing check}" |
| notFixed | cross, `--bad` | "Not fixed yet" |
| stopped | square, `--fg-2` | "Stopped" |
| limit | square, `--fg-2` | "Stopped at today's limit" |
| undone | back arrow, `--fg-2` | "Undone. The problem is back." |

- Sizes: 28/34 on the result card, 22/28 for Home's headline, 15/22 weight 590 in the notch and on recent rows.
- A 13/18 `--fg-2` line sits under it ("Checked 2 hours ago").
- Colour is on the icon only, never on the words or on a box.

**Proof chip**
- 24 tall, padding 0 8, `--r-thumb`, transparent fill, 1 px `--line-strong`, 12/16 weight 590 `--fg`, with a 12 px icon first.
- **Pass:** a tick in `--ok`.
- **Fail:** a cross in `--bad`.
- **Not run:** a dash in `--fg-2`, a dashed border, and the words "{check} did not run".
- **Cost chip:** the same shape, no icon, tabular: "$0.06" or "No cost".
- **Status chip** (permissions, plan): "Allowed" with a tick, "Not allowed" with an amber dot, "Not needed yet" in `--fg-2` with no icon.

**Sidebar item**
- 32 tall, padding 0 10, `--r-control`, gap 8.
- A 16 px line icon (stroke 1.5) in `--fg-2`, then the label at 14/20 `--fg`.
- **Selected:** `--surface-3` fill, icon and label in `--fg`, label weight 590. No stripe, no left border, no coloured dot.
- **Needs attention** (a missing permission, a Pro key that isn't active): a 6 px `--amber` dot at the right end.

**Sheet** (an editor or the plan comparison)
- Slides over the content column from the right. Its width equals the content column and its height equals the panel.
- `--surface-2`, `--shadow-raised`, `--r-card` on the left corners, with `--scrim` over the sidebar.
- Header: a 16/24 weight 590 title and a quiet Cancel. The footer holds Save (primary), which stays disabled until something changes.
- Closing with unsaved changes asks "Keep editing" or "Discard changes".

**Toast**
- Bottom centre of the panel, `--surface-2`, `--r-control`, `--shadow-raised`, 13/18, with an optional quiet action ("Undo"). It stays 10 s, and the timer pauses while the pointer is over it.

**Recent row** (Home and History)
- Built on Row: the verdict icon, the name at 14/20, meta at 12/16 `--fg-2` ("Today, 14:02"), and a cost chip on the right.
- The whole row is a button. Its hover is `--surface-2` with `--r-control`. It opens that fix's receipt.

---

## 3. Settings

### 3.1 The surface

**One Settings, inside Home** (founder call 2, in the M47 plan, because it deletes the second surface).
- The gear on Home's top bar, ⌘, while Home has focus, and the menu bar item's "Settings…" all open Home on Settings, at the last page viewed.
- The separate window is deleted: `settings.html`, `settingsWindow.tsx`, `settingsGroups.ts`, `settingswin.rs` and its command. If a window is ever wanted, it renders this same component with the `home-page` class, and a test checks that every page id is grouped.

**Size.**
- While Settings is open, Home uses the Large width, 680, which already passes look.md's 1024 display check.
- Its height is fixed at `min(640, visible screen height minus 48)`.
- The sidebar stays put and the content column scrolls. Pages may scroll. The first screen of each page is planned to be useful (3.3).

**Top bar in Settings.** Back arrow, "Settings", Close. The place icons and the gear are hidden. The sidebar is the only navigation.

**Keys.**
- ⌘F focuses search.
- Esc clears the search if there is one. Otherwise it closes Home (one Esc rule everywhere, as HeyClicky does).
- ⌘[ goes back to Now.
- Up and down move through the sidebar.

**Changes apply at once.** There is no Save, except in sheets. If a change only takes effect from the next task, a toast says "Takes effect from the next task." The row does not grow a note.

### 3.2 Sidebar and pages

The sidebar is 184 wide with padding 12. A search field sits at its top: 28 tall, with a magnifier, an inline × to clear, and the placeholder "Search settings". Below it are eight items with no group headings. A hairline separates the last two.

| Page | Icon | Page line (13/18 `--fg-2`) |
|---|---|---|
| Account | person | Your plan, your Claude key and what Squibby may spend. |
| General | sliders | The notch, Home, text size and which tools are on. |
| Fixing | wrench | How Squibby fixes and checks your project. |
| Flowflow | drop | How it looks and how much it moves. |
| Keys and voice | keyboard | The keys for each job, and talking to Squibby. |
| Privacy | lock | What Squibby may see, what it keeps, and the danger zone. |
| (hairline) | | |
| About | info | Version, help and practice projects. |
| More options | ellipsis | Fine tuning. The usual values suit almost everyone. |

- "Powers", "Advanced" and the "Squibby" and "More" headings go.
- "Powers" becomes the Tools group on General.
- "Flow" becomes "Fix" everywhere (executive review, principle 1).
- The page title is 22/28 weight 700 `--fg`, plain, with no gradient. The page line sits 4 under it. The first group starts 24 under that.

### 3.3 Layout

- The content column is at most 520 wide, inside 24 padding, aligned left beside the sidebar.
- A page is a vertical list of Groups, 24 apart.
- The last thing on a page is a quiet link, "More {page} options ({n})". It opens More options, scrolled to that page's section, with the section open.
- **First screen.** At 680×640 with Standard text and setup finished, General shows its title and the whole Notch and Home group before any scroll: 44 + 24 + 28 + 4 + 18 + 24 + 26 + 6 rows × 58 = 516. The rest of the page may scroll. A page of 10 rows with descriptions is about 800 tall, and that is fine.

### 3.4 Pages, groups and rows

Every visible key in `protocol/settings.json` (145; `groups.tried` is hidden) belongs to exactly one place: a page's main level, or that page's section of More options. 34 are on main levels and 111 are in More. If the founder hides Paper, `look.theme` becomes hidden like `groups.tried`, and the counts become 144 and 110.

**Ownership rule.** Each key is owned by exactly one row group. One row may own several keys ("At rest" owns `character.peek` and `character.stick`). A custom key may render several rows (`keys.hotkeys` renders one row per job; `talk.voice` renders Microphone and Voice and speed). The schema test (7.2) follows this rule.

**Main level keys per page** (the cap is 10 setting keys; fixed blocks and a custom key's extra rows don't count):

| Account | General | Fixing | Flowflow | Keys and voice | Privacy | About | Total |
|---|---|---|---|---|---|---|---|
| 1 | 10 | 5 | 8 + 1 new | 6 + 1 new | 3 | 1 | 34 + 2 new |

Two keys are new, from M46 and M47:
- `character.liveliness` (`still` | `gentle` | `lively`, usually `still`; F28). It replaces the derived `livelyOf()` in `lookfeel.ts`. Migration (7.2): `still` unless the person changed `fun.reactions` or `character.motion` themselves. `fun.reactions` off maps to `still`. `character.motion: less` maps to `still`. `character.motion` set by the person to a livelier value maps to `lively`. Untouched values map to `still`.
- `prompt.on` (usually on). It splits Prompt help out of `voice.on` (executive review), so turning off talking no longer turns off typed Prompt help. Today `voice.on` also controls the error explainer key and the Second Look key (help text in `strings.ts`). After the split:
  - `voice.on` controls talking only.
  - `prompt.on` controls Prompt help and the error explainer key. Both act on text you select.
  - The Second Look key follows `secondLook.on`.
  - Migration copies `voice.on` into `prompt.on`.

Both keys go through the T16 registry with tests.

**F28's new usual values.** `secondLook.on`, `files.on`, `watch.on`, `talk.dictate` and `panel.showHello` become off by default in `protocol/settings.json`. `keymap.rs` DEFAULTS bind F28's four jobs plus Accept (7.2). A value the person set themselves stays as it is. Only the usual value changes.

The labels below are the new plain labels. `strings.ts` `label` and `short` change to match them. The old labels go into each setting's `also` list so search still finds them. Every description follows 3.11.

#### Account

| Group | Row (key) | Control | Description |
|---|---|---|---|
| Plan and billing (`#account.plan`) | Plan card (fixed `plan`, new) | See 3.10 | |
| Your Claude (`#account.claude`) | Claude key (fixed `key`) | Status chip "Saved in Keychain" plus secondary "Replace". When missing: a field plus primary "Save key". | Used only by Squibby on this Mac. We never see it. |
| | Claude plan sign in (fixed; shown only when the T03 remote switch is on) | Secondary "Sign in with Terminal" (runs Anthropic's own `claude auth login`) | |
| Spending (`#account.spending`) | Daily limit (`spend.dailyLimit`) | Stepper, "$" with "a day" | At $10 today, Squibby stops and asks before spending more. Spent today: $0.18. |

#### General

| Group | Row (key) | Control | Description |
|---|---|---|---|
| Finish setting up (shown only while something is missing; Retool) | Add your Claude key, Pick a project folder, Learn the stop key | Each row: a tick when done, or a secondary button | Goes away for good once every item is done. No permissions are listed here: each one is asked the first time its feature is used (rule 8). |
| Notch and Home | Show in the notch (`island.show`) | Switch | Squibby's status lives in the notch at the top of the screen. |
| | Show status on hover (`island.peekOnHover`) | Switch | Point at the notch to see the live job, a result or a question. Off: click to open. |
| | Open for questions (`island.openForQuestions`) | Switch | The notch opens on its own for your OK. Things that can't be undone open Home. |
| | Display (`island.display`) | Segmented: Follow you, Built in, Main | Which screen the notch and Home use. |
| | Esc clears the screen (`home.escStops`) | Switch | Esc removes what Squibby is showing on your screen. |
| | Text size (`display.textSize`) | Menu: Standard, Large, Larger, Largest, Huge | Every word in Home gets bigger. The notch keeps its size. |
| Tools (footer: "A tool that is off keeps its settings. Squibby always fixes; that can't be turned off here.") | Show me how (`guide.on`) | Switch, usually on | Points at where to click, step by step. |
| | Second Look (`secondLook.on`) | Switch, usually off (F28) | A second opinion on an answer, with a few web searches. Its key works only while this is on. |
| | Convert files (`files.on`) | Switch, usually off (F28) | Drop a file on Flowflow to change its format. |
| | Watch routines (`watch.on`) | Switch, usually off (F28) | Checks that run on a schedule, plus Google connections. |

#### Fixing

| Group | Row (key) | Control | Description |
|---|---|---|---|
| Rules (footer: "Squibby always asks before it sends, pays, deletes or goes live. That can't be turned off.") | House rules (`rules.house`) | Summary "3 rules" plus "Edit", which opens a sheet | Squibby follows these in every fix, in every project. |
| | Install packages (`check.install`) | Segmented: Ask, Always, Never. Usually Ask (M49). | Before a check, whether Squibby may install what the project needs. |
| Checks | Check the page at (`check.pageSize`) | Segmented: Desktop, Phone, Both | Both takes about twice as long. |
| | Explain each fix (`explain.mode`) | Segmented: Off, Short, Full | Short: two reasons under each result. Full: also a question. A small cost on your Claude. |
| Undo | Keep your own edits (`undo.protectMyEdits`) | Switch | Undo leaves files you changed yourself and tells you which. |

#### Flowflow

The page opens with a preview card: the live Flowflow in the chosen look, 120 tall. A small segmented control (Resting, Working, Done) previews each state. The old CompanionHero buttons and the second copy of it on Advanced go.

| Group | Row (key) | Control | Description |
|---|---|---|---|
| How lively | Liveliness (`character.liveliness`, new) | Picture choice: Still (usual), Gentle, Lively | Still: moves only when there is news. Gentle: a slow sway. Lively: watches your pointer. |
| Look | Water (`look.water`) | Picture choice, 5 swatches: Ocean, Lagoon, Lime, Berry, Midnight | |
| | Size (`look.size`) | Segmented: Small, Usual, Large | How big it is on the edge of the screen. |
| | Name (`character.name`) | Field, 200 wide | What Squibby's character is called. |
| Where it lives | Screen edge (`character.edge`) | Menu: Left, Right, Top, Bottom | |
| | At rest (`character.peek` and `character.stick`, one row) | Segmented: Show, Half, Hidden | Hidden waits past the edge until you push the pointer there. |
| | Follow your pointer (`character.follow`) | Segmented: Eyes, Drop, Off | Still only follows while listening or pointing (F28). |
| Sound | Play sounds (`sound.on`) | Switch | A soft tone when a fix is proven, a tap when work stops. |

How "At rest" writes its two keys (executive review: merge the two edge switches):
- Show writes `peek` off.
- Half writes `peek` on and `stick` on.
- Hidden writes `peek` on and `stick` off.

Liveliness, water, size, theme, text size and motion are free on every plan. Only extra water colours are Pro (3.10).

#### Keys and voice

| Group | Row (key) | Control | Description |
|---|---|---|---|
| Keys (`keys.hotkeys`, rendered as rows; footer has a quiet "Restore usual keys") | Fix it, Hold to talk, Prompt help, Stop everything (F28's four) | Each row: the job name, a one line description, key labels and a quiet "Change". Change records the next chord ("Press the new keys. Esc cancels.") and reports a clash in the row. | |
| | Accept (⌃⌥⌘A) | The same row | Works only while a suggestion shows. |
| | Other jobs (5), no key yet | A disclosure holding the same rows, each with "Add a key" | |
| Talking (footer: one help line for the whole group) | Talk to Squibby (`voice.on`) | Switch (parent) | Hold the talk key and ask out loud. |
| | Microphone (`talk.voice`, part 1) | Menu (child) | |
| | Say answers out loud (`talk.speak`) | Switch (child) | Short answers are spoken. |
| | Voice and speed (`talk.voice`, parts 2 and 3) | Menu plus segmented 0.75×, 1×, 1.25× (child of Say answers) | |
| | Show your words (`talk.captions`) | Switch (child) | Your words appear as you speak. |
| | Type by voice in any app (`talk.dictate`) | Switch (child), usually off (F28) | Hold its key in any app and speak to type. |
| Prompt help | Prompt help (`prompt.on`, new) | Switch | Rewrite a prompt in any app with its key, then paste it back. Also the error explainer key. |

#### Privacy

| Group | Row (key) | Control | Description |
|---|---|---|---|
| What Squibby may see (footer link "What Squibby can see" opens one screen of plain "never" lines, as on https://heyclicky.com/trust) | Accessibility, Screen Recording, Microphone (fixed `permissions`) | Status chip, plus one secondary "Open System Settings" when not allowed | One line on why ("To paste Prompt help back into the app you're in"). "Not needed yet" until a feature first asks (rule 8). |
| Sharing and calls | Hide from screen sharing (`sharing.hide`) | Switch | Squibby is left out of shares and recordings. |
| | Quiet on calls (`calls.quiet`) | Switch | While a call app is in front, Squibby doesn't speak and Flowflow stays still. |
| Memory | Pause memory (`memory.paused`) | Switch | Squibby stops learning about your projects until you turn this off. |
| | What Squibby remembers (fixed `kept`) | Secondary "Open memory" | Every line shows its source and can be forgotten. |
| Danger zone | See 3.9 | | |

#### About

The page opens with a header card: the app icon (48), "Squibby", and "Version {x} ({build})" at 13 `--fg-2`.

| Group | Row (key) | Control |
|---|---|---|
| Updates | Check for updates automatically (`updates.daily`) | Switch. Then a row with the status ("Up to date, checked 10:02") and a secondary "Check now", plus a quiet "Release notes". |
| Help | Replay the first run | Secondary "Replay" (moved from the Flowflow hero) |
| | Practice projects (fixed `practice`) | Secondary "Open" |
| | What Squibby made (fixed `made`) | Secondary "Open" |
| | Report a problem (fixed `logs`) | Secondary "Copy report" |
| Legal | Acknowledgements (fixed `acknowledgements`) | Quiet "View" |

#### More options (111 keys)

- Each page owns a section, in the sidebar's order.
- Inside a section, each topic is a closed disclosure showing its title, count and chevron. Opened, it is a normal Group of Rows.
- If the topic's parent tool is off, its rows are disabled, with "Turn on {tool} in General to use these."
- Search opens topics as needed.

| Owner page | Topic | Keys |
|---|---|---|
| Account | Spending per job and models | `budget.task`, `budget.plan`, `budget.rescue`, `budget.research`, `model.work`, `model.rescue`, `model.quick` |
| General | Notch | `island.showWork`, `island.openDelay`, `island.closeDelay`, `island.followDelay`, `panel.showHello` (usually off, F28), `panel.showWork`, `panel.showButtons`, `panel.size` |
| General | Home | `home.closeOnClickAway`, `home.stepAside`, `home.goToNeeds`, `home.size`, `look.theme` (Night, Paper; only if the founder keeps Paper) |
| General | Tools | `flow.on` (labelled "Fix"; a confirm explains what stops), `groups.islandName`, `groups.showUntried`, `secondLook.searches` |
| General | Show me how and pointing | `showme.allScreens`, `showme.askWorked`, `showme.waitForPage`, `showme.everydayTutor`, `showme.listen`, `point.ringSeconds`, `point.yourTurnSeconds`, `point.colour`, `point.style`, `point.dropSize`, `point.caption`, `point.lettering`, `point.guesses`, `point.pace`, `point.everyday`, `point.everydayWhy`, `point.fixWith`, `drawIt.seconds`, `teach.startWhereYouAre`, `teach.yourTurn` |
| General | File conversion | `drop.on`, `drop.imageFormat`, `drop.docFormat`, `drop.audioFormat`, `drop.videoFormat`, `drop.resizeTo`, `drop.quality`, `drop.sampleRate`, `drop.saveTo`, `attach.docLimit` |
| General | Watch routines and Where was I | `watch.schedule`, `watch.dailyHour`, `watch.quiet`, `watch.quietFrom`, `watch.quietTo`, `where.after`, plus the Google connections (fixed `google`, moved off Account; shown only while `watch.on` is on) |
| Fixing | How fixes run | `work.maxTurns`, `work.tries`, `work.askOnAnyFailure`, `work.tryAgain`, `work.stopOnQuestion`, `work.webSearch`, `drive.maxSteps`, `make.folder`, `approval.waitMinutes`, `pointat.editor`, `explain.after` |
| Fixing | Checks and proof | `check.mustSee`, `check.press`, `check.afterPress`, `check.start`, `check.skip`, `check.time`, `net.slow`, `pictures.make`, `pictures.keep`, `rescue.readDeployLog`, `rescue.readCiRun` |
| Flowflow | Motion and placement | `character.position`, `character.sameEverywhere`, `character.comeTo`, `character.linger`, `character.motion`, `character.overFullScreen`, `character.peekIdle`, `character.live`, `fun.reactions`, `sound.volume` |
| Keys and voice | Talking | `talk.speakReplies`, `talk.autoSend`, `talk.followUpByPointing`, `talk.shortSteps`, `talk.maxHold`, `speak.alsoSay` |
| Keys and voice | Prompt help | `ph.style`, `ph.useProjectInfo`, `ph.handBack`, `ph.appAnswers` |
| Privacy | Memory | `memory.learnFromFiles`, `memory.learnFromWords`, `memory.rememberGoals`, `memory.tellClaude`, `memory.recallLength`, `memory.toastSeconds`, `task.offRecordByDefault` |
| Privacy | Calls and counts | `calls.apps`, `numbers.on` |

Fix these broken controls while moving them (M47, executive review):
- "Caption colour" (`point.caption`, today `lime` | `white`) becomes Water (`--water`) and White, two choices that look different. A stored `lime` maps to Water.
- The `drop.sampleRate` label becomes "Audio sample rate".
- `island.showWork` becomes "Drop work from the notch as it moves on", and `panel.showWork` becomes "List work in the notch panel", so the two can't be confused.

### 3.5 Control choice rule (tested)

| Setting kind | Control |
|---|---|
| switch | Switch |
| choice with 2 or 3 options | Segmented |
| choice with 4 or more options | Menu |
| choice that is visual (`look.water`, `character.liveliness`) | Picture choice |
| number | Stepper with a unit |
| text | Field |
| list or custom | Summary plus "Edit", which opens a Sheet (`keys.hotkeys` and `talk.voice` have named renderers) |

The control is always on the right of the row, or under the text when the row stacks.

### 3.6 Row anatomy, in words

```
| Label (14, fg)                                   [control] |
| One line on what changes (12, fg-2)                        |
```
- Min height 44 (58 with a description), padding 10 16.
- At most one description line, or two when it wraps. No "Usual: X" line, no project line, no note line. Those become the dot, the tag and a toast (2.3 Row).

### 3.7 Search

- **Where:** the field at the top of the sidebar. ⌘F focuses it. Typing replaces the content column with results, and the sidebar selection dims to show search is active.
- **Matching:** a small scorer written in house, with no new dependency. It matches the label, the description, `help` and the `also` synonyms (`strings.ts` already has them). Order: exact word first, then prefix, then a fuzzy match with up to 1 typo for words over 4 letters. At most 30 results.
- **New synonyms** (added to `also`):
  - Plan: plan, pro, free, trial, pay, billing, subscription, upgrade, cancel, invoice, receipt, student, discount, price, money, license, key.
  - Spending: cost, money, spend, limit, budget.
  - Keys and voice: mic, microphone, talk, speak, voice, dictate, shortcut, hotkey, keys, stop, panic.
  - `look.theme`: dark, light, theme, colour.
  - `character.liveliness`: quiet, calm, still, motion, animation, battery.
  - `sharing.hide`: zoom, screen share, record.
  - Danger zone: delete, reset, forget, remove.
- **Results:** grouped under their page's name (13 weight 590 `--fg-2`, "General, Notch"). Each result is a normal Row with its live control, so a setting can be changed right in the results. Clicking the page name jumps to the row on its page, scrolls it into view, and flashes it with a `--surface-3` fill that fades over 1200 ms.
- **Fixed blocks are searchable too:** Plan, Claude key, Permissions, Danger zone, Replay the first run and Report a problem.
- **Nothing found:** "No setting matches “{q}”. Try a plain word like sound, keys or plan."
- **Removed:** the "Clear search" text button and the search only "Close" button.
- **Deep links:** every "change this" link uses `openSettings(key | groupId)`: the spending limit card, the notch's "Add your key", a permission request, the Free limit card. Home's ask field also offers "Open Settings, {page}" when the words match a page or key (Superhuman).

### 3.8 Fixed blocks become rows

The key, the permissions, practice, made, logs, acknowledgements and memory are no longer bare `Group` blocks with uppercase `h3`s. Each one is a Row inside a Group card, with a status on the right and one secondary button. The update line and the spending line move into rows. Nothing sits loose under a card.

### 3.9 Danger zone

This is the last group on Privacy.
- Its card has a 1 px border of `--bad` at 40%.
- The header is "Danger zone" in `--fg-2`, not red.
- Each row states its exact consequence and has one Danger button.

| Row | Description | Confirm |
|---|---|---|
| Forget everything Squibby remembers | Deletes project memory and what Squibby knows about you, on this Mac. Receipts stay. | An alert of one paragraph |
| Remove your Claude key | Deletes the key from the Keychain. Squibby can't fix anything until you add one. | Type to confirm with the existing `REMOVE_KEY_PHRASE` |
| Delete everything Squibby keeps | Memory, receipts, safety copies and settings on this Mac. Your projects and their git are not touched. | Type to confirm "delete everything". The confirm lists what is kept. If the founder keeps the trial date (founder call 8), it says "Kept: the date your trial started, so it can't restart". It also says whether this month's free fix count resets, following where the payments spec stores the count. |

There are three reset levels today: per row, "Reset this section", and "Reset all settings". They become:
- per row: the row's "Restore usual";
- per page: a quiet "Restore usual settings for {page}" at the foot of each More section;
- "Reset all settings": a row in the danger zone, confirmed with an alert and a 10 s Undo toast.

There is no account deletion row. The license key design has no Squibby account, and website work is paused.

### 3.10 Plan and billing (Dodo, license key design)

This section follows the payments spec's design: a Dodo license key plus a trial kept on the Mac. The founder records the final choice in T17 before M47 starts (founder call 1). If a separate billing Worker wins instead, Appendix A applies.

**Principles.**
- Squibby never shows a card form.
- "Get Pro" opens Dodo checkout in the person's browser. "Billing and invoices" opens Dodo's hosted customer portal (https://docs.dodopayments.com/features/customer-portal). Neither ever opens in a web view.
- No Dodo secret key ships in the app. Pro billing never runs on `usage-proxy`. Every route there sits behind the F22 managed usage switch (`if (!d.enabled()) return refuse('disabled', ...)` at `usage-proxy/src/proxy.ts:112`), and that server carries Claude traffic.
- The app knows the plan from two things: whether the license key is valid (Dodo's validate call returns only `{valid}`, https://docs.dodopayments.com/api-reference/licenses/validate-license), and the trial item on this Mac. It never knows the renewal date, the price paid, or monthly against yearly. Those live in Dodo's portal.
- Payments stay off behind the remote switch until the founder switches them on (F25: "Nothing is charged until payments are switched on").
- **Prices.** The app shows US prices only: $10 a month, or $96 a year. It adds the line "Your local price and tax show at checkout." Dodo applies regional prices and currency only at checkout, and has no public API for them in advance (https://docs.dodopayments.com/features/purchasing-power-parity).

**Dodo dashboard settings this design depends on** (add them to the payments spec's setup list; all are off by default; https://docs.dodopayments.com/features/subscription):
- The past due grace period is on, with N days chosen by the founder. Without it, a failed renewal goes straight to on hold.
- The end of grace goes to on hold, not cancelled. A cancelled subscription disables keys for good.
- Allow Subscription Updates is on, so people can switch between monthly and yearly in the portal.
- Both products are in one Product Collection.

**The Plan card** (`#account.plan`). One Card at the top of Account. A line styled like a verdict comes first, then at most two facts, then the buttons. At most one primary.

| State | Line (15 weight 590) | Facts (13 `--fg-2`, tabular) | Buttons |
|---|---|---|---|
| Payments off | Early access | Nothing is charged. You'll be told before that changes. | None |
| Free, no proven fix yet | Free | {n} of {limit} fixes left this month. They come back on {date}. | Quiet "Compare plans" (founder call 7) |
| Free, trial available | Free | {n} of {limit} fixes left this month. They come back on {date}. | Primary "Try Pro free for 14 days", quiet "Compare plans" |
| Trial | Pro trial, {d} days left | Ends {date}. No card needed. | Primary "Keep Pro after the trial", quiet "Compare plans" |
| Trial ended | Free | Your trial ended on {date}. | Primary "Get Pro", quiet "Compare plans" |
| Waiting for your key | A water arc, then "Finish paying in your browser" | Pro turns on when your key arrives. | Secondary "Paste key", quiet "Cancel" |
| Pro | Pro | Renewal, invoices and your card are on your billing page. | Secondary "Billing and invoices" |
| Pro key not active | An amber dot, then "Your Pro key isn't active" | Usually a payment that didn't go through. Fix it and Pro comes back. | Primary "Update payment" (opens the portal) |
| Can't check | {last known plan} | Couldn't check your Pro key. Showing your plan as of {time}. | Secondary "Check again" |

More rules for the card:
- **A failed check never shows Free.** Within the payments spec's offline grace, the card keeps the last known plan. This avoids HeyClicky's "plan shows Free" and strict network bugs.
- **Past due.** While the grace period is on, the key stays valid through past due, so the card shows Pro, and Dodo's own emails ask for the card. When the subscription moves to on hold, the key stops validating and the card shows "Pro key not active". Keys come back after on hold.
- **How the key arrives.** The Waiting state ends when a key is activated, by the return link or by a paste (payments spec), or when the person presses Cancel.
- **Still to verify** in the payments spec's test run: a refund or dispute (V15), and whether the portal can undo a scheduled cancel (V16). The card has no "cancelled, still paid" state, because a valid key looks the same either way.

Under the card, one footer line: "You pay Anthropic directly for Claude. We never mark up your AI." (F25)

**Compare plans** (a Sheet).
- A Monthly | Yearly segmented control. Yearly shows "$8 a month, billed $96 a year. Save 20%." Under it: "US prices. Your local price and tax show at checkout."
- Two columns, Free and Pro, each with at most four lines:
  - **Free:** "Show me how, voice, Prompt help, Explain an error". "{limit} fixes a month". "Undo, receipts and the browser check". "Every safety feature and every look setting".
  - **Pro:** "Unlimited fixes". "Ship with rollback". "Recaps". "Extra water colours".
- "Looks" in Pro means the extra `look.water` colours only. Liveliness, the theme, size, text size and motion stay free, and a test checks this.
- Footer:
  - "Cancel any time. Pro stays on until the end of the period you paid for. On Free you keep Undo, receipts and the browser check."
  - "Students pay half: Ask for the student price." This is a quiet button that opens a mail draft to support in the person's own mail app. [verify the student check with Dodo discount codes]
- The primary button follows the state: "Try Pro free for 14 days" or "Continue to payment".

**The Free limit card** (Home). It replaces any wall.
- It shows only when a new fix is asked for with none left. The check runs before a fix starts, never in the middle of one (the Replit lesson).
- "You've used {limit} of {limit} fixes this month. They come back on {date}, {time}."
- "Undo, receipts, Show me how and voice still work."
- Primary "Try Pro free for 14 days", or "Get Pro" once the trial has been used. Quiet "Not now".
- First run and practice fixes never count against the limit (the HeyClicky v1.0.49 lesson).
- **Bring the fix back counts.** On Free, if Undo gave a fix back to the count, "Bring the fix back" counts as a fix again. With none left, it shows this card instead. Otherwise fix, undo and bring back would give unlimited free fixes with normal buttons.

**Never under the notch.** Home's content, the Plan card and the Free limit card included, starts below the hardware notch's safe area at both Home sizes (the HeyClicky v1.0.50 bug). The notch hover panel's content stays within `PANEL_MAX` (240, `island.rs:90`), as today.

### 3.11 Copy rules for Settings

- **Labels** are a verb phrase or a noun, in sentence case, with no pronoun ("Show in the notch", "Daily limit").
- **Descriptions** say what changes for the person. They speak to "you", name "Squibby" when needed, and never use "I" or "me". Settings is the person's control panel. Squibby speaks as "I" in conversation (executive review, principle 5), not here. This needs the founder's yes in the M47 plan (founder call 5).
- **Descriptions keep each setting's real behaviour.** A shorter line may leave out detail, but never changes what the setting does. The full text stays in `help`.
- **Buttons** start with a verb that names the outcome: "Save key", "Open System Settings", "Try Pro free for 14 days". Manage, Submit, Simply and Easily are not used. The portal button is "Billing and invoices".
- **Errors** name the problem, then the fix.
- **Feature names** a new person has not met yet (Hold to talk, Prompt help) appear only as row labels, never inside another row's description. The exception is the Prompt help row's own mention of the error explainer.
- No em dashes. A strings test already exists; extend it to Settings.

---

## 4. Home and the notch (F28, M48), from the same parts

### 4.1 Home at rest (one column, 640 wide; Large 680)

1. **Top bar, 44.**
   - Left: the project name, 13/18 weight 590, with a chevron menu (Change folder, Open from a link).
   - Right: quiet buttons with words: History, Memory and Settings. Learn shows only until the first practice is done. Then the Close icon button.
   - A hairline sits under the bar.
   - These go (executive review, Home): the ^⌥⌘ text on rows, the "Do" list, the invite line, "How to talk", the Watches disclosure, and the folder buttons at the foot.
2. **Status headline.** A Verdict line at display size (22/28). When nothing has been proven yet, the icon is the status dot. Examples: "test-shop works" with "Checked 2 hours ago", or "Not checked yet". The words come only from the M45 verdict function and the project's last check.
3. **One primary button (`lg`)**, chosen by status: "Fix it", "Check before going live" or "Check my project".
4. **The ask field.** 44 tall, `--r-card`. Placeholder "Or tell me what's wrong". The talking key labels sit inside it on the right. Return starts a fix.
5. **Recent.** A Group with no header, holding up to 4 Recent rows. The first is the last fix. Each opens its receipt.

Every surface uses the Night tokens. There are no waterline gradients. Flowflow is not drawn in Home; it lives on the screen edge (F28, M43).

### 4.2 Working and result

**Working.**
- The job fills the whole panel. It is a Card with:
  - the headline as an order ("Fix the signup button");
  - "Safety copy saved. Undo is ready." with a tick;
  - a four step strip, Finding, Fixing, Checking, Proven: four 2 px lines that fill with `--water`, with labels at 12/16;
  - the current step at 15/22;
  - on the right, the time so far, with the cost chip last.
- Stop is a secondary button at the top right of the card. Its key labels are in the tooltip.
- A retry says "Trying again (2 of 3)" and steps the strip back. The strip reads only the runner's real states.

**Result card.**
1. A Verdict line at verdict size (28/34), with a 13 line under it.
2. The before and after picture, `--r-control`, with the change outlined in `--ok`.
3. Two facts at 14/20, built from the diff: "Found: signup.js, line 8" and "Changed 1 file".
4. A row of Proof chips: Builds, Tests pass, Works in a browser.
5. Actions: a secondary "Undo this fix"; the cost text "$0.06, today $0.18 of your $10 limit" (12 `--fg-2`, tabular, linking to `#account.spending`); and a quiet "More" menu (Copy receipt, See the changes).
6. A disclosure, "How it was proven", holding the step rows and "What it said".

After Undo, the card shows "Undone. The problem is back.", the picture and chips dim to 50%, and a secondary "Bring the fix back" appears. On Free it counts as a fix (3.10).

**Approval card.**
- A Card with a 2 px `--amber` left edge. This is the one edge accent allowed, and it means "needs you".
- It holds a plain question, one line on why, the command in code type inside an `--inset` box, and one line on Undo.
- "Don't allow" and "Allow" are both secondary and the same width. Neither is silver. There is no "Always" button for send, pay, delete or go live (rules 12 and 13; The Rundown).
- **Focus.** When the person opened Home or the panel by hotkey or click, focus starts on "Don't allow". A question that opened on its own takes no keyboard focus (rule 9; T01 allows key focus only on the person's hotkey or click), and its buttons ignore clicks for their first 600 ms.

**Loop breaker.** "I've tried 3 times and it still fails." Three secondary buttons: "Try another way", "Stop and undo my changes", "Stop and keep the changes".

### 4.3 The notch

**At rest.** Exactly the hardware notch: the clickable area equals the black. The greeting, the silver sun and the launcher buttons go (F28). Removing the menu bar sun needs the founder's yes (founder call 6, M16).

**Working wings, 40 each.**
- Left: one flat status icon at 16.
- Right: a ring 13 across with a 1.75 px line that fills with `--water` step by step (`islandPanel.ts` knows the step and the total). It never spins without end.
- "Looking at your screen" has its own mark: a white ring with a filled centre (rule 5).
- Listening shows three bars.
- Needs you is an `--amber` dot that pulses three times, then holds.

**Hover panel.**
- As wide as the black behind it. One constant fixes today's mismatch between 340 and 400.
- Notch black, one typeface, content within `PANEL_MAX`.
- It shows exactly one of these:

| Live thing | Parts |
|---|---|
| A job | Verdict line style at 15: the step, then the time so far, plus a secondary "Stop" |
| A result | Verdict line at 15, Proof chips, secondary "Undo this fix", quiet "See proof" |
| A question | The approval card, compact. It takes no keyboard focus when it opened on its own, and its buttons ignore clicks for their first 600 ms. Questions about things that can't be undone, and changes to the project's git history, open Home instead (`island.openForQuestions`' existing rule). |
| Nothing live | One true line: "test-shop works. Last fix proven 2 hours ago." |
| Not connected | Primary `lg` "Add your key", which opens Account at `#account.claude` |

- It opens on its own only for a question, a proven result or a failure, and never while presenting or in full screen. `calls.quiet` keeps its current behaviour: no speech and no reactions while a call app is in front.
- A click on the notch always opens Home. Esc closes it.

**Notch settings.** Four stay visible on General (show, hover, questions, display). The rest are in More options, under General, Notch.

---

## 5. Motion and states

### 5.1 Per part

| Part | Hover | Pressed | Focus (keyboard) | Disabled |
|---|---|---|---|---|
| Primary button | `--silver-hover`, 120 ms ease out | `--silver-press`, scale .97, 120 ms | 2 px `--focus` ring, offset 2, radius +2 | Fill `--surface-3`, text `--fg-3`, no lip or edge (M29's calm grey) |
| Secondary button | Fill `--surface-2` | Fill `--surface-3`, scale .97 | Ring | Text and border at 40% |
| Quiet button | Text `--fg` | Text `--fg`, scale .97 | Ring | Text `--fg-3` |
| Danger button | Fill `--bad` at 10% | Fill `--bad` at 16% | Ring | 40% |
| Icon button | Fill `--surface-2`, icon `--fg` | Fill `--surface-3` | Ring | Icon `--fg-3` |
| Row | No fill (Mac settings rows don't light up) | | The control inside gets the ring | Label `--fg-3`, the description says why, control at 40% |
| Recent row | Fill `--surface-2` | Fill `--surface-3` | Ring, inset 0 | |
| Switch | Off track: border at 48%. On: unchanged. | Knob widens to 20 (Mac style), 120 ms | Ring around the track | 40% |
| Segmented | Unselected label turns `--fg` | Thumb follows | Ring around the track; arrows move | 40% |
| Menu | As secondary | As secondary | Ring | 40% |
| Stepper | Button fill `--surface-2` | Scale .97 | Ring on the focused part | 40% |
| Field | Border `--fg` at 30% | | Border `--fg` at 60% plus ring | Fill `--surface-1`, text `--fg-3` |
| Picture choice | Border `--line-strong` | Scale .98 | Ring | 40% |
| Sidebar item | Fill `--surface-2` | Fill `--surface-3` | Ring, inset 2 | |
| Proof chip, Key label | None; they can't be pressed | | | |
| Card | None | | | |

### 5.2 Movement (all `--ease-out` unless named)

- **Switch:** the knob slides 16 px in 200 ms. The track's fill and border fade in 120 ms.
- **Segmented:** the thumb slides between options in 200 ms, and can be interrupted.
- **Sidebar selection:** instant, with no sliding highlight (as on the Mac).
- **Page change:** the content cross fades in 120 ms, with no slide.
- **Disclosure:** the chevron turns 90° in 200 ms. The body opens with `grid-template-rows` going from `0fr` to `1fr` in 200 ms.
- **Sheet:** slides in from the right in 280 ms ease out while the scrim fades to 50% in 200 ms. Out takes 200 ms ease in.
- **Menu:** fades in from its button, scaling from .98 to 1 in 120 ms. It closes at once.
- **Toast:** rises 8 px and fades in over 200 ms. Out takes 120 ms ease in.
- **Search hit:** a `--surface-3` flash on the row, fading over 1200 ms.
- **Result:** the strip turns into the verdict in place. The tick draws in 280 ms, once. The card settles with one small bounce on `--ease-spring`. This is the only bounce in Home.
- **Undo:** the tick undraws in 200 ms, and the chips dim in 200 ms.
- **Home opening:** opens from the notch in 240 ms ease out, with the parts following 20 ms apart. Closing takes 200 ms ease in (look.md, unchanged).

### 5.3 The notch

- **Hover:** within 120 ms the black grows 3 px taller and gains `0 6px 16px rgba(0,0,0,.35)`. This is the swell before opening (NotchNook). It never grows wider, so it never covers menu bar items (F18, executive review). If the pointer leaves, it settles back in 120 ms.
- **Open:** after `island.openDelay` (usually 0.4 s), the panel opens on the island's spring in 240 ms, with at most a 2 px overshoot. It can be interrupted: if the pointer leaves halfway, it reverses from where it is.
- **Close:** 200 ms ease in. The window waits `TUCK_MS` (unchanged, pinned by a test).
- **Proven:** the ring fills to the top, the tick draws, and the wings widen 8 px once, outward within the notch area, on the soft spring. They tuck back after 4 s.

### 5.4 Reduced motion

With the Mac's Reduce motion on, or `character.motion: less`:
- Every movement above becomes an opacity change of 120 ms or less, or happens at once.
- There is no swell, no spring, no bounce and no tick drawing. The tick simply appears.
- The lights that must show first (looking at the screen, listening) still show at once.

Flowflow's own motion follows `character.liveliness` (M46).

---

## 6. What to delete from `style.css`

M48 rule: replace, never override. Line numbers are from the m36-type worktree today. Each block's job moves to `ui/tokens.css`, `ui/parts.css` or the character file.

| Lines (about) | Block | Becomes |
|---|---|---|
| 15 to 16, 81, 1091 | The duplicate token sets (`--sky`, `--card`, `--surface`, `--lime*`, `--key*`, `--home-sea*`) | `ui/tokens.css`, Night and Paper only |
| 147 to 152 | M17 rounded face and lime headings | Deleted |
| 156 to 163 | M41 rim of light on cards | Deleted (Card has no rim) |
| 169 to 173 | Settings as a row of pills inside Home | Deleted |
| 205 to 217 | Base `.btn` (12 px, transparent, negative margin) and the pill `.btn.primary` | `Button` in `parts.css` |
| 326 to 346 | Settings uppercase `h3` groups and `.setting` rows (the old row) | `Row` and `Group` |
| 473 to 489 | The Settings window grid and its side list | Deleted with the window (founder call 2) |
| 624 to 631 | The M16 sun beside the notch | Deleted once the founder says yes (founder call 6) |
| 633 to 692 | M17 waterline (sea gradient, wave, lime keys, quick actions on water) | Deleted. Home is flat `--bg`. |
| 798 to 817 | M18 grouped side list with coloured dots and a left bar (`.side-item`, `.side-head`, `.side-dot`) | `Sidebar item`, in its own `.sb-*` namespace. Home no longer has a side list. |
| 844 to 870 | M19 themes (Deep), compact panel, character card drops | Paper becomes tokens. Deep is hidden. The rest is deleted. |
| 876 to 893 | M20 settings in Home and the M21 Google block | `Row` and `Group` |
| 939 to 962 | M30 settings page layer (first version of `.sp-*`) | `Row`, `Group`, `Sidebar item` |
| 963 to 973 | M39 change card | `Card` |
| 974 to 990 | M35 swatch cards (20 px corners) | `Picture choice` |
| 991 to 999 | M30 segmented as 999 px pills | `Segmented` |
| 1000 to 1016 | M32 chrome: `--chrome`, `--chrome-text`, and chrome on switches, menu hover and the drop ring | Flat silver (2.2) on `Button.primary` only, after the founder has seen flat and current side by side on a real Mac (founder call 4) |
| 1018 to 1022 | M33 notch hello in chrome text | Deleted (F28) |
| 1023 to 1047 | M34 settings in chrome (silver nav pill, brushed cards, chrome segmented) | Deleted |
| 1047 to 1086 | M42 two column Now, command bar and side list | One column Home (4.1), built from the parts |
| 1087 to 1135 | M43 overrides (`:root.home-page:not([data-theme="paper"])…`, lit nav row, flat cards, outlined secondary that excluded Settings) | Folded into the parts. No theme gated selectors remain. |
| 1136 to 1149 | M44 fixes | Kept as tests. Their rules fold into the parts (the `PANEL_MAX` scroll, the Tab target above the Undo strip, stacking with big text). |
| Every `var(--round)` (about 40) and the handwritten faces | | `-apple-system` |

**Lint added as a test** (`app/src/ui/styleLint.test.ts`). It fails when:
- a part's class selector is defined in more than one rule block;
- a colour, radius or font size literal appears outside `ui/tokens.css` (the character and overlay files are allowed);
- a `linear-gradient` appears in a button, switch or title;
- `background-clip: text`, `text-transform: uppercase` or `border-left` appears on a sidebar or nav item;
- a selector gated on `data-theme` appears outside `tokens.css`;
- a font family other than `-apple-system` (and the code face) appears;
- a font size is not one of the seven tokens;
- `style.css` grows past 600 lines.

**Code deleted along with it** (the window needs founder call 2):
- `app/settings.html`, `app/src/settingsWindow.tsx`, `app/src/settingsGroups.ts`, `app/src-tauri/src/settingswin.rs`, and the `open_settings_window` command.
- The window path in `openSettings.ts`.
- In `settingsPage.tsx`: the voided search in `settingsPlaces()` (line 736), the voided `onePart` (824, 834), and the `useSetting('fun.reactions')` redraw hack (743).
- The Google check that runs at import time (730 to 733). It moves to when the Watch routines topic opens.
- `settingsPage.tsx` (1077 lines, 17 components) is rebuilt as:
  - `settings/schema.ts`: the page and group tables from 3.4, replacing `settingsPages.ts`;
  - `settings/SettingsView.tsx`;
  - `settings/rows.tsx`;
  - `settings/plan.tsx`;
  - `settings/search.ts`;
  - `settings/editors/*`.

---

## 7. Acceptance checks

### 7.1 Screens to capture on a real Mac

Use a notched MacBook and an external display, in Night (and Paper if the founder keeps it), at Standard and Largest text. Name the files `docs/design/captures/2026-11-xx-*.png`. Nothing counts until it is seen on a real Mac (executive review, principle 7).

1. Home at rest in each status: works, failing, not checked.
2. Home working, with the strip at Fixing.
3. Each result card: proven, partial, not fixed, stopped, limit, undone, and after "Bring the fix back".
4. The approval card opened by hotkey (focus on "Don't allow"), and one that opened on its own (no focus; the person's app keeps typing).
5. The notch at rest, the hover swell (taller only, no menu bar item covered), and the hover panel in each of its five states.
6. Settings: each of the eight sidebar pages, top to bottom.
7. Settings General at 680×640, Standard text, setup finished: the title and the whole Notch and Home group show before any scroll.
8. Settings search for "mic", "billing" and "xyz".
9. More options with one topic open, and a disabled topic whose tool is off.
10. The Plan card in all 9 states (driven by a fixture), and the Compare plans sheet, monthly and yearly.
11. The Free limit card on Home, including when it is reached from "Bring the fix back".
12. The danger zone and each of its confirms.
13. The Keys and voice page while recording a key, and with a clash.
14. Focus ring screenshots: Tab through the sidebar, a row switch and a segmented control.
15. Reduce motion on: the notch opening and a result (no movement).
16. The current chrome next to flat silver, for founder call 4.

### 7.2 Tests (written first for the risky logic, per rule 17)

**Settings map** (`settings/schema.test.ts`):
- Every visible key in `protocol/settings.json` is owned by exactly one row group, on a page's main level or in More options. One row may own several keys, and a custom key (`keys.hotkeys`, `talk.voice`) may render several rows.
- Main levels hold 34 existing keys plus `character.liveliness` and `prompt.on`, matching the per page table in 3.4.
- Each page's main level holds at most 10 setting keys. Fixed blocks and a custom key's extra rows are not counted.
- `groups.tried` stays hidden. So does `look.theme`, if Paper is hidden.
- Every key and every fixed block can be found by searching for its label.

**Control rule:**
- Each row's control matches 3.5: a choice with 2 or 3 options renders Segmented (`explain.mode` included), and one with 4 or more renders Menu.
- A switch never has a gradient.

**Copy:**
- No "I", "me" or "my" in Settings labels or descriptions.
- No em dashes.
- No "Manage" anywhere in Settings.
- Every description is 90 characters or fewer.

**Search:**
- "mic" finds `talk.voice`. "billing", "cancel", "student" and "license" find Plan. "dark" finds `look.theme` (when shown). "stop" finds the Stop everything key. "quiet" finds `character.liveliness`.
- A match with one typo ("micophone") works.
- A result's live control changes the setting.
- Clicking the page name lands on the row at its anchor.

**One primary per screen:** a DOM test over Home in each status, the notch in each state, each Settings page and each Plan state.

**Rules 8 and 9:**
- Finish setting up never lists a permission.
- A permission row shows "Not needed yet" until its feature first asks.
- A question that opens on its own never makes its window key. Its buttons ignore clicks for 600 ms.

**Plan state machine** (`settings/plan.test.ts`):
- Every row of the 3.10 table renders from a fixture of license validity plus the trial item.
- A network error keeps the last plan, and never shows Free within the offline grace.
- The trial button is hidden until the first proven fix.
- Waiting ends only when a key is activated or the person presses Cancel.
- First run and practice fixes never count.
- The Free limit check runs only before a fix starts.
- On Free with the limit reached, running fix, then undo, then bring back shows the Free limit card and does not restore the fix for free (runner test).
- Every look setting except extra water colours stays free.
- No price other than the US prices and the "local price shows at checkout" line appears in the app.

**Billing hosts** (owned with the payments spec): a release build cannot point at a Dodo test host. Portal and checkout links always open in the browser, never in a web view.

**Top safe area:** at both Home sizes, Home's content (Plan card, Free limit card and question card included) starts below the hardware notch. The hover panel's content stays within `PANEL_MAX`.

**Contrast** (`a11y.test.ts`):
- Every readable text token pair reaches AA in Night and Paper.
- `--fg-2` is checked on `--surface-1` and on `--surface-2`.
- Status and meaning marks reach 3:1.
- `--fg-3` is left out of the test, and the lint fails if it is used on readable text (status chips, descriptions, "did not run").

**Motion:**
- With reduced motion, no transition is longer than 120 ms and no transform is used; only opacity changes.
- The notch's `RETRACT_MS` equals `TUCK_MS` (existing).
- The hover swell never changes the notch's width.

**Style lint:** see section 6.

**Migrations:**
- `character.liveliness`: untouched settings give `still`. `fun.reactions` off gives `still`. `character.motion: less` gives `still`. `character.motion` set by the person to a livelier value gives `lively`.
- `prompt.on` is copied from `voice.on`. After the split, the error explainer key follows `prompt.on` and the Second Look key follows `secondLook.on`.
- The F28 usual values: `secondLook.on`, `files.on`, `watch.on`, `talk.dictate` and `panel.showHello` are usually off. A value the person set themselves is kept.
- The `keymap.rs` DEFAULTS bind F28's four jobs plus Accept (⌃⌥⌘A, armed only while a suggestion shows). The other five have no key. A key the person set themselves is kept.
- `look.theme: deep` reads as Night.
- `point.caption: lime` reads as Water.
- `check.install` stays as the person set it. Only the usual value changes, to `ask`.

**Esc:** in Settings, Esc clears the search first, then closes Home.

### 7.3 Done means

- The full suite is green (`scripts/test-all.sh`).
- The app is rebuilt and opened, and the captures in 7.1 are taken on a real Mac.
- `CHANGELOG.md` gets plain lines: "Settings is simpler: fewer pages, the same row everywhere, and search finds everything." and "See your plan in Settings, Account."
- `docs/design/look.md` sections 1, 3, 5 and 8 are rewritten to match this spec.
- T17 records the billing design, and the payments spec's setup list includes the Dodo dashboard settings from 3.10.
- AGENTS.md is updated if the repo map changes (`app/src/ui/`, `app/src/settings/`).

---

## Appendix A. If T17 picks a separate billing Worker instead

Use this only if the founder chooses an account and a server over the license key.

**Where it runs.** A separate Cloudflare Worker with its own remote switch, never `usage-proxy`. It reuses `verifyDodoWebhook` from a shared module.

**What exists today, stated exactly:**
- `createDodoWebhook` in `usage-proxy/src/dodo.ts` is a handler that is built and tested, but nothing serves it. There is no Worker entry point, and `createDodoWebhook` and `webhookRouteFor` are not called outside `dodo.ts` and `payments.ts`.
- The store cannot set a plan from a payment.
- `MemoryDodoLedger` keeps webhook ids for 15 minutes (`KEEP_MS` = 3 × 300 s). Dodo retries for about 27.6 hours (https://docs.dodopayments.com/developer-resources/webhooks), so a retry signed again with a fresh timestamp passes as new.
- The only sign in that exists is Google (`GOOGLE_SIGNIN_PATH = /v1/signin/google`). Email sign in would be new work.

**Work to add to the plan:**
- A Worker entry point.
- A store write that sets the plan.
- A durable ledger that keeps webhook ids for at least 3 days.
- Routes for status, trial, checkout and portal sessions.
- Google sign in (existing) as the account.

**What changes in the UI:**
- The Plan card regains "Renews {date} for {price}", "Cancelled, still paid", and "Switch to yearly, save 20%". The yearly switch needs Allow Subscription Updates in the Dodo dashboard.
- The grace end comes from the Dodo grace period setting.
- The danger zone gains "Delete your Squibby account", but only once a deletion page exists. Website work is paused today.
- Prices stay US only, with "Your local price and tax show at checkout". The server cannot get local prices in advance either.