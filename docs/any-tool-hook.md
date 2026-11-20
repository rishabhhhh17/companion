# Any AI tool can tell Squibby it is done

Squibby starts a review the moment your AI tool finishes, if the tool tells it. Squibby connects the tools it knows by itself (Settings, Fixing, Your AI tools). Any other tool can plug in with one line.

## The line

Open Settings, Fixing, Your AI tools, and open **Any other tool**. It shows this project's line with a Copy button. It looks like this:

```sh
/usr/bin/touch -- '/Users/you/Library/Application Support/Companion/runner/done/0123456789abcdef01234567.any'
```

Have your tool run it when it finishes a task, in whatever way the tool runs a command at that moment (a "stop", "done", "after agent" or "task complete" hook). Squibby starts a review of what changed at once, and History says "Another tool" finished.

## What it does, and what it never does

- It only touches an empty file in Squibby's own folder. The file's name is a random token for this project, so the line works only for this project.
- Nothing of your tool's work, words or files travels. Squibby reads the project's changed files itself, as it always does.
- Nothing is blocked. With Squibby closed the line still works and does nothing; the review starts from the changes the next time Squibby is open.
- Delete everything in Settings makes the token meaningless: the line then does nothing until you copy the new one.

## The rules for a tool that wants more

The line is the open part. The safety copy before a destructive command, the live feed and answering from the notch need the tool's own hooks, written by Squibby after you say yes on a card that shows every line. To ask for a tool to be added, say which tool and where its hooks are documented.
