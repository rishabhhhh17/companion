# M20: Alive (physics on the side, a drop that follows you, the logo in the notch, Settings inside Home)

**Decided by the founder, 28 Oct 2026:** the character feels "very still when it's from the sides", it needs physics and to be fun; the logo on the notch does not look right; Settings must not open in a separate window, it belongs inside. On following the pointer: "it depends on the user if they want the whole of Flowflow to come or a part of it, so use some water based tool that works as a pointer, and if they don't want it, it won't be there". The logo goes inside the notch, in lime.

## Why it feels still today
- Flowflow only sees the pointer while it is over its own small window (160 points), so its eyes almost never follow you.
- The window slides in and out on a curve, but the water inside does not feel the motion: no lag, no squash, no splash on arrival.
- With nothing happening it only breathes.

## Part A
1. **Follow my pointer** (a new setting, chosen in the first run's Make it yours and in Settings): **Its eyes** (the usual: Flowflow's eyes and body lean toward the pointer anywhere on the screen), **A drop of water** (Part B), or **Off**. The shell reads only where the pointer is, a few times a second, only while the character is visible, never stored, never what is on screen.
2. **Physics from the window itself:** the page feels its own window move (a peek, a trip to a window, a drag) and the water lags behind like jelly, squashes as it stops and wobbles, with a splash of droplets when it comes in from the edge and a stretch toward the edge as it hides.
3. **Life when nothing happens** (Lively only): now and then it glances around, blinks, does a small hop or a ripple; never while you type in Home, never with Calm or Still, never with less motion.
4. **The logo inside the notch:** at rest the black of the notch grows a little on each side, and the sun sits on that black, in lime, sharp on any wallpaper, like HeyClicky's notch.
5. **Settings inside Home:** the gear, Command comma and the notch's Settings button all open Settings inside Home (the Character, Powers, Your Mac, Account and More side list and Flowflow's card). The separate Settings window is no longer opened from anywhere.

## Part B
6. **A drop that follows you:** with "A drop of water" chosen, a small drop of Flowflow's water trails the pointer on a spring, squashing with speed and settling beside it when the pointer stops. It is its own tiny window that never takes clicks or the keyboard. It hides during screen sharing like the rest, at Stop everything, while a pointer ring is up, and when the setting is off.

## How it is built
Tests first: the setting and its default, the gaze maths (pointer to eye direction, limited reach), the window physics (lag, settle, no runaway), the idle schedule (never while typing, none when calm or still), the notch shape at rest, the drop's spring and where it may go. The full suite and the app build after each part; nothing merged without the founder.
