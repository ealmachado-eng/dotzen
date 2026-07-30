# ONBOARDING — resuming dotzen on a new machine / Claude instance

This file exists so a fresh Claude (or human) can pick up dotzen with zero
prior conversation context. **Read `CLAUDE.md` first** (root) — it is the
authoritative orientation and hard-constraints doc. This file adds the things
`CLAUDE.md` can't: current state, machine setup, and the immediate next task.

_Last updated: 2026-07-10, at published version **0.1.2**._

---

## 0. TL;DR — get running in 5 steps

```bash
git clone https://github.com/ealmachado-eng/dotzen.git
cd dotzen/packages/cli
npm install                 # NOT `npm ci` — see §3
npm run typecheck && npm run lint && npx vitest run && npm run build   # gate: all green (217 tests)
node bin/dotzen.js check examples/ai-generated                          # see it fire on the corpus
```

If the gate is green and the corpus check prints violations, you are fully
set up. Then read `CLAUDE.md`, then §5–§6 below.

---

## 1. What dotzen is (one paragraph)

A **governance layer for AI-generated Terraform** — "Prose as Code." A
Node/TypeScript CLI (`@dotzen/dotzen`, run via `npx`) that statically
analyses HCL against rules written in a fluent, enum-backed TypeScript DSL
(`.zen/spec.ts`). Parsing uses the official `hashicorp/hcl` parser compiled
to WASM (`@cdktf/hcl2json`), in-process. Full rationale in `CLAUDE.md` and
`docs/specs/*` (read `00-architecture-decision-record.md` before any
architectural change).

## 2. Current state (source of truth: `origin/main`)

- **Published:** `@dotzen/dotzen@0.1.2` is npm `latest`. `package.json`
  version = `0.1.2` and **matches npm**.
- **Repo:** `github.com/ealmachado-eng/dotzen`. `main` is fully synced and
  contains everything below. Just clone it.
- **Coverage:** three clouds at CIS-L1 (AWS deepest; Azure + GCP slices),
  ~24 conditions, multi-root + per-environment scoping, `dotzen init`
  scaffolding, and **module-following** (local sources, single level).
- **Version discipline:** the **next runtime change must bump to `0.1.3`**
  before publishing. Test/docs-only changes do **not** bump (tests aren't
  shipped — `package.json` `files: ["dist","bin"]`).
- **Branch hygiene:** these feature branches are merged and safe to delete
  (local + remote): `feat/module-following`, `feat/rds-cluster-instance`,
  `fix/merge-tag-resolution`, `test/env-layer-fixture`.

## 3. Machine setup gotchas (learned the hard way)

- **Node ≥ 18** (developed on 24). npm 11.
- **Use `npm install`, not `npm ci`.** Cross-platform optional native deps
  (rolldown / `@emnapi`) aren't all in the lockfile on every OS; `npm ci`
  fails. CI uses `npm install --no-audit --no-fund`. (See doc 07.)
- **Line endings:** `.gitattributes` forces LF repo-wide, so the Prettier
  gate stays happy on Windows. No action needed — but don't remove it.
- **Windows "dubious ownership"** from git: run
  `git config --global --add safe.directory <repo-path>`.
- **GitLab push auth:** needs a credential (PAT / OS credential manager).
- **npm publish auth:** `npm login`, or a granular automation token in
  `.npmrc`. See `.claude/skills/dotzen-release/SKILL.md`.

## 4. How to run

| Task | Command (from `packages/cli/`) |
|---|---|
| Check a project | `node bin/dotzen.js check <dir>` (or `npx @dotzen/dotzen check`) |
| Scaffold | `node bin/dotzen.js init` |
| Unit tests | `npx vitest run` |
| Integration | `npm run test:integration` |
| Full gate | `typecheck` + `lint` + `format:check` + `vitest` + `build` |

The gate also runs as three **parallel subagents** (`.claude/agents/`):
`test-runner`, `code-quality`, `security-scan`. A feature is not done until
all three pass and CI is green (`.github/workflows/ci.yml`).

## 5. Non-negotiable invariants — READ BEFORE WRITING CODE

1. **Never false-positive.** If a value can't be resolved, degrade to
   **"could not evaluate"** — never guess, never claim a violation you can't
   prove. This is the product's entire credibility. (Same for absence: never
   claim a tag/attr is missing when a `var` could supply it.)
2. **Module-layer vs env-layer** — the recurring lesson. *Hardcoded* controls
   (e.g. `storage_encrypted = true`) resolve when scanning a **module
   library**; *caller-supplied* values (tags, cidrs, retention) only resolve
   at the **env/deployment layer** via module-following. There are therefore
   **two spec styles** (see §7).
3. **No bare strings for domain values** — resource types, ports, effects,
   attributes are enum-backed. The one exception: **tag KEYS** (org-defined).
4. **Never `@latest`** in any script/CI/docs example — always `dotzen.json`
   version pinning.
5. **jiti alias:** a scaffolded spec's `import … from '@dotzen/dotzen'`
   resolves to the *running engine* via an alias in `src/spec/load.ts`. Don't
   break it, or `npx`-run specs stop resolving.
6. **Module-following:** local sources only, single level, **confined to
   `projectRoot`** (never follow a path that escapes the scanned project).
7. Read the matching skill before editing: `.claude/skills/dotzen-engine-dev`
   (engine), `dotzen-spec-authoring` (`.zen/spec.ts`), `dotzen-release`
   (publishing).

## 6. Immediate next task (recommended)

**Fix `mustHaveAssociated` through `local` indirection** — small, high-value,
surfaced during real dogfooding. See `docs/ROADMAP.md` → "[Med]
Cross-resource association through `local` indirection." Today the
association index links a child to its parent only by a *direct* ref
(`bucket = aws_s3_bucket.x.id`); real modules route through a local
(`bucket = local.bucket_name`, where `local.bucket_name =
aws_s3_bucket.main.id`), so the link fails → S3 SSE/versioning checks must be
omitted to avoid a false violation. Fix: resolve the association ref through
`local`/`var` (reuse the existing scope resolver in `src/hcl/normalize.ts`)
before indexing in `src/engine/evaluate.ts` (`buildAssociations`). Test-first,
with a fixture module that uses the `local` indirection.

## 7. Two spec patterns (both proven, both in-repo)

- **Module-library spec** — governs *hardcoded* controls when scanning a
  module library (e.g. S3 public-access-block, RDS `storage_encrypted`, EC2
  IMDSv2). Produces real passes at the module layer.
- **Env-layer spec** — governs *caller-supplied* values at the deployment
  layer; module-following threads the caller's inputs in. Worked example +
  regression fixture: `packages/cli/tests/integration/fixtures/env-layer/`
  (`.zen/spec.ts`, per-env `dotzen.json`, module + env layout).

## 8. Where everything is

- **`CLAUDE.md`** — orientation + hard constraints (start here).
- **`docs/specs/00–08`** — design docs (ADR, DSL, distribution, governance,
  future cloud, engine architecture, dev workflow, module-following).
- **`docs/ROADMAP.md`** — done items + prioritized backlog.
- **`.claude/skills/`** — engine-dev, spec-authoring, release skills.
- **`.claude/agents/`** — the three quality-gate subagents.
- **`packages/cli/src/`** — engine (`engine/`), HCL adapter (`hcl/`), DSL
  (`spec/`, `vocabulary/`), reporting (`report/`), Result ROP (`result/`).
- **`packages/cli/examples/ai-generated/`** — the multi-cloud test corpus.
