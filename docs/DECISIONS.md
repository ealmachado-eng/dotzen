# Decisions — rolling log

> One line per non-trivial choice. Append-only. For locked architectural decisions see `docs/specs/00-architecture-decision-record.md`. For two-sided lessons (KEEP/AVOID) see `docs/LESSONS.md`.
>
> Shape: `YYYY-MM-DD — <topic> — <choice>. Why: <reason>. Rejected: <alternative>.`

## 2026-08-05 — release — `publish needs: [gate]` in release.yml
Choice: gate job runs full correctness suite before `npm publish --provenance` can start. Why: caught Quick Start order regression pre-publish. Rejected: trust CI on push — CI is non-blocking on tag pushes.

## 2026-08-05 — release — Node 24 / npm 11 pin on release workflow
Choice: pin release workflow to Node 24 / npm 11. Why: trusted-publishing OIDC token exchange silently fails on Node 20 / npm 10.x. Rejected: match ci.yml's matrix — release is single-target.

## 2026-08-06 — ci — CodeQL semantic analysis added
Choice: add CodeQL `security-and-quality` suite on JS/TS, with `workflow_dispatch` on every gating workflow. Why: 5 real findings on first run (3 tainted-template, 1 unanchored regex, 1 formatting). Rejected: Semgrep-only — already in gate, but CodeQL catches different shapes.

## 2026-08-08 — parser — HCL `${...}` built via concatenation, not template strings
Choice: build interpolation strings via concatenation in `normalize.ts`. Why: CodeQL #1-3 flagged template forms as tainted-template even though exploitation requires engine input. Concatenation is the safe shape. Rejected: disable the rule with `// nosec` — would hide future regressions.

## 2026-08-11 — process — session memory harness
Choice: add `SESSION_HANDOFF.md` (rolling) + `LESSONS.md` (KEEP/AVOID) + `DECISIONS.md` (this file) + `npm run context` + opencode compaction plugin + `.githooks/post-commit` writing `.session/state.md`. Why: agent didn't proactively pull context at session start — auto-injection closes that gap. Rejected: a single big CLAUDE.md — too long to skim, agent skips sections.
