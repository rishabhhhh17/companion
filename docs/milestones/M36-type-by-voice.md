# M36: Type by voice into any app

Approved by the founder on 30 Oct 2026 (plan mode). The default key changed from the draft's Control, Option and Space to Option, Shift and Space, because Control, Option and Space is the Mac's own next keyboard language key.

## Context
On 30 Oct 2026 the founder said "do it" to voice typing into any app, like Wispr Flow: hold a key, speak, let go, and the words land in whatever text box is focused in the app in front.

The research says Squibby works *alongside* Wispr Flow (product_research.md sections 4 and 12, and the Wispr row). So this changes a research position. Per AGENTS.md it needs a founder record and doc updates in the same change.

Almost everything already exists:
- **Hold to talk:** the hotkey, the light first, the recorder, on device Whisper, and Stop everything.
- **Prompt help's paste back:** the Accessibility focus check, secure field refusal, clipboard save and restore, Edit > Paste with Cmd+V as fallback.

The missing piece is the hand off. Today the transcript always goes to Home's ask box.

## What the person gets
- **The Type key, a new hotkey** (default Option+Shift+Space, changeable in Shortcuts):
  - Hold it and the light comes on first (Flowflow and the notch show "Listening").
  - Speak, let go, and the words are pasted at the cursor in the app in front.
  - The notch shows "Typed into Notes" for a moment.
- **The existing talk key is unchanged.** Option+Space still talks to Squibby.
- **Never typed into:** password boxes, secure typing, or the never-read apps (password managers, Keychain, System Settings).
  - If the focused box or app changed between the key going down and the words being ready, the words are copied instead, and the notch says "Copied. Press Cmd+V."
- **Permissions**, both asked the first time the Type key is used (rule 8), never at install. No Input Monitoring.
  - Microphone, as now.
  - Accessibility, the same one Prompt help uses.
- **Settings:**
  - "Type by voice in any app" on the Voice page. It is a switch, on by default, and part of the voice group, so turning voice off turns it off.
  - The Type key in Shortcuts.
- **Never presses Return.** The words are typed, never sent (rule 13).

## Privacy shape (rules 5, 8, 11)
- **The microphone** opens only while the Type key is held, with the light lit about 150 ms before (the existing `listening` path). Nothing is stored. Only text leaves the recorder, and only into the focused box.
- **Remembered on key down:** the app in front (pid and bundle) and the focused element's identity (`Cf::id`), never its text.
- **Landing check:** after the paste, the other app's text is not read. We confirm only that the same app and element are still focused, so dictation reads less than Prompt help does.
- **Clipboard:** saved and put back only under the existing rules (`clipboard_plan_with`, `may_save`, change count unchanged). Our item is marked transient and concealed (`ax::write_clipboard`).
- **Stop everything** cancels the recording and any pending paste: `VOICE_STOPS`, plus a new `dictate::dismiss` called from `showme_stop_rest`.

## How it's built (reusing what exists)

**Rust shell (`app/src-tauri/src`)**
1. **`keymap.rs`:**
   - New `Action::Dictate` (a hold chord like Talk) with `N`, `ACTIONS`, `id()`, `job()` and `DEFAULTS`.
   - Its own choice list in `talkkeys.rs` (`DICTATE_CHOICES`: Control+Option+Space, Control+Option+Return), clashing with no other default.
   - Update the wiring tests.
2. **`main.rs` handler:**
   - An `is_dictate` branch beside `is_talk`, with its own `DICTATE_HELD: talkkeys::Held`.
   - It sends `VoiceMsg::Down/Up` with a `Mode::{Ask, Type}` flag. One worker, one microphone: a Type press while Talk is held is ignored, and the reverse too.
   - Key change and reset paths reset `DICTATE_HELD` (as they do `TALK_HELD`).
3. **New `dictate.rs`:**
   - **Pure rules, unit tested:** `target_verdict(role, subrole, secure_on, bundle, deny) -> Ok | Refuse(why)`, reusing `prompthelp::secure_now` and `built_in_never`. `insert_plan(at_down: Focus, now: Focus) -> Paste | Copy`. `typed_words(app, outcome)`.
   - **Mac side, the `insert_at_cursor(target, text)` sequence:**
     1. `ensure_front(pid)` and a focus check.
     2. `clipboard_plan_with` decides whether to `save_clipboard`.
     3. `write_clipboard`.
     4. `press_menu("Edit","Paste")`, falling back to `press_paste()`.
     5. Wait about 300 ms, then `restore_clipboard` only if the change count is unchanged.
     6. Otherwise copy and say so.
   - Modelled on `phelp::put_back_now`, but with no select-all and no value read.
   - `dismiss()` and a `GEN` counter for Stop everything.
