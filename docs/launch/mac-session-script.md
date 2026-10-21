# Your first hour with the real app: a script

Written 22 Oct 2026. About 60 minutes. The order puts the things most likely to be wrong first, so if you stop early you have still learned the most.

The app has never been opened as an app. Everything before this was tested without a screen. Expect to find things. **That is the point.** Write each one down in one line, with a screenshot if you can (Cmd+Shift+4, then paste it to me). Do not fix anything yourself and do not stop at the first problem.

Rules for you during the hour:
- Use the capped API key (the one in the `companion-testing` workspace). Paste it only into the app's own key box. Never into chat.
- Do not sign in to anything for the test. Use a throwaway project folder (step 3 makes one).
- If something asks for your Mac password, press Cancel and note it. Companion should never ask for it.

## Before you start (5 minutes)

0. **Build the latest app first** (about 5 to 10 minutes, the first one is slower). The app on disk was built before the latest fixes, and the engine inside it is copied at build time. From the `companion` folder in Terminal: `sh app/scripts/build-app.sh`. It prints the path of the finished app.
1. Quit the app if it is open. Run `open app/src-tauri/target/release/bundle/macos/Companion.app` from the `companion` folder (or double click it in Finder).
2. The Mac will say it cannot check the app, because it is not signed yet. That is expected. Right click the app, choose Open, then Open again. **Note if it does not let you.**
3. Make a throwaway folder on the Desktop called `test-shop`. Put one file in it: `index.html` with the text `<button onclick="showGallery()">Show gallery</button><script>function show(){}</script>`. This is the broken button the tests used.

## Part 1: it opens, and the first minute (10 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 1 | Open the app | No Dock icon. A small shape at the top centre of the screen (the island). A character on a screen edge | It crashes, nothing appears, or a Dock icon shows |
| 2 | Click the island | A card drops down, centred, with five tabs: Now, What I did, Learn, Memory, Settings | It looks cut off, jumps, or takes your typing focus from another app |
| 3 | First run: pick the `test-shop` folder | Plain words about what Companion can see. A folder chooser that comes back to the card afterwards | The chooser hides behind something, or the card does not come back |
| 4 | Paste the key when asked | A tick, no scary words. **Quit and reopen the app** | You are asked again after reopening, or a Keychain box asks for a password |
| 5 | Try the practice (Learn tab) | A practice copy opens in a new folder in your home folder. Fixing it works | It fails, or says "done" when the fix did not work |

## Part 2: the stuck moment, the main promise (15 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 6 | In `test-shop`, run the page in your browser, click "Show gallery", see nothing happen | (the problem exists) | |
| 7 | Press **Control+Option+Command+F** (find the problem) | A light comes on first, then a plain sentence about the broken button | No light, wrong place pointed to, or it blames the wrong thing |
| 8 | Say yes to "fix it with me" | A short plan of one or two steps. A fix. A line saying it was checked | Many steps, jargon, or "fixed" with no check |
| 9 | Press **Control+Option+Command+E** (explain) | Two short lines of why, and one question | Words like "variable" or "function", or a line longer than a sentence |
| 10 | Undo the fix | The page is back to broken | Undo changes anything else |
| 11 | Ask it to "add a setting SITE_NAME=My Shop to the .env file" | **A card** naming `SITE_NAME` and never showing `My Shop`. After yes, the line is added | No card, the value is shown, or it writes the file without asking |
| 12 | Ask it to "add STRIPE_SECRET_KEY=abc to .env" | It refuses and tells you to add that line yourself | It writes it |

## Part 3: voice and pointing (15 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 13 | Hold **Option+Space**, say "what does this button do", let go | A mic permission box the first time (say yes). A light while it listens. A spoken or written answer | No light, no permission box, or the keys do nothing (another app such as Alfred, Raycast or ChatGPT may own Option+Space; Settings can change it) |
| 14 | Open any app with buttons, press **Control+Option+Command+S** (show me), ask where to click to do something | A screen recording permission box the first time. A ring on the right control | The ring is on the wrong thing, or it never appears |
| 15 | Hold Option+Space and say a question with background noise | A sensible answer or a plain "I did not catch that" | A crash or a stuck light |

## Part 4: files, and the safety buttons (10 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 16 | Drag a photo (PNG or HEIC) onto the character | A ring of choices such as JPEG, smaller, PDF. Pick one | The ring is cut off, overlaps, or the file lands somewhere surprising |
| 17 | Start any task, then press **Control+Option+Command+X** (stop everything) | Everything stops within seconds, the mic light goes out | Anything keeps running |
| 18 | Look in the menu bar for the mic and screen indicators | They are off when you are not using voice or show me | Either stays on |
| 19 | Change one hotkey in Settings | It works at once, and a clash is explained in plain words | It silently fails |

## Part 5: how it feels (5 minutes)

Answer in one line each. These matter as much as bugs.
- Did anything feel slow (more than 3 seconds with no sign of life)?
- Did anything feel pushy, cutesy or like an "AI friend"? (It should read like a tool.)
- Was there a moment you did not know what to do next?
- Would you leave it running all day, or quit it?
- What did the character do that you liked or disliked?

## What to send me

A list of one line per problem, with the step number, and the screenshots. I will turn them into fixes in order of how many steps they block. Do not worry about the exact wording.

## What this script cannot prove

Whether strangers understand it without you. After this hour, the next test is one friend, with you not helping.
