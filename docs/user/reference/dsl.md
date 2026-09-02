# DSL reference — `.pluvian/spec.ts`

> **Audience:** spec authors. The authoritative reference for the rule-building language. For _what the shipped rules check_, see the [rule catalog](./rules/all-rules.md); this page documents the _language itself_.

## The spec file

`.pluvian/spec.ts` exports a `spec` array of rules (builders). The engine resolves the `@erkos/pluvian` import itself — no local install required to run. Install the types locally (`npm i -D @erkos/pluvian`) for editor autocomplete + a `tsc --noEmit` typo check.

```ts
import { rule, AwsResource, Port, Effect } from "@erkos/pluvian";

export const spec = [
  rule()
    .id("no-public-ssh")
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .onViolation(Effect.Block)
    .message("SSH and RDP must not be open to the internet")
    .rationale("CIS AWS Foundations Benchmark, control 5.2"),
];
```

## The builder chain

| Method                                     | Purpose                                                                     | Required                     |
| ------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------- |
| `rule()`                                   | Start a rule. Returns the builder.                                          | yes                          |
| `.id('…')`                                 | Stable id (defaults to `rule-N`). Used in ignore directives + SARIF.        | recommended                  |
| `.resource(T1, T2, …)`                     | Target resource type(s).                                                    | one of resource/allResources |
| `.allResources()`                          | Target every resource (for project-wide conditions like `requireResource`). |                              |
| `.denyIngress(…)` / `.mustHaveTags(…)` / … | One or more conditions (see below).                                         | at least one                 |
| `.message('…')`                            | The finding text.                                                           | yes                          |
| `.rationale('…')`                          | The why. Surfaces in terminal + SARIF.                                      | recommended                  |
| `.onViolation(Effect)`                     | Severity: `Block` (default), `Warn`, `RequireApproval`.                     | optional                     |
| `.environment(Environment)`                | Scope to an environment.                                                    | optional                     |
| `.providerAlias('…')`                      | Scope to a provider alias.                                                  | optional                     |
| `.region(r1, r2, …)`                       | Scope to provider regions.                                                  | optional                     |
| `.approvers(a1, a2, …)`                    | Who signs off (for `require_approval`).                                     | optional                     |

Multiple conditions on one rule **AND** — all must fire to violate.

## Conditions

Grouped by what they check. The first argument is often a typed enum (`Port`, `AwsAttribute`, `Block`, …) — autocomplete + typo-proof.

### Network exposure (ingress/egress)

| Method                              | Fires when                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `.denyIngress(Port…, from?: Cidr…)` | An ingress rule (SG / NACL / GCP firewall / Azure NSG) opens one of the ports. Default `from = [0.0.0.0/0, ::/0]` (internet). |
| `.denyEgress(Port…, from?: Cidr…)`  | Same, for egress.                                                                                                             |

`denyIngress` reads the cloud-neutral `ingress` field — one rule covers AWS SGs, AWS NACLs, GCP firewalls, and Azure NSGs.

### Attributes — boolean / presence / value

| Method                          | Fires when                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `.mustBeTrue(attr…)`            | attr is not literally `true` (absent violates — for attrs whose safe value is `true`).      |
| `.mustBeFalse(attr…)`           | attr is not literally `false` (absent violates — for attrs that default to `true`).         |
| `.mustBeSet(attr…)`             | attr is absent / null (any non-empty value passes).                                         |
| `.denyWhenTrue(attr…)`          | attr is literally `true`.                                                                   |
| `.mustEqual(attr, value)`       | attr ≠ `value` (absent violates).                                                           |
| `.mustBeAtLeast(attr, min)`     | numeric attr < `min`.                                                                       |
| `.mustBeAtMost(attr, max)`      | numeric attr > `max`.                                                                       |
| `.mustBeOneOf(attr, v1, v2, …)` | attr not in the allowlist (absent violates).                                                |
| `.denyValue(attr, v1, v2, …)`   | attr in the denylist.                                                                       |
| `.denyAcl(acl…)`                | S3 ACL is one of the denied values.                                                         |
| `.denyLiteral(attr…)`           | attr is a literal value (a reference is the safe pattern — for hardcoded-secret detection). |

