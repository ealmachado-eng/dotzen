---
name: dotzen-release
description: Use this skill when cutting a new dotzen release, publishing to npm, writing or modifying the release CI pipeline, bumping the engine version, or updating the CHANGELOG. Triggers on requests like "release a new version", "publish to npm", "bump the version", "set up the release pipeline", or edits to the release jobs in .github/workflows/release.yml. (dotzen ships no native binary — the parser is the @cdktf/hcl2json WASM dep — so there is no Go build or macOS signing to do.)
---

# dotzen Release Engineering

Read `/docs/specs/03-distribution-and-cli.md` in full before making any
change here — this skill is a checklist derived from it, not a
replacement for it.

## Pre-release checklist (in order)

Run every step; do not skip. A missed step here surfaces as a failed CI
pipeline on the tag (which blocks the release) or a broken published
package (which blocks consumers).

1. **Does this release change the spec DSL vocabulary or API shape** in
   any way a consumer's `.zen/spec.ts` depends on? If yes, this needs a
   CHANGELOG entry under a "Migration" heading even if technically
   backward-compatible, and the version bump should be treated as
   meaningful (not just a patch) regardless of strict semver mechanics
   — consumers need to know whether re-reading their spec is warranted.
2. **Does this release add or change a rule in dotzen's own
   documentation examples?** Verify every example in `/docs/specs/`
   still reflects the current `RuleBuilder` API shape (no `.build()`,
   current enum names) — stale examples in the docs are worse than no
   examples.
3. **Bump `packages/cli/package.json` `version`.** Per the CHANGELOG
   header convention: new spec DSL vocabulary (resource types,
   attributes, conditions, enums) = a feature bump (`0.X.0`), not a
   patch, even when backward-compatible. Bug fixes / engine internals =
   patch.
4. **Add a CHANGELOG entry** under a new `## <version>` heading. Cover:
   Added / Changed / Migration notes for spec authors. Be specific about
   which resources/attributes/enums were added and which engine
   behaviors changed (call out any case where a previously
   could-not-evaluate finding now becomes a definite verdict — that
   surfaces new violations on existing configs, which consumers must
   know about).
5. **Update `docs/ROADMAP.md`** — add a `### <area> (<version>) — DONE`
   section (or mark an existing item DONE) for whatever this release
   delivered. The roadmap is the cross-reference between versions and
   capability areas; a release without a roadmap entry is invisible to
   anyone scanning capability coverage.
6. **Run the local gate — from `packages/cli/`, the same directory CI
   runs in:**
   ```bash
   cd packages/cli
   npm run typecheck      # tsc --noEmit
   npm run lint           # eslint .  (0 errors required; warnings are pre-existing)
   npm run format:check   # prettier --check .   ← run from packages/cli, NOT repo root
   npm test               # vitest run src       (unit)
   npm run test:integration # vitest run tests  (end-to-end fixtures)
   npm run build          # tsc -p tsconfig.build.json  (produces dist/)
   npm pack --dry-run     # verify the tarball payload is dist/ + bin/ only
   npm run check-docs     # rule-doc freshness: gen-docs output must match committed docs/user/reference/rules/
   ```
   The `format:check` step is the one that bit the v0.2.0 release:
   running `prettier --check` from the repo root (or on a hand-picked
   file list) can report clean while CI — which `cd packages/cli` first
   — finds unformatted files. **Always run it from `packages/cli/`** so
   local and CI see the same relative paths. If it fails, run
   `npm run format` (prettier --write) from that directory, re-stage,
   and re-run the gate. The `check-docs` step (added with the v1.9.23
   user-docs set) fails if a preset changed without regenerating the
   rule catalog — fix with `npm run gen-docs`, stage the result, re-run.
   It is also wired into `.github/workflows/ci.yml` so CI is the
   non-bypassable backstop.
7. **Commit the release prep** (version bump + CHANGELOG + ROADMAP +
   any formatting fixes). If formatting fixes land in a *separate*
   commit on top of the feature commit (as happened in v0.2.0), that is
   fine — the tag points at the tip.
