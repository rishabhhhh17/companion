# F26. Type by voice into any app

- **Status:** Founder decision, 30 Oct 2026 ("do it"), after being told it changes the research's position on Wispr Flow.
- **Date:** 2026-10-30
- **Related:** F17 and F18 (hold to talk), T11 (read through Accessibility, write by paste), T13 (on device Whisper), product_research.md sections 3, 4, 10, 12, M36

## Decision
- **Squibby types by voice in any app.**
  - Hold the Type key (Option, Shift and Space unless changed in Shortcuts), speak, and let go.
  - The words are pasted where the cursor is, in the app in front.
  - It is on by default, with a switch on the Voice page ("Type by voice in any app"). It sits in the voice group, so Voice off turns it off.
- **Hold to talk is unchanged.** Its words still go to Home's ask box.

## Why
- **The founder wants it.** HeyClicky and Wispr Flow showed that people want to talk instead of type, everywhere.
- **Almost nothing new.** Squibby already had both halves:
  - Hold to talk: the light first, on device Whisper, Stop everything.
  - Prompt help's paste back: Accessibility, Edit > Paste, clipboard save and restore.
- **It costs nothing per minute,** because transcription runs on the Mac.

## What changes
- **The research said Squibby works alongside Wispr Flow and is not a competitor.** It now overlaps on dictation. Squibby's main promise is still "fix your project, with proof"; voice typing is one more reason to keep it open, not the headline.
- **Rules that hold:**
  - Rule 5: the microphone opens only while the key is held, the light comes on first, and nothing is stored.
  - Rule 8: Microphone and Accessibility are asked the first time the Type key is used, never at install, and never Input Monitoring.
  - Rule 11: Stop everything drops the words, even right before the paste.
  - Rule 13: it never presses Return, so nothing is sent.
- **What it reads:**
  - It never reads the text box. At the press it notes only which app is in front and which element has the keyboard (its identity).
  - After the paste nothing is read back, so it reads less than Prompt help.
- **What it refuses:**
  - It never types into a password box, during secure typing, or into the apps that are never read.
  - If the person moved to another app or box, the words are copied instead and the person is told.

## Revisit only if
The founder changes it, or Apple or Anthropic terms change what an app may do with Accessibility or the microphone.
