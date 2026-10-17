# T13. Voice transcribed on the device with Whisper

- **Status:** Accepted from research; open items checked in M0 spike (f), or in M2 if the founder picks the lean M0 plan. Updated 7 Oct 2026 after desk research and review.
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 13; section 15 (also sections 18, 19 and 20); M0-desk-research-details.md section (f)
- **Related:** F07, F11, T01

## Decision
Voice uses on device Whisper (whisper.cpp through Rust bindings) behind a hold to talk hotkey. No cloud speech.

## Why
- Claude takes images, PDFs and text, not audio (section 15).
- Claude Code's own `/voice` dictation streams audio to Anthropic, needs a claude.ai login, does not work with an API key, and is a terminal feature, not an SDK call (section 15).
- No per minute cost, and the same code runs on Windows. It covers about 99 languages including Hindi (section 15).
- It integrates an existing open model; it is not a voice engine of our own (product_research.md section 4).

## Alternatives considered
- Cloud speech to text, or a voice engine of our own: dropped because of per minute cost (product_research.md section 11).
- Claude Code's own dictation: needs a claude.ai login.
- Apple SpeechAnalyzer and SpeechTranscriber: need macOS 26 and launched with about 10 languages, no Hindi.
- Windows built in dictation: its grammar runs on a Microsoft web service.

## What this means for the build
Details are in technical_research.md section 15. Rules a coding agent must never miss:
- Default model: `base` or `small`, quantized (for example base-q5_1 about 57 MiB, small-q5_1 about 181 MiB; full precision base 142 MiB, small 466 MiB). It downloads when the user turns voice on, never bundled in the DMG.
- Read Handy (MIT, v0.9.8, Tauri, React and Rust) before writing the voice module. Use the Tauri global shortcut plugin, which needs no permission, not Handy's default `handy-keys` event tap, which needs Accessibility.
- Key down opens the microphone and the character shows Listening; key up closes it. The transcript appears in the ask box. No wake word. The kill switch hotkey also closes the microphone.
- The hotkey is a normal key plus modifiers: the permission free Carbon path cannot register fn or a modifier held alone.
- Add `NSMicrophoneUsageDescription` to `Info.plist` and `com.apple.security.device.audio-input` to the entitlements file, because Tauri turns on the hardened runtime. Ask on first use; treat all zero buffers as "microphone blocked".
- Recovery for a missing microphone entry: `tccutil reset Microphone <Companion bundle id>`, never without the bundle id (that resets every app on the Mac), then a full quit and relaunch.
- The ask box accepts paste and never swallows Cmd+V, so Wispr Flow and macOS Dictation work. Test both.
- Speaking back is off by default; the opt in uses `AVSpeechSynthesizer` system voices.
- Spike (f) passes when hold to talk gives text in under about one second after release for a short sentence with `base` (section 18).

## Settled by the build (9 Oct 2026)
- whisper-rs 0.16.0 with Metal builds and runs on this Mac (macOS 27, Apple Silicon). The base model (147,951,465 bytes, SHA-256 60ed5bc3...2efe, checked against Hugging Face's own record) is downloaded once into Companion's folder by the Mac's own `curl` and kept only if size and fingerprint match.
- A spoken sentence made with the Mac's `say` came back word for word. Loading the model takes a few seconds, so it is loaded while the person is still holding the keys; transcribing a 3 second sentence then takes about 0.18 seconds (target was about 1 second). The model is let go after five idle minutes.
- The global shortcut plugin reports key down and key up, so hold to talk needs no permission beyond the microphone. Default keys: Control, Option, Command and V. (Changed by F18 on 17 Oct 2026: two keys, Option and Space by default, with a short list of other chords in Settings; `talkkeys.rs`.)
- Still to do by a person: the microphone permission prompt and a real voice through a real microphone.

## Settled by the build (17 Oct 2026, M11 wave 4 item 2: voice settings)
Build details inside this record's decision, not changes to it. Rules in `voiceset.rs` and `voicewords.rs`, tested without a microphone, a speaker or any sound; Settings rows in Home's Settings tab, Talking and listening.
- **Kept on this Mac** in `voice.json` in Companion's folder (delete everything removes it with the other settings): the voice, the speed, the microphone and the language. A damaged or odd file gives the Mac's own choice for that part, never an error.
- **The voice.** Settings lists the Mac's installed voices (`AVSpeechSynthesisVoice speechVoices`: name, language, quality), the Mac's own language first, best quality first, without novelty or personal voices. Nothing picked means the Mac's own voice. A picked voice that is gone (removed in System Settings) is replaced by the best one in the same language, then the same language from another place, else the Mac's own, and Settings names which one is gone and what speaks instead. A Hear it button says one sample line, only when pressed.
- **The speed.** Five steps, 0.5x to 1.5x. Normal is the Mac's own default rate; half speed is halfway from it to `AVSpeechUtteranceMinimumSpeechRate`, one and a half times halfway to the maximum (`voiceset::rate_for`).
- **Speaking back stays off by default.** Two switches, both off until turned on: Speak to me (the short lines, as before) and Answer out loud when I ask by voice: the whole short answer (up to 600 characters; a longer one is said up to a sentence, then "The rest is on the card.") to a question sent while the box still held the words from hold to talk, for ten minutes and once, and only the answer of the kind asked: a Show me's lines for a Show me, the research answer for Research it, a finished task's result for a task. Only an answer new on the card counts, so an older one still shown never stands in for it, and a lesson's lines are never said whole. A rescue is started by its button, never by voice, so it is not said this way. The same rules as every spoken line: no secrets, no web addresses read out, never during a call, card only.
- **The Mac's sound off.** Spoken lines were always shown on the card too. Now, when the Mac is muted, its volume is at zero or no output device is there (read from Core Audio, read only, no permission), nothing is said, and the card says once "Your Mac's sound is off, so I am showing the words only."; Settings shows the same in its own words while it is off.
- **The microphone.** Settings lists the Mac's input devices (cpal, by Core Audio's lasting device id). Nothing picked means the Mac's default, read again at every press, so Companion follows it when it changes. A picked microphone that is not connected at a press means the default listens, with one plain line, said once each time it goes away. While the keys are held, a microphone that goes away (Bluetooth headphones switched off) is replaced by the picked one, else the default, else any other, never by itself again; one that reports a changed rate (cpal's `StreamInvalidated`; a Bluetooth headset switching to its microphone mode does) is opened again. cpal's `DeviceChanged` (rerouted, still running), an overload and anything else keep listening. At most four reopenings per hold; what was heard before is kept, and the card says in one line that another microphone took over or that the microphone went away. The light still comes first and the microphone still closes on let go, Stop everything or after a minute.
- **The project's own words.** Whisper's initial prompt gets a short list of the open project's names: package names from `package.json` (the only file opened, at most 512 KB, never a version, a script or any value), the setting names the project check reported (names only), then folder and file names up to three levels deep (at most 4000 entries, never hidden files, `.env` files, names that sound private or anything inside a folder whose name does, links, or folders such as `node_modules`), at most 40 names and 320 characters, each checked by the secret checks. Only on this Mac; the log records how many words, never which. A transcript that only repeats the list in its order is not taken as what was said.
- **The language.** Automatic by default (the model tells which language it hears); a short list in Settings (English, Hindi, Spanish and 18 more) fixes it.

