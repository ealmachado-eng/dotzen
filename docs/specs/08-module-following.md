# 08 — Module-following (resolving `module {}` calls)

Status: **Implemented** (Tranche 1 + the Tranche-2 hardening slices).
Local single-level following shipped in v0.1.0; per-instantiation trace
labels, `count = 0` handling, doc-08 DoD surfacing of non-followed modules,
nested modules, and module `for_each` all land in v0.3.0. Originally the
single highest-value feature after the engine itself, identified by
dogfooding on real module-based AWS repos.

## The problem (why this matters)

Real org Terraform is overwhelmingly **module-based**, and dotzen today
sees only *direct* `resource` blocks. That splits a module-based repo into
two halves, neither of which dotzen can fully evaluate:

- **The environment layer** (`env/{dev,prd}`) is just `module "x" { … }`
  calls — no direct resources — so dotzen reports **`0 checks`**.
- **The module layer** (`modules/x`) has the resources, but their
  governance-relevant values are caller-supplied `var`s
  (`cidr_blocks = var.allowed_cidrs`, `tags = merge(local.t, var.tags)`),
  so dotzen honestly reports **"could not evaluate."**

The concrete values only exist where the two meet: the env's
`module "x" { allowed_cidrs = […], tags = {…} }` inputs flowing into the
module's `var.*`. **Module-following connects them.**

## Goal

Given a `module "x" { source = "./modules/x", <inputs> }` call, evaluate
the module's `resource` blocks **with the caller's inputs threaded into
the module's `var.*`** — turning caller-`var` "could not evaluate" cases
into definite verdicts, reported against the instantiation.

## Design: one new resolution stage, engine unchanged

Today: `parse → normalize(scope) → evaluate`. The engine, conditions, and
normalized model stay **exactly as they are** — this is purely a
resolution/scope-threading layer that feeds more (and more concrete)
resources into the existing pipeline. That reuse is the whole payoff of
the architecture.

Per `module` block found in a scanned root:

1. **Resolve `source`.** Local relative paths only (`./`, `../`),
   resolved relative to the calling file and confined to the repo.
   Registry / git / archive sources → **skipped** (emit one
   `could-not-evaluate` noting the module was not followed).
2. **Find the module's `.tf` files** (existing `findTfFiles`).
3. **Build the module's scope.** Start from the module's own `variable`
   defaults + `locals` (existing `buildScope`), then **overlay the
   caller's block inputs**: `module "x" { tags = {…} }` sets
   `var.tags = {…}`. Caller inputs win — they *are* the `var` values.
   This is a small extension to `buildScope` (accept an override map).