4. **Voice worker (`main.rs` ~3748 and ~3845):**
   - On Down with `Mode::Type`, before the light: `ax::trusted(true)` (Accessibility, first use only), `ax::front_app`, `ax::focused`, then `target_verdict`. A refusal says why and never opens the microphone.
   - On `heard` with `Mode::Type`, call `dictate::insert_at_cursor` instead of filling the ask box.
   - Say `app.voice` stage `typed {app}` or `copied`. Keep every `stops_at` check.
5. **`protocol/groups.json`:** a `dictate` tool in the voice group, holding the hotkey id and `"tried"`. Also `groups.tried` `allowedItems` and `maxItems` in settings.json.

**Protocol and settings**
- `protocol/settings.json`: `talk.dictate` (switch, default true, applies shell and pages, Voice page).
- Add it to the `want` map in `runner/test/settings-registry.test.ts` and to `settingsPages.ts` (Voice).
- The `app.voice` stages gain `typed` and `copied` (protocol types; the runner just relays).

**Pages (`app/src`)**
- `keys.ts`: add `Job "dictate"` to `JOBS` and `KEY_DEFAULTS`.
- `strings.ts` gets:
  - `keyJobs.dictate`
  - `S.set["talk.dictate"]` and its short line
  - notch lines "Typed into {app}", "Copied. Press Cmd+V." and the refusal lines in plain words
  - first use permission lines
- `model.ts` reduces `typed` and `copied` to the island line and Flowflow's "done" glance.
- `card.tsx` and `askbox.ts heardGoesTo`: `typed` and `copied` never fill the ask box.

**Docs, in the same change**
- `docs/decisions/F26-type-by-voice-anywhere.md`: the founder decision, why, and what it changes.
- product_research.md:
  - Section 4 voice text.
  - Section 10 Voice row: words go into the focused box only on the Type key.
  - Section 12 Wispr row: "Overlaps on dictation; our hero is still fix it with proof."
  - Section 3 table.
- technical_research.md section 15 and T13: the Type key flow. Mark [verify] items for a real Mac.
- `docs/milestones/M36-type-by-voice.md` (this plan), `CHANGELOG.md` and the AGENTS.md repo map if a file is added.

## Tests first (rule 17)
- **Rust (`dictate.rs`):**
  - Secure fields, secure typing and never-read apps are refused before the microphone opens.
  - `insert_plan` copies when the pid or element changed.
  - Never Return; no read of the field's value (the body pins it: no `value_of` in the dictate path).
  - Stop everything bumps `GEN` and the worker drops the words.
  - The clipboard is put back only when the change count is unchanged.
- **Rust (`keymap.rs`, `groups.rs`):** the new action is wired, its default clashes with nothing, and it is listed in groups.
- **Pages:**
  - `hotkeys.test.ts` (JOBS order, handler arms).
  - `askbox.test.ts` (`typed` never fills the box).
  - `voice.test.ts` (island lines).
  - A rule 16 words check.

## Verification
1. `caffeinate -i sh scripts/test-all.sh && git push && sh app/scripts/build-app.sh && open <app>`. Build pages into `app/dist` first in a new worktree.
2. A guided hands on session with the founder, one step per message. Record the results in technical_research.md section 15 and T13:
   - Hold the Type key in TextEdit, Notes, Chrome (a Google Doc and a plain input), Slack or Messages, and the Claude desktop app.
   - The words land at the cursor; the clipboard comes back; a password box is refused; switching apps mid-hold gives "Copied".
   - Stop everything mid-hold drops the words.
   - The microphone dot shows only while held.

## Not in this milestone
- Windows.
- A floating waveform at the cursor.
- Edit commands ("scratch that").
- Formatting or rewrite by Claude (Prompt help already does rewriting).
- Hold-on-fn: the Carbon hotkey can't take it (research section 15).
