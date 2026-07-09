# dotzen

**Prose as Code.** Governance for AI-generated Terraform infrastructure.

> **Status: working v0 vertical slice.** A complete static-analysis engine
> lives in `packages/cli/` — **22 rule conditions** across **three clouds**
> (AWS deep; Azure and GCP at ~CIS Foundations L1), ~200 tests, and a
> representative AI-generated multi-cloud corpus it fires correctly on. Not
> yet published to npm — run it from the repo for now (see below). The
> design rationale behind every choice lives in `docs/specs/`; start with
> the ADR.

## What this is

```bash
npx @dotzen/dotzen check ./terraform/      # the target UX (once published)
```

A zero-install governance layer that catches policy violations in
Terraform HCL — especially the kind AI code-generation tools produce when
they don't know your organization's security, tagging, and compliance
requirements. Rules are written in a readable, strongly-typed TypeScript
DSL (`.zen/spec.ts`) designed to be reviewable by a security architect who
has never written code:

```ts
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH, Port.RDP)
  .message('SSH and RDP must not be open to the internet')
  .rationale('CIS AWS Foundations Benchmark, control 5.2')
```

Every finding is `block` (fails the build), `warn`, or `require_approval`
(pauses CI for sign-off). When dotzen can't statically resolve a value it
reports **"could not evaluate"** rather than guessing — for a governance
tool, a false positive is worse than an honest gap.

## What works today

- **Three clouds, one engine.** AWS (security groups, RDS, S3, EBS/EFS,
  KMS, EC2, DynamoDB, ECR, IAM, ECS/EKS, ALB/NLB, Secrets Manager, VPC,
  CloudTrail, IAM password policy), **Azure** and **GCP** at ~CIS
  Foundations Level 1. The pipeline and rule conditions are shared; adding
  a cloud is per-provider vocabulary + rules (plus a small parser mapper
  for network rules).
- **Honest static resolution** — follows sole `var`/`local` references
  across files, expands `dynamic` blocks whose `for_each` resolves,
  flattens nested blocks to dotted keys at any depth, and degrades to
  "could not evaluate" on `jsonencode(...)`/unresolved input.
- **`dotzen init`** scaffolds a spec, detecting existing Terraform
  (including per-environment `env/{dev,stg,prd}` layouts and guessing the
  environment mapping — which you then edit by hand).
- **Version pinning** via `dotzen.json` (the engine refuses to run on a
  mismatch; never `@latest` in automation).
- Terminal output (TTY/`NO_COLOR`-aware ANSI) + `--format json`;
  multi-root support with isolated per-root scope.

## Run it from the repo (pre-publish)

```bash
cd packages/cli
npm install
npm run build
node bin/dotzen.js check examples/ai-generated
```

## Start here (design docs)

- **`CLAUDE.md`** — orientation for any Claude instance (or engineer)
  picking up this project. Read this first.
- **`docs/specs/00-architecture-decision-record.md`** — why Node/TypeScript
  + npx won on adoption friction, and the category-level reasons the
  alternatives were rejected. The decision is locked; the ADR exists to
  keep it from being re-litigated.
- **`docs/specs/01-product-overview.md`** — the problem, the "Prose as
  Code" philosophy, and positioning vs. OPA/Sentinel/tfsec.
- **`docs/specs/02-spec-dsl.md`** — the `.zen/spec.ts` language spec,
  including the per-provider vocabulary namespacing.
- **`docs/specs/03-distribution-and-cli.md`** — npx mechanics, version
  pinning, and the WASM-parser distribution choice (`@cdktf/hcl2json`).
- **`docs/specs/04-governance-model.md`** — monorepo vs polyrepo,
  defense-in-depth layering, exceptions, approval gates.
- **`docs/specs/05-future-cloud-layer.md`** — explicitly deferred
  (do not build yet): central spec registry, audit dashboard, policy
  pack marketplace, async analysis tier.
- **`docs/specs/06-engine-architecture.md`** — the engine's internal
  structure: the pipeline, Railway Oriented Programming (and its hard
  rules), the normalized resource model, and module boundaries.
- **`docs/specs/07-development-workflow.md`** — how dotzen is built:
  test-first (TDD), and the quality/security gate (tests, coverage,
  types, lint, SAST, secrets, supply chain) run via subagents locally and
  GitLab CI (`.gitlab-ci.yml`) in CI.
- **`docs/ROADMAP.md`** — what's shipped and the remaining backlog per
  cloud, plus the reusable engine capabilities that unlock new checks.

## Claude Code skills in this repo

Located in `.claude/skills/`, auto-discovered by Claude Code:

- **`dotzen-spec-authoring`** — for writing/editing `.zen/spec.ts` rule
  files (consumer-facing).
- **`dotzen-engine-dev`** — for working on dotzen's own engine
  implementation.
- **`dotzen-release`** — for cutting releases: npm publish (with
  provenance) and the CI matrix.

## Claude Code subagents in this repo

Located in `.claude/agents/`, these run the TDD quality/security gate in
parallel on every change (see `docs/specs/07-development-workflow.md`):

- **`test-runner`** — Vitest unit + CLI integration + coverage.
- **`code-quality`** — `tsc --noEmit`, ESLint, Prettier.
- **`security-scan`** — Semgrep SAST, gitleaks secrets, npm audit +
  osv-scanner supply chain.

## Quick orientation for a human

1. Read `CLAUDE.md` §1–2 for the elevator pitch and core architecture.
2. Read the ADR to understand *why* — a lot of tempting alternatives
   were deliberately rejected and re-proposing them wastes time unless
   you have new information.
3. `docs/specs/02-spec-dsl.md` has copy-pasteable example rules; or run
   `node bin/dotzen.js check examples/ai-generated` to see real output.
