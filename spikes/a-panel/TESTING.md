# Your session for spike (a)

About 85 minutes: tests 1 to 7, then test 8, which repeats every design twice. Breaks are fine **between** tests, never inside one. Tests 4, 5, 6 and 7 share one run, so do those four in one go.

Everything else is already tested automatically (see `RESULTS.md`). These checks need your hands and eyes, because computer use can't click Panel Spike or type into Terminal and Safari. Claude ran every command on this page on this Mac before your session (pre-flight, 7 Oct 2026).

## How each step reads

- **Do:** one action.
- **Paste:** only some steps have one. Copy the grey box, click inside the Terminal window, paste with Cmd+V, then press Return (unless the step says not to).
- **See:** what should happen. If something else happens, it's a result, not your mistake: write it down and carry on.
- **Note:** the line in your notes file to fill in. A step with no Note has nothing to write.

## Rules for the whole session

1. Don't update macOS before or during the session. These results are for macOS 27.0.1.
2. During a run, use only the apps the steps name. Between runs, switching to TextEdit to write notes is fine.
3. Never fix things mid run. If something looks wrong, note the step number under "Anything odd" and carry on.
4. If you ever press Return after typing words in Terminal, no harm done: it just says "command not found".

## What the panel looks like

Panel Spike sits on the right edge of your screen. From top to bottom:

```text
Panel Spike  mode B, AFM on          <- which run this is: check it every time
Clicks on the circle: 0
Panel has keyboard: no
Front app: Terminal                  <- the app your typing goes to: watch this line
preset 0: level 3 floating, A_all_spaces  segment 0
IPC: ok
[ Type ]  in design B,  or a text box "Click here to type"  in design A
( orange circle )                    <- the character
```

"AFM on" means "first click on": the panel reacts to a click even while you're in another app. "AFM off" means it may ignore that first click.

---

## Setup (5 min)

**0.1** Do: turn on Do Not Disturb (Control Center, the two switches icon at the top right of the menu bar, then Focus, then Do Not Disturb).
See: a moon icon in the menu bar.

**0.2** Do: open the Terminal app. Press Cmd+Space, type `Terminal`, press Return.
See: a Terminal window with a prompt. Use this window for every paste, not the terminal inside the Claude app.

