# Session handoff — for the next context window

> **Rolling log.** Append a new `## Session N — YYYY-MM-DD` section at the end of each non-trivial session. Don't delete old sections — supersede stale facts in place with a `~~struck~~ superseded YYYY-MM-DD` marker, or move them into `docs/LESSONS.md` under the matching topic tag. Pairs with `docs/LESSONS.md` (two-sided lessons, KEEP + AVOID) and `docs/ROADMAP.md` (backlog + dogfood log). Run `npm run context` from `packages/cli/` for a deterministic state blob.
>
> Read this + `docs/ROADMAP.md` + `docs/LESSONS.md` + `AGENTS.md` to resume.

## Current state (v1.9.37, 2026-08-05)

- **Repo:** `github.com/ealmachado-eng/dotzen` (public). `origin` = GitHub. `gh` CLI is NOT installed — use the GitHub web API or `npm view` for verification.
- **npm:** `@dotzen/dotzen@1.9.37` latest, published via GitHub OIDC + SLSA provenance. **npm no-republish:** once a version number is published (even if unpublished), npm blocks republishing it. Always use a fresh version number after any publish.
- **CI:** `.github/workflows/ci.yml` (Node 24, 801 unit + 40 integration + check-docs + semgrep + gitleaks) — does NOT fire on tags (release.yml owns those). `release.yml` (Node 24 / npm 11, trusted publishing, `--provenance`) has a `gate` job + `publish needs: [gate]`. **Trusted publishing requires Node 24 / npm 11** — Node 20 / npm 10.x silently fails the OIDC token exchange. Don't lower it.
- **Renovate:** onboarded, majors-gated. **typescript major BLOCKED** (`enabled: false` — typescript-eslint doesn't support TS 7 yet; typescript-eslint#10940). Actions majors approved & merged (#6: actions v5→v7, gitleaks v2→v3). TS/deps patch PRs auto-merge. brace-expansion DoS fix already on main via `npm audit fix`. Config is `config:recommended` with no explicit schedule → Mend app ~hourly; existing PRs rebase automatically.
- **Branch protection:** `require-ci-on-main` ruleset (status checks required) + `v*` tag ruleset. Squash-merge.
- **Docs:** full user docs in `docs/user/` (tutorial + how-tos + DSL reference + auto-generated rule catalog via `npm run gen-docs`). ADR at `docs/specs/00-architecture-decision-record.md` documents the archived HCL parser risk + the "own the WASM" future mitigation.
- **144 rules** across 8 presets (`coreSecurity`, `cisAws`, `cisAzure`, `cisGcp`, `pciDss`, `soc2`, `nist80053`, `dataProtection`) · ~3,200 resource/data types · 0 false positives since dogfood round 6, across 35+ real module repos.

## Session arc (v1.9.28 → v1.9.37, 9 releases)

1. **v1.9.29 — Graph layer hardening.** Resource-type-aware edge classification (`classifyEdge(attr, resourceType)` + `STRUCTURAL_REF_BY_TYPE` override — fixes the NAT false chain via `aws_nat_gateway.subnet_id` → structural). CNE for unresolved graph edges. Path detail for `denyIfSharedWith` + `denyIfReachableAttr`. List-edge traversal so `buildGraph` scans `res.lists` (fixes SG-shared on real `.tf`).
2. **v1.9.30–v1.9.31 — Dogfood round 11 (GKE `.member` coverage).** `denyValueExcludedByResourceAttr` returns a definite PASS (not CNE) for bare `google_service_account.*.{member,email,name}` refs — the provider type-system guarantees the value can't equal a public-principal scalar. Dropped the terraform-google-kubernetes-engine module from 15 CNE → 3.
3. **v1.9.32–v1.9.34 — Vocabulary rounds 11–13 + example specs.** Ungoverned-enum closure (aws_eks*, azurerm_monitor_data_collection_*, google_service_networking_connection, kubernetes_config_map_v1_data → `UTILITY_TYPES`). `KNOWN_TYPES` in `normalize.ts` is now derived from the vocab enums. Example specs generated from `src/cli/profiles.ts` via `npm run gen-examples` into `examples/{startup,enterprise,regulated}/.zen/spec.ts`.
4. **v1.9.35–v1.9.36 — Launch README + `dotzen init --profile/--presets`.** README rewritten for launch: ASCII diagrams (mermaid doesn't render on npm), absolute links (relative 404 on npm), Quick Start reordered (init before check — check needs a spec). `prepack` script copies root README → `./README.md` so the tarball ships the current README. `init` grew `--profile {startup,enterprise,regulated}` + `--presets coreSecurity,cisAws,...` (profiles as data, 816 unit tests).
5. **v1.9.37 — Quick Start order fix on npm + CI gating.** release.yml got a `gate` job (Node 24) and `publish needs: [gate]` so a correctness regression can't ship. ci.yml no longer fires on tags.
6. **Post-release (unreleased, on main) — Stryker mutation testing.** Evaluated mutation testing on the engine (`evaluate.ts`: 74.82% score, 438 survived — 180 StringLiteral + mixed logic) and the profiles module (52.85%). Triage found NO real verdict-logic gaps; the skip-optimization cluster in `evaluate.ts` (L2403-2413) is disabled for Stryker via `// Stryker disable` comments. Kept as periodic/on-demand (`npm run mutation`), NOT in the CI gate — runtime + equivalent-mutant noise + the zero-friction thesis. Setup committed: `stryker.conf.json`, `.gitignore`/`.prettierignore` include `reports/`.

## Open questions / advisory answered this session

- **`init --tags`?** User proposed a new flag so the spec is "born with the enum of required tags." Recommendation: **hold off.** The profiles (`enterprise`/`startup`) already ship an `OrgTag` enum + tag rule; the marginal value of pre-filling 3 enum values doesn't justify the new flag + the identifier-derivation codegen (hyphens/dots/dup names) + the awkward composition with `--profile` (both define tags → two tag rules). Reconsider IF tagging clearly emerges as the dominant first-use case; then scope `--tags` to compose with `--presets`/alone only (error if combined with `--profile`).

## Known issues / gotchas (don't re-discover these)

### Permanent facts (not bugs)
- **npm no-republish** (above).
- **HCL parser is archived upstream.** `@cdktf/hcl2json@0.21.0` — source repo `hashicorp/terraform-cdk` is archived. Risk documented in `docs/specs/00-architecture-decision-record.md`. Future mitigation: compile `hashicorp/hcl/v2` to WASM + vendor the `.wasm`. No action now.
- **Strict no-fabrication for vocab additions.** Names must be verified against the provider Go `ResourcesMap` or observed from real `.tf`. Known-verified: `aws_eks*`, `azurerm_monitor_data_collection_*`, `google_service_networking_connection`, k8s types → `UTILITY_TYPES`.
- **GitHub/Markdown constraints.** Mermaid does NOT render on npm. README links must be absolute. Raw HTML unsupported in README. npm README diverged historically; `prepack` now copies root README → `./README.md` so the tarball is current.

### Process reminders
- **check-docs gate:** `npm run check-docs` regenerates + diffs the rule catalog. After ANY preset change, run `npm run gen-docs` + commit, or the gate fails. Same for examples: `npm run gen-examples` after touching `profiles.ts`.
- **Gate (run from `packages/cli/`):** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:integration && npm run coverage && npm run check-docs`. Per action: run gates first, then `git add`, commit, tag, push, verify via `npm view` + `npx`.
- **Release flow:** bump `packages/cli/package.json` version → add CHANGELOG entry → commit → `git tag vX.Y.Z` → `git push origin main && git push origin vX.Y.Z` → release.yml publishes via GitHub OIDC + provenance. `gh` CLI is NOT installed — verify via `npm view @dotzen/dotzen version`.

## Immediate next steps (ranked)

1. **Nothing pending a release.** All changes since v1.9.37 are docs/CI/skill/mutation-testing setup (already on main, not version-bearing). Next release = v1.9.38 at user request when a user-facing change lands.
2. **Launch / adoption** — engine is feature-complete + documented + provenance-attested. A Show HN / r/terraform post is the #1 traction lever. Docs + README are launch-ready.
3. **Graph improvements** — essentially complete. Remaining: GCP graph conditions (low-applicability — GCP has no per-resource SGs; existing per-resource conditions cover its public-access controls).
4. **VS Code extension** — inline `.tf` findings (larger lift, high adoption value).

## Key file map

- **Engine:** `packages/cli/src/engine/evaluate.ts` — `buildGraph()` (~L310-520), `evalDenyIfReachable` (~L1935), `evalDenyIfSharedWith` (~L1975), `evalDenyIfReachableAttr` (~L2000), `denyValueExcludedByResourceAttr` (v1.9.31), skip-optimization block L2403-2413 (Stryker-disabled).
- **Normalize:** `packages/cli/src/hcl/normalize.ts` — `KNOWN_TYPES` (derived from vocab enums), `UTILITY_TYPES` silent-skip set, `tryEvalConcat`/`tryEvalTernary`/`tryEvalComparison`, `STRUCTURAL_REF_BY_TYPE`.
- **CLI:** `packages/cli/src/cli/profiles.ts` (profiles as data — startup/enterprise/regulated bundles), `init` command (`--profile`/`--presets`).
- **Stryker:** `packages/cli/stryker.conf.json` (mutate `src/engine/evaluate.ts`, perTest).
- **CI:** `.github/workflows/ci.yml` (no tag triggers), `.github/workflows/release.yml` (`gate` job + `publish needs: [gate]`, actions@v7, `npm publish --provenance`).
- **Docs:** `docs/ROADMAP.md` (status-at-a-glance + dogfood log), `docs/specs/00-architecture-decision-record.md` (HCL parser risk), `docs/user/` (tutorial + how-tos + DSL ref + auto-gen rule catalog).
- **Examples:** `examples/{startup,enterprise,regulated}/.zen/spec.ts` (generated via `npm run gen-examples`).
- **Skills:** `.claude/skills/dotzen-engine-dev/SKILL.md`, `.claude/skills/dotzen-release/SKILL.md` (release.yml snippet synced — gate job + Node 24), `.claude/skills/dotzen-spec-authoring/SKILL.md`.

## How to resume

```bash
cd /Users/ealmachado/projects/dotzen
git pull origin main
# verify state:
npm view @dotzen/dotzen version   # should be 1.9.37
git log --oneline -10             # latest commits
```

Then read `docs/ROADMAP.md` (remaining items + dogfood log) + this file (session context) + `AGENTS.md` (conventions) and pick a direction.

## Session N+1 — 2026-08-11 — session memory harness

**Goal:** close the "agent didn't proactively pull context at session start" gap + the "wins rot, only failures captured" asymmetry. Built the full Tier 1 + Tier 2 + Tier 3 stack from the design discussion.

**Shipped (uncommitted, on `main` working tree):**

- `docs/LESSONS.md` — two-sided append-only log (KEEP/AVOID), 5 seeded entries covering release/parser/CI/engine/process.
- `docs/DECISIONS.md` — one-liner choice log with rejected alternatives.
- `packages/cli/scripts/session-context.ts` + `npm run context` script — deterministic state blob (last tag, drift, npm ver, lesson count).
- `docs/SESSION_HANDOFF.md` — switched from "delete after absorb" → rolling append-only.
- `AGENTS.md` — new "Session bootstrap" section + "Persistence mechanisms" inventory + "When to append to the logs" rules.
- `.opencode/plugins/memory.js` — fires on `experimental.session.compacting`; injects the 4 memory files into compaction context so memory survives context-window compression mid-session.
- `.opencode/plugins/session-state.js` — one-shot reminder on first bash of each session (mirrors `graphify.js` pattern).
- `.githooks/post-commit` + `core.hooksPath = .githooks` — regenerates `.session/state.md` on every commit. Gitignored.
- `CLAUDE.md` — extracted §7's 140-line illustrative condition list (which rotted between releases and explicitly deferred to authoritative sources) into a tight family summary + pointers. 442 → 350 lines, 27K → 20K.
- `.gitignore` — added `.session/`.

**Verified:** typecheck + lint + format + 816 unit tests green. Plugin/hook syntax checked. `npm run context` runs clean. `.githooks/post-commit` writes correct `.session/state.md`. Graphify updated.

**Not done:**
- Aggressive caveman-compress of `CLAUDE.md` — declined as lossy on technical reference; structural trim done instead.
- No release. Nothing here is version-bearing (all meta/tooling/docs).

**Next session resume:** run `npm run context` from `packages/cli/`, grep `docs/LESSONS.md` for the topic, decide direction. If adopting a real engine change, this harness now forces you to see the rolling memory before acting.

## Session N+2 — 2026-08-18 — rebrand recovery + naming sprint (INCOMPLETE — see docs/REBRAND.md)

**Goal:** recover the lost rebranding plan (original discussion died with a pre-harness session) and drive it to a locked name.

**Recovered + decided (full detail in `docs/REBRAND.md`):**
- Trigger confirmed: trademark conflict on "dotzen". Scope: total rebrand (all 6 axes).
- Locked: umbrella **tafros** · pattern **C** (mascot + coined technical name) · mascot **crocodile** · GH `tafros-hq` direction · domain `tafros.dev` direction.
- Naming sprint: ~40 candidates screened (npm + GitHub + DDG common-law). Front-runners: **Squama, Sphragis, Gharial, Erkos**. Sobek was the user's pick but stepped back for zero-risk (Hi-Rez/Smite class-9 adjacency + 4 live USPTO apps). Suchus deprioritized (pronunciation). Animal-type architecture dead on npm.
- Strategy: governance-OS endgame accepted as direction (npx-compatible, NixOS as reference architecture, "pure function of the spec" thesis), launch stays wedge-shaped ("control plane" for buyers, "NixOS for governance" for devs). OS architecture work = DomainAdapter isolation, 3-6mo, post-rebrand.

**Open (blocking Phase C-E execution):**
- Tool name — user holding. Live candidates + screening data in `docs/REBRAND.md` matrix. Don't re-screen; data is current as of 2026-08-11/18.
- Contract-file renames (`dotzen.json`, `.zen/`) — recommend yes, decide with name.
- tafros-hq org / npm org / tafros.dev — unclaimed, user action required.

**Also this session:** model switch prep — glm-5.3 exists only under `zai-coding-plan` provider (not plain `zai`); restart + `/models` → ZAI Coding Plan group, or pin `"model": "zai-coding-plan/glm-5.3"` in config. Session restarted for this.

**Next session resume:** read `docs/REBRAND.md` first. If name locked → Phase C checklist. If still holding → live candidates are Squama/Sphragis/Gharial/Erkos; present, don't push.

## Session N+3 — 2026-09-01 — VS Code spec + full security audit + qs fix

**Goal:** session-start memory recovery, then VS Code extension design, then a full cybersecurity review of the project.

**Shipped:**
- `docs/specs/11-vscode-extension.md` (NEW) — name-agnostic extension design: bundled in-process engine (prereq: export `check` from package index), CLI coexistence, severity/trigger tables, lockstep versioning, Marketplace + Open VSX, P1–P3 phasing gated on rebrand name. Commit `2c3296c`.
- Full security audit (engine src, CI workflows, release pipeline, gitleaks config, SARIF/terminal rendering, dynamic regexes, prototype-pollution vectors): zero critical/high; all 8 dynamic-RegExp sites escape-verified (`parse.ts:43`, `normalize.ts:2487`, `evaluate.ts:1781`); no child_process/eval/vm; OIDC trusted publishing confirmed.
- `packages/cli/package.json` + lockfile — `overrides.typed-rest-client.qs = "6.15.3"` (GHSA-q8mj-m7cp-5q26 moderate DoS; exact pin made `audit fix` a no-op). Dev-only chain via Stryker. Audit → 0 vulns; 816 tests green. Commit `fc12e1d`.
- `docs/LESSONS.md` — audit-gate blind spot + override lesson (in `fc12e1d`).
- Both commits rebased onto Renovate #9 (`5faf4e6`) and pushed to origin/main.

**Deferred / blocked:**
- VS Code extension BUILD — gated on rebrand tool-name decision (`docs/REBRAND.md`; candidates Squama/Sphragis/Gharial/Erkos, user holding).
- Security hardening recs #2–#3: README trust-boundary note (spec.ts exec), C0/C1 control-char strip in `makePaint` (`src/report/report.ts:23`).
- Stale `wip-2026-08-18-1540` tag: its work landed in `ee015a1` — delete it.

**Next resume step:**
- Rebrand decision is the global blocker (name → Phase C → VS Code P1 → launch). Read `docs/REBRAND.md` first; if name locked, run Phase C checklist.

## Session N+4 — 2026-09-01 — docs deep-read + stale user-docs fixes

**Goal:** onboard a fresh agent via a full docs read (all 11 specs + user docs + memory files), then fix the staleness the read surfaced.

**Shipped:**
- Full read-through: specs 00–08/10/11, user docs, REBRAND/ROADMAP/LESSONS/DECISIONS, launch post. Context loaded.
- `docs/user/what-it-does.md` — replaced stale "No multi-hop dependency graph (yet)" bullet (graph layer shipped v1.9.26–29) with the real limit (graph rules are module-scoped; module-output edges are a future iteration, per spec 10); added a topology-aware bullet to the capabilities list; rule counts 140 → 144 (verified against the generated catalog).
- `docs/user/reference/dsl.md` — rewrote the "known edge case" note about NAT-gateway `subnet_id`: resource-type-aware classification shipped in v1.9.29 (`classifyEdge` + `STRUCTURAL_REF_BY_TYPE`, `engine/evaluate.ts:330`).
- Commit `ced968d` "docs(user): fix stale graph-layer claims" pushed to origin/main (owner-push bypass accepted — docs-only, per the 2026-09-01 ci lesson). check-docs gate green.
- LESSONS: docs-staleness entry appended (same date).

**Not done / notes:**
- `dsl.md` has a **pre-existing** prettier warn — root `docs/` is outside the `packages/cli` format gate; left as-is deliberately.
- N+3 deferred security recs still open: README trust-boundary note (spec.ts exec), C0/C1 control-char strip in `makePaint` (`src/report/report.ts:23`), stale `wip-2026-08-18-1540` tag deletion.
- This section + the LESSONS entry are uncommitted by design (`/handoff` never commits — explicit user action).

**Next resume step:** unchanged from N+3 — the rebrand tool-name decision is the global blocker (`docs/REBRAND.md`; live candidates Squama / Sphragis / Gharial / Erkos — present, don't push).

## Session N+5 — 2026-09-01 — rebrand: erkos umbrella locked + Phase D inventory

**Decided:**
- **Umbrella brand = erkos** (user decision; supersedes the 2026-08-18 tafros lock — DECISIONS.md entry added). Derived identities: GH org **erkos-hq** (github.com/erkos taken by an inactive 2011 account — verified; erkos-hq verified open), npm scope **@erkos-hq/<tool>**, domain direction **erkos.dev** (DNS unresolved — verify at registration).
- **Tool name still open** (user holding: "None for now. I'll rebrand the tool name"). Live candidates: Squama / Sphragis / Gharial — all re-verified free on npm 2026-09-01. Gharial's *erkos odonton* tie is restored by the flip; Erkos is no longer a candidate (it's the umbrella).

**Shipped:**
- Full rebrand blast-radius inventory (3 explore agents): **1,063 textual occurrences / 112 files** + filename-only artifacts (43 `dotzen.json`, 46 `.zen/` dirs, `bin/dotzen.js`, 3 `.claude/skills/dotzen-*` dirs). Discovered beyond the original Phase D list: second synthetic ruleId `dotzen.ungoverned` (`report.ts:308`), `DOTZEN_ENV_FILE`/`dotzen.env` + `.gitignore:8`, SARIF driver name (`report.ts:327`), ci-templates emitted YAML, trusted-publisher binding being npm-side repo-identity (not just YAML).
- **Phase D execution playbook embedded in `docs/REBRAND.md`** (18-row coupling table + ordering + clean-files list) — the mechanical rebrand is executable by any future session with zero re-discovery the moment the tool name locks.
- REBRAND/DECISIONS/SESSION_HANDOFF updated per append-only convention (tafros rows superseded with dates, not deleted).

**Blocked on user:**
- Tool name → then Phase C remainder (repo transfer to `erkos-hq/<tool>`, Trusted Publisher registration), Phase D (one branch/PR, squash as v2.0.0 prep), Phase E (publish, deprecate `@dotzen/dotzen`, launch post), VS Code P1.
- Name-independent NOW: create GitHub org **erkos-hq**, npm org **erkos-hq**, optionally register **erkos.dev** (~15 min).

**Next resume step:** read `docs/REBRAND.md` (updated matrix + playbook). If tool name locked → Phase C items 2/4 (repo transfer + TP registration), then execute Phase D from the embedded table.

