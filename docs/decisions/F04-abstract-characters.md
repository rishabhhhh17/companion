# F04. Abstract characters docked on the side edges

- **Status:** Fixed. Founder decision; do not reopen without the founder. Updated 7 Oct 2026 after desk research.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 4
- **Related:** F01, F07, F11, T01, T12

## Decision
Characters are abstract shapes with their own identity and personality, anime inspired without copying any IP. Not cute mascots, not just a glow. Skins are switchable. They dock on the side edges (never the Mac notch), move anywhere, and show a clear on and working indicator. They must look and behave better than HeyClicky's side cards.

## Why
- Characters carry the brand and make several agents readable (product_research.md section 11).
- A 2026 review of 53 studies found no consistent trust advantage for realistic over stylized agents, and Microsoft's abstract Mico was accepted by the mainstream (product_research.md section 4).
- Side edges, not the notch, so the design works on Windows and external monitors (product_research.md section 4).
- HeyClicky shows a corner accordion and thumbnail pile. Our cards show proof and control, not just activity (product_research.md section 4).

## What this means for the build
- A tab of about 48 to 56 pixels on the left or right edge. It slides, snaps, floats when dragged off, and never reserves screen space. Position is stored per display as edge plus offset (product_research.md section 4; technical_research.md section 4).
- Cards fan out when agents run, at most three visible. Each shows the character, task, live step, progress arc, risk badge, proof, and Stop, Undo and Receipt (product_research.md section 4).
- One state machine per character driven by agent events: Off, Idle, Listening, Thinking, Working, Checking, Needs you, Done, Error or blocked, Seeing your screen, Reading your text (product_research.md section 4).
- Rive: one `.riv` file per species, one `state` input, skins as data bound view models, a reduced motion input driven from React (technical_research.md section 12). The $9 Cadet seat removes the splash screen. The web runtime is MIT (checked 7 Oct 2026), so keep its notice in the app's acknowledgements. Idle CPU in a transparent webview still needs measuring.
- Faces are eyes only, with manga style emotion symbols. No human figures, no gendered designs. Readable at 32 pixels (product_research.md section 4).
- Skins change the material, never the silhouette. Users can rename any character (product_research.md section 4).
- Idle budget: under 1% average CPU after 10 seconds on an M1 Air; windows sized to content, animation paused when idle (technical_research.md sections 12, 18).
- Alpha ships one character with all states; Beta ships the full set and skins (product_research.md section 3).

## What it rules out
- Section 11 row: "A calm glow or dot as the only presence".
- Cute mascots, human figures, gendered designs, copied IP, and docking at the Mac notch.
- Affection meters or streaks tied to a character (section 11 row: "AI friend" framing).

## Revisit only if
The founder decides to.
