# The second hands on Mac session (plan, 27 Oct 2026)

What M15 changed has passed every automatic test, but none of it has been seen on a real Mac yet. This session checks it by eye, one step per message, the way session 1 ran (docs/status/2026-10-26-mac-session-1.md). Use a throwaway project folder and a capped test key. About 45 minutes.

## Before
- Turn off "Hidden from screen sharing" in Settings, so screenshots show Squibby.
- To see the first run as a new person: Home remembers on this Mac that the first run was finished. The cleanest way to be new is a second macOS user account. Whether Delete everything in Settings also starts the first run again is not checked yet, so it is not the plan; nothing is deleted without asking.

## Steps, in order

| # | What to do | What should happen | Checks |
|---|---|---|---|
| 1 | Open Squibby for the first time | Home opens by itself under the notch, without taking the keyboard from the app in front | Wave 1 |
| 2 | Watch the recorded fix | Five steps, about 15 seconds: Join fails, the line, one change, the check turns green, Undo. Flowflow acts it out and splashes on green. It says it is a recording | Wave 1 |
| 3 | Press "Try it on my project", then "Get a key" | Anthropic's console page opens in your browser | Wave 1 |
| 4 | Paste a wrong key, then the real one | Wrong: a plain "did not accept" line and Continue stays off. Right: "Anthropic accepted your key" | Wave 1 |
| 5 | Pick the folder; open "Make it yours"; press "Skip and start" | Home's main screen, nothing else asked | Wave 1 |
| 6 | Drop the project folder on Flowflow, pick "Fix this" | It becomes the project; Find the problem runs | Wave 1 |
| 7 | Fix something small | The notch wings show the working arc; green chips under the receipt for each check; the screenshot; the done bounce in the notch | Waves 1, 3 |
| 8 | Press Undo on the receipt | The icon spins back, "Put back as it was", the files are as before | Wave 3 |
| 9 | Hover the notch while idle; move the pointer into the screen edge beside Flowflow | The peek from the notch; Flowflow comes in from the edge and tucks away a few seconds after | m15/fun |
| 10 | Pull the Wi-Fi, ask something | One plain sentence, nothing about engines, exit codes or git | Wave 2 |
| 11 | Settings window: "Walk me through it" on a lesson | Home opens and that lesson starts | Wave 2 |
| 12 | Turn on Reduce motion; repeat 2 and 7 | Nothing moves; the recording waits for Next step | Waves 1, 3 |

## What to tell us after each step
Did it happen? How did it feel: fun, calm, confusing, slow? A screenshot when something looks wrong.

## Still open after this session
- Whether a window fully past the screen edge is allowed by macOS (step 9).
- Battery and GPU use with live Flowflow on, over an hour.
- Pricing (left for later by the founder).
