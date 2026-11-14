# The 60 second video (for YC and building in public)

Written 14 Nov 2026, after M89. It replaces nothing: the 30 second clip (`demo-30s-script.md`) stays as the short cut. This one tells the new pitch from the 13 Nov research:

**"Squibby checks what your AI coding tool just did: explains every change in plain words, proves it works, and undoes it in one tap. In any tool."**

The companion parts (the notch, Flowflow) are how it feels, not what it is. Lead with the problem and the proof.

## The demo project

`docs/outreach/demo-project/make-demo.sh` makes a tiny signup page with one real bug (the email check is backwards) and three tests, two of them failing. Run it into a new folder:

```bash
sh docs/outreach/demo-project/make-demo.sh ~/Desktop/signup-demo
```

It writes only inside that folder and never touches git. Every number in the video comes from a real run on it.

## Before recording

- Squibby: Settings, turn off "Hidden from screen sharing" so the recorder sees it.
- Connect Cursor and Claude Code in "Connect your AI tools" (one yes).
- Screen recorder at 1080p or more, notch in frame. Nothing private on screen, no key in frame.

## The shots

| Time | On screen | Caption |
|---|---|---|
| 0 to 5 s | The signup page in a browser. Type a real email: "That email looks wrong." | "My AI built this. It's broken." |
| 5 to 12 s | In Cursor, type "the signup form refuses my email, fix it". Cursor works. Flowflow in the notch turns to watch. | "I asked my AI to fix it." |
| 12 to 20 s | Cursor says done. The notch lights: "2 changes to review". Hover: the per tool card, Cursor "Done", the review line in plain words. | "Squibby noticed, the moment it said done." |
| 20 to 30 s | Open the review. Watch what changed plays the file drawing. The flag: "Said it fixed the email check, also removed the password length check" (if the real run does this; never stage it). | "It explains every change in plain words." |
| 30 to 40 s | The checks go green or red for real: tests, browser check, the screenshot of the working page. | "Then it proves it. Exit codes first, then a real browser." |
| 40 to 48 s | Press Undo. The page is back exactly as before. Press the proven fix instead. | "Not happy? One tap puts it back. No git." |
| 48 to 55 s | Quick cuts: the same notch card for Claude Code, Codex, Gemini CLI. The "ask before live systems" card on `supabase db reset`. | "Claude Code, Cursor, Codex, Gemini, Copilot, Antigravity, Windsurf." |
| 55 to 60 s | Flowflow does its proud reaction. The line on screen. | "Squibby. The safety net for AI coding." |

## Rules for the video

- Only real runs. If the AI's change has no hidden extra, cut the 20 to 30 s flag and show the plain review instead. Never a mock, never a number we did not see.
- No "AI friend" words, no hype. A tool that checks the work.
- Say "Powered by Claude" at most; never style anything as Claude Code.
- The founder records and posts by hand. Nothing is posted for them.
