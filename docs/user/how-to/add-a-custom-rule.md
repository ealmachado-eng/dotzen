# How to add a custom rule

> **Audience:** spec authors. The rule DSL, the condition families, and when to reach for each — with copy-pasteable patterns for the most common controls.

## Rule anatomy

Every rule is a `rule()` builder chain. The minimum is a target, one or more conditions, and a message:

```ts
rule()
  .resource(AwsResource.SecurityGroup) // WHAT: the resource type(s)
  .denyIngress(Port.SSH, Port.RDP) // WHEN: the condition(s) that fire
  .message("...") // WHAT IT SAYS
  .rationale("..."); // WHY (optional, recommended)
```

Optional knobs:

- `.id('my-rule')` — a stable id (defaults to `rule-N`); used in ignore directives and SARIF. **Set one** for rules you'll keep.
- `.onViolation(Effect.Block | Effect.Warn | Effect.RequireApproval)` — severity (defaults to `block`).
- `.environment(Environment.Production)` — scope to an environment. See [scope to environment](./scope-to-environment.md).
- `.region(...)`, `.providerAlias(...)` — scope to a region/provider alias.
- `.approvers(...)` — who must sign off (for `require_approval`).

A rule can carry **multiple conditions** (all must fire to violate — they AND). A rule can target **multiple resource types** (`.resource(AwsResource.X, AwsResource.Y)`).

## The condition families

Reach for the right family for the job. Full detail in the [DSL reference](../reference/dsl.md); the common patterns:

### Network exposure

```ts
// Block public SSH/RDP on a security group (and NACLs, GCP firewalls, Azure NSGs).
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH, Port.RDP)
  .message("No public SSH/RDP");
```

`denyIngress` reads the cloud-neutral `ingress` field that the normalizer maps from SGs, NACLs, GCP firewalls, and Azure NSGs — one rule covers all of them. `Port` is a typed enum (autocomplete + typo-proof).

### Encryption at rest

```ts
// Require storage_encrypted = true (absent = the provider default, which is false → violate).
rule()
  .resource(AwsResource.DbInstance)
  .mustBeTrue(AwsAttribute.StorageEncrypted)
  .message("RDS instances must encrypt storage at rest");
```

Use `mustBeTrue` when the safe value is `true` and absence is the violation. Use `mustBeFalse` when the safe value is `false` and the _attribute defaults to true_ (so absence must violate — e.g. EKS `endpoint_public_access`).

```ts
// Require an attribute to be present (any value) — e.g. a KMS key id.
rule()
  .resource(AwsResource.Cloudtrail)
  .mustBeSet(AwsAttribute.KmsKeyId)
  .message("CloudTrail must be KMS-encrypted");
```

### Tagging

```ts
enum OrgTag {
  Owner = "owner",
  CostCenter = "cost_center",
}
rule()
  .resource(AwsResource.S3Bucket)
  .mustHaveTags(OrgTag.Owner, OrgTag.CostCenter)
  .message("S3 buckets must carry org tags");
```

