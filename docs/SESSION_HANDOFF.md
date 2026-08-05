# Session handoff — for the next context window

> Read this + `docs/ROADMAP.md` + `AGENTS.md` to resume. Delete this file after the next session absorbs it.

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
