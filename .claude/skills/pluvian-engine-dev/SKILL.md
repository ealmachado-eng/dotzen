---
name: pluvian-engine-dev
description: Use this skill when implementing or modifying pluvian's own engine code (the TypeScript CLI package, HCL parsing integration, rule evaluation logic, version-pinning enforcement, or CI/pre-commit distribution mechanics) as opposed to writing a governance spec file. Triggers on work inside packages/cli/src/, bin/pluvian.js, the HCL parser subprocess wrapper, or requests to add a new resource type, evaluation condition, or output format to pluvian itself. For editing .pluvian/spec.ts rule content, use pluvian-spec-authoring instead.
---

# pluvian Engine Development

You are working on pluvian's own implementation, not a consumer's spec
file. Read `/CLAUDE.md` and `/docs/specs/00-architecture-decision-record.md`
before making any language or architecture choice — this project has
already gone through an extensive comparison of alternatives and the
decisions are final unless you have a specific, new reason documented
in the ADR to revisit them.

## Non-negotiable architectural constraints

1. **The engine is Node.js/TypeScript, distributed via npm, invoked via
   `npx`.** Do not introduce an alternative engine language
   (native-compiled, JVM/managed-runtime, or dynamically-typed) without
   first re-reading the ADR's rejection reasoning and getting explicit
   sign-off — the tradeoffs were already evaluated in depth. (Go remains
   allowed for the *optional* HCL-parser subprocess only, never as the
   engine language — see constraint 2.)
2. **HCL parsing is a subprocess concern, not inline TypeScript parsing
   logic**, if a Go binary is used at all. For v1, prefer a pure
   npm/TypeScript HCL parser dependency over bundling any native binary
   — see `/docs/specs/03-distribution-and-cli.md` §"v1 recommendation:
   no bundled Go binary" for why (macOS Gatekeeper, cross-platform
   binary bundling complexity). Only add a bundled Go subprocess if a
   specific, real HCL-parsing correctness gap is found in the npm
   parser.
3. **Never build a `terraform plan`-dependent code path into the local
   CLI or pre-commit flow.** Static HCL analysis only, for the reasons
   in `/docs/specs/03-distribution-and-cli.md` §"Static analysis vs
   `terraform plan`" — this is what keeps the local check fast and
   credential-free, which is required for developer adoption.
4. **Never hardcode or default to `@latest` anywhere** — not in
   examples, not in fallback logic, not in test fixtures. Every code
   path that resolves a version must go through the `pluvian.json`
   mechanism in `/docs/specs/03-distribution-and-cli.md`.

## Engine structure: pipeline + Railway Oriented Programming

Full design: `/docs/specs/06-engine-architecture.md`. Read it before
writing evaluation, parsing, or CLI-flow code. The engine is a linear
pipeline of total functions `(input) => Result<Output, EngineError>`
(readEngineConfig → enforceVersion → loadSpec / parseTf → normalize →
evaluate → report), using Railway Oriented Programming for the outer
flow. The hard rules — do not violate without re-reading that doc:

1. **Violations live on the SUCCESS track, never the failure track.**
   The `Err` track is for *operational* failures (parse blew up, spec
   invalid, version mismatch, path unreadable). A rule violation is a
   successful outcome carried inside the `Ok` payload. This is the
   formalization of "a parse error is not a violation" (see Testing
   conventions below).
2. **There are three outcomes, not two:** `violations`, `passed`, and
   `couldNotEvaluate` — all inside the success-track `CheckReport`.
   Never collapse `couldNotEvaluate` (unresolved `var`/`local`, values
   needing `terraform plan`) into a silent pass or into an `Err`.
3. **The pipeline is a railway, but the inner loops are folds.** Spec
   validation and rule evaluation must *accumulate* all results (report
   every invalid rule / every violation), not short-circuit on the
   first. Do not force them onto an `andThen` chain.
4. **`evaluate` is total** — it always returns a `CheckReport`, so it is
   not a `Result`-returning railway step. Do not wrap total functions in
   `Result` "for consistency."
5. **The engine never sees the parser's raw output type.** The `hcl/`
   layer normalizes into pluvian's own `NormalizedResource` model; the
   `engine/` depends only on that model. This is what keeps the parser
   swappable and contains the hard matching work in one place.
6. **Result library:** neverthrow or a hand-rolled `Result<T,E>`. **Not
   fp-ts** — see the doc for why (contributor readability).

## Version-enforcement is the first thing the CLI entry point does

Before doing anything else — before parsing arguments, before touching
the filesystem for HCL — the CLI must read `pluvian.json` (if present)
and compare its own version. If mismatched, print the exact corrective
`npx` command and exit non-zero immediately. Do not let this check be
skippable via a flag; a governance tool with a silent bypass for its own
version-consistency guarantee has defeated its own purpose.

