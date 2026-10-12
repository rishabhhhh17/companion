# Writing a lesson

A lesson is one JSON file in `lessons/` (shipped with the app) or in the `lessons` folder of the app's data folder (yours). The runner checks every file; a bad file is named and skipped, never half used. Plain words only: no `<`, no `>`, no control characters.

```json
{
  "id": "companion-screen-recording",
  "title": "Let Companion see your screen when you ask",
  "app": "System Settings",
  "goal": "One sentence on what the person gets",
  "steps": [
    {
      "id": "privacy",
      "say": "Choose Privacy & Security in the list on the left.",
      "find": "Privacy & Security in the sidebar",
      "check": { "kind": "ask" },
      "instead": { "say": "A different way to do the same step", "find": "what to look for" }
    }
  ]
}
```

- **Up to 15 steps.** Step ids are unique. `say` (up to 200 letters) is what the person reads; `find` (up to 120) is what Companion looks for on the screen.
- **`check`** says how a step is proven. Only these kinds exist, so a lesson can never run a command:
  - `{"kind":"ask"}`: the person is asked "Did that work?" (the default).
  - `{"kind":"env_name","name":"SUPABASE_URL"}`: a `.env` file in the project names this setting. Only names are read, never values.
  - `{"kind":"file_exists","path":"src/app.ts"}`: a file inside the project.
  - `{"kind":"file_contains","path":"src/app.ts","text":"createClient"}`: a file inside the project holds these words. Settings and key files are refused.
- **`instead`** (optional) is the other way, shown once if the first did not work. After that the person gets words only and an "I did it myself" button. A step that failed is never shown as the same ring again.
- The ring is a solid ring only where the place is confirmed; a guess gets a soft ring and says so (rule 22).
- Progress is saved after every move and holds step ids and outcomes only.
