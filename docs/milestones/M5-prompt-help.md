# M5: Prompt help. Plan for approval

**Status:** waiting for the founder's approval. No code until approved. **Written:** 9 Oct 2026. **Source:** technical doc section 13 (read, rewrite, write back, consent), the M5 row in section 18, decision T11 and the spike (d) results (`spikes/d-paste/RESULTS.md`); product doc section 5 (the rubric). Decisions behind it: F15 (Prompt help is second in launch order; hotkey only; short clarifying questions), F07 and F11 (never watch passively, never steal focus), T11 (read through Accessibility, always write back by paste).

## What M5 is

You are typing a prompt in Claude, ChatGPT, Cursor, Lovable or anywhere else. You press one hotkey. Companion reads **only the text box you are in**, a card shows a better version with a plain diff (and at most one short question if something important is missing), and when you press accept the better version lands in the original box. Nothing is read in the background, ever. One click puts your original back.

This is the feature that helps people while they work somewhere else, and it uses the same Claude the user already brings.

## What already exists

- **Runner side, from M1:** a fast lane that streams a rewrite, a diff and one question (`assist.prompt`).
- **Spike (d):** proved on a real Mac that reading through Accessibility and pasting back works in TextEdit, Claude desktop and claude.ai (in Dia), with a banner that draws before anything is read, and refuses password fields.

What is missing is the product around them: the rewrite quality, the target kinds, the project context, the consent screens, the real Rust code (the spike was Swift) and the safety rules.

## The recommendation: split it, logic first (F15)

**M5a, the logic (about 5 to 6 working days, no permissions, no hands on needed until the end):**
1. **Rewrite quality.** The rubric from the product doc as a tested prompt, with guardrails kept in code: code, URLs, commands and pasted logs stay exactly as they were; a rough prompt may not triple in length; a "light" style that fixes clarity only. Tests check the guardrails on fixtures (a prompt with a stack trace, one with a URL, one with a command) and fail if anything was altered.
2. **Target kinds.** Claude Code, chat app, app builder (Lovable and similar) and other, each with its own small adapter: what a good prompt looks like there, how long, and how to hand it back (paste, or "copied; press Cmd+V" for terminals).
3. **Project context, only if you granted that folder.** A compact block (stack, scripts, relevant file names, house rules) built from the folder and never including file contents beyond a few short lines, with secrets removed first. No folder granted means no context.
4. **One short clarifying question at most,** shown in the card with quick answers, and a "skip" that just rewrites.
5. **The safety rules as tested Rust logic:** secure fields refused; a list of apps that are never read (password managers, banking apps you add); "the same app and field are still in front" check before pasting, otherwise copy and say so; clipboard saved and restored only when macOS will not alert; consent state (asked once per app: once, always, never).
6. **No content in logs.** A test reads every log line the feature writes and fails if any text from the field appears.
7. **An eval set** (about 30 rough prompts with the qualities a good rewrite must have) so we can measure rewrite quality instead of guessing, run on request.

**M5b, the real thing on your Mac (about 4 to 5 working days, with a hands on session of roughly 30 minutes):**
1. The hotkey, the "reading your text" banner, the Accessibility read and the paste in Rust (ported from the spike), with the accept and dismiss hotkeys held only while the card is visible.
2. The consent screens (first use of Accessibility with a plain explanation, then per app).
3. The Restore button and the focus checks in real apps: Claude desktop, ChatGPT, claude.ai and Lovable in Chrome and Safari, Cursor chat, Terminal.

Why split: M5a is almost all of the thinking and the risk, and it can be built and tested with no permission prompts and no spending. M5b is the part that touches your Mac and needs you.

## How we will know it worked

**Automatic, written first, run after every change:**
- guardrails: code, links, commands and logs come back unchanged; growth is capped; light style changes only clarity;
- no folder granted means no project context, and secrets never appear in what is sent;
- secure fields, denylisted apps and "never for this app" are refused with nothing read;
- if the user moved to another app or field, nothing is pasted and the text is copied instead, with a plain message;
- the clipboard is restored only when it is safe, and our item is marked so clipboard managers and other devices ignore it;
- no content in any log;
- the card streams its first words within about a second on a warm runner (measured with a scripted engine for the plumbing and once for real).

**Hands on (M5b):** accepted text lands in the original field in each target app; Cmd+Z, the send button and Enter behave; Terminal gives "copied; press Cmd+V"; Restore puts the original back; no permission is asked except Accessibility the first time.

## What I need from you

1. **Approve this plan** (the split is my recommendation; say "all in one" if you prefer).
2. **Nothing to install.** M5a costs nothing to build. The real Claude checks in M5b use a little of your plan; I will say before each one and you can skip any.

## Risks and plan B

- **Some apps do not expose their text box** (a few web fields). Fallback is the select-then-copy flow, native, never AppleScript. If an app allows neither, the card says so plainly and nothing is touched.
- **macOS starts alerting on clipboard reads.** We prefer the Accessibility read so the clipboard is untouched; where we must use it we skip save and restore and tell you the clipboard now holds the improved prompt.
- **A pasted prompt is followed less well than a typed one in Claude Code.** One of the [verify] items from the technical doc, checked in M5b; if it is worse, terminals stay on "copied; press Cmd+V" and we note it.

## Approval

Say **approved** (or **approved, all in one**), and I'll start with the tests for the guardrails.