8. **Tag `v<version>`** matching `package.json` exactly (`git tag v0.2.0`).
   The tag is what triggers the `publish` CI job. Never publish from an
   untagged or dirty tree.
9. **Never publish with the npm `latest` dist-tag as an accident of
   default `npm publish` behavior without confirming that's intended.**
   Every publish goes to a specific version; `latest` dist-tag placement
   is a separate, deliberate decision. See
   `/docs/specs/03-distribution-and-cli.md` §"Version pinning" for why
   `@latest` resolution is actively dangerous for a governance tool's
   consumers — do not make it easier to depend on accidentally.

## Pushing the release

```bash
git push origin main
git push origin v<version>
```

If the tag was already pushed and needs to move (e.g. you amended the
release commit after pushing), `--force` the tag:

```bash
git push origin v<version> --force
```

Caveat: if `v*` is a **protected tag** in GitHub (Settings → Tags → tag
protection rule), force-push/move is restricted. Either temporarily remove
the protection rule, or delete + recreate the remote tag:
```bash
git push origin :refs/tags/v<version>   # delete remote
git push origin v<version>              # recreate at the new commit
```
Then re-add the protection rule. (GitLab's old "protected tag" concept —
`Settings → Repository → Protected tags` — no longer applies post-migration.)

## The version-bump is also a documentation update

Bumping `ENGINE_VERSION` in the package is not just a version-string
change. Cross-check:
- The example `dotzen.json` snippets across `/docs/specs/` — do they
  need updating to reflect a new minimum recommended version?
- Any hardcoded version string in this skill file, `CLAUDE.md`, or
  other skills — these should generally reference "the version in
  `dotzen.json`" conceptually rather than a hardcoded number, but if a
  concrete example version appears anywhere, check it isn't now
  misleadingly stale.

## Release CI pipeline shape (GitHub Actions)

dotzen ships **no native binary** — the HCL parser is the pure-JS
`@cdktf/hcl2json` WASM dependency (ADR §2a). A release is therefore just:
build the TypeScript `dist/`, then `npm publish`. **There is no Go build
matrix and no macOS signing/notarization** — earlier drafts had those; they
are obsolete and must not be reintroduced (see ADR §2a before ever adding
a native binary).

The publish workflow uses **npm Trusted Publishing (OIDC)** — no stored
`NPM_TOKEN`. npm exchanges the GitHub Actions OIDC token for a short-lived
publish token at publish time. The current workflow in
`.github/workflows/release.yml`:

```yaml
# .github/workflows/release.yml — release (actual current shape; keep in sync)
name: release
on:
  push:
    tags: ["v*"]                # only on vX.Y.Z tags
permissions:
  contents: read
jobs:
  # Correctness gate — mirrors ci.yml's `test` job. publish runs ONLY after
  # this passes, so a tag pushed with a failing check does NOT ship to npm.
  # (ci.yml does not fire on tags; security scans audit/semgrep/gitleaks ran
  # on the PR/commit that became the tag, so they're not re-run here.)
  gate:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: packages/cli } }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '24', cache: npm, cache-dependency-path: packages/cli/package-lock.json }
      - run: npm install --no-audit --no-fund
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: npm run test:integration
      - run: npm run coverage
      - run: npm run check-docs

  publish:
    needs: [gate]               # publish waits for the gate — not parallel
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write           # REQUIRED for npm trusted publishing (OIDC)
    defaults: { run: { working-directory: packages/cli } }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          # Node 24 → npm 11.x. REQUIRED for trusted publishing: the OIDC →
          # publish-token exchange needs npm CLI ≥ 11.5.1; Node 20 ships npm
          # 10.x, which is too old (the exchange silently fails, the PUT goes
          # anonymous, and npm returns 404 "not in this registry" — provenance
          # signing still succeeds because sigstore uses the GitHub OIDC token
          # directly, masking the publish-token failure).
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
          cache: npm
          cache-dependency-path: packages/cli/package-lock.json
      - run: npm install --no-audit --no-fund
      - run: npm run build
      # The repo is PUBLIC on GitHub → sigstore provenance works (was E422 on
      # the old private GitLab repo). Keep --provenance so the npm page shows
      # the attestation.
      - run: npm publish --access public --provenance
```

