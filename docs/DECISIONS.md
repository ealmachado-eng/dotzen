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

## 2026-08-18 — brand — Pattern C (mascot + coined technical name)
Choice: package/CLI gets a coined technical name; beast + character name live in marketing/docs only. Why: character-as-package (B) is weak trademark + enterprise-tone risk; marketing-only beast (A) loses narrative integration. Rejected: B (Sotiris-as-package), A (no character).

## 2026-08-18 — brand — tafros stays umbrella; erkos demoted to tool-name candidate
Choice: keep tafros (moat) as the umbrella brand. Why: beast-in-moat narrative only works with the moat; erkos-as-umbrella breaks the crocodile story and costs a mental-model rebuild. Erkos survives only as a first-tool name option. Rejected: erkos as umbrella (identity-tie with gharial was poetic but not worth losing the moat).

## 2026-09-01 — vscode-ext — engine delivery
Choice: bundle engine in-process (import `check()` in the extension host). Why: zero user setup, no version-skew subprocess surface; prereq = export `check` + finding types from the package index. Rejected: spawning user-installed CLI (breaks zero-friction thesis); LSP server (overkill, single editor).

## 2026-09-01 — vscode-ext — versioning
Choice: extension version lockstep with engine, cut from the same tag. Why: one number, coherent `dotzen.json` pin semantics. Rejected: independent extension semver (two numbers to juggle, more pin-mismatch warnings).

## 2026-09-01 — vscode-ext — build timing
Choice: park build until rebrand name locked; design captured in `docs/specs/11-vscode-extension.md`. Why: extension id/publisher/icon/README are brand-bearing; marketplace renames painful. Rejected: placeholder-id build now.

## 2026-09-01 — vscode-ext — distribution
Choice: Marketplace + Open VSX at publish time. Why: covers Cursor/Windsurf/VSCodium where AI-Terraform authors disproportionately are. Rejected: Marketplace-only.

## 2026-09-01 — deps — qs override vs wait
Choice: scoped `overrides` forcing qs 6.15.3. Why: `typed-rest-client@2.3.1` pins qs exact so no semver-compatible fix exists; dev-only chain, zero runtime risk. Rejected: waiting for upstream; leaving the moderate (CI gate is high-level).
