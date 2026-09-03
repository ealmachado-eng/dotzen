---
name: handoff
description: Close out a pluvian working session by persisting memory — append the next Session section to docs/SESSION_HANDOFF.md, mine the session for unrecorded docs/LESSONS.md and docs/DECISIONS.md entries, tag WIP if work is unfinished, and print the resume command. Run when the user says "wrapping up", "end of session", "/handoff", "handoff", "close the session", "done for today", or otherwise signals the session is ending — even if they don't name this skill.
---

# Session handoff

Persist the session's memory before context is lost. These files are the
next session's only bridge — write concrete facts (commit SHAs, PR
numbers, file paths), never vague summaries. The rolling conventions
live in `AGENTS.md` ("When to append to the logs"); this skill is the
end-of-session pass.

## 1. Gather state

Run these, then recall the session's tool calls. Separate "shipped"
from "attempted" — the handoff must not claim unfinished work as done.

```bash
git describe --tags --abbrev=0
git log --oneline -15
git status --short
```

## 2. Append the session section to `docs/SESSION_HANDOFF.md`

Read the file, find the last `## Session N` heading, and increment N.
**The new section goes after the LAST LINE of the file.** Never insert
before an existing section, and never anchor an edit on an existing
session header — a replace-anchored edit silently consumes it (this
happened once and cost a manual repair; appending at end-of-file makes
it structurally impossible).

Exact shape, with today's date:

```markdown
## Session N+1 — YYYY-MM-DD — <short topic>

**Goal:** one line — what the session set out to do.

**Shipped:**
- bullet list of concrete outcomes (commits or uncommitted changes, with file paths)

**Deferred / blocked:**
- bullet list of what didn't get done and why

**Next resume step:**
- the single highest-leverage next action
```

If a PRIOR section lists as open something that has since landed, don't
rewrite its text — strike it in place with a dated note
(`~~item~~ (done — #NN, YYYY-MM-DD)`).

## 3. Mine for missed lessons

Scan the session's work. For any non-trivial fix, surprise, gotcha, or
"won't repeat" moment NOT already in `docs/LESSONS.md`, append:

```markdown
## YYYY-MM-DD — <topic> — <short title>

**KEEP** (do again):
- ...

**AVOID** (don't repeat):
- ...
```

If nothing was learned that isn't already recorded, skip silently.

## 4. Mine for missed decisions

For any non-obvious choice with a rejected alternative NOT already in
`docs/DECISIONS.md`, append a one-liner:

```markdown
## YYYY-MM-DD — <topic> — <choice>
Choice: ... Why: ... Rejected: ...
```

If nothing applies, skip.

## 5. WIP tag if mid-task

If there is uncommitted WORK (code, docs-in-progress) or an incomplete
task, run and note the tag name under "Next resume step":

```bash
git tag wip-$(date +%Y-%m-%d-%H%M)
```

The handoff's own memory-file edits are this skill's normal output, not
mid-task work — no tag for them. Skip the tag entirely when the session
completed its task.

## 6. Report back

Print, in order:

1. The new SESSION_HANDOFF section you appended.
2. Any LESSONS/DECISIONS entries appended (or "none — already recorded").
3. The WIP tag name (or "no WIP tag — clean").
4. The resume command for the next session:
   `git checkout <tag-or-head>` then `npm run context` from `packages/cli/`.

Remind the user the memory-file edits are intentionally uncommitted —
committing (via PR; the org ruleset blocks direct main pushes) stays an
explicit user action.

## Hard constraints

- **Do not commit.** This skill only writes memory files and optionally
  tags. Commits/pushes are the user's explicit call.
- **Append-only.** Never delete or rewrite prior sections in any memory
  file; supersede stale facts with strikethrough + date instead.
- **No vague bullets.** Every bullet points to a file path, commit SHA,
  PR number, or concrete next step.