4. **Normalize the module's resources with that scope.** Now
   `merge(local.t, var.tags)` and `cidr_blocks = var.allowed_cidrs`
   resolve to concrete values → real verdicts (including complete tag
   sets, which flip today's `partial` results to pass/violation).
5. **Report with a traceable path**, e.g.
   `env/prd › modules/rds : aws_db_instance.this` — so a finding names
   both the instantiation and the module resource.

The same module called by `dev` and `prd` is evaluated **once per call**
with that call's scope (per-instantiation isolation — the same discipline
as today's multi-root isolated scopes). Findings are per-instantiation.

## Scope (deliberately bounded — everything else degrades honestly)

| Implemented | Degrades to could-not-evaluate / skip |
|---|---|
| Local relative `source` | Registry / git / archive sources (surfaced) |
| Literal caller inputs → `var.*`; sole-ref caller inputs (`var.y`) | Caller inputs that are unresolved compound expressions |
| One level + **nested modules** (recursive, cycle-bounded) | Re-entering a dir already on the current path (surfaced) |
| `count = 0` skip (literal or var-resolving-to-0) | `count` per-index expansion (followed once, honest) |
| `for_each` over a literal map or var-resolved list/set | `for_each` that is a `toset(...)` compound or unresolvable var (followed once, no `each` bindings) |
| `each.value` / `each.key` (sole refs) threaded into module scope | `each.value.field` (non-sole each refs inside module resources) |

Every out-of-scope case degrades to **could-not-evaluate** (or a skip
note) — never a false verdict. Nesting may be extended to a bounded depth
in a later tranche.

## The genuinely hard parts (where the risk lives)

1. **Path resolution** — `source` is relative to the *calling file*, must
   work cross-OS, and must stay within the repo (no escaping via `../..`
   into the filesystem). Reject/skip anything that resolves outside the
   scanned project.
2. **Input → `var` mapping** — by name (`module { tags = X }` → `var.tags`).
   A caller input can itself be `var.y`/an expression → resolve what's
   resolvable, leave the rest unresolved (honest).
3. **Per-instantiation isolation** — no scope bleed between two calls of
   the same module. Evaluate each call independently.
4. **Where you point dotzen** — with following, you point it at the **env
   repo** (the `module {}` calls) and it descends into the local module
   dirs. This finally makes the `env/{dev,prd}` layout — the one that gave
   `0 checks` — the *correct* target.

## Honest limits (state these in output/docs)

- Only **local** module sources are followed; remote sources are reported
  as not-followed (could-not-evaluate, ruleId `dotzen.module-following`),
  not silently passed.
- A caller input that can't be resolved leaves the module's `var`
  unresolved → the dependent check stays could-not-evaluate.
- `count` is honored only as a presence gate (`0` → skip; anything else,
  including unresolvable, → follow once); no per-index key expansion.
- `for_each` is expanded only for a literal map or a var-resolved
  list/set; `toset(...)` and other compound calls, and var refs with no
  default, are followed once (no `each.*` bindings → degrade honestly).
- Nested module following is bounded by a path-stack of resolved dirs
  (a cycle is surfaced as a could-not-evaluate skip, not infinite
  recursion). Independent diamond paths (two modules calling the same
  module with different inputs) ARE evaluated per-path — the cycle guard
  is a current-path test, not a global visited set.
- `each.value.field` (non-sole each refs inside module resources) is not
  resolved — the inner field ref degrades to `could-not-evaluate`.
- This introduces **cross-file/cross-directory resolution** — a new class
  of complexity (and bugs). Built test-first, tranche by tranche, holding
  the "degrade to could-not-evaluate, never false-positive" line.

## Implementation tranches

1. **Local single-level following** — resolve `source`, thread literal
   inputs into `var.*`, normalize + evaluate the module's resources.
   (Covers the dogfooding cases: rds/vm/s3 `var.tags` + SG
   `var.allowed_cidrs`.) — **DONE v0.1.0**
2. **Traceable reporting** — `caller › module : resource` paths;
   per-instantiation trace labels `(module-label)` so two calls of one
   module are distinguishable in findings; per-instantiation dedupe. —
   **DONE v0.3.0**
3. **Non-followed modules surfaced** (doc 08 DoD, slice into tranche 2):
   remote/registry/git sources, sources that escape the scanned project,
   and missing module dirs are recorded as `ModuleSkip` notes and surfaced
   as `couldNotEvaluate` under the stable ruleId `dotzen.module-following`
   — never a silent `0 checks`. — **DONE v0.3.0**
4. **`count = 0`** disables a module (literal or var-resolving-to-0);
   followed silently (correct, no resources, no note). An unresolvable
   `count` is followed once (honest; no key expansion in v1). — **DONE v0.3.0**
5. **Bounded nested modules** (module → module), then `for_each` on
   modules (larger; its own effort). — **DONE v0.3.0**
   - Nested: `followModules` recurses; a path-stack of resolved absolute
     dirs bounds it (a self/mutual cycle surfaces as a
     `dotzen.module-following` could-not-evaluate, not infinite recursion).
     The trace accumulates the full chain: `env/prd › modules/outer/main.tf
     (db) › modules/inner/main.tf (inner_db)`.
   - `for_each`: a resolvable literal map or a var-resolved list is
     expanded per element — one module instance per key, `each.value` and
     `each.key` threaded into the module scope (the `SOLE_REF` resolver in
     `normalize.ts` now follows `each.value`/`each.key`). Trace carries
     `(module-label[element-key])`. An unresolvable `for_each` (`toset(...)`
     compound, `var.x` with no default) is followed once honestly — refs to
     `each.*` inside the module degrade to `could-not-evaluate` rather than
     false expansion. An empty resolved collection skips silently.
   - `count` per-index expansion, `each.value.field` (non-sole each refs),
     and compound caller-input resolution remain out of scope (v1 honest
     degradation still applies).

## Definition of Done (per doc 07)

Test-first; violating **and** passing fixtures for a real env→module
layout (env calls a local module; caller inputs make a module resource
pass or violate); all gate subagents green; `docs/ROADMAP.md` updated.
