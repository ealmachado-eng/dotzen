# Session handoff — for the next context window

> Read this + `docs/ROADMAP.md` + `AGENTS.md` to resume. Delete this file after the next session absorbs it.

## Current state (v1.9.28, 2026-07-30)

- **Repo:** `github.com/ealmachado-eng/dotzen` (public). `origin` = GitHub. GitLab archived.
- **npm:** `@dotzen/dotzen@1.9.28` latest, published via GitHub OIDC + SLSA provenance.
- **CI:** `.github/workflows/ci.yml` (Node 24, 769 unit + 40 integration + check-docs + semgrep + gitleaks) + `release.yml` (Node 24 / npm 11, trusted publishing, `--provenance`).
- **Renovate:** onboarded, majors-gated (`dependencyDashboardApproval: false` + major-gate packageRule). **typescript major BLOCKED** (`enabled: false` — typescript-eslint doesn't support TS 7 yet; tracking issue typescript-eslint#10940). `.gitlab-ci.yml` removed (dead after migration).
- **Branch protection:** `require-ci-on-main` ruleset (status checks required) + `v*` tag ruleset. Squash-merge only.
- **Docs:** full user docs in `docs/user/` (tutorial + 6 how-tos + DSL reference + auto-generated rule catalog via `npm run gen-docs`). Design spec for the graph layer at `docs/specs/10-graph-layer.md`.
- **143 rules** across 8 presets (core-security + cis-aws/azure/gcp + pci-dss/soc2/nist-800-53/data-protection).

## Session arc (v1.9.19 → v1.9.28, 10 releases)

1. Compound caller inputs (toset/concat/flatten/merge static evaluation).
2. BigQuery multi-access-block flattener + list-aware denyValue.
3. 2 dogfood FP fixes (conditional dynamic blocks, cross-module association aliasing).
4. SARIF 2.1.0 output (+ ingestion fix for trace URIs + project-level locations).
5. GitLab → GitHub migration (repo + CI + npm trusted publishing + provenance).
6. v2 graph layer: `buildGraph` + 3 conditions (`denyIfReachable`, `denyIfSharedWith`, `denyIfReachableAttr`) + edge types + violation path detail.
7. User docs (tutorial, how-tos, auto-generated catalog, DSL reference).
8. Dogfood rounds (13 repos across terraform-aws-modules / Azure / terraform-google-modules / cloudposse).

## Immediate next steps (ranked)

1. **Launch / adoption** — the engine is feature-complete + documented + provenance-attested. A Show HN / r/terraform post is the #1 traction lever. Docs are ready.
2. **Graph improvements** (from ROADMAP):
   - Resource-type-aware edge classification (NAT `subnet_id` → structural, not routing).
   - CNE for unresolved graph edges (false-negative gap).
   - Path detail for `denyIfSharedWith` + `denyIfReachableAttr`.
   - More routing attrs (`peer_vpc_id`, `customer_gateway_id`, etc.).
   - Azure graph conditions (VM → NIC → public IP).
3. **More preset rules** — round-11 ungoverned enum-adds + org-profile example specs.
4. **VS Code extension** — inline `.tf` findings (larger lift, high adoption value).

## Known issues / gotchas (don't re-discover these)

- **Graph NAT false positive:** `subnet_id` on `aws_nat_gateway` is classified as `routing` (it IS a routing attr name), but semantically it's a deployment ref. Creates a false chain: private_DB → … → NAT → subnet_id → public_subnet → … → IGW. Fix: resource-type-aware edge classification (classify by attr name + resource type). The `vpc_id` false-positive was fixed by edge types (structural), but this one needs per-resource-type classification.
- **Renovate `mode: silent`:** the Mend hosted app defaults to `mode: silent` (detects updates, populates dashboard, but doesn't auto-create PRs unless ticked). Check the Mend dashboard if "no PRs appear" — it may need a mode toggle.
- **npm no-republish:** once a version number is published (even if unpublished), npm blocks republishing it. v1.9.24 was skipped for this reason. Always use a fresh version number after any publish.
- **Trusted publishing requires Node 24 (npm 11):** Node 20 / npm 10.x silently fails the OIDC token exchange → 404 "not in this registry." The release.yml uses `node-version: '24'`.
- **check-docs gate:** `npm run check-docs` regenerates + diffs the rule catalog. After ANY preset change, run `npm run gen-docs` + commit the output, or the gate fails.
- **`.gitlab-ci.yml` was removed** (dead after migration). Don't recreate it.

## Key operational facts

- **Gate (run from `packages/cli/`):** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:integration && npm run coverage && npm run check-docs`
- **Release flow:** bump `package.json` version → add CHANGELOG entry → commit → `git tag vX.Y.Z` → `git push origin main && git push origin vX.Y.Z` → release.yml publishes via GitHub OIDC + provenance.
- **Generate rule docs:** `npm run gen-docs` (from `packages/cli/`). Output committed to `docs/user/reference/rules/`.
- **Graph layer code:** `evaluate.ts` — `buildGraph()` (~L310-520), `evalDenyIfReachable` (~L1935), `evalDenyIfSharedWith` (~L1975), `evalDenyIfReachableAttr` (~L2000). Design spec: `docs/specs/10-graph-layer.md`.
- **Skills:** `.claude/skills/dotzen-engine-dev/SKILL.md` (engine conventions), `.claude/skills/dotzen-release/SKILL.md` (release flow + OIDC gotchas), `.claude/skills/dotzen-spec-authoring/SKILL.md` (rule DSL).

## How to resume

```bash
cd /Users/ealmachado/projects/dotzen
git pull origin main
# verify state:
npm view @dotzen/dotzen version   # should be 1.9.28
git log --oneline -5              # latest commits
```

Then read `docs/ROADMAP.md` (remaining items) + this file (session context) + `AGENTS.md` (conventions) and pick a direction.