## Open [verify] items
- **[verify]** the release event still fires when the user lets go of the modifier before the main key (with Option and Space: Option first), and whether a Space still held then types spaces into the app in front.
- **[verify] Launch blocker.** With ChatGPT, Raycast, Alfred or Superwhisper holding Option and Space, whether macOS refuses Companion's registration (then the launch notice shows and Settings greys the chord out) or both apps get it and only one receives the press. The global shortcut library registers without the exclusive flag (global-hotkey 0.8.0 passes options 0 to RegisterEventHotKey), so a refusal is expected only when the other app asked for the keys exclusively. If both get it, nothing in Companion notices: the launch check and the Settings free check (`talkkeys::free`) both rely on a refusal. Until this is settled, Settings, the first run and INSTALL.md name those three apps and tell the person to pick other keys if one stops opening or talking does nothing. The answer decides whether that warning is enough for the launch or the default must change.
- **[verify]** whether the Mac's hot key service repeats the press while the keys are held. Handled either way (`talkkeys::Held` ignores repeats), but the answer tells whether that code is needed.
- **[verify]** whether `SpeechTranscriber` supports Hindi on macOS 27; print `supportedLocales` on the founder's Mac.
- **[verify] Voice settings, on a real Mac (none of it was run: no app was opened, nothing was said, no microphone was used).** That the voice list shows the voices System Settings shows, without novelty voices, and Hear it uses the picked voice at the picked speed; that the five speeds sound evenly spaced and 0.5x and 1.5x are still pleasant (the mapping is linear in AVSpeechUtterance's rate, which is not linear to the ear); that muting, volume zero and unplugging headphones on a Mac mini with no speaker are read right (Core Audio's mute and volume on the default output; some devices report volume only per channel, some not at all and then count as on); that the microphone list names AirPods, USB and the built in microphone as macOS does; that switching AirPods off while holding the keys moves to the default and keeps the words said so far, and whether AirPods starting their microphone really reports a changed rate (then the reopen matters on every first press); that following the default needs nothing more than reading it at each press; that the project's words make "supabase", "vercel" and "useAuth" come out right (`cargo test -- --ignored project_words_round_trip`, which makes its audio with `say` into a file, plays nothing, and needs the model) and do not make the model write project names into short or unclear speech; and how long gathering the words takes in a big project (the cap is 4000 entries, gathered while the person talks); and that listing the voices and microphones when Settings opens asks for no permission (it reads device names through Core Audio and never opens the microphone; rule 8 says the Microphone permission is asked only at the first hold to talk).

## Settled by desk research (7 Oct 2026)
- Rust bindings: spike (f) tries `whisper-rs` 0.16.0 (Unlicense; `metal` feature on; needs cmake) first, pinned and vendored because it is dormant with open memory leak bugs, with VAD run through `WhisperVadContext` (not `FullParams`). Plan B is `transcribe-cpp` (MIT), which Handy uses (section 20, question 20).

## Revisit if
After v1, add Apple's SpeechAnalyzer as an optional engine on macOS 26. One third party benchmark found it more accurate and faster than Whisper Small on English (secondhand) (section 15).
