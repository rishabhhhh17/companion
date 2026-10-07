# Your session for spike (a): about 45 minutes

Everything else is already tested automatically (see `RESULTS.md`). These checks need your hands and eyes: computer use can't click Panel Spike or drive Terminal and Safari.

**Before you start:** quit or pause anything that might pop up. Keep Wispr Flow running as usual (we want to know the panel works next to it). Record your screen with Cmd+Shift+5 if you can, and save the recording **outside the repo** (for example in Documents).

Open Terminal and go to the spike folder once:

```bash
cd ~/Desktop/companion/spikes/a-panel
```

Each test below starts Panel Spike with one command. The panel appears on the right edge of your screen: a box with a readout and an orange circle (the "character").

---

## 1. Opening it never interrupts you (3 min)

1. Type this in Terminal, but **don't press Return yet**:
   ```bash
   ./scripts/stop.sh; sleep 4; open --env PANEL_MODE=a "src-tauri/target/release/bundle/macos/Panel Spike.app"
   ```
2. Press Return, then **immediately keep typing** any sentence. The prompt line is fine; Ctrl+C it afterwards.
3. Watch: the menu bar still says **Terminal**, no new icon appears in the Dock, every letter you typed is there.
4. Then open it from Finder: in Finder, go to `Desktop/companion/spikes/a-panel/src-tauri/target/release/bundle/macos/` and double click **Panel Spike**. (Run `./scripts/stop.sh` first.) The menu bar should stay **Finder**, with no Dock icon.

## 2. Clicking never steals your typing (8 min)

**Already known:** design A with first click on **fails** on macOS 27. While I was testing, clicks on its panel made Panel Spike the active app four times (the tauri-nspanel issue 123 bug). So run these in this order: **B on, B off, then A off** (to learn whether the first click setting is the trigger). Skip "A, first click on".

For each run:

1. Start it with the command for that run (stop first, every time):

   | Run | Command |
   |---|---|
   | A, first click on | `./scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=1 "src-tauri/target/release/bundle/macos/Panel Spike.app"` |
   | A, first click off | `./scripts/stop.sh; open --env PANEL_MODE=a --env PANEL_AFM=0 "src-tauri/target/release/bundle/macos/Panel Spike.app"` |
   | B, first click on | `./scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=1 "src-tauri/target/release/bundle/macos/Panel Spike.app"` |
   | B, first click off | `./scripts/stop.sh; open --env PANEL_MODE=b --env PANEL_AFM=0 "src-tauri/target/release/bundle/macos/Panel Spike.app"` |

2. Click into Terminal. Press **Ctrl+Option+Cmd+R** (starts a fresh count).
3. Type a sentence, and **click the orange circle 10 times while typing**, between words.
4. Watch: every letter lands in Terminal; the menu bar always says Terminal; the readout's "Panel has keyboard" stays **no**.
5. Run `python3 scripts/analyze.py --expect-clicks 10` and note the C1, C3 or C4, and C5 lines.

Expected surprise: with design B and first click **off**, clicks may not count at all (the panel never takes the keyboard, so every click is a "first click"). That's a finding, not a bug.

## 3. Typing into the panel, then Esc hands typing back (6 min)

This is the macOS 27 bug check (tauri-nspanel issue 123). Design A's text box already failed it (clicking it made Panel Spike the active app), so the question is whether design B's separate card works.

- **Design B:** start run "B, first click on". Click the panel's **Type** button, type `test` in the card that appears, press **Esc**: the card disappears and your next letters go to Terminal. Repeat once with **Ctrl+Option+Cmd+K** instead of the button.
- **Design A, hotkey only:** start "A, first click on", click Terminal, press **Ctrl+Option+Cmd+K** (no click on the panel), type `test`, press Esc, keep typing. This tells us whether taking the keyboard by hotkey is safe even though clicking isn't.
- Run `python3 scripts/analyze.py` after each and note C1, C3 or C4, and C6.

## 4. Over full screen apps (8 min)

Start run "B, first click on". The readout shows the preset, for example "0: level 3 floating, A_all_spaces".

1. Make **Safari** full screen (green button). Is the panel visible on top?
2. If not, press **Ctrl+Option+Cmd+P** to step through the presets until it shows up. Note the first preset number that works.
3. With it visible, click the orange circle. Safari must stay full screen (no jump to another desktop).
4. Do the same with **Terminal** full screen.
5. Leave full screen and enter it again **5 times** (Ctrl+Cmd+F). The panel should still be there each time.

## 5. Spaces and Stage Manager (8 min)

1. Open Mission Control (F3) and add two desktops with the **+** at the top right (three in total).
2. Swipe between all desktops and the full screen app. The panel should stay in the same place on each, with no flicker longer than a blink.
3. Open Mission Control: the panel should not turn into a thumbnail.
4. Turn **Stage Manager** on (Control Center). The panel should stay visible and not join the strip on the left. Press Ctrl+Option+Cmd+P until the preset name says **B_all_spaces_all_apps** and check again. Turn Stage Manager off.
5. Remove the two extra desktops afterwards if you like.

## 6. Dock positions and screen size (5 min)

1. System Settings, Desktop & Dock: turn **auto hide off**. Restart the run. The panel should sit above the Dock, never under it.
2. Move the Dock to the **right** edge. The panel should sit left of it.
3. System Settings, Displays: choose **More Space**, then back to Default. The panel should stay fully on screen.
4. Put your Dock settings back the way you like them (auto hide on, bottom).
5. If you can borrow an external monitor: press Ctrl+Option+Cmd+M to move the panel onto it, then unplug the cable. The panel should come back to the built in screen within 2 seconds.

## 7. Permissions (2 min)

System Settings, Privacy & Security: Panel Spike must **not** appear under Accessibility, Input Monitoring, Screen & System Audio Recording, Microphone or Automation. Also: did any permission prompt appear at any point today? It shouldn't have.

---

## When you're done

```bash
./scripts/stop.sh
python3 scripts/analyze.py --run all > ~/Documents/panel-spike-analysis.txt
```

Then tell me what you saw for each numbered section (a few words each is enough, for example "3A: menu bar switched to Panel Spike"). I'll read the log, write `RESULTS.md`, and correct the docs.
