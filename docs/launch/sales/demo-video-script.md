# Demo video scripts (60 seconds and 3 minutes)

Drafted 20 Oct 2026. Nothing here may be filmed until the founder's hands on session is done, because the ring, the card and the voice have only been tested by machine, never seen on a real screen. These scripts are written so that **every second is a real recording of the real app on a real Mac**. If a step does not work on the day, cut the shot or the sentence. Do not fake it, do not re-stage it, do not speed up a slow wait without showing a visible "sped up" label.

## Rules for the recording

1. **Use the practice projects, unedited.** They live in `app/sample/` and are copied by the app into a new folder in the home folder (first run offers them; the Learn tab lists them). Film the copy the app makes, not a hand prepared one.
2. **No fake data.** The email in the signup test (`sam@example.com`) is the project's own test value, fine to show. No invented names, user counts, savings or review quotes on screen. No cost number is spoken unless it is read live from the receipt on screen.
3. **Real Claude, real key, a throwaway.** Use an Anthropic key with a small credit, created for the recording. Never show the key. Do not film the Keychain or the key screen with the value visible.
4. **Show the light.** When the screen look happens, the light must be visible in frame. That is the privacy point, so do not crop it out.
5. **Show failures honestly.** If the first try fails, keep it, or re-record the whole take and say nothing about luck. Do not splice a failed fix into a success.
6. **Real time or labelled.** The practice takes about 2 to 3 minutes of machine time (estimate; not measured). In the 60 second version, speed up the waiting with an on screen label "sped up". In the 3 minute version, cut waiting with a visible cut mark, or leave real time.
7. **Voice over in plain words.** No "revolutionary", "game changer", "magic". Say what happens.
8. **Captions on.** Most viewers watch without sound.
9. Record at the Mac's native size, with the dock icons you would normally have. Hide notifications. Do not show other apps' private windows.
10. Name: say "Companion, the working name". Never "Claude Code". "Powered by Claude" is allowed.

## Before filming (one time)

- Signed installer or the dev build, fresh macOS user account, no leftover settings.
- Permissions: do the Screen Recording and Accessibility grants off camera, then film from the point they are given (or film the plain permission ask once, because "asks only when needed" is a selling point).
- Node and Git installed.
- Run each practice once off camera to learn the real wait times and the real receipt cost. Do not film the first run unless it is also the take you will use.

---

## Version A: 60 seconds ("The Join button")

**Practice used:** `stuck-signup` ("A Join button that fails"). Cause: the page sends the email to an address the server does not serve, so Join says "Something went wrong". Companion's own check (`node --test`) fails at `test/signup.test.js` line 17 with the message that pressing Join sends the email to a path that returned a 404 or similar. [Read the real message off the screen when filming; do not paraphrase it in captions unless it matches.]

| Time | On screen | Voice over (plain) | Needs |
|---|---|---|---|
| 0:00 to 0:06 | The practice signup page in a browser. Click Join. The page shows "Something went wrong". | "This signup page has a Join button that fails. If you built it with AI, you know this feeling." | Real page |
| 0:06 to 0:12 | Caption: "Stuck?" Hands on the keys; a key cap graphic of Control, Option, Command and F appears as they press. | "I press one key." | Key overlay (graphic only) |
| 0:12 to 0:22 | The light comes on. The card opens: "Found it", the failing test, the file and line. A ring on the failing line if the ring works on the real screen. | "It runs the project's own checks and finds the failing line. It tells me the cause in two sentences. The light shows me when it looks at my screen." | Card, light, optional ring |
| 0:22 to 0:34 | The card: "Fix it". Small step. Diff of one line. Wait is sped up with the label. | "I let it fix it. One small change, in my project folder only. It saved a copy of my files first." | Real fix, label "sped up" |
| 0:34 to 0:44 | The check runs and passes. The receipt shows: what changed, what proved it, a before and after picture of the page, the cost read from the receipt. | "Now it proves it. The checks pass, and it shows the page before and after. It only says done when it is shown." | Real receipt, real cost |
| 0:44 to 0:50 | The two "why" lines. | "And two lines on why it broke, so I know next time." | Real text from the app |
| 0:50 to 0:55 | Click Undo. Files return. Brief. | "If I do not like it, Undo puts my files back." | Real Undo |
| 0:55 to 1:00 | End card: "Companion (working name). Mac. Your own Claude." and the early access line. | "You bring your own Claude. It is an early build for Mac." | End card |

**Do not include:** the on screen drawing, the voice, the lessons, or the file drop in the 60 second cut. Too many things. One loop, done properly.

**If the ring does not work on the real screen on the day:** skip it. The card with the file and line is true and enough.

---

## Version B: 3 minutes ("Stuck, fixed, proven, and what it will not do")

**Practices used:** `stuck-signup` (main), `stuck-setting` (a missing setting, shows "never sees the value"), `stuck-open-table` (the pre launch safety check). Three practices, three different ideas.

### Part 1: The problem (0:00 to 0:20)

