# Spike: can Companion read the structure of a web page in a browser? (M10 step 0b, 12 Oct 2026)

**Question.** The teaching engine rings a target only when it is confirmed from the project or the app's accessibility structure (F17, rule 22). For Lovable, Vercel and Supabase the targets are buttons and links in web pages in the person's browser. Does macOS hand Companion that structure, and is it usable?

**Method.** The signed dev Companion app (it already holds the Accessibility grant) walked the accessibility tree of the window of **Dia**, the Chromium browser the founder uses, once as the browser was and once after switching its web accessibility on (`AXManualAccessibility` and `AXEnhancedUserInterface`). The probe kept only counts, roles and name lengths of the founder's own open page, never text. The test page I had prepared was not the visible tab, so no page of ours was measured; the founder's open page (a heavy React site) was. The probe code lived behind an environment variable only for this spike and was removed again from `main.rs` afterwards (a launch hook like that would let any process borrow Companion's permission). The tree walker stays in `ax.rs` (`probe_windows`) as the base for the engine's target finder.

**Result.**
- **Yes, without switching anything on.** Both runs gave the same tree: a web area, 3,432 elements, among them 130 buttons, 170 links, 16 headings, 76 pop up buttons, text areas and a combo box. Read time about 0.27 s (0.8 s when waiting for the browser to wake).
- **Names and positions are there.** In a sample of 80 elements: 9 of 10 buttons had a name and all had an on screen frame; 22 of 22 links and 7 of 7 headings had both.
- **A window on another Space is readable** (found through the app's main window, not the usual window list).
- Plain text blocks carried no name of their own (0 of 37 in the sample), so a step that points at text, not at a control, needs another way (reading the screen).

**Not measured.** Safari, Chrome and Arc (not running, and a test tab could not be navigated there without a workaround to the tool limits); Lovable, Vercel and Supabase pages themselves (needs the founder's logged in accounts; the hands on session). WebKit and other Chromium browsers are expected to behave alike but are unproven.

**Effect on the plan.** The "solid ring from the accessibility structure" path works for Chromium browsers. Anywhere mode keeps the soft ring for the cases where a target is not in the tree (text, canvases, native apps that expose little).
