# Reference pass: how the best funded products look and behave (30 Oct 2026)

Looked at live, on their own sites and product demos: Raycast, Linear, Granola, Wispr Flow, HeyClicky. Taken for Squibby's own product, not for a website.

## What they share
- **One colour, everything else black and white.** Raycast's whole interface is grey on black with one red glow behind it. Linear is grey and white, with green and red only for numbers that change. It matches our chrome on black.
- **Results in plain sentences, then a compact card of facts.** Linear's agent panel says "Worked for 10 sec", then one sentence of what it did, then a card: "Changed 2 files +22 −10", the change named in one line, Preview.
- **Progress lives where the result will appear.** Granola shows "Enhancing notes" with a thin arc right in the note, then the notes change in place. No modal, no progress bar.
- **Listening is visible where you look.** Wispr Flow's black pill with a live sound wave. HeyClicky's speech bubble by the cursor and a dotted wave. People see that they are heard.
- **Keys are shown, small.** Raycast's bar along the bottom: the action, its key in a keycap (⏎), and "Actions ⌘K".
- **Two tone sentences.** A bold white statement, then the rest in grey ("Remember Everything. Stop playing clipboard ping pong.").
- **HeyClicky:** glossy chrome buttons and an Aqua feel on a macOS-like page. The same family as our chrome; we keep ours on black, bolder.

## Y Combinator companies (looked at the same day)
The five above are venture backed but not YC. Two design led YC companies, live:
- **Resend (YC):** pure black, one soft beam of light. Dark cards have a thin rim of light along the top edge, like glass. The chosen item gets a soft glowing outline.
- **Supabase (YC):** two tone headlines, a white line then a grey or brand line ("Build in a weekend / Scale to millions"). Small cards with an icon, a title, one bold key phrase and a few ticked points.

## What we built from it
- **M39, the water ring listens.** While a voice key is held, the ring at the pointer ripples with your voice and glows a little (`voice_mac.rs` level, `follow.ts` `voiceEnvelope`). Only a loudness number, never stored. Our version of Wispr's pill and HeyClicky's wave, in our own water.
- **M39, the receipt.** The result's own words as a paragraph, then one changes card: "Changed 3 files", a mark for each file (+ added, ● changed, − removed), the name in bold and its folder in grey (`changesCard.tsx`). Linear's pattern, without numbers we do not have.

- **M40, keycaps.** Home's actions that have keys show them as small keycaps at the end of the row, with the keys in use now (`keys.ts` `keycaps`).
- **M40, progress in place (Granola).** While a task works, the step under way has a thin turning arc and the step before it a quiet tick; still with Reduce motion or Less motion.
- **M41, the light rim (Resend).** Home's cards catch a thin line of light along the top edge, with a soft shade below.

## Next candidates, not built
- **Two tone empty states:** the bold statement, then the grey line.
- **"Worked for N seconds"** on the receipt, once the engine sends how long a task took. We would not guess it in the page.