| Time | On screen | Voice over |
|---|---|---|
| 0:00 to 0:10 | A real chat with a builder or with Claude where you asked three times for a fix. Use a real recording of yourself, or a real session on a practice project. Do not stage fake chat. | "You are building with AI. Something breaks. You ask for a fix. It says fixed. It is not." |
| 0:10 to 0:20 | Title: "Companion (working name)". The signup page, Join fails. | "Companion is a Mac app for that moment." |

### Part 2: Find, fix, prove (0:20 to 1:30)

| Time | On screen | Voice over |
|---|---|---|
| 0:20 to 0:35 | Press the key. Light on. Card opens with the cause and the failing line. | "Press one key. It runs your project's own checks and finds the failing line. It does not watch you in between. It looks only when you press." |
| 0:35 to 0:50 | The card's Settings, privacy section, for 5 seconds: the three permissions and "asked the first time". | "It asks for each Mac permission only when a feature needs it, and says why." |
| 0:50 to 1:05 | Fix starts. The diff of one line. A snapshot line ("saved a copy"). | "It works in small steps. Before each step it saves a copy of your files." |
| 1:05 to 1:20 | Checks pass. Receipt shows before and after pictures of the page. | "Then proof. Your checks, then a hidden browser opens your page. If it could not check, the receipt says partly checked. It does not say done." |
| 1:20 to 1:30 | Explain lines. | "And two lines on why, so you learn the cause." |

### Part 3: Undo, Stop and limits (1:30 to 2:00)

| Time | On screen | Voice over |
|---|---|---|
| 1:30 to 1:40 | Click Undo. Files return. The card says "Undone" with what was restored. | "Undo puts it back. It uses its own copies. It never touches your git history." |
| 1:40 to 1:50 | Start a task, press Control, Option, Command, X. Everything stops. | "One key stops everything: the task, the screen look, the microphone." |
| 1:50 to 2:00 | On screen text card: "Limits: Undo does not cover files your project ignores. Best on common web projects." | "It is not magic. It is best on common web project problems. Here is what it cannot do." |

### Part 4: A setting, and a check before you go live (2:00 to 2:30)

| Time | On screen | Voice over |
|---|---|---|
| 2:00 to 2:15 | `stuck-setting`: the shop page will not start. Card says the page needs a setting and the value is yours to add. It shows where (`.env.local`). Cut to the person typing the value in their own editor, not on camera. | "Sometimes the fix is a setting. It tells you where it goes. It never asks for the value and never sees it." |
| 2:15 to 2:30 | `stuck-open-table`: "Check before shipping" finds the table made without row level security, pointing at the migration file and line. No database touched. | "Before you go live it checks your database files. Here a table anyone could read." |

### Part 5: Show me where to click, and the file drop (2:30 to 2:50) [only after hands on, otherwise cut]

| Time | On screen | Voice over |
|---|---|---|
| 2:30 to 2:42 | A lesson step with a ring on a real button and the "just do it" button visible. Only if a lesson is verified on the real app that day; otherwise use the practice's step card. | "When you need to click, it shows where, waits for your click, and moves on." |
| 2:42 to 2:50 | Drag a PNG onto the companion; ring of choices; choose JPEG; result appears next to the original under a new name. | "And drop a file on it to convert it. It happens on your Mac and nothing is uploaded." |

### Part 6: Close (2:50 to 3:00)

| Time | On screen | Voice over |
|---|---|---|
| 2:50 to 3:00 | End card: name, "Mac, Apple Silicon. Early build." and the early access link. Small line: "You bring your own Claude; Companion never sells or resells it." | "You bring your own Claude. It is an early build for Mac. If you want to try it, here is where to ask." |

---

## Shot list (for either cut)

1. Wide screen recording of the practice page with Join failing (browser).
2. Key cap overlay (Control, Option, Command, F) as a graphic. Do not film the keyboard if it shows other keys being pressed.
3. The light coming on, full frame, so the privacy point is visible.
4. The card: cause, file and line.
5. The ring (only if it works on the real screen).
6. The diff of one line and the "saved a copy" step.
7. The check output: failing, then passing.
8. The receipt: before and after pictures of the app, proof line, cost.
9. Explain lines.
10. Undo, and the "Undone" text.
11. Stop everything.
12. (3 minute) Setting practice; open table practice.
13. (3 minute, if verified) lesson ring; file drop.
14. End card.

## Things to check against reality before filming

- Real wait time for the signup practice. The catalog estimates 2 minutes and about $0.20 (`app/sample/practices.json`), and says those are estimates until a real run measures them. Replace with the measured values or say nothing about time or cost.
- The failing message text on the card. Read it, use it.
- That the receipt really shows before and after pictures for the signup practice (browser check). If the browser check needs its one time download (about 100 MB), either do it off camera or say so.
- That Undo restores the exact file, and what the card says.
- That the light is visible in the recorded frame.

## Things the video must not claim

- "Works with Lovable/Cursor/Replit" as pointing inside their web pages. Not tried on real pages yet.
- Any number of users, any testimonial, any press.
- That it is faster than another tool, or better than HeyClicky. We did not test theirs.
- "It never fails". The verdict says it fails on odd layouts and unusual apps.
- Voice, unless filmed and working: the microphone permission and the 148 MB model download have never been tried by a person.
- Pricing.
