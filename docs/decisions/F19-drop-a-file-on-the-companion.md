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

## How it is built (M11, 20 Oct 2026)
- **Where the drop is seen:** Tauri's own drop events on the character's window and the island only (`convert.rs`, wired in `main.rs` setup). A drag over one of them lights it; nothing watches drags anywhere else and nothing reads keys. Home keeps its own page drop, which adds a file to the ask box as before. A drop on the island opens Home, where its choices are.
- **The menu:** a ring of round choices around the character (`dropRing.tsx`, `role="menu"`), and the same choices as a list on Home's Now tab, because the character's window never takes the keyboard (rule 9). Home is also where a trim's two times are typed; Trim on the ring opens Home for them. The character grows and lights while a file is over it, and only lights with reduced motion.
- **The actions:** pictures convert between PNG, JPEG, HEIC and TIFF (WebP is offered only when `sips --formats` says this Mac can write it; on macOS 27.0.1 it can read WebP but not write it), resize (longest side 1024, 1600 or 2400 pixels, never made bigger) and compress (JPEG, or HEIC for a HEIC). PDFs merge (several dropped), split into one PDF per page, compress (the Mac's Reduce File Size filter) and save each page as a picture. Documents (Word, RTF, HTML, plain text, old Word, OpenDocument text) go to PDF, plain text, Word, RTF and HTML. Sound goes between M4A, WAV and AIFF and can be trimmed; video between MP4 and MOV, keep only the sound, and trim. Several files of one kind get each action on each file; trim is one file at a time.
- **The tools:** `sips`, `textutil` (always with `-noload`, so an HTML file never fetches anything), `afconvert`, `avconvert`, and one fixed PDFKit script run by `osascript -l JavaScript` for the PDF jobs and for printing a document to PDF. All are argument lists with absolute paths, never a shell string, with a plain environment. No new dependency, no ffmpeg.
- **Never over the original:** each tool writes into a private work folder in the Mac's temporary folder; the result is then put next to the original (or in Downloads or on the Desktop, from Settings) under the first free name, "photo (converted).png", then "photo (converted 2).png", by a link or a copy made new that fails rather than replace a file. A split or pages to pictures makes a new folder, "report (pages)". The dropped file is checked again (a regular file, not a link, readable) just before each tool runs. The work folder is removed after every job; nothing else is ever deleted.
- **Stop:** one job at a time, with progress (results done, and the tool's own percentage when it gives one). The menu's Stop and Stop everything end the tool; nothing half made is put anywhere.
- **Settings** (section Dropped files, `drop.*`): Drop a file on the character to convert it (on), the format offered first for pictures, documents, sound and video, the resize size, how much to compress, and where new files go (next to the original).
- **Off the record:** the pages get the files' names only, never their paths; nothing goes to the engine, Claude or the network; the activity log names no file.

## Not proven (needs a real Mac)
- Dropping a real file from Finder on the character and on the island in the built app: that Tauri's drop events arrive on these borderless, non activating panels, that the hover lights, and that a drop on the island opens Home.
- The ring's look and fit in the character's 160 point window at every edge, VoiceOver reading the ring and the list, and the keyboard on Home's list.
- Video conversion, Keep only the sound and trim on a real video, and how long a long video takes. Pictures, documents to HTML and PDF, PDF merge, split, compress and pages to pictures, and sound conversion and trim ran for real on files in a temporary folder in the tests; Show in Finder did not run in a test.
- A result going to Downloads or the Desktop, and a folder Companion cannot write to.