```typescript
async function enforceVersion(): Promise<void> {
  const config = readEngineConfig()
  if (!config?.version) return
  const running = ENGINE_VERSION
  const required = config.version
  if (running === required) return
  console.error(`
✗ pluvian version mismatch
  required: ${required} (from pluvian.json)
  running:  ${running}

  run: npx @erkos/pluvian@${required} check
`)
  process.exit(1)
}
```

## Adding a new resource type to the evaluation vocabulary

The vocabulary is shared between the spec-authoring surface
(`AwsResource` enum, consumed via `pluvian-spec-authoring`) and the
engine's internal evaluation logic. When adding a new resource type:

1. Add the enum member in the single canonical enum definition (see
   `/docs/specs/02-spec-dsl.md` for the current vocabulary table).
2. **If the engine uses `ts-pattern` `.exhaustive()` for evaluation
   (Layer 4 of the type-safety model — recommended once the resource
   vocabulary is non-trivial), let the TypeScript compiler surface every
   `match()` call that now needs a new case.** Do not add a silent
   fallthrough `.otherwise(() => pass())` case as a shortcut to make
   the compiler happy without actually handling the new resource type —
   that reintroduces exactly the silent-gap failure mode the
   exhaustiveness check exists to prevent.
3. Update the worked-example vocabulary table in
   `/docs/specs/02-spec-dsl.md` to keep documentation and code in sync.

## Which type-safety layers to implement — do not over-build

Full model: `/docs/specs/02-spec-dsl.md` §"The layered type-safety
model." Summary for engine work specifically:

- **Layer 1 (`const enum`) and Layer 6 (builder validation)**: always
  present, no exceptions.
- **Layer 4 (`ts-pattern` `.exhaustive()`)**: add this in the engine's
  internal evaluation logic once there are more than roughly 5 resource
  types or more than one contributor touching evaluation code — it is
  the single highest-value addition beyond the v1 minimum, because it
  converts "forgot to handle a new resource type" from a silent runtime
  gap into a compile error.
- **Layers 2, 3, 5 (branded types, discriminated-union resource
  modeling, Zod runtime validation)**: do **not** add speculatively.
  Each has a specific trigger condition documented in
  `/docs/specs/02-spec-dsl.md`'s layer table. If you're about to add one
  of these, first confirm the trigger condition is actually met, and
  say so explicitly (e.g. "adding Zod because the spec is now fetched
  from an external registry, which is the documented trigger") rather
  than adding it because it seems like good practice in the abstract.

## Testing conventions

**pluvian is developed test-first (TDD, red → green → refactor).** Full
model: `/docs/specs/07-development-workflow.md`. Do not write production
code before a failing test exists for it. Because every pipeline stage is
a total `(input) => Result<Output, EngineError>` and `evaluate` consumes
the normalized model (see the ROP section above and doc 06), unit tests
are input-in / assert-on-`Result`-out with no mocking — lean on that.

**Every change runs the quality/security gate before it is done.** Launch
the three subagents in `.claude/agents/` — `test-runner`, `code-quality`,
`security-scan` — **in parallel** in one message, and do not mark the
work complete until all three PASS. A check that could not run is a
failure, never a silent pass (the same principle as the engine's
`couldNotEvaluate`). CI (`.github/workflows/ci.yml`, GitHub Actions) enforces the same
tools as the non-bypassable gate. Test runner is Vitest.

- Every new rule condition type (deny-ingress, must-have-attribute,
  must-have-tags, deny-acl, etc.) needs a fixture Terraform HCL snippet
  that should violate it and one that should pass it — both as literal
  test fixtures, not generated, so they double as documentation of
  exactly what the condition matches. Write these fixtures first (the
  red step).
- Test the `pluvian.json` version-mismatch path explicitly — this is a
  correctness-critical code path (see "Version-enforcement" above), not
  an edge case to skip.
- If a Go HCL-parser subprocess exists, test the subprocess
  integration (argument passing, JSON stdout parsing, non-zero exit
  handling) separately from rule-evaluation logic — a subprocess
  failure and a rule violation are different failure modes and must
  produce different CLI output (a parse error is not a "violation").

## Output format contract

Human-readable terminal output is the default; `--format json` must
also be supported for CI artifact storage (see
`/docs/specs/03-distribution-and-cli.md` §"Output formats"). Any new
output format must preserve, per violation: rule name/message, resource
identifier, file path, line number, severity/effect, and rationale if
present — CI tooling and future audit/reporting work
(`/docs/specs/05-future-cloud-layer.md`) will depend on this shape being
stable.

## Before touching distribution/packaging code

Read `/docs/specs/03-distribution-and-cli.md` in full, specifically the
macOS Gatekeeper section, before adding or modifying anything under
`bin/` or any `postinstall` script. A change here that reintroduces an
unsigned bundled binary without the documented mitigation will break
first-run on every macOS developer machine silently (no error until the
user actually tries to run the tool).
