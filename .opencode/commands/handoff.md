---
description: Append a session handoff entry + mine lessons/decisions + tag WIP before closing
---

You are closing a session. Persist the memory before context is lost.

## Inputs

Current git state:

!`git describe --tags --abbrev=0 2>/dev/null`
!`git log --oneline -15`
!`git status --short`

## Steps

### 1. Identify what was actually accomplished

Read the git log above + `git diff --stat` (if uncommitted) + recall your tool calls this session. Separate "shipped" from "attempted."

### 2. Append to `docs/SESSION_HANDOFF.md`

Read the file to find the last `## Session N` heading and increment N. Append a new section using this exact shape:

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

Use today's date. Don't delete prior sections.

### 3. Mine for missed lessons

Scan the session's work. For any non-trivial fix, surprise, gotcha, or "won't repeat" moment that isn't already in `docs/LESSONS.md`, append an entry:

```markdown
## YYYY-MM-DD — <topic> — <short title>

**KEEP** (do again):
- ...

**AVOID** (don't repeat):
- ...
```

If nothing was learned that isn't already recorded, skip this step silently.

### 4. Mine for missed decisions

For any non-obvious choice with a rejected alternative that isn't already in `docs/DECISIONS.md`, append a one-liner:

```markdown
## YYYY-MM-DD — <topic> — <choice>
Choice: ... Why: ... Rejected: ...
```

If nothing applicable, skip.

### 5. WIP tag if mid-task

If there is uncommitted work OR a task is incomplete, run:

```bash
git tag wip-$(date +%Y-%m-%d-%H%M)
```

Note the tag name in the SESSION_HANDOFF section under "Next resume step."

If the session fully completed its task with a clean tree, skip the tag.

### 6. Report back

Print, in order:
1. The new SESSION_HANDOFF section you appended.
2. Any LESSONS/DECISIONS entries you appended (or "none — already recorded").
3. The WIP tag name if created (or "no WIP tag — clean").
4. The exact resume command for the next session: `git checkout <tag-or-head>` then `npm run context` from `packages/cli/`.

## Hard constraints

- **Do not commit.** This command only writes to memory files and optionally tags. Committing stays an explicit user action.
- **Do not delete or rewrite prior sections** in any memory file. Append-only.
- **Do not summarize vaguely.** Every bullet must point to a file path, commit SHA, or concrete next step.
