# M12: Elementals groups (plan, 21 Oct 2026)

Founder approved on 21 Oct 2026 (F20). One builder, then the usual adversarial review and fixes.

## Build
1. **One catalog of groups and tools** (data, one file shared by the shell, runner and pages like protocol/apps.json): each tool id, which group it belongs to, the settings and permissions it touches, and a plain line. Names only in app/src/strings.ts.
2. **Group switches** in the settings registry (flow.on, guide.on, voice.on, files.on; default on): turning one off disables every tool in it end to end (hotkeys unregistered, windows and handlers refuse politely with one plain line, pages hide their buttons), never Stop everything or the safety rules. Tests for each group off.
3. **"Tried" tracking, local and tiny:** a set of tool ids tried, kept in the shell settings file, never content, erased by Delete everything and Reset, set only by a real use (a finished task, a Show me answer, a talk, a conversion).
4. **Home:** a Groups view (in Settings and as an optional line in Now) listing each group, what it may do on your Mac in one sentence, its switch, and "not tried yet" tools with a one line invitation that goes away once tried. Setting to hide the invitations. No scores, levels or streaks.
5. **Island and character:** the island can show the working group's name; the character gets named group states (water states for Flow) as data for the art, reduced motion respected.
6. **First run:** explains the four groups in four short lines and lets the person switch any off.
7. Docs, architecture, T16 settings section, F20 true; a test that no user text has praise, streak or level words.

## Status (20 Oct 2026)
All seven items built on branch m12/elementals, with tests; see F20 ("Built") and `docs/architecture.md` (module `groups`). Not tried in the built app. Next: the adversarial review, then the fixes.
