# M19: Make it yours (customization that is fun)

**Decided by the founder, 28 Oct 2026:** build all eight (water colour and Home theme; Lively, Calm or Still and the character's size; sounds and the pointer's style; the notch panel and the voice). Choosing the water colour was among them, so tinting Flowflow's water is allowed (no new art).

Written 28 Oct 2026, after the founder asked for "more customizable and fun", to check HeyClicky and its newest announcements, and couldn't find Settings (fixed the same day: a Settings pill in the notch panel, Command comma in Home, and a sliders drawing instead of the cog that looked like the sun).

## What HeyClicky did (its changelog, newest first)
- **v1.1.1, 23 Oct 2026:** Home, full chat and Settings all live in the notch; agents get their own notch windows; captions of spoken words.
- **v1.0.52, 24 Sep:** a smaller notch peek you can turn off; Clickys know their own settings.
- **v1.0.51, 18 Sep:** Home resizable and remembered; replay the welcome tour; quiet mode with separate voice and cursor switches.
- **v1.0.49, 12 Sep, "Introducing Clickys":** character packs with editable looks, expressive faces and matching colours across the notch; each Clicky has a name, memory and files.
- Earlier: cursor colour picker on its own Settings page, a voice picker with spoken previews, voice speed 0.5x to 1.5x, custom shortcuts, a "See what's new" card.

## What we already have
Rename, how lively, which edge, the four groups, keys, the ring colour and lettering, the pace, text size, Home's size, peek on hover, quiet on calls, What's new, the first run again.

## The plan: one "Look and feel" place, every change seen live on Flowflow's card
Each item is a setting in the registry (T16) with a safe default, Reset and Undo, and is shown on the live card at the top of Settings as it changes.
1. **Water colour:** Ocean (today), Lagoon, Lime, Berry, Midnight. It tints Flowflow, the drop, the ring and the waterline together, like HeyClicky's matching colours.
2. **Home theme:** Night (today's black), Deep sea (navy), Paper (light).
3. **How lively:** Lively, Calm or Still, one control for the reactions and the motion.
4. **Sounds:** off unless turned on. Soft water sounds made on the Mac (no recordings): the drop leaving, the right click, done, needs you.
5. **The pointer:** water drop or a classic ring; drop size; the caption bubble lime or white.
6. **The notch panel:** choose what it shows (the hello, the work, the quick buttons), and its size.
7. **The character's size** on the edge: small, usual, large.
8. **Voice:** pick the voice and its speed, each with a spoken preview.

## How it is built
Tests first for every new setting (its default is today's behaviour, its options, that a theme keeps contrast, that colours never touch the safety marks: amber still means waiting, red still means a refusal). The full suite and the app build after each part; nothing merged without the founder.

## Decisions only the founder can make
1. Which of the eight to build.
2. Water colour changes Flowflow's look: allowed, given the founder supplies the characters? (No new art, only the water's tint.)
