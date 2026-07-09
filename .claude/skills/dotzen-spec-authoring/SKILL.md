---
name: dotzen-spec-authoring
description: Use this skill whenever writing, editing, or reviewing a dotzen governance spec file (.zen/spec.ts), or when a user asks to add/modify a governance rule for Terraform infrastructure, or asks what rules a dotzen spec contains. Triggers on mentions of ".zen/spec.ts", "dotzen rule", "governance rule", "add a rule for", or requests to express a security/compliance/tagging/cost policy as code for Terraform. Do not use this skill for dotzen's own engine implementation code (parsing, evaluation logic) — use dotzen-engine-dev for that instead.
---

# dotzen Spec Authoring

You are writing or editing `.zen/spec.ts` — the file a **security
architect with no programming background** will read to understand and
approve infrastructure governance rules. Every decision below exists to
protect that reader's ability to understand the file correctly. See
`/docs/specs/02-spec-dsl.md` for the full specification this skill
summarizes into actionable rules.

## The one rule that overrides all style preferences

**No bare strings for domain values. Ever.** Resource types, ports,
effects, tags, regions, environments, ACLs, attributes — all `const
enum`. If you catch yourself writing `resource('aws_security_group')`
instead of `resource(AwsResource.SecurityGroup)`, stop and fix it
before continuing. A typo in a bare string silently produces a rule
that never fires — the single most dangerous failure mode for a
governance tool, because it looks correct in review and fails silently
in production.

If a needed enum value does not exist yet, **add it to the enum
definition** rather than falling back to a string literal, even for a
one-off rule. This is not over-engineering — it is the entire point of
the type-safety model.

## Before writing a new rule, check these three things

1. **Does an enum value already exist for what you need** (resource
   type, port, attribute, tag)? Search the existing enum blocks at the
   top of `spec.ts` first.
2. **Does a similar rule already exist** that this should extend rather
   than duplicate? Prefer adding a port to an existing
   `.denyIngress(Port.SSH, Port.RDP)` call over writing a near-duplicate
   rule.
3. **What severity is actually correct?** Default to `Effect.Block`
   unless there's a specific, statable reason to soften to `Warn` or
   `Effect.RequireApproval`. See severity guidance below.

## The prose-readability test — apply before finishing every rule

Read the rule aloud, replacing each method call with a plain-English
paraphrase. If it does not read as a sentence a non-programmer would
understand and correctly restate, revise it.

```typescript
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH, Port.RDP)
  .message('SSH and RDP must not be open to internet'),

// reads as: "For AWS security groups, deny ingress on SSH and RDP."
// PASSES.
```

If a rule requires more than one sentence to explain, or requires
explaining what a method name means, the vocabulary is wrong — fix the
builder/enum naming, not the reader's expectations.

## Never call `.build()`

The `RuleBuilder` is the rule object itself. There is no `.build()`
step in the current design (this changed during design — older examples
elsewhere may show it; they are outdated). Validation happens
automatically at spec-load time via the engine calling `.validate()` on
every rule.

```typescript
// CORRECT — no .build()
export const spec = [
  rule()
    .resource(AwsResource.DbInstance)
    .mustHave(AwsAttribute.StorageEncrypted)
    .message('RDS encryption at rest required'),
]
```

## Every `Block`-severity rule should have a `.message()` and usually
## a `.rationale()`

`.message()` is mandatory (the builder's `validate()` throws without
it). `.rationale()` is not enforced by the type system but should be
added whenever the "why" isn't obvious from the message alone —
especially for compliance-driven rules, where citing the specific
control (CIS benchmark number, LGPD article, internal policy ID) turns
the spec into partial audit documentation:

```typescript
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH)
  .message('SSH must not be open to the internet')
  .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2'),
```

## Severity guidance (do not default to Warn)

| Use `Effect.Block` when | Use `Effect.Warn` when | Use `Effect.RequireApproval` when |
|---|---|---|
| Hard security/compliance violation, no legitimate exception path | Best-practice deviation with plausible legitimate exceptions not yet formalized | Legitimately allowed but higher-risk, needs human sign-off (large prod resources, cross-region data transfer) |

A spec whose rules default to `Warn` trains developers to ignore dotzen
entirely. When in doubt between `Block` and `Warn`, prefer `Block` and
let a real, specific exception request (handled via the exceptions
mechanism below) surface any case that was wrongly blocked — that is a
much better failure mode than silent, permanent under-enforcement.

## Exceptions — never edit a rule to work around one specific resource

If a specific resource legitimately needs to violate a rule (e.g. a
legacy migration needs temporary SSH access), **do not weaken the rule
itself.** Add a scoped, time-limited, reviewed exception instead:

```typescript
export const exceptions = [
  exception({
    rule: 'no-public-ssh',
    resource: 'aws_security_group.legacy_migration',
    justification: 'Legacy system migration — scheduled decommission',
    approvedBy: 'security-architect-name',
    expires: '2026-09-01',
  }),
]
```

Full detail: `/docs/specs/04-governance-model.md` §"Exception handling."

## Common mistakes to catch in review

- A bare string anywhere a domain enum should be used.
- A rule with no `.message()` (will throw at spec-load time — catch it
  before that, not after).
- A rule that silently weakens an existing rule's scope instead of
  adding a proper time-limited exception.
- A `.mustHave(AwsAttribute.PubliclyAccessible)` used to mean "must NOT be
  publicly accessible" — check whether the attribute condition's
  polarity actually matches the intent; "must have X=true" and "must
  not have X=true" are different conditions and the builder API should
  make this unambiguous (see `/docs/specs/02-spec-dsl.md`'s note on this
  exact ambiguity — if the current `RuleBuilder` implementation
  conflates them, flag it rather than writing around the ambiguity
  silently).
- Tag/port/resource enum values duplicated with slightly different
  casing or naming instead of reusing the canonical one already defined.

## When asked to add a new resource type or condition to the vocabulary

Add the enum member in exactly one place. Do not add a string literal
anywhere as a workaround "for now." If the engine uses `ts-pattern`
`.exhaustive()` internally (see `dotzen-engine-dev` skill), the
TypeScript compiler will now surface every place in the engine that
needs a corresponding case — this is the intended workflow, not friction
to route around.
