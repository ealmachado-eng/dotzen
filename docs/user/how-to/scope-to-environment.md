# How to scope rules to environment / region / provider

> **Audience:** spec authors. Most rules apply everywhere, but some controls are environment-specific ("prod requires MFA delete on buckets"), region-bound ("EU data must stay in approved regions"), or account-scoped ("the DR account enforces stricter encryption"). pluvian has three independent scope filters.

## The three scope knobs

Each is optional and independent — a rule with no scope applies to every matching resource.

| Knob               | Method                                 | Scopes by                                                                               |
| ------------------ | -------------------------------------- | --------------------------------------------------------------------------------------- |
| **Environment**    | `.environment(Environment.Production)` | The resource's environment (from an `environment` tag/label OR the root-folder mapping) |
| **Provider alias** | `.providerAlias('dr')`                 | The resource's `provider = aws.dr` alias                                                |
| **Region**         | `.region('eu-west-1', 'europe-west1')` | The provider block's region (data-residency rules)                                      |

## Environment scoping

A rule scoped to `Production` fires **only** on resources whose environment resolves to `production`. Environments come from two places:

1. **An `environment` tag/label** on the resource (`environment = "production"` / GCP `environment` label). pluvian reads it directly.
2. **A root-folder mapping** — if your repo is laid out `env/prod/terraform/`, `env/dev/terraform/`, the folder name sets the environment for every resource under it (no per-resource tag needed). See the `env-layer` / `env-mapping` integration fixtures in `tests/integration/fixtures/`.

```ts
import { Environment } from "@erkos/pluvian";

// Stricter retention only in production.
rule()
  .resource(AwsResource.RdsCluster)
  .mustBeAtLeast(AwsAttribute.BackupRetentionPeriod, 30)
  .environment(Environment.Production)
  .message("Prod RDS clusters must retain backups ≥ 30 days");
```

The `Environment` enum (`Development`, `Staging`, `Production`, …) gives you typo-proof scoping. A resource whose environment is **unknown** (no tag, no mapping) degrades to could-not-evaluate for an environment-scoped rule — never a silent false pass.

## Provider-alias scoping

If you run multiple AWS accounts/regions via aliases (`provider "aws" { alias = "dr" }`, then `provider = aws.dr`), scope a rule to one alias:

```ts
// Only the DR account enforces cross-region replication.
rule()
  .resource(AwsResource.S3Bucket)
  .mustHaveAssociated(
    AwsResource.S3BucketReplicationConfiguration,
    AwsAttribute.Bucket,
  )
  .providerAlias("dr")
  .message("DR-account buckets must have cross-region replication");
```

`.providerAlias('dr')` matches resources whose provider alias is `dr`. A module call's `providers = { aws = aws.dr }` map is followed, so a child module's default provider resolves to the parent alias correctly.

## Region scoping (data residency — GDPR / LGPD)

Data-residency rules: data must **stay in** an approved region list, OR must **not be in** a denied list. pluvian resolves a resource's region from its `provider {}` block.

```ts
// EU data must stay in approved EU regions.
rule()
  .allResources()
  .denyNonApprovedRegion(
    "eu-west-1",
    "eu-west-2",
    "eu-central-1",
    "europe-west1",
    "europe-west3",
  )
  .message("Resources must run in an approved EU region (GDPR residency)");
```

`denyNonApprovedRegion` fires when the resource's region is **not** in the list. A resource whose region is unknown (provider block declares no region) degrades to could-not-evaluate — never a false pass. Pair with `.region(...)` if you want the rule itself scoped to a region set rather than denying based on it.

## Combining scopes

The three filters AND together. A rule with `.environment(Production).providerAlias('dr')` fires only on production resources in the DR account. Use this to express matrix policies cleanly rather than scattering ignore directives.

## When NOT to scope

Don't reach for a scope filter when:

- The rule is a genuine universal control (encryption, no public SSH). Apply everywhere.
- The difference is one resource, not a class. [Suppress that one](./handle-exceptions.md) instead of complicating the rule.

Scoping is for _classes_ of resources (prod vs dev, DR vs primary, EU vs global), not individual exceptions.

## See also

- [Handle exceptions](./handle-exceptions.md) — per-resource suppression (the complement of broad scoping).
- [DSL reference](../reference/dsl.md) — full scope-filter detail.
- `tests/integration/fixtures/env-layer/`, `env-mapping/`, `provider-alias/` — worked scope examples.
