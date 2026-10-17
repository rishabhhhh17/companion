# How Explain is graded

Explain shows two short lines after a task, built from the real change, and one question that checks the person understood. This is the rubric for scoring one explanation. The parts marked **checked in code** are scored by `score.ts` with no model. The parts marked **graded** are judged by a grader model, which is shown this rubric, the same change Explain was shown, and the explanation.

An explanation passes only if it meets every part.

## 1. Correct (graded)

- Both lines are true of the change that was shown. Nothing is made up: no cause, file or behaviour that the change does not show.
- The first line names the real reason the change was needed (the actual cause), not just "there was a bug" or "it was broken".
- The second line says why the change works, in a way that follows from the first.
- If the assistant's own words disagree with the change, the change wins.

## 2. Plain words (checked in code, and graded)

Checked in code:
- No code: no backticks, brackets used as code, arrows, semicolons or braces.
- No file names (such as `config.json`) and no code style names (`siteTitle`, `user_id`). Setting names in capitals, such as `SITE_NAME`, are allowed: the person sees those in their settings.
- None of these programming words: variable, function, parameter, argument, undefined, null, boolean, integer, array, string, async, await, promise, callback, runtime, compile, syntax, regex, refactor, dependency, stack trace, exception, directive, hook, TypeError, ReferenceError.
- No sentence longer than 30 words.

Graded:
- A person who has never written code could follow both lines without looking anything up.

## 3. Two lines (checked in code)

- Exactly two lines: why the change was needed, and why it works.
- Each line is at most 160 characters and at most two sentences.

## 4. A fair check question (checked in code, and graded)

Checked in code:
- There is a question, it ends with a question mark, and it has two or three different options with one marked right.

Graded:
- The marked answer is really the right one, given the change.
- It checks one reason from the explanation, not a detail such as a file name or a number to remember.
- The other options are believable, so the right one cannot be picked from the wording alone.

## How the grader answers

The grader replies with only this JSON, and anything else counts as no grade (never as a pass):

```json
{"correct": true, "questionRight": true, "plain": true, "why": "one plain sentence on the weakest part"}
```
