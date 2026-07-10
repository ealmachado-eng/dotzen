# 08 — Module-following (resolving `module {}` calls)

Status: **Designed, not yet implemented** (targets v0.1.0). This is the
single highest-value feature after the engine itself, identified by
dogfooding on real module-based AWS repos (see `docs/ROADMAP.md`
"Post-publish dogfooding findings").

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

## Scope for v1 (deliberately bounded — everything else degrades honestly)

| In scope | Out of scope → could-not-evaluate / skip |
|---|---|
| Local relative `source` | Registry / git / archive sources (need fetching) |
| Literal caller inputs → `var.*` | Caller inputs that are themselves unresolved |
| One level (caller → module) | Deep nesting beyond a bounded depth |
| — | `count` / `for_each` on the `module` block |

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
  as not-followed, not silently passed.
- A caller input that can't be resolved leaves the module's `var`
  unresolved → the dependent check stays could-not-evaluate.
- No `count`/`for_each` expansion on modules in v1.
- This introduces **cross-file/cross-directory resolution** — a new class
  of complexity (and bugs). Built test-first, tranche by tranche, holding
  the "degrade to could-not-evaluate, never false-positive" line.

## Implementation tranches

1. **Local single-level following** — resolve `source`, thread literal
   inputs into `var.*`, normalize + evaluate the module's resources.
   (Covers the dogfooding cases: rds/vm/s3 `var.tags` + SG
   `var.allowed_cidrs`.)
2. **Traceable reporting** — `caller › module : resource` paths;
   per-instantiation dedupe.
3. **Bounded nested modules** (module → module), then `count`/`for_each`
   on modules (larger; likely its own effort).

## Definition of Done (per doc 07)

Test-first; violating **and** passing fixtures for a real env→module
layout (env calls a local module; caller inputs make a module resource
pass or violate); all gate subagents green; `docs/ROADMAP.md` updated.