### Tags

| Method                     | Fires when                                                        |
| -------------------------- | ----------------------------------------------------------------- |
| `.mustHaveTags(t1, t2, …)` | The resource's tag/label map is missing any of the required keys. |

Accepts your own enum (a closed org taxonomy). `merge()` tag maps resolve; an unresolvable `var.tags` degrades to could-not-evaluate.

### Lists

| Method                              | Fires when                                               |
| ----------------------------------- | -------------------------------------------------------- |
| `.listContains(attr, v1, v2, …)`    | The list-valued attr contains any of the values.         |
| `.listMustInclude(attr, v1, v2, …)` | The list-valued attr does not include all of the values. |

### Cross-resource (association)

| Method                                | Fires when                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.mustHaveAssociated(childType, via)` | No separate `childType` resource references this one via `via` (e.g. a bucket with no encryption-config companion). |
| `.denyIfAssociated(childType, via)`   | A separate `childType` resource references this one via `via` (e.g. a role with an inline policy).                  |

Associations follow resource refs and `var`/`local` chains; **module-scoped** so a submodule's child can't alias onto a same-named root parent.

### Graph (topology-aware)

The v2 graph layer (doc 10) adds **multi-hop dependency-graph** conditions — the only static Terraform rules that traverse chains of references. These catch controls no per-resource tool can express.

| Method | Fires when |
|---|---|
| `.denyIfReachable(targetType, direction?)` | This resource can reach a `targetType` through any chain of references (bidirectional BFS). The "no DB in a public subnet" rule = `.denyIfReachable(AwsResource.InternetGateway)` — traverses `db → subnet → route_table → route → IGW`. |
| `.denyIfSharedWith(sharedType, otherType)` | This resource shares a `sharedType` (e.g. a security group) with a resource of `otherType` (e.g. a public load balancer). Lateral-movement prevention. |
| `.denyIfReachableAttr(targetType, attr, ...values)` | This resource can reach a `targetType` whose `attr` is in `values`. Combines traversal + attribute check. E.g. `.denyIfReachableAttr(AwsResource.KmsKey, AwsAttribute.KeyManager, 'AWS')` = "KMS key must be customer-managed." |

`direction` defaults to `'both'` (forward + reverse traversal). Forward follows edges from this resource outward; reverse finds resources that reference this one. The "no DB in public subnet" chain alternates both.

> **Edge classification is resource-type-aware.** Edges are classified by attribute name (`subnet_id` → routing, `vpc_id` → structural), with per-resource-type overrides for attributes that read like routing but are deployment refs — `subnet_id` on a NAT gateway is treated as `structural`, so a private DB egressing via a NAT deployed in a public subnet does not false-violate. An unresolvable edge in a chain (e.g. `subnet_id = var.x` with no default) degrades the query to could-not-evaluate — never a false pass.

### Same-resource blocks

| Method                      | Fires when                   |
| --------------------------- | ---------------------------- |
| `.mustHaveBlock(block)`     | The nested block is absent.  |
| `.denyBlockPresence(block)` | The nested block is present. |

A `dynamic` block whose `for_each` is unresolvable degrades to could-not-evaluate (presence unknown), never a definite verdict.

### IAM policies

| Method                    | Fires when                                                                  |
| ------------------------- | --------------------------------------------------------------------------- |
| `.denyIamWildcard()`      | A parsed policy has `Action "*"` (or `NotAction` on an Allow).              |
| `.denyPublicPrincipal()`  | A parsed Allow statement has `Principal "*"`.                               |
| `.requireSslOnlyPolicy()` | The policy does not deny non-SSL transport (`aws:SecureTransport = false`). |

These parse literal-JSON, `jsonencode(...)`, and `data.aws_iam_policy_document` policies.

### Secrets (structural — defense-in-depth)

| Method                             | Fires when                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `.denyPlaintextEnvSecrets()`       | An env-var name (PASSWORD/SECRET/KEY/TOKEN/CREDENTIAL) has a literal value in ECS/Lambda env vars. |
| `.denyPlaintextConnectionSecret()` | A `connection {}` block has a plaintext private_key/password/token.                                |

pluvian is **not** a general secret scanner (use gitleaks) — these are structural checks on known secret-bearing attributes.

### Lifecycle / supply-chain

| Method                                | Fires when                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `.denyProvisioner(name…)`             | The resource declares any of the provisioner types (`local-exec`, `remote-exec`, `file`). |
| `.denyIgnoreChanges(attr…)`           | `lifecycle.ignore_changes` lists any of the attribute paths.                              |
| `.requireExactTerraformVersion()`     | `terraform.required_version` is not an exact `= X.Y.Z` pin.                               |
| `.denyFloatingProviderVersion(name…)` | A named provider's version constraint floats (bare / `>=` / `>`).                         |
| `.denyFloatingModuleVersion()`        | A registry module's version constraint floats or is absent.                               |
| `.requireEncryptedBackend()`          | No backend declared, or `encrypt` is not `true`.                                          |
| `.denyLocalBackend()`                 | The backend is `local` (or absent — Terraform treats absence as local).                   |

### Bindings / outputs

| Method                                | Fires when                                                            |
| ------------------------------------- | --------------------------------------------------------------------- |
| `.denyInsensitiveVariable()`          | A secret-named `variable` lacks `sensitive = true`.                   |
| `.denyPlaintextLocalSecret()`         | A secret-named `local` holds a literal (not a reference).             |
| `.denyInsensitiveSecretOutput(attr…)` | An output referencing a secret-bearing attr lacks `sensitive = true`. |

### Data residency

| Method                              | Fires when                                                  |
| ----------------------------------- | ----------------------------------------------------------- |
| `.denyNonApprovedRegion(r1, r2, …)` | The resource's provider region is not in the approved list. |

Unknown region → could-not-evaluate.

### Project-level presence

| Method                   | Fires when                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `.requireResource(type)` | No resource of `type` exists anywhere in the scanned project (the one non-per-resource condition). |

Pair with `.allResources()`. The finding carries a synthetic `<project>:0` location.

## Scoping

A rule with no scope applies to every matching resource. The three filters (independent, AND-combined):

- `.environment(Environment.Production)` — the resource's environment (tag/label OR root-folder mapping). Unknown env → could-not-evaluate.
- `.providerAlias('dr')` — the resource's `provider = aws.dr` alias (module `providers =` maps followed).
- `.region('eu-west-1', …)` — the provider block's region.

See [how to scope](../how-to/scope-to-environment.md).

## Effects

| Effect            | Behavior                                                                  | Exit code impact |
| ----------------- | ------------------------------------------------------------------------- | ---------------- |
| `Block` (default) | Fails the build                                                           | exit 1           |
| `Warn`            | Visible, non-blocking                                                     | exit 0           |
| `RequireApproval` | Non-blocking; emits `PLUVIAN_REQUIRES_APPROVAL=true` for a downstream gate | exit 0           |

## Inline ignore directive

Suppress findings on a specific block, with a reason (auditable in the diff):

```hcl
# pluvian:ignore: bastion — SSH is intentional behind a corp-VPN CIDR
# pluvian:ignore <ruleId>: specific rule + reason
```

No global bypass (no `.pluvianignore`, no `--no-check`). See [handle exceptions](../how-to/handle-exceptions.md).

## Vocabulary

Resource types, attributes, ports, tags, blocks live in typed enums under `@erkos/pluvian`:

- `AwsResource`, `AzureResource`, `GcpResource`, `DataResource` — the resource types (~3200 recognized).
- `AwsAttribute`, `AzureAttribute`, `GcpAttribute`, `DataAttribute` — the flattened attribute paths.
- `Port`, `Cidr`, `Tag`, `Acl`, `Block`, `Provisioner`, `LifecycleAttribute`, `Environment`, `Effect`, `Approver`.

A value not in the enum resolves to `undefined` at runtime → the rule fails `validate()` with a clear error. Adding a resource type is an enum member in one place.

## See also

- [Rule catalog](./rules/all-rules.md) — the shipped rules using this DSL.
- [Add a custom rule](../how-to/add-a-custom-rule.md) — copy-paste patterns by control family.
- [What pluvian does / doesn't](../what-it-does.md) — the could-not-evaluate / ungoverned discipline behind every condition.
