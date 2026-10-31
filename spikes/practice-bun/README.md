# Spike: the practices without Node (M49)

**Question.** Can the practice projects (`app/sample`) be checked, tested and started with the Bun that runs the engine, in place of Node and npm, inside the safety box for checks (`runner/src/proof/box.ts`), with no internet? If so, a person without Node can still try a practice. (M49, AGENTS.md rule 18: a [verify] item is settled by a spike before code depends on it.)

**How to run it.** From the runner folder:

```
cd runner && bun ../spikes/practice-bun/spike.ts
```

It copies the Bun running it into a folder laid out like the app's engine (`engine/bin/bun`, as `app/scripts/stage-engine.sh` does), gives every command a tool path with only that folder and the system's own folders (so neither `node` nor `npm` can be found), names each copy the way the shell does (`Squibby practice signup page`, spaces and all), and runs every command through the runner's own `runCommand` and `startServer`, in the box, with no internet. Nothing is downloaded or installed, and nothing outside temporary folders is written. It prints one JSON line per thing it tried.

There are no manual steps. The same checks run in the runner suite: `cd runner && bun test test/practice-bun.test.ts`.

What it found is in [RESULTS.md](RESULTS.md).
