# F19: Drop a file on the companion to convert it (20 Oct 2026)

- **Status:** Founder decision, 20 Oct 2026. Adds to F17's "works on any app" screen features. Not to be reopened without the founder.
- **Source:** the founder, after a Tangerine reel (hold Shift while dragging a file, a circular menu of conversions): "I wanna build this into the normal screen HeyClicky feature list."

## Decision
1. **The trigger is a drop onto Companion's own windows:** the character or the island in the notch. Hold Shift while dragging anywhere is not possible: it needs key events and watching every drag (AGENTS.md rules 5 and 8). The character comes to meet a file being dragged over it only once the drag is over Companion's own window.
2. **A circular menu of what can be done with that file,** chosen by its type, all on the Mac with nothing uploaded: images (convert between PNG, JPEG, HEIC, WebP, TIFF; resize; compress), PDFs (merge, split, compress, pages to images), documents (to PDF, plain text, between Word, RTF and HTML), audio and video (the formats the Mac converts by itself; trim).
3. **Never over the original.** The result goes next to the original with a new name, never replaces it, and a Show in Finder line appears. Nothing is deleted.
4. **Built in Mac tools first.** Wider video and audio formats need ffmpeg, which has a licence question: the founder decides before it is added.
5. **Customizable** through the settings registry: on or off, default format choices, where results go (next to the original by default).
6. Off the record by nature: no file content goes to Claude or anywhere else; nothing is kept.