`mustHaveTags` accepts your own enum — typo-proof, closed taxonomy. A `merge()` tag map is resolved (proven-present keys count; an unresolvable `var.tags` degrades to could-not-evaluate, never a false violation). See [require org tags](#) (covered in the [tutorial](../tutorial.md#4-add-a-custom-rule-the-bit-that-matters)).

### Value checks

```ts
// Deny a value (e.g. a weak TLS policy, an "allow all" principal).
rule()
  .resource(AwsResource.LbListener)
  .denyValue(AwsAttribute.SslPolicy, TlsPolicy.Tls10, TlsPolicy.Tls11)
  .message("Load balancer listeners must not use TLS 1.0/1.1");

// Require a value (allowlist).
rule()
  .resource(GcpResource.SqlDatabaseInstance)
  .mustBeOneOf(
    GcpAttribute.SqlSslMode,
    "ENCRYPTED_ONLY",
    "TRUSTED_CLIENT_CERTIFICATES_ONLY",
  )
  .message("Cloud SQL must require encrypted connections");
```

### Cross-resource presence

```ts
// An S3 bucket MUST have a companion encryption-config resource referencing it.
rule()
  .resource(AwsResource.S3Bucket)
  .mustHaveAssociated(
    AwsResource.S3BucketServerSideEncryptionConfiguration,
    AwsAttribute.Bucket,
  )
  .message("Buckets must have server-side encryption configured");

// An IAM role must NOT have an inline policy (managed policies are the safe pattern).
rule()
  .resource(AwsResource.IamRole)
  .denyIfAssociated(AwsResource.IamRolePolicy, AwsAttribute.Role)
  .message("IAM roles must not have inline policies — use managed policies");
```

`mustHaveAssociated` / `denyIfAssociated` follow resource references (`bucket = aws_s3_bucket.x.id`) and `var`/`local` chains that bottom out at a ref. The association is **module-scoped** — a submodule's child won't alias onto a same-named root parent.

### Block presence

```ts
// Require a nested block (e.g. EKS workload identity).
rule()
  .resource(GcpResource.ContainerCluster)
  .mustHaveBlock(Block.WorkloadIdentityConfig)
  .message("GKE clusters must enable Workload Identity");

// Deny a nested block (e.g. a GCP instance ephemeral public IP).
rule()
  .resource(GcpResource.ComputeInstance)
  .denyBlockPresence(Block.NetworkInterfaceAccessConfig)
  .message("Compute instances must not have ephemeral public IPs");
```

### Secrets

```ts
// Deny a hardcoded secret on a known attribute (defense-in-depth; complements gitleaks).
rule()
  .resource(AwsResource.DbInstance)
  .denyLiteral(AwsAttribute.Password)
  .message(
    "RDS password must be a reference (Secrets Manager / SSM), not a literal",
  );

// Flag plaintext secrets in ECS / Lambda env vars.
rule()
  .resource(AwsResource.EcsTaskDefinition)
  .denyPlaintextEnvSecrets()
  .message("No plaintext secrets in container environment variables");
```

dotzen is **not** a general secret scanner (use gitleaks for that) — these are _structural_ checks on known secret-bearing attributes. See [what-it-does](../what-it-does.md).

### IAM policies

```ts
// Deny wildcard / over-broad IAM (parses literal-JSON, jsonencode, and data-source policies).
rule()
  .resource(AwsResource.IamPolicy)
  .denyIamWildcard()
  .denyPublicPrincipal()
  .message("IAM policies must not be wildcard or public");
```

### List-valued attributes

```ts
// A list must (or must not) contain certain values.
rule()
  .resource(AwsResource.EksCluster)
  .listMustInclude(AwsAttribute.EnabledClusterLogTypes, "api", "audit")
  .message("EKS clusters must enable audit + api logging");
```

### Project-level presence

```ts
// Require a resource to EXIST somewhere in the project (not per-resource — project-wide).
rule()
  .allResources()
  .requireResource(AwsResource.AccessAnalyzerAnalyzer)
  .message("An IAM Access Analyzer must be declared in the project");
```

`requireResource` is evaluated once for the whole project (violations carry a synthetic `<project>:0` location). Pair it with per-resource conditions on the same rule freely.

## Composing with the presets

You usually don't write rules from scratch — you **spread a preset and add your own**:

```ts
import { coreSecurity, cisAws } from '@dotzen/dotzen'

export const spec = [
  ...coreSecurity,        // the 80% baseline
  ...cisAws,              // AWS CIS additions
  rule().resource(...)... // YOUR rule, on top
]
```

See [use the CIS presets](./use-the-cis-presets.md) and the [rule catalog](../reference/rules/all-rules.md).

## Verifying a rule

The fastest feedback loop: write the rule, run `npx @dotzen/dotzen check`, confirm it fires (or passes) on a resource you control. For editor autocomplete + a compile-time check, install the types locally: `npm i -D @dotzen/dotzen`, then `tsc --noEmit .zen/spec.ts` catches typos in resource types / attributes / ports.

## See also

- [DSL reference](../reference/dsl.md) — every condition, every knob, in full.
- [Rule catalog](../reference/rules/all-rules.md) — what the shipped presets check (steal patterns).
- [Scope to environment / region](./scope-to-environment.md) — make a rule prod-only, EU-only, etc.
- [Handle exceptions](./handle-exceptions.md) — suppress a finding on a specific resource.
