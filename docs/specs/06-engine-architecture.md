# 06 — Engine Architecture (internal)

Status: **Decided.** This document defines the *internal* structure of
the dotzen engine — the pipeline, its error-handling model, and the
module boundaries. It is distinct from the DSL surface (`02-spec-dsl.md`,
what spec authors write) and the distribution mechanics
(`03-distribution-and-cli.md`, how the tool ships). Read those first for
context; this document is about how the engine is built internally.

The two organizing principles are **Railway Oriented Programming (ROP)**
for the top-level flow and **strict module boundaries** so each stage is
independently testable and the HCL parser is swappable.

## The pipeline

A `dotzen check` run is a linear sequence of fallible stages:

```
readDotzenJson ─► enforceVersion ─► loadSpec ─┐
                                              ├─► evaluate ─► report
                          parseTf ─► normalize┘
```

- **readDotzenJson / enforceVersion** — read the pinned config, refuse
  to run on a version mismatch (see `03-distribution-and-cli.md` and the
  engine-dev skill; this is always the first thing that happens).
- **loadSpec** — load `.zen/spec.ts`, produce validated `RuleBuilder[]`.
- **parseTf** — read `.tf` files through the HCL parser adapter.
- **normalize** — convert the parser's raw output into dotzen's own
  resource model (see "The normalized resource model" below).
- **evaluate** — run every rule against the normalized model, producing
  a `CheckReport`.
- **report** — render the `CheckReport` as terminal or JSON output.

## Railway Oriented Programming — the model and its hard rules

Each pipeline stage is a total function `(input) => Result<Output, DotzenError>`,
composed so that an operational failure short-circuits the remaining
stages. This keeps error handling explicit (no thrown exceptions
crossing module boundaries) and makes every stage unit-testable in
isolation. ROP was chosen deliberately; the following rules are what
make it correct for *this* domain rather than cargo-culted.

### Rule 1 — violations live on the SUCCESS track, never the failure track

This is the single most important distinction in the whole engine.

- The **failure track (`Err<DotzenError>`)** is for *operational*
  failures only: cannot read the target directory, HCL parser blew up,
  `spec.ts` is invalid, `dotzen.json` version mismatch, unreadable file.
  These mean *dotzen could not do its job*.
- The **success track (`Ok`)** carries a `CheckReport`. A rule violation
  is a **successful** outcome — the check ran correctly and found a
  policy breach. Violations are data *inside* the `Ok` payload, not
  errors.

Conflating the two corrupts exit-code semantics and reporting: "dotzen
crashed" and "dotzen worked and your Terraform is non-compliant" are
different events that must be distinguishable by callers (CI especially).
This formalizes the existing rule in the engine-dev skill: *"a parse
error is not a violation."*

### Rule 2 — there are THREE outcomes, not two; model the third in the payload

A binary `Result<T, E>` cannot express dotzen's real outcome space. The
`CheckReport` therefore carries three categories explicitly:

```
CheckReport {
  violations:       Violation[]        // rules that fired
  passed:           number             // rules evaluated cleanly, no breach
  couldNotEvaluate: Unevaluable[]      // rule + reason it could not be judged
}
```

`couldNotEvaluate` exists because static analysis deliberately does not
resolve everything (unresolved `var`/`local`, values that would need a
`terraform plan`). A rule that silently never fires because its input
could not be resolved is worse than no rule — it must surface as a
distinct, visible outcome, **never** as a silent pass and **never** as an
operational `Err`. See `01-product-overview.md` and `02-spec-dsl.md`
§"Implementation reality." Do not collapse this third category into
either track.

### Rule 3 — the pipeline is a railway, but the inner loops are FOLDS

Short-circuit-on-first-failure (`andThen`) is correct for the *outer*
pipeline. It is wrong for the two stages that must gather all results:

- **Spec validation** (`loadSpec`) must report **every** invalid rule at
  once, not fail on rule 1. This is applicative/accumulating validation
  (e.g. neverthrow's `Result.combineWithAllErrors`), not monadic
  short-circuiting.
- **Rule evaluation** (`evaluate`) runs **every** rule against **every**
  resource and accumulates all violations and all `couldNotEvaluate`
  entries. This is a fold/traverse, not a railway.

Do not force these onto a short-circuit chain because "everything is a
railway." They are folds that produce an accumulated result.

### Rule 4 — `evaluate` is total; it is not a railway step

`evaluate(rules, model)` always produces a `CheckReport`. It has no
operational failure mode of its own (a rule it cannot judge becomes a
`couldNotEvaluate` entry, not an `Err`). So it is the pure transform that
builds the success payload at the *end* of the railway — not a stage that
returns `Result`. Wrapping total functions in `Result` "for consistency"
is the most common ROP over-application; avoid it.

### `DotzenError` is a discriminated union

The failure track is a single discriminated union so the `report/` layer
renders each variant exhaustively (the same Layer-4 exhaustiveness
benefit sought for resource types — see `02-spec-dsl.md`):

```
type DotzenError =
  | { kind: 'VersionMismatch'; required: string; running: string }
  | { kind: 'ConfigNotFound';  path: string }
  | { kind: 'SpecInvalid';     errors: RuleValidationError[] }
  | { kind: 'ParseFailed';     file: string; detail: string }
  | { kind: 'PathNotFound';    path: string }
```

Extend by adding a variant and letting the compiler surface every place
that must handle it.

### Result implementation — library choice

Recommended: **neverthrow** (lightweight, `Result`-focused, provides
`.map`/`.andThen`/`.combineWithAllErrors` and `safeTry` to avoid deep
nesting, since TypeScript has no do-notation). A **hand-rolled
`Result<T, E>`** (~30–40 lines, zero dependencies) is an equally valid,
in-character choice that aligns with the "stay pure-JS, minimal
dependencies" boundary in `00-architecture-decision-record.md`.

**Do not use fp-ts.** Its learning curve makes the engine unreadable to
casual contributors, which works directly against the ADR's
"community contribution potential" driver and the project's anti-ceremony
ethos. If someone proposes fp-ts, that is a decision to re-open here with
a concrete justification, not a default.

## The normalized resource model — decouple the engine from the parser

The `engine/` (evaluation) must **never** see the HCL parser's raw output
type. The `hcl/` layer converts whatever the parser emits into dotzen's
own stable model:

```
NormalizedResource {
  type:        AwsResource
  name:        string
  file:        string
  line:        number
  attributes:  Record<string, NormalizedValue>
  ingress:     IngressRule[]      // when applicable
  tags:        Record<string, string>
  // …grown case-by-case as the matcher needs it
}
```

Three reasons this boundary is mandatory, not optional:

1. **Parser swappability.** `00-architecture-decision-record.md` keeps
   open replacing the npm parser with the official Go `hashicorp/hcl`
   parser later. With an adapter, that swap touches only `hcl/`. If it
   ever happens, **prefer compiling `hashicorp/hcl` to WASM over bundling
   a native per-platform binary** — WASM avoids macOS Gatekeeper, Apple
   notarization, and Windows Defender/SmartScreen/EDR alerts entirely,
   and ships as one cross-platform artifact. See
   `/docs/specs/03-distribution-and-cli.md` §"If official-parser
   correctness is ever needed."
2. **Containment of the hard part.** The genuinely difficult work —
   `dynamic`/`for_each`/`count` expansion, `var`/`local` resolution,
   accurate `file:line`, and deciding what is `couldNotEvaluate` — lives
   in one place (`hcl/` + `normalize`) instead of being smeared through
   every rule. See `02-spec-dsl.md` §"Implementation reality."
3. **Testability.** `evaluate` can be unit-tested against hand-built
   `NormalizedResource` objects with no `.tf` parsing involved.

## Module boundaries

```
packages/cli/
├── bin/dotzen.js          ← thin Node entry; execs the compiled CLI
└── src/
    ├── vocabulary/        ← const enums (AwsResource, Port, Effect, …)
    │                        LEAF module: depends on nothing; imported by
    │                        BOTH the spec surface and the engine. This is
    │                        what makes "add a resource type in exactly
    │                        one place" (CLAUDE.md §8) real.
    ├── spec/              ← RuleBuilder, rule(), validate(), loadSpec()
    ├── hcl/               ← parser adapter + normalize → NormalizedResource
    ├── engine/            ← evaluate(rules, model) → CheckReport
    │                        via condition evaluators keyed by condition
    │                        kind (deny-ingress, must-have-attr, must-have-
    │                        tags, deny-acl…), so adding a condition adds
    │                        one evaluator rather than editing a monolith
    ├── report/            ← CheckReport / DotzenError → terminal | JSON
    ├── version/           ← dotzen.json read + enforcement
    └── result/            ← Result<T,E> + DotzenError (if hand-rolled)
```

Dependency direction: `vocabulary/` is the leaf. `spec/`, `hcl/`, and
`engine/` depend on it; `engine/` depends on the `hcl/` model type but
not on the parser library; `report/` depends on the `engine/` output
types. Nothing depends on `report/`. The CLI entry composes the stages.

## Spec loading — decided: pure-JS runtime loader (`jiti`)

`.zen/spec.ts` is TypeScript authored by the user, so the engine must
transpile-and-execute it at runtime to obtain the exported
`RuleBuilder[]`. **Decision: load it through a pure-JavaScript runtime
TypeScript loader (`jiti`). No build step is imposed on spec authors.**
Isolated behind `importSpecModule`, so it touches exactly one function.

Rationale — two locked principles both point here, and one rules out the
alternatives:

- **Zero authoring friction (product).** The spec author is a security
  architect / platform engineer; "Prose as Code" means they write
  `.zen/spec.ts` and it just works. Requiring a `tsc`/build step before
  `dotzen check` reintroduces the friction the product exists to remove,
  and adds a CI stage where `spec.ts`/`spec.js` can drift. So the engine
  transpiles the `.ts` itself.
- **Stays pure-JS (architecture) — the deciding factor for *which*
  loader.** The fast TS loaders `tsx` / `esbuild-register` / `@swc/register`
  are built on **native binaries** (esbuild = Go, swc = Rust, shipped
  per-platform via `optionalDependencies`). Adding any of them would
  smuggle a native binary back into the dependency tree — exactly what
  the "The decision depends on staying pure-JS" section forbids. `jiti`
  is **pure JavaScript** (bundled Babel, filesystem-cached, no native
  deps), so it changes nothing about the zero-install cross-platform
  story.
- **Proven pattern.** ESLint flat config, Nuxt, and others use `jiti` for
  exactly this "load a user's `.ts` config" job.
- **Precompile stays as a free escape hatch.** `jiti` also loads
  `.js`/`.mjs`, so a precompiled spec works through the *same* code path;
  precompilation is available if ever needed, not the default.

Caveats to carry into implementation:

- **Runtime loaders strip types; they do not type-check.** The
  type-safety value (enum autocomplete, typo-as-compile-error) comes from
  the author's editor (TS language server) plus an optional
  `tsc --noEmit`, **not** from `dotzen check` itself. Document a
  `tsc --noEmit` on the spec in CI as belt-and-suspenders for a
  governance tool. **Layer 6 `validate()` is the runtime backstop** — a
  bad enum member resolves to `undefined` at runtime rather than a
  compile error, and `validate()` catches the structural fallout
  (missing target/message/conditions). This is part of why Layer 6 is
  non-negotiable even with a loader.
- **Executing the spec = running the org's own code**, authored in the
  org's own private repo — the same trust model that lets v1 defer WASM
  sandboxing (see `05-future-cloud-layer.md`). No sandbox needed for v1.

## Relationship to the type-safety layer model

Nothing here changes `02-spec-dsl.md`'s guidance to ship only Layers 1
and 6 for v1 and add Layer 4 (`ts-pattern .exhaustive()`) in the engine
when the resource vocabulary grows. ROP and Layer 4 are complementary:
ROP structures the *flow* and its errors; Layer 4 guarantees the
*evaluation* handles every resource type. Both push in the same
direction — make missing cases and unhandled failures compile errors or
visible outcomes, never silent gaps.

## Appendix — type sketch (design, not yet implemented)

Signatures and shapes only, no evaluation bodies. This is the concrete
form of every decision above; it is a design artifact to review and
refine, not committed engine code. Two intentional refinements over
earlier docs are called out at the end.

### `result/` — Result + error track

```typescript
// Hand-rolled shown for zero-dep clarity; neverthrow gives the same shape.
export type Result<T, E> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok  = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

// railway combinators (short-circuit)
export const map:     <T, U, E>(r: Result<T, E>, f: (t: T) => U)            => Result<U, E>
export const andThen: <T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>) => Result<U, E>

// fold combinator (ACCUMULATE — Rule 3): used by loadSpec, not the pipeline
export const combineWithAllErrors: <T, E>(rs: Result<T, E>[]) => Result<T[], E[]>

// The failure track. Operational failures ONLY (Rule 1). Never violations.
export type DotzenError =
  | { kind: 'ConfigNotFound';  path: string }
  | { kind: 'VersionMismatch'; required: string; running: string }
  | { kind: 'SpecLoadFailed';  path: string; detail: string }
  | { kind: 'SpecInvalid';     errors: RuleValidationError[] }  // accumulated
  | { kind: 'PathNotFound';    path: string }
  | { kind: 'ParseFailed';     file: string; detail: string }
```

### `vocabulary/` — leaf module (from `02-spec-dsl.md`, unchanged)

```typescript
export const enum AwsResource { AwsSecurityGroup = 'aws_security_group', /* … */ }
export const enum Port { SSH = 22, RDP = 3389, /* … */ }
export const enum Cidr { Internet = '0.0.0.0/0', InternetV6 = '::/0' }
export const enum Effect { Block = 'block', Warn = 'warn', RequireApproval = 'require_approval' }
export const enum Tag { Team = 'team', CostCenter = 'cost_center', /* … */ }
export const enum AwsAttribute { StorageEncrypted = 'storage_encrypted', /* … */ }
export const enum Acl { Private = 'private', PublicRead = 'public-read', /* … */ }
export const enum Environment { Development = 'development', Production = 'production', /* … */ }
```

### `spec/` — authored surface + the internal Rule model

The `RuleBuilder` (see `02-spec-dsl.md`) is what authors write. The
engine consumes a normalized `Rule` whose conditions are a
**discriminated union** — this is what makes the "one evaluator per
condition kind" dispatch exhaustive.

```typescript
export type ResourceTarget =
  | { kind: 'resource'; type: AwsResource }
  | { kind: 'all' }

export type Condition =
  | { kind: 'denyIngress';   ports: Port[]; from: Cidr[] }
  | { kind: 'mustHaveTags';  tags: Tag[] }
  | { kind: 'mustBeTrue';    attrs: AwsAttribute[] }   // require attr = true
  | { kind: 'denyWhenTrue';  attrs: AwsAttribute[] }   // deny attr = true (02's split)
  | { kind: 'denyAcl';       acls: Acl[] }

export interface Rule {
  readonly id:           string        // stable name for reporting/exceptions
  readonly target:       ResourceTarget
  readonly environment?: Environment   // scope filter
  readonly conditions:   Condition[]
  readonly effect:       Effect
  readonly message:      string
  readonly rationale?:   string
  readonly approvers?:   string[]
}

export interface RuleValidationError { readonly ruleIndex: number; readonly problem: string }

// Refines 02's validate() into ROP form (no throwing across boundaries):
// on success yields the normalized Rule; on failure ACCUMULATES problems.
export class RuleBuilder {
  // …fluent methods from 02 (resource, denyIngress, mustHaveTags, …)…
  validate(index: number): Result<Rule, RuleValidationError[]>
}
export const rule: () => RuleBuilder

// Two stages, split so the OPEN loader decision is isolated:
export const importSpecModule: (path: string)             => Result<RuleBuilder[], DotzenError>  // loader TBD
export const loadSpec:         (builders: RuleBuilder[])  => Result<Rule[], DotzenError>
//   loadSpec folds builder.validate() via combineWithAllErrors →
//   Err({ kind: 'SpecInvalid', errors }) reporting EVERY bad rule at once (Rule 3)
```

### `hcl/` — parser adapter + normalized model

The engine never imports the parser's types; it only sees
`NormalizedResource`. Unresolvable expressions are represented
explicitly — that is what feeds `couldNotEvaluate`.

```typescript
export type NormalizedValue =
  | { kind: 'literal';    value: string | number | boolean }
  | { kind: 'unresolved'; expr: string }   // var/local/computed — cannot statically judge

export interface IngressRule {
  readonly fromPort:   NormalizedValue
  readonly toPort:     NormalizedValue
  readonly cidrBlocks: NormalizedValue[]
  readonly line:       number
}

export interface NormalizedResource {
  readonly type:       AwsResource
  readonly name:       string          // address is `${type}.${name}`
  readonly file:       string
  readonly line:       number
  readonly attributes: Record<string, NormalizedValue>
  readonly ingress:    IngressRule[]
  readonly tags:       Record<string, NormalizedValue>
}

export interface RawHclFile { readonly path: string; readonly ast: unknown }  // parser-specific, never leaves hcl/

export const parseTf:   (dir: string)          => Result<RawHclFile[], DotzenError>
export const normalize: (files: RawHclFile[])  => Result<NormalizedResource[], DotzenError>
```

### `engine/` — evaluation (total, three-way, folded)

```typescript
export interface Violation {
  readonly ruleId:     string
  readonly message:    string
  readonly rationale?: string
  readonly effect:     Effect
  readonly resource:   string   // aws_security_group.web
  readonly file:       string
  readonly line:       number
}

export interface Unevaluable {
  readonly ruleId:   string
  readonly resource: string
  readonly reason:   string     // "ingress cidr is an unresolved var reference"
}

// The success-track payload. THREE outcomes (Rule 2), never on the Err track.
export interface CheckReport {
  readonly violations:       Violation[]
  readonly passed:           number
  readonly couldNotEvaluate: Unevaluable[]
}

// Per-condition, three-way — folded up into CheckReport
export type ConditionOutcome =
  | { kind: 'pass' }
  | { kind: 'violation';      line: number; detail: string }
  | { kind: 'cannotEvaluate'; reason: string }

// One evaluator per condition kind; dispatch by `condition.kind`
// (switch now; ts-pattern .exhaustive() at Layer 4 when vocabulary grows)
export type ConditionEvaluator<C extends Condition> =
  (condition: C, resource: NormalizedResource) => ConditionOutcome

// TOTAL — always returns a report, never a Result (Rule 4).
// Internally a fold over rules × matching resources × conditions (Rule 3).
export const evaluate: (rules: Rule[], resources: NormalizedResource[]) => CheckReport
```

### `version/` and `report/`

```typescript
export interface DotzenConfig { readonly version?: string; readonly spec: string; readonly terraform: string }

export const readDotzenJson: (cwd: string)                           => Result<DotzenConfig, DotzenError>
export const enforceVersion: (config: DotzenConfig, running: string) => Result<DotzenConfig, DotzenError>

export const renderTerminal: (report: CheckReport) => string
export const renderJson:     (report: CheckReport) => string
export const renderError:    (error: DotzenError)  => string   // exhaustive switch on DotzenError.kind

// exit-code semantics keep the three states distinguishable for CI:
//   Ok + no violations → 0 ;  Ok + violations → 1 ;  Err (operational) → 2
export const reportExitCode: (report: CheckReport) => 0 | 1
```

### The composed pipeline — where rails end and the fold/total step begins

```typescript
export function check(cwd: string): Result<CheckReport, DotzenError> {
  return andThen(readDotzenJson(cwd), (cfg) =>
    andThen(enforceVersion(cfg, ENGINE_VERSION), () =>
      andThen(importSpecModule(cfg.spec), (builders) =>
        andThen(loadSpec(builders), (rules) =>          // fold happens INSIDE loadSpec
          andThen(parseTf(cfg.terraform), (raw) =>
            map(normalize(raw), (resources) =>
              evaluate(rules, resources)))))))          // .map, not .andThen — evaluate is total
}
```

`andThen` for every operational stage; `map` (not `andThen`) for
`evaluate` because it cannot fail; the accumulating fold lives *inside*
`loadSpec`. The `main` wrapper then runs `check(cwd)` → on `Ok`, render +
`reportExitCode`; on `Err`, `renderError` + exit `2`.

### Two intentional refinements over earlier docs

- **`importSpecModule` isolates the open loader question.** Its signature
  is deliberately loader-agnostic (`path → Result<RuleBuilder[]>`), so
  resolving jiti/tsx vs. precompiled changes only that one function's
  body — nothing downstream. See "Open decision" above.
- **`RuleBuilder.validate()` is refined to ROP form** (returns `Result`
  and accumulates errors) versus `02-spec-dsl.md`'s throwing version.
  This is a deliberate, consistent tightening — update `02-spec-dsl.md`'s
  `validate()` description when this is implemented so the two do not
  drift.
