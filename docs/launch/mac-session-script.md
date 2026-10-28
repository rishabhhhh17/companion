# Your first hour with the real app: a script

Written 22 Oct 2026. About 60 minutes. The order puts the things most likely to be wrong first, so if you stop early you have still learned the most.

The app has never been opened as an app. Everything before this was tested without a screen. Expect to find things. **That is the point.** Write each one down in one line, with a screenshot if you can (Cmd+Shift+4, then paste it to me). Do not fix anything yourself and do not stop at the first problem.

Rules for you during the hour:
- Use the capped API key (the one in the `companion-testing` workspace). Paste it only into the app's own key box. Never into chat.
- Do not sign in to anything for the test. Use a throwaway project folder (step 3 makes one).
- If something asks for your Mac password, press Cancel and note it. Squibby should never ask for it.

## Before you start (5 minutes)

0. **Build the latest app first** (about 5 to 10 minutes, the first one is slower). The app on disk was built before the latest fixes, and the engine inside it is copied at build time. From the `companion` folder in Terminal: `sh app/scripts/build-app.sh`. It prints the path of the finished app.
1. Quit the app if it is open. Run `open app/src-tauri/target/release/bundle/macos/Squibby.app` from the `companion` folder (or double click it in Finder).
2. The Mac will say it cannot check the app, because it is not signed yet. That is expected. Right click the app, choose Open, then Open again. **Note if it does not let you.**
3. Make a throwaway folder on the Desktop called `test-shop`. Put one file in it: `index.html` with the text `<button onclick="showGallery()">Show gallery</button><script>function show(){}</script>`. This is the broken button the tests used.

## Part 1: it opens, and the first minute (10 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 1 | Open the app | No Dock icon. A small shape at the top centre of the screen (the island). A character on a screen edge | It crashes, nothing appears, or a Dock icon shows |
| 2 | Click the island | A card drops down, centred, with five tabs: Now, What I did, Learn, Memory, Settings | It looks cut off, jumps, or takes your typing focus from another app |
| 3 | First run: pick the `test-shop` folder | Plain words about what Squibby can see. A folder chooser that comes back to the card afterwards | The chooser hides behind something, or the card does not come back |
| 4 | Paste the key when asked | A tick, no scary words. **Quit and reopen the app** | You are asked again after reopening, or a Keychain box asks for a password |
| 5 | Try the practice (Learn tab) | A practice copy opens in a new folder in your home folder. Fixing it works | It fails, or says "done" when the fix did not work |

## Part 2: the stuck moment, the main promise (15 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 6 | In `test-shop`, run the page in your browser, click "Show gallery", see nothing happen | (the problem exists) | |
| 7 | Press **Control+Option+Command+F** (find the problem) | A light comes on first, then a plain sentence about the broken button | No light, wrong place pointed to, or it blames the wrong thing |
| 8 | Say yes to "fix it with me" | A short plan of one or two steps. A fix. A line saying it was checked | Many steps, jargon, or "fixed" with no check |
| 9 | Select an error message with the mouse (for example the red text in a Terminal or a browser console, or paste one into TextEdit and select it), then press **Control+Option+Command+E** (explain a selected error) | A light first, then two short plain lines about what the error means and where it is in your project, with Show me where and Fix it buttons | Words like "variable" or "function", a line longer than a sentence, or nothing on screen at all |
| 9b | Click in an app with nothing selected (try Cursor or VS Code too), then press **Control+Option+Command+E** again | Always a plain line in the card, never silence: that nothing could be read and to select the text and try again (or that Accessibility is off, or that Squibby itself is in front) | The key does nothing visible, or the card shows a stuck "Reading" line for more than five seconds |
| 10 | Undo the fix: press Undo on the receipt on Now, or open What I did and press Undo this task on the newest task that changed files | The page is back to broken. Older tasks in What I did show a line saying only the newest task has Undo and why | Undo changes anything else, or an older task has an Undo button |
| 10b | Ask a plain question, such as "what does this page do?" | The answer sits under a heading called Answer, not What changed | The heading says What changed for an answer that changed no files |
| 11 | Ask it to "add a setting SITE_NAME=My Shop to the .env file" | **A card** naming `SITE_NAME` and never showing `My Shop`. After yes, the line is added | No card, the value is shown, or it writes the file without asking |
| 12 | Ask it to "add STRIPE_SECRET_KEY=abc to .env" | It refuses and tells you to add that line yourself | It writes it |

## Part 3: voice and pointing (15 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 13 | Hold **Option+Space**, say "what does this button do", let go | A mic permission box the first time (say yes). A light while it listens. A spoken or written answer | No light, no permission box, or the keys do nothing (another app such as Alfred, Raycast or ChatGPT may own Option+Space; Settings can change it) |
| 14 | Open any app with buttons, press **Control+Option+Command+S** (show me), say out loud where to click to do something, then press the same keys again | The light comes on first and the card says it is listening (a microphone permission box the first time, then press again). The second press ends it, then a screen recording permission box the first time, and a ring on the right control. With voice off, no speech model, or the microphone not allowed yet, the key opens the question box instead (type your question there) | The ring is on the wrong thing or never appears, the light is not on while it listens, or the key listens when Stop everything was pressed |
| 15 | Hold Option+Space and say a question with background noise | A sensible answer or a plain "I did not catch that" | A crash or a stuck light |

## Part 4: files, and the safety buttons (10 minutes)

| Step | You do | You should see | Write down if |
|---|---|---|---|
| 16 | Drag a photo (PNG or HEIC) onto the character | A ring of choices such as JPEG, smaller, PDF. Pick one | The ring is cut off, overlaps, or the file lands somewhere surprising |
| 17 | Start any task, then press **Control+Option+Command+X** (stop everything) | Everything stops within seconds, the mic light goes out | Anything keeps running |
| 18 | Look in the menu bar for the mic and screen indicators | They are off when you are not using voice or show me | Either stays on |
| 19 | Change one hotkey in Settings, once from the short list and once by ticking Control, Option, Shift or Command and choosing the key from the list under "Or pick any keys" (it needs two ticks, one of them Control or Command) | It works at once, and a clash is explained in plain words | It silently fails, or a chord with one tick is accepted |
| 20 | Open Home, drag in a PDF with real text (a bank letter or an invoice), then a Word file and an Excel sheet, and ask "what is the total?" with Start | Each shows as a chip with its KB of text; the answer uses what is in them. A scanned PDF says it has no text to read; a long one says only its start goes | A chip is missing, the answer ignores the file, or anything waits more than a few seconds |
| 21 | Join a test call in Zoom or FaceTime with Hide from screen sharing on, share your screen, and ask Squibby something with Speak to me on | Your shared screen shows no character, ring or Home; while the call app is in front Squibby does not speak | Any of them shows in the share, or it speaks over the call |

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
