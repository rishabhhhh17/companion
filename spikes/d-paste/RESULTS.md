# Spike (d) results: read and paste text in other apps (7 to 8 Oct 2026)

**Status:** shortened by the founder's decision. Reading, pasting and the password refusal passed in the three places below, and the white indicator, reported missing at first in Claude desktop and Dia, is fixed (see finding 0). Not yet tried over a true full screen app. The rest of the original test list moves into the Prompt help milestone (M5) as per app checks. No API key and no paid Apple account were needed.

## Headline

**Reading a typed prompt and replacing it works instantly, with no fallback needed, in every place we tried.** Every read succeeded on the first, plain Accessibility read (3 to 31 ms). Every paste replaced the text exactly (107 to 161 ms), restored the clipboard, and left the app in front. A password field is refused with nothing logged. The only permission asked was Accessibility, once, under the name Paste Spike.

## Environment

macOS 27.0.1 (26A434), MacBook Pro, Apple Silicon. A Swift app (no Tauri, no AI call), signed with the founder's free Apple Development certificate so the Accessibility grant survives rebuilds. Browser: Dia (Chromium based), which is the founder's browser.

## Results

| Place | Read | Paste | Notes |
|---|---|---|---|
| TextEdit | Exact, first try, 3 to 31 ms | Exact, 126 ms | Plain text document |
| Claude desktop | Exact, first try, 14 ms | Exact, 161 ms | The ladder's other steps (role retry, Electron switch) were not needed |
| claude.ai in Dia | Exact, first try, 15 ms | Exact, 107 and 122 ms | Rich editor; replaced correctly, including the link, a code span, an emoji and a Hindi word |
| Dia's address and chat bar | Exact, first try, 3 ms | Exact, 122 ms | |
| Password field (GitHub login in Dia) | Refused: marked secure, nothing returned | Nothing pasted | No length, hash or text in the log |

"Exact" means the fingerprint of the text read back after pasting equals the expected fingerprint. The log holds only lengths and a 6 byte hash, never text.

## What we learned

0. **The visible indicator was not seen in Claude desktop or Dia at first (founder report, 8 Oct 2026); now fixed and seen.** Two causes found. (a) My code read the other app straight after showing the banner, so the banner never got a moment to draw, and when a read was slow (5.9 s of retries on a page with no text box) the main thread was blocked and nothing drew until the end. Fix: let the run loop draw for 0.15 s before reading. (b) In macOS, turning on a panel's floating flag resets its level to 3, so a level set earlier is lost; set the level last. After both fixes, at level 25 (status bar), the banner stayed on screen for 5 s after a successful read in Dia, and the log probe agrees (visible, on the active Space, level 25). Not separated: whether level 3 would also have worked after fix (a); the indicator was seen at level 3 in the nothing-read case. **Still to test in M2:** over a true full screen app, at the lowest level that works (T01 [verify]).
1. **Held modifier keys merge with keys we send.** Our first accept sent Cmd+A while the founder's Ctrl and Option were still down, so macOS saw our own accept hotkey, and the old text was not replaced. Fix: select everything through Accessibility (set the selected range) and send keys from a private event source that ignores held keys. It also removed a 2 second wait for modifiers to lift: paste went from 2.0 to 2.6 s down to about 120 ms.
2. **A global Esc catches every Esc press on the Mac while a result is waiting.** An Esc typed elsewhere cancelled a pending read 100 seconds later. The product must hold Esc only while its own card is on screen, and time out after a few seconds.
3. **The Accessibility prompt appears on the first read hotkey and nowhere else.** No other permission prompt was reported.
4. **Keep the target in front.** Pressing the hotkey while another app was in front read that app instead. The app records which app it read, and refuses to paste if the front app or focused field changed (built; the "copied instead" path was not exercised by hand).
5. **Clipboard** was restored every time (the spike saved it, wrote our text marked transient, pasted, then restored if nothing else had changed it).

## Not run, moving to M5 as per app checks

Google Chrome, Safari, the ChatGPT app, Cursor chat and Lovable (the founder uses Dia); selecting one word; Send button and Enter after pasting; Cmd+Z restoring the original; an image copied before the test surviving; switching apps between read and accept; Terminal with Claude Code (copy only); the clipboard privacy alert test and Spotlight clipboard history. The macOS 27.2 caution in T11 stays: don't update until the clipboard alert is checked.

## [verify] items settled

- Web fields in a Chromium browser (claude.ai) are readable on the first press: **yes, in Dia.** Other browsers not tested.
- Chromium password inputs report the secure flag: **yes, in Dia** (role text field, secure).
- The read is exact for text with a link, a code span, an emoji and a Hindi word.
