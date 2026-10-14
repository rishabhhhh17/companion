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

## Lessons that need no project

`"needsProject": false` marks a lesson that reads nothing from a project folder (installing a tool, leaving a builder, allowing a permission). It can start with no folder chosen, and may use only `ask` checks, which the checker enforces. Any lesson that uses `env_name`, `file_exists` or `file_contains` needs a chosen folder and says so if there is none.

## Draft and tried

A lesson has `"status": "draft"` (the default) or `"tried"`. **Draft** means it was written from the maker's own help pages and nobody has walked it on a real screen yet; the app says so on the Lessons list. Only change a lesson to `tried` after a person has done every step on a real screen and the steps matched. The test suite fails if a shipped lesson says `tried` without that being decided here: today none are.

Sources used for the drafts (checked 14 Oct 2026): Claude Code quickstart (code.claude.com/docs/en/quickstart); Replit "Download as zip" help page; for Bolt, Vercel's Bolt guide and several write ups that disagree on where the export button sits, so that lesson says to look in both places; the Cursor lesson uses Cursor's own help article (cursor.com/help/getting-started/install: download, drag to Applications, sign in, File > Open Folder); the GitHub lesson uses GitHub's "Quickstart for repositories" page (plus icon, New repository, Repository name, Create repository) and says only that GitHub shows next steps afterwards, because that page does not describe the screen that follows. Earlier: Vercel docs "Managing environment variables", "Managing Deployments", "Troubleshooting Build Errors"; Lovable docs "GitHub integration" and "Publish / deploy". Button names in these products change often, which is why the hands on check matters.
