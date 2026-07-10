---
name: dotzen-release
description: Use this skill when cutting a new dotzen release, publishing to npm, writing or modifying the release CI pipeline, bumping the engine version, or updating the CHANGELOG. Triggers on requests like "release a new version", "publish to npm", "bump the version", "set up the release pipeline", or edits to the release jobs in .gitlab-ci.yml. (dotzen ships no native binary — the parser is the @cdktf/hcl2json WASM dep — so there is no Go build or macOS signing to do.)
---

# dotzen Release Engineering

Read `/docs/specs/03-distribution-and-cli.md` in full before making any
change here — this skill is a checklist derived from it, not a
replacement for it.

## Pre-release checklist (in order)

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
3. **Never publish with the npm `latest` dist-tag as an accident of
   default `npm publish` behavior without confirming that's intended.**
   Every publish goes to a specific version; `latest` dist-tag placement
   is a separate, deliberate decision. See
   `/docs/specs/03-distribution-and-cli.md` §"Version pinning" for why
   `@latest` resolution is actively dangerous for a governance tool's
   consumers — do not make it easier to depend on accidentally.

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

## Release CI pipeline shape (GitLab CI)

dotzen ships **no native binary** — the HCL parser is the pure-JS
`@cdktf/hcl2json` WASM dependency (ADR §2a). A release is therefore just:
build the TypeScript `dist/`, then `npm publish`. **There is no Go build
matrix and no macOS signing/notarization** — earlier drafts had those; they
are obsolete and must not be reintroduced (see ADR §2a before ever adding a
native binary).

Add a tag-triggered job to `.gitlab-ci.yml` (after the test + security
stages, which must be green first):

```yaml
# .gitlab-ci.yml — release stage
publish:
  stage: release
  image: node:20-bookworm
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v/' # only on vX.Y.Z tags
  before_script:
    - cd packages/cli
    - npm install --no-audit --no-fund # not `npm ci` — see the CI gate note
  script:
    - npm run build
    - echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
    - npm publish --provenance --access public
```

Notes:
- **`NPM_TOKEN`** is a **masked, protected** CI/CD variable (Settings →
  CI/CD → Variables). Never commit the token or the generated `.npmrc`.
- **Provenance.** `--provenance` attests the package to the source commit +
  CI build. It requires an OIDC-capable pipeline; if your runner can't
  provide it yet, drop the flag (publish still works) and revisit — for a
  governance tool, provenance is worth getting on later.
- **Tag = version.** The `v*` tag must match `package.json` /
  `dotzen.json`. Never publish from an untagged or dirty tree.

## No binary to build (was: cross-compilation note)

There is no Go binary or per-OS artifact to cross-compile — the package is
pure JS plus the `@cdktf/hcl2json` WASM dependency, shipped as one
cross-platform tarball. That is the whole point of the WASM parser choice
(ADR §2a): no build matrix, no signing, no Gatekeeper. If a native parser
is ever reintroduced (the ADR says don't), revisit
signing/notarization then.

## Post-release verification

After a release is published, verify the zero-install promise still
holds before considering the release complete:

```bash
# From a clean environment (or at minimum, clear the npx cache):
npx @dotzen/dotzen@<new-version> check ./some/test/terraform/
```

This should complete without any manual install step, any Gatekeeper
dialog on macOS, and any Windows SmartScreen block. If any of these
occur, the release is not actually zero-friction and should be treated
as a release-blocking regression, not a follow-up item — the entire
product thesis (see `/docs/specs/01-product-overview.md`) depends on
this working.
