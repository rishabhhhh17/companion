# F20: Elementals, tools grouped by what they do on your Mac (21 Oct 2026)

- **Status:** Founder decision, 21 Oct 2026 ("go ahead with the Elementals group plan"). Builds on F18 (home in the notch, the companion from anywhere). Names and art are placeholders: the founder supplies the characters, the product name is not final (rule 21: every name lives in the strings file).
- **Idea (the founder's words, condensed):** different tools with different elements, grouped into bigger groups, each group doing a different kind of thing on your Mac. First creature is water based; every new element gives a new power.

## Decision
1. **A group is a set of related tools** (its elements) with one switch, one settings section, one plain line saying what it may do on your Mac, and its own place in the island, Home and the first run. Four groups at launch, made only from what already exists:
   - **Flow** (water, the first creature): find the problem, fix it, prove it, undo it, explain it (Rescue, Drive, Proof, Undo, Explain, which task broke it, follow ups).
   - **Guide:** Show me how, walkthroughs and lessons, Your turn, practice, everyday help on screen.
   - **Voice:** hold to talk, spoken answers, Prompt help, the error explainer.
   - **Files:** drop a file on the companion to convert it (F19).
   Group names here are placeholders (strings file only).
2. **Switches follow the permissions.** Turning a group off turns off every tool in it and, where nothing else needs it, stops asking for its permission (Screen Recording, Accessibility, Microphone are asked the first time a tool needs them, rule 8). Stop everything and the safety rules are never part of a group and can never be switched off.
3. **Powers unlock by use, never by streak.** A tool in a group is "new" until the person has tried it once. Home shows, quietly and optionally, which tools of each group they have not tried yet and a one line invitation ("Try Show me how"), never a score, a streak, a level number or a guilt message (rule 16). Nothing is locked behind this: every tool works from the start; unlocking only means the invitation goes away and, later, extra practice for that group becomes visible.
4. **The character reflects the group at work** through named motion and look states (water for Flow: clearer when checks pass, murkier when they fail; other groups get placeholders). The art and the extra groups come from the founder; the code only names the states.
5. **Everything stays customizable** through the settings registry: each group on or off, whether the island shows the group's state, whether Home shows "not tried yet", and a Reset.
6. **Never part of a group:** the safety rules, Stop everything, the daily limit, the key, Delete everything, house rules. F18's general assistant features stay out of the launch; a later group can hold them behind a switch that is off.

## Why (research, 21 Oct 2026, weak evidence, treat as direction not proof)
- Microsoft Research's delight interviews: people enjoy playfulness at work, quickly doing something beyond their own ability, and personalization.
- Personality changes what people enjoy of playful design (so: optional and customizable, not one forced style).
- Practitioners say sporadic rewards after real accomplishment stay delightful longer than constant animation.
- Only about a third of US adults have tried AI companion apps and some of those apps retain users with guilt and FOMO: we do the opposite.