**0.3** Do: in Terminal's menu bar choose **Window**, then **Move & Resize**, then **Left**.
See: Terminal fills the left half of the screen, so the panel on the right never covers it. (If that menu item isn't there, drag the window to the left half.)

**0.4** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/set-launch.sh b 1 0
```
See: `launch.json: {"mode":"b","afm":true,"preset":0}`. This makes the Finder launch in test 1 use design B.

**0.5** Paste:
```bash
[ -e ~/Documents/panel-spike-notes.txt ] || sed -n '/^PANEL SPIKE NOTES/,/^END OF NOTES/p' ~/Desktop/companion/spikes/a-panel/TESTING.md > ~/Documents/panel-spike-notes.txt; open -e ~/Documents/panel-spike-notes.txt
```
See: TextEdit opens **panel-spike-notes.txt**, which holds the notes sheet from the bottom of this page. It's saved in your Documents folder, outside the repo. Pasting this again later reopens your notes and never wipes them.

**0.6** Do: in the notes, replace the ___ after "Started at" with the time now, and press Cmd+S.

**0.7** Optional: press Cmd+Shift+5, choose **Record Entire Screen**, set Options, Save to: **Documents**, then click Record. Never save a recording in the companion folder.

**0.8** Do: click inside the Terminal window.
See: the menu bar (the app name next to the Apple logo) says **Terminal**.

---

## Test 1. Opening it never interrupts you (5 min)

**1.1** Paste this, but **do not press Return yet**:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; sleep 4; open --env PANEL_MODE=b --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the command sits on the prompt line, not running yet.

**1.2** Do: press Return, then straight away type any sentence, without stopping, for about 10 seconds.
See: after about 5 seconds the panel appears on the right edge, the menu bar keeps saying Terminal the whole time, and your sentence keeps appearing in Terminal.
Note: 1a.

**1.3** Do: move the pointer to the bottom edge of the screen so the Dock shows.
See: no new icon in the Dock.
Note: 1b.

**1.4** Do: read the sentence you typed in Terminal.
See: every letter is there.
Note: 1c.

**1.5** Do: press Ctrl+C.
See: a fresh prompt line.

**1.6** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh
```
See: the panel disappears.

**1.7** Do: click the Finder icon in the Dock (move the pointer to the bottom edge first).
See: the menu bar says **Finder**.

**1.8** Do: press Cmd+Shift+G.
See: a "Go to Folder" box.

**1.9** Paste this into **that box** (not into Terminal), then press Return:
```text
~/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/
```
See: a Finder window showing **Panel Spike**.

**1.10** Do: double click **Panel Spike**.
See: within 2 seconds the panel appears on the right edge, its top line says **mode B, AFM on**, and the menu bar keeps saying **Finder**.
Note: 1d, 1e, 1f.

**1.11** Do: move the pointer to the bottom edge of the screen so the Dock shows.
See: no new icon in the Dock.
Note: 1g.

Leave Panel Spike running. The next test's first paste stops it.

---

## Test 2. Clicking the character never steals your typing (12 min)

Four runs, in this order: **B1, B0, A0, A1**. Each run is: click Terminal, paste the start command, then do the **click routine** below.

### The click routine (K1 to K6)

**K1** Do: press **Ctrl+Option+Cmd+R**.
See: within a second, "Clicks on the circle" shows 0, the segment number on the small line goes up by one, and "Front app" says Terminal.

**K2** Do this 10 times: type one word in Terminal, then click the orange circle once.
See: each click adds one to "Clicks on the circle", and "Front app" keeps saying Terminal.
If "Front app" changes away from Terminal: add 1 to your tally for line **c**, click once inside the Terminal window, and carry on with the next word.

**K3** Do: look at the panel.
Note: line **b** (the number after "Clicks on the circle"), line **c** (your tally, 0 if none), line **e** (did "Panel has keyboard" ever say YES).

**K4** Do: read the words you typed in Terminal.
Note: line **d** (are any letters missing).

**K5** Do: click inside the Terminal window.

**K6** Do: press Ctrl+C.
See: a fresh prompt line.

### Run 2.1: B1

**2.1.1** Do: click inside the Terminal window.

**2.1.2** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: within 2 seconds the panel appears, and its top line says **mode B, AFM on**. It has a **Type** button.
Note: 2.1 a.

**2.1.3** Do: the click routine, K1 to K6.
Note: 2.1 b to e.

### Run 2.2: B0

**2.2.1** Do: click inside the Terminal window.

**2.2.2** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=0 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode B, AFM off**.
Note: 2.2 a.

**2.2.3** Do: the click routine, K1 to K6. In this run the count may stay at 0. That's a finding, not a bug.
Note: 2.2 b to e.

### Run 2.3: A0

**2.3.1** Do: click inside the Terminal window.

**2.3.2** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=0 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode A, AFM off**. It has a text box instead of a Type button.
Note: 2.3 a.

**2.3.3** Do: the click routine, K1 to K6.
Note: 2.3 b to e.

### Run 2.4: A1

**2.4.1** Do: click inside the Terminal window.

**2.4.2** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode A, AFM on**.
Note: 2.4 a.

**2.4.3** Do: the click routine, K1 to K6. This design failed in earlier tests, so "Front app" may leave Terminal often. Keep tallying and keep going.
Note: 2.4 b to e.

---

## Test 3. Typing into the panel, then Esc hands typing back (10 min)

Never click Terminal between typing `test` and pressing Esc.

### 3a. Card by button

**3.1** Do: click inside the Terminal window.

**3.2** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode B, AFM on**.

**3.3** Do: press **Ctrl+Option+Cmd+R**.
See: the segment number goes up by one.

**3.4** Do: type one word in Terminal.
See: it appears in Terminal.

**3.5** Do: click the panel's **Type** button.
See: a small card titled "Type here" appears to the left of the panel, with a blinking cursor. The card says "Card has keyboard: YES". "Front app" still says Terminal.
Note: 3a1, 3a2.

**3.6** Do: without clicking anything, type `test`.
See: `test` appears in the card, and "Front app" still says Terminal.
Note: 3a3, 3a4.

**3.7** Do: press **Esc**.
See: the card disappears.
Note: 3a5.

**3.8** Do: without clicking anything, type one word.
See: it appears in Terminal.
Note: 3a6.

**3.9** Do: click inside the Terminal window.

**3.10** Do: press Ctrl+C.
See: a fresh prompt line.

### 3b. Card by hotkey (same run)

**3.11** Do: press **Ctrl+Option+Cmd+R**.
See: the segment number goes up by one.

**3.12** Do: type one word in Terminal.

**3.13** Do: press **Ctrl+Option+Cmd+K**.
See: the card appears with a blinking cursor and "Card has keyboard: YES". "Front app" still says Terminal.
Note: 3b1, 3b2.

**3.14** Do: without clicking anything, type `test`.
See: `test` appears in the card, and "Front app" still says Terminal.
Note: 3b3, 3b4.

**3.15** Do: press **Esc**.
See: the card disappears.
Note: 3b5.

**3.16** Do: without clicking anything, type one word.
See: it appears in Terminal.
Note: 3b6.

**3.17** Do: click inside the Terminal window.

**3.18** Do: press Ctrl+C.

### 3c. Clicking inside the card (same run)

The real ask box will get clicked, so this one matters most.

**3.19** Do: press **Ctrl+Option+Cmd+R**.

**3.20** Do: type one word in Terminal.

**3.21** Do: press **Ctrl+Option+Cmd+K**.
See: the card appears with a blinking cursor and "Card has keyboard: YES".
Note: 3c1, 3c2.

**3.22** Do: click once inside the card's text box.
See: "Front app" still says Terminal.
Note: 3c3.

**3.23** Do: type `test`.
See: `test` appears in the card.
Note: 3c4.

**3.24** Do: press **Esc**.
See: the card disappears.
Note: 3c5.

**3.25** Do: without clicking anything, type one word.
See: it appears in Terminal.
Note: 3c6.

**3.26** Do: click inside the Terminal window.

**3.27** Do: press Ctrl+C.

### 3d. Design A by hotkey only (new run)

Don't click the panel at all in this part.

**3.28** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode A, AFM on**.
Note: 3d1.

**3.29** Do: press **Ctrl+Option+Cmd+R**.

**3.30** Do: type one word in Terminal.

**3.31** Do: press **Ctrl+Option+Cmd+K**.
See: a blinking cursor in the panel's own text box, "Panel has keyboard: YES", and "Front app" still says Terminal.
Note: 3d2, 3d3.

**3.32** Do: type `test`.
See: `test` appears in the panel's text box, and "Front app" still says Terminal.
Note: 3d4, 3d5.

**3.33** Do: press **Esc**.
See: the cursor leaves the panel's text box, and "Panel has keyboard" says no.
Note: 3d6.

**3.34** Do: without clicking anything, type one word.
See: it appears in Terminal.
Note: 3d7.

**3.35** Do: click inside the Terminal window.

**3.36** Do: press Ctrl+C.

---

## Test 4. Over full screen apps (8 min)

This run carries on through tests 4, 5, 6 and 7. Don't restart it.

**4.1** Do: click inside the Terminal window.

**4.2** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode B, AFM on**.

**4.3** Do: press **Ctrl+Option+Cmd+R**.
See: the segment number goes up by one.

**4.4** Do: open Safari. Press Cmd+Space, type `Safari`, press Return.
See: a Safari window in front.

**4.5** Do: press **Ctrl+Cmd+F**.
See: Safari fills the whole screen. (If it doesn't, click the green circle at the top left of the Safari window.)

**4.6** Do: look at the right edge of the screen.
See: the panel, on top of Safari.
Note: 4a.

**4.7** Do: only if the panel is **not** there, press **Ctrl+Option+Cmd+P**, wait 2 seconds and look again. Repeat until it appears, at most 9 times.
See: the panel appears. Its small line starts with "preset" and a number.
Note: 4b (that number; "none" if it never appeared; "not needed" if it was there in 4.6).

**4.8** Do: click the orange circle 3 times.
See: Safari stays full screen and in front, and "Front app" says Safari.
Note: 4c, 4d.

**4.9** Do this 5 times: press Ctrl+Cmd+F to leave full screen, press Ctrl+Cmd+F again to go back in, then look for the panel.
See: the panel is there each time Safari is back in full screen.
Note: 4e (how many of the 5 times it was there).

**4.10** Do: switch to Terminal with Cmd+Tab.
See: the Terminal window.

**4.11** Do: press **Ctrl+Cmd+F**.
See: Terminal fills the whole screen.

**4.12** Do: look at the right edge of the screen.
See: the panel, on top of Terminal.
Note: 4f.

**4.13** Do: click the orange circle 3 times.
See: Terminal stays full screen, and "Front app" says Terminal.
Note: 4g.

**4.14** Do: press **Ctrl+Cmd+F**.
See: Terminal leaves full screen. Safari stays in full screen, for test 5.

---

## Test 5. Desktops and Stage Manager (8 min)

**5.1** Do: press **Ctrl+Option+Cmd+R**.
See: the segment number goes up by one.

**5.2** Do: press **Ctrl+Up arrow**.
See: Mission Control: your windows spread out, with a row of desktops at the top.

**5.3** Do: move the pointer to the top of the screen.
See: the row of desktops grows, and a **+** appears at the far right.

**5.4** Do: click the **+**.
See: a new desktop in the row.

**5.5** Do: click the **+** again.
See: Desktop 1, Desktop 2, Desktop 3 and Safari in the row.

**5.6** Do: press Esc.
See: Mission Control closes.

**5.7** Do: press **Ctrl+Right arrow** again and again until you reach the last desktop, then **Ctrl+Left arrow** back to the first, looking at the panel each time. Do this whole round twice.
See: on every desktop, including Safari's full screen one, the panel is in the same place, with no flicker longer than a blink.
Note: 5a, 5b, 5c.

**5.8** Do: press **Ctrl+Up arrow**.
See: Mission Control. The panel stays as it is (good), rather than turning into a small window thumbnail (bad).
Note: 5d.

**5.9** Do: press Esc.

**5.10** Do: press Ctrl+Right arrow until you see Safari's full screen desktop.

**5.11** Do: press **Ctrl+Cmd+F**.
See: Safari leaves full screen.

**5.12** Do: turn on **Stage Manager**: Control Center (the two switches icon), then **Stage Manager**. (If it isn't there: System Settings, Desktop & Dock, Stage Manager.)
See: your windows move into a strip of thumbnails on the left.

**5.13** Do: look at the panel.
See: it's on the right edge, and it is not in the strip on the left.
Note: 5e, 5f.

**5.14** Do: press **Ctrl+Option+Cmd+P** once at a time until the small line ends with **B_all_spaces_all_apps**.
See: that text on the small line.

**5.15** Do: look at the panel.
See: it's on the right edge, and not in the strip.
Note: 5g, 5h.

**5.16** Do: turn Stage Manager off the same way you turned it on.
See: your windows go back to normal.

**5.17** Do: press **Ctrl+Up arrow**, then move the pointer to the top of the screen.
See: the row of desktops.

**5.18** Do: hover over Desktop 3 and click the **x** that appears on it.
See: Desktop 3 is gone.

**5.19** Do: hover over Desktop 2 and click the **x** that appears on it.
See: Desktop 2 is gone.

**5.20** Do: press Esc.

---

## Test 6. Dock positions and screen size (7 min)

**6.1** Do: press **Ctrl+Option+Cmd+R**.
See: the segment number goes up by one.

**6.2** Do: open System Settings (Apple menu, System Settings).

**6.3** Do: click **Desktop & Dock** in the sidebar.

**6.4** Do: turn **off** "Automatically hide and show the Dock". Then watch the panel for 2 seconds.
See: the Dock stays visible at the bottom, and the panel doesn't cover any part of it.
Note: 6a.

**6.5** Do: set "Position on screen" to **Right**. Then watch the panel for 2 seconds.
See: the Dock moves to the right edge, and within 2 seconds the panel moves to sit left of it. The panel never ends up under the Dock.
Note: 6b, 6c.

**6.6** Do: set "Position on screen" back to **Bottom**.
See: the panel moves back to the right edge.

**6.7** Do: turn "Automatically hide and show the Dock" back **on**.

**6.8** Do: click **Displays** in the sidebar.

**6.9** Do: click **More Space** (the resolution choice furthest to the right). Confirm if asked.
See: everything gets smaller. The panel is fully on screen, on the right edge.
Note: 6d.

**6.10** Do: click **Default**.
See: back to normal. The panel is fully on screen, on the right edge.
Note: 6e.

**6.11** Do: connect a second screen if you have one: plug in a monitor, or use an iPad (Control Center, Screen Mirroring, your iPad, then "Use as Separate Display" if asked). If you have neither, write "not run" in 6f and 6g and go to test 7.
See: the Mac's desktop extends onto the second screen.

**6.12** Do: press **Ctrl+Option+Cmd+M**.
See: the panel moves onto the second screen.
Note: 6f.

**6.13** Do: unplug the monitor's cable (or for an iPad: Control Center, Screen Mirroring, click your iPad to disconnect).
See: within 2 seconds the panel is back on the right edge of the Mac's own screen.
Note: 6g.

---

## Test 7. Permissions (3 min)

**7.1** Do: in System Settings, click **Privacy & Security** in the sidebar.

**7.2** Do: click **Accessibility**.
See: a list of apps. Panel Spike is **not** in it.
Note: 7a.

**7.3** Do: click the back arrow at the top left.

**7.4** Do: click **Input Monitoring**.
See: Panel Spike is not in the list.
Note: 7b.

**7.5** Do: click the back arrow.

**7.6** Do: click **Screen & System Audio Recording**.
See: Panel Spike is not in the list.
Note: 7c.

**7.7** Do: click the back arrow.

**7.8** Do: click **Microphone**.
See: Panel Spike is not in the list.
Note: 7d.

**7.9** Do: click the back arrow.

**7.10** Do: click **Automation**.
See: Panel Spike is not in the list.
Note: 7e.

**7.11** Do: close System Settings (Cmd+Q).

**7.12** Do: think back over today.
See: no box ever asked for a permission for Panel Spike.
Note: 7f.

---

## Test 8. Every design twice (24 min)

Eight runs, in two rounds. Each round goes **A0, A1, B0, B1**. One lucky or unlucky run can't decide the verdict this way.

Every run is the same: click Terminal, paste that run's start command, do the **click routine** (K1 to K6, in test 2), then the **type routine** below.

### The type routine (T1 to T7)

**T1** Do: press **Ctrl+Option+Cmd+K**.
See: in design A, a blinking cursor in the panel's own text box and "Panel has keyboard: YES". In design B, the card appears to the left of the panel with a blinking cursor and "Card has keyboard: YES". Either way, "Front app" still says Terminal.
Note: line **f** (a blinking cursor appeared).

**T2** Do: click once inside the text box that has the cursor.
Note: line **g** (did "Front app" change away from Terminal when you clicked).

**T3** Do: type `test`.
See: `test` appears in that text box.
Note: line **h**.

**T4** Do: press **Esc**.
See: in design A, the cursor leaves the panel's text box and "Panel has keyboard" says no. In design B, the card disappears.
Note: line **i**.

**T5** Do: without clicking anything, type one word.
See: it appears in Terminal.
Note: line **j**.

**T6** Do: click inside the Terminal window.

**T7** Do: press Ctrl+C.
See: a fresh prompt line.

### Round 1

**8.1** A0. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=0 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode A, AFM off**. Note: 8.1 a. Then do K1 to K6 and T1 to T7. Note: 8.1 b to j.

**8.2** A1. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode A, AFM on**. Note: 8.2 a. Then do K1 to K6 and T1 to T7. Note: 8.2 b to j.

**8.3** B0. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=0 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode B, AFM off**. Note: 8.3 a. Then do K1 to K6 and T1 to T7. Note: 8.3 b to j.

**8.4** B1. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode B, AFM on**. Note: 8.4 a. Then do K1 to K6 and T1 to T7. Note: 8.4 b to j.

### Round 2

**8.5** A0. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=0 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode A, AFM off**. Note: 8.5 a. Then do K1 to K6 and T1 to T7. Note: 8.5 b to j.

**8.6** A1. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode A, AFM on**. Note: 8.6 a. Then do K1 to K6 and T1 to T7. Note: 8.6 b to j.

**8.7** B0. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=0 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode B, AFM off**. Note: 8.7 a. Then do K1 to K6 and T1 to T7. Note: 8.7 b to j.

**8.8** B1. Click inside the Terminal window, then paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=1 "$HOME/Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/Panel Spike.app"
```
See: the top line says **mode B, AFM on**. Note: 8.8 a. Then do K1 to K6 and T1 to T7. Note: 8.8 b to j.

---

## Finish (3 min)

**9.1** Paste:
```bash
~/Desktop/companion/spikes/a-panel/scripts/stop.sh
```
See: the panel disappears.

**9.2** Do: if you recorded the screen, click the stop button in the menu bar.
See: the recording is saved in Documents.

**9.3** Do: turn off Do Not Disturb.

**9.4** Do: in TextEdit, fill in "Finished at", then press Cmd+S.

**9.5** Do: in TextEdit, press Cmd+A, then Cmd+C, and paste the notes into the chat with Claude.

Leave the log alone (the `dev.companion.spike.panel` folder in Application Support). Claude runs the analysis on it.

---

## Notes sheet

Step 0.5 copies everything between the two marker lines below into `~/Documents/panel-spike-notes.txt`. Replace every ___ with yes, no, a number, or not run.

```text
PANEL SPIKE NOTES  (after each colon, answer yes, no, a number, or not run; Cmd+S saves)
Started at (time): ___
Finished at (time): ___
Did you use any other app (Excel, WhatsApp, a browser) during a run: ___

TEST 1  Opening it
1a  Terminal launch: menu bar kept saying Terminal: ___
1b  Terminal launch: a new icon appeared in the Dock: ___
1c  Terminal launch: every letter you typed is there: ___
1d  Finder launch: panel appeared on the right edge: ___
1e  Finder launch: top line said mode B, AFM on: ___
1f  Finder launch: menu bar kept saying Finder: ___
1g  Finder launch: a new icon appeared in the Dock: ___

TEST 2  Clicking the character
2.1 B1  a  top line said mode B, AFM on: ___
2.1 B1  b  clicks counted on the panel (0 to 10): ___
2.1 B1  c  times Front app left Terminal (0 to 10): ___
2.1 B1  d  any typed letters missing: ___
2.1 B1  e  "Panel has keyboard" ever said YES: ___
2.2 B0  a  top line said mode B, AFM off: ___
2.2 B0  b  clicks counted on the panel (0 to 10): ___
2.2 B0  c  times Front app left Terminal (0 to 10): ___
2.2 B0  d  any typed letters missing: ___
2.2 B0  e  "Panel has keyboard" ever said YES: ___
2.3 A0  a  top line said mode A, AFM off: ___
2.3 A0  b  clicks counted on the panel (0 to 10): ___
2.3 A0  c  times Front app left Terminal (0 to 10): ___
2.3 A0  d  any typed letters missing: ___
2.3 A0  e  "Panel has keyboard" ever said YES: ___
2.4 A1  a  top line said mode A, AFM on: ___
2.4 A1  b  clicks counted on the panel (0 to 10): ___
2.4 A1  c  times Front app left Terminal (0 to 10): ___
2.4 A1  d  any typed letters missing: ___
2.4 A1  e  "Panel has keyboard" ever said YES: ___

TEST 3  Typing, then Esc
3a1  button: card appeared with a blinking cursor: ___
3a2  button: card said "Card has keyboard: YES": ___
3a3  button: test appeared in the card: ___
3a4  button: Front app said Terminal the whole time: ___
3a5  button: card disappeared after Esc: ___
3a6  button: word after Esc appeared in Terminal: ___
3b1  hotkey: card appeared with a blinking cursor: ___
3b2  hotkey: card said "Card has keyboard: YES": ___
3b3  hotkey: test appeared in the card: ___
3b4  hotkey: Front app said Terminal the whole time: ___
3b5  hotkey: card disappeared after Esc: ___
3b6  hotkey: word after Esc appeared in Terminal: ___
3c1  click in card: card appeared with a blinking cursor: ___
3c2  click in card: card said "Card has keyboard: YES": ___
3c3  click in card: Front app still said Terminal after your click: ___
3c4  click in card: test appeared in the card: ___
3c5  click in card: card disappeared after Esc: ___
3c6  click in card: word after Esc appeared in Terminal: ___
3d1  A by hotkey: top line said mode A, AFM on: ___
3d2  A by hotkey: blinking cursor in the panel's text box: ___
3d3  A by hotkey: "Panel has keyboard" said YES: ___
3d4  A by hotkey: test appeared in the panel's text box: ___
3d5  A by hotkey: Front app said Terminal the whole time: ___
3d6  A by hotkey: after Esc, "Panel has keyboard" said no: ___
3d7  A by hotkey: word after Esc appeared in Terminal: ___

TEST 4  Full screen
4a  Safari full screen: panel visible straight away: ___
4b  first preset number that made it visible (or none, or not needed): ___
4c  after 3 clicks, Safari still full screen and in front: ___
4d  Front app said Safari during the clicks: ___
4e  times the panel was there after re-entering full screen (0 to 5): ___
4f  Terminal full screen: panel visible: ___
4g  after 3 clicks, Terminal still full screen and Front app said Terminal: ___

TEST 5  Desktops and Stage Manager
5a  panel in the same place on every desktop: ___
5b  any flicker longer than a blink: ___
5c  panel visible on Safari's full screen desktop: ___
5d  panel turned into a thumbnail in Mission Control: ___
5e  Stage Manager: panel visible on the right edge: ___
5f  Stage Manager: panel joined the strip on the left: ___
5g  with B_all_spaces_all_apps: panel visible on the right edge: ___
5h  with B_all_spaces_all_apps: panel joined the strip on the left: ___

TEST 6  Dock and screen size
6a  Dock auto hide off: panel covered part of the Dock: ___
6b  Dock on the right: panel moved left of it within 2 seconds: ___
6c  Dock on the right: panel ever ended up under the Dock: ___
6d  More Space: panel fully on screen at the right edge: ___
6e  Default: panel fully on screen at the right edge: ___
6f  second screen: panel moved onto it with the hotkey: ___
6g  second screen unplugged: panel back on the Mac's screen within 2 seconds: ___

TEST 7  Permissions
7a  Panel Spike listed under Accessibility: ___
7b  Panel Spike listed under Input Monitoring: ___
7c  Panel Spike listed under Screen & System Audio Recording: ___
7d  Panel Spike listed under Microphone: ___
7e  Panel Spike listed under Automation: ___
7f  any permission prompt for Panel Spike at any time today: ___

TEST 8  Every design twice
8.1 A0  a  top line said mode A, AFM off: ___
8.1 A0  b  clicks counted (0 to 10): ___
8.1 A0  c  times Front app left Terminal during the clicks: ___
8.1 A0  d  any typed letters missing: ___
8.1 A0  e  "Panel has keyboard" said YES during the clicks: ___
8.1 A0  f  after the hotkey, a blinking cursor appeared: ___
8.1 A0  g  Front app left Terminal when you clicked in the text box: ___
8.1 A0  h  test appeared in the text box: ___
8.1 A0  i  Esc took the cursor away (A) or hid the card (B): ___
8.1 A0  j  word after Esc appeared in Terminal: ___
8.2 A1  a  top line said mode A, AFM on: ___
8.2 A1  b  clicks counted (0 to 10): ___
8.2 A1  c  times Front app left Terminal during the clicks: ___
8.2 A1  d  any typed letters missing: ___
8.2 A1  e  "Panel has keyboard" said YES during the clicks: ___
8.2 A1  f  after the hotkey, a blinking cursor appeared: ___
8.2 A1  g  Front app left Terminal when you clicked in the text box: ___
8.2 A1  h  test appeared in the text box: ___
8.2 A1  i  Esc took the cursor away (A) or hid the card (B): ___
8.2 A1  j  word after Esc appeared in Terminal: ___
8.3 B0  a  top line said mode B, AFM off: ___
8.3 B0  b  clicks counted (0 to 10): ___
8.3 B0  c  times Front app left Terminal during the clicks: ___
8.3 B0  d  any typed letters missing: ___
8.3 B0  e  "Panel has keyboard" said YES during the clicks: ___
8.3 B0  f  after the hotkey, a blinking cursor appeared: ___
8.3 B0  g  Front app left Terminal when you clicked in the text box: ___
8.3 B0  h  test appeared in the text box: ___
8.3 B0  i  Esc took the cursor away (A) or hid the card (B): ___
8.3 B0  j  word after Esc appeared in Terminal: ___
8.4 B1  a  top line said mode B, AFM on: ___
8.4 B1  b  clicks counted (0 to 10): ___
8.4 B1  c  times Front app left Terminal during the clicks: ___
8.4 B1  d  any typed letters missing: ___
8.4 B1  e  "Panel has keyboard" said YES during the clicks: ___
8.4 B1  f  after the hotkey, a blinking cursor appeared: ___
8.4 B1  g  Front app left Terminal when you clicked in the text box: ___
8.4 B1  h  test appeared in the text box: ___
8.4 B1  i  Esc took the cursor away (A) or hid the card (B): ___
8.4 B1  j  word after Esc appeared in Terminal: ___
8.5 A0  a  top line said mode A, AFM off: ___
8.5 A0  b  clicks counted (0 to 10): ___
8.5 A0  c  times Front app left Terminal during the clicks: ___
8.5 A0  d  any typed letters missing: ___
8.5 A0  e  "Panel has keyboard" said YES during the clicks: ___
8.5 A0  f  after the hotkey, a blinking cursor appeared: ___
8.5 A0  g  Front app left Terminal when you clicked in the text box: ___
8.5 A0  h  test appeared in the text box: ___
8.5 A0  i  Esc took the cursor away (A) or hid the card (B): ___
8.5 A0  j  word after Esc appeared in Terminal: ___
8.6 A1  a  top line said mode A, AFM on: ___
8.6 A1  b  clicks counted (0 to 10): ___
8.6 A1  c  times Front app left Terminal during the clicks: ___
8.6 A1  d  any typed letters missing: ___
8.6 A1  e  "Panel has keyboard" said YES during the clicks: ___
8.6 A1  f  after the hotkey, a blinking cursor appeared: ___
8.6 A1  g  Front app left Terminal when you clicked in the text box: ___
8.6 A1  h  test appeared in the text box: ___
8.6 A1  i  Esc took the cursor away (A) or hid the card (B): ___
8.6 A1  j  word after Esc appeared in Terminal: ___
8.7 B0  a  top line said mode B, AFM off: ___
8.7 B0  b  clicks counted (0 to 10): ___
8.7 B0  c  times Front app left Terminal during the clicks: ___
8.7 B0  d  any typed letters missing: ___
8.7 B0  e  "Panel has keyboard" said YES during the clicks: ___
8.7 B0  f  after the hotkey, a blinking cursor appeared: ___
8.7 B0  g  Front app left Terminal when you clicked in the text box: ___
8.7 B0  h  test appeared in the text box: ___
8.7 B0  i  Esc took the cursor away (A) or hid the card (B): ___
8.7 B0  j  word after Esc appeared in Terminal: ___
8.8 B1  a  top line said mode B, AFM on: ___
8.8 B1  b  clicks counted (0 to 10): ___
8.8 B1  c  times Front app left Terminal during the clicks: ___
8.8 B1  d  any typed letters missing: ___
8.8 B1  e  "Panel has keyboard" said YES during the clicks: ___
8.8 B1  f  after the hotkey, a blinking cursor appeared: ___
8.8 B1  g  Front app left Terminal when you clicked in the text box: ___
8.8 B1  h  test appeared in the text box: ___
8.8 B1  i  Esc took the cursor away (A) or hid the card (B): ___
8.8 B1  j  word after Esc appeared in Terminal: ___

ANYTHING ODD  (step number, then what you saw)
- ___
- ___
- ___
- ___
- ___
END OF NOTES
```
