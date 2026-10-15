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
- **After a pause** the lesson carries on at the first step not proven done. Finished steps the project can prove are checked again (one that came undone is shown again, not as a failure). From the saved place on, steps the project proves are passed by; at a step only the person can confirm (`ask`), it asks "Did you already do this?" before pointing at anything. Yes counts it as done and moves on; No shows the step. A step that failed before stays words only.

## Lessons that need no project

`"needsProject": false` marks a lesson that reads nothing from a project folder (installing a tool, leaving a builder, allowing a permission). It can start with no folder chosen, and may use only `ask` checks, which the checker enforces. Any lesson that uses `env_name`, `file_exists` or `file_contains` needs a chosen folder and says so if there is none.

## Proving steps from the project

A step is proven from the project whenever its result lands there: a setting name in a `.env` file, a file made, a line in a config file. `ask` stays only where the result is on another app's screen. Checked step by step on 16 Oct 2026 for the shipped lessons:

- **GitHub (`github-new-repo`)**: the last step, linking the project, is proven: `.git/config` names `github.com` (only those words are looked for; nothing is run and git is never written). So this lesson now needs a chosen folder.
- **The other eleven stay `ask`**, because nothing they do touches a project folder: the three Companion permission lessons (System Settings), Lovable publish and Lovable to GitHub (Lovable's site), the two Vercel lessons (Vercel's site; the generic one cannot name a setting, so the project's own names are proven by the lessons made from the project, below), Bolt and Replit downloads (before any project exists here), and installing Cursor or Claude Code (apps, not project files).

## Lessons made from your project

Two lessons are made from the chosen project each time the Lessons list opens, from the setting names its code reads (the same names as About this project). They are data like any other lesson, go through the same checks, are drafts, and have at most 15 steps.

- **Set up the settings this project needs** (`from-project-settings`): for exactly the names the code reads that no `.env` file sets yet. First the settings file (`.env.local`, or `.env` for a plain Node server or Python), proven when it exists. Then one step per name: where to get the value (a small table of well known names: Supabase, Stripe, OpenAI, Resend, DATABASE_URL; otherwise it says it does not know and points to the README), and how to add it to the file. Each is proven by an `env_name` check. A value is never asked for, kept or shown (the check reads the file only for the names in it): the steps say to paste it only into the file. Last, restart the project (asked).
- **Add this project's settings to Vercel** (`from-project-vercel`): every name the project needs, since the live site needs them all and Companion cannot see Vercel. Each name is added in the project's Vercel settings and confirmed by the person (asked), then a redeploy.
- More than fits in 15 steps: the first ones are covered (names the page reads first) and the goal says how many are left. A paused lesson keeps its list of names, so it picks up where it was.
- A name the page can read (it starts with `VITE_`, `NEXT_PUBLIC_` and the like) that looks like a secret key gets a plain warning instead of where to get it. A name a setting check cannot hold (lower case, one letter) is left out.
- About this project shows "Show me how to set them" when settings are missing. Lesson files cannot use ids that start with `from-project-`.
- Where the values come from was written from what those dashboards are known to show, not checked on a real screen yet: these lessons are drafts like the rest.

## Draft and tried

A lesson has `"status": "draft"` (the default) or `"tried"`. **Draft** means it was written from the maker's own help pages and nobody has walked it on a real screen yet; the app says so on the Lessons list. Only change a lesson to `tried` after a person has done every step on a real screen and the steps matched. The test suite fails if a shipped lesson says `tried` without that being decided here: today none are.

Sources used for the drafts (checked 14 Oct 2026): Claude Code quickstart (code.claude.com/docs/en/quickstart); Replit "Download as zip" help page; for Bolt, Vercel's Bolt guide and several write ups that disagree on where the export button sits, so that lesson says to look in both places; the Cursor lesson uses Cursor's own help article (cursor.com/help/getting-started/install: download, drag to Applications, sign in, File > Open Folder); the GitHub lesson uses GitHub's "Quickstart for repositories" page (plus icon, New repository, Repository name, Create repository) and says only that GitHub shows next steps afterwards, because that page does not describe the screen that follows. Earlier: Vercel docs "Managing environment variables", "Managing Deployments", "Troubleshooting Build Errors"; Lovable docs "GitHub integration" and "Publish / deploy". Button names in these products change often, which is why the hands on check matters.