Notes (each is a real failure mode — do not relearn):
- **Trusted Publisher must be configured on npmjs.com** (Package → Settings →
  Trusted publishing): repository owner=`ealmachado-eng`, name=`dotzen`,
  workflow filename=`release.yml`, allowed action=`npm publish`. npm does
  **not** validate these fields when you save them — a mismatch only
  surfaces at publish time as `ENEEDAUTH`. Re-verify before each release if
  anyone touched the repo path or workflow filename.
- **`permissions: id-token: write` is mandatory.** Without it the OIDC token
  isn't issued and `npm publish` fails auth. The `contents: read` is for
  checkout. Do not broaden to `write-all`.
- **Node 24 (npm 11.x), NOT Node 20.** Trusted publishing — the OIDC →
  publish-token exchange — requires npm CLI ≥ 11.5.1. Node 20 ships npm 10.x,
  which is too old: the exchange silently fails, the publish PUT goes
  anonymous, and npm returns **404 "not in this registry"** (the exact symptom
  that bit the v1.9.24 first-GitHub-publish). Provenance *signing* still
  succeeds on Node 20 (sigstore uses the GitHub OIDC token directly, not the
  npm publish token), which masks the failure — don't be fooled by a signed
  provenance statement followed by a 404. Both the `gate` and `publish` jobs
  use `node-version: '24'`.
- **No `NPM_TOKEN` / `.npmrc` write.** The old stored-token path wrote
  `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` to `~/.npmrc`. With
  trusted publishing there is no token variable — that line writes a blank
  `_authToken`, which npm rejects with `ENEEDAUTH`. Do not reintroduce it.
- **Provenance now works (public repo).** The repo moved from a private
  GitLab repo (provenance E422-blocked) to a **public** GitHub repo, so
  `--provenance` is on and the npm page gets the sigstore attestation from
  `v1.9.24` onward. Past releases (v1.9.1–v1.9.23) keep their pre-provenance
  state on npm — attestation is not retroactive.
- **`v*` tag triggers it.** Pushing a `vX.Y.Z` tag fires `release.yml`. Works
  on hosted runners (`ubuntu-latest`) AND self-hosted runners — unlike
  GitLab (where trusted publishing was shared-runner-only). See
  `docs/dev/setup-runner.md`.
- **Tag = version.** The `v*` tag must match `package.json`. Never publish
  from an untagged or dirty tree.


## No binary to build (was: cross-compilation note)

There is no Go binary or per-OS artifact to cross-compile — the package is
pure JS plus the `@cdktf/hcl2json` WASM dependency, shipped as one
cross-platform tarball. That is the whole point of the WASM parser choice
(ADR §2a): no build matrix, no signing, no Gatekeeper. If a native parser
is ever reintroduced (the ADR says don't), revisit
signing/notarization then.

## Post-release verification

After a release is published, verify the zero-install promise still
holds before considering the release complete — run the **published**
package (via `npx`, not the local build) against repo fixtures:

```bash
# A violating fixture — expect the documented violation count.
npx @dotzen/dotzen@<new-version> check ./packages/cli/tests/integration/fixtures/violating-project/
# A clean fixture (use the fixture root, NOT the terraform/ subdir —
# dotzen needs the dotzen.json at the fixture root to locate spec + tf).
npx @dotzen/dotzen@<new-version> check ./packages/cli/tests/integration/fixtures/clean-project/
```

This should complete without any manual install step, any Gatekeeper
dialog on macOS, and any Windows SmartScreen block. If any of these
occur, the release is not actually zero-friction and should be treated
as a release-blocking regression, not a follow-up item — the entire
product thesis (see `/docs/specs/01-product-overview.md`) depends on
this working.

If the release added new resource coverage, also run the matching
fixture (e.g. `serverless-functions/` for v0.2.0) and confirm the
violation/passed counts match the integration test's expectations —
this proves the published package and the local build produce the same
verdicts.
