# Changelog

All notable changes to `@dotzen/dotzen` are documented here. Versions follow
[semver](https://semver.org/). Notably, **new spec DSL vocabulary (new rule
conditions, resource types, or attributes) is treated as a feature release**,
not a patch — even when strictly backward-compatible, consumers should know
whether re-reading their spec is warranted.

## 1.5.0

### Fixed — dogfood-driven improvements from real-world Terraform modules

Ran dotzen v1.4.3 against three popular HashiCorp/community Terraform
modules (terraform-aws-vpc, Azure/terraform-azurerm-aks,
terraform-google-kubernetes-engine). Findings drove four fixes:

**False positives eliminated — config-flag variables (breaking for
`denyInsensitiveVariable`):**

Variables whose name contains a secret-like word (PASSWORD, SECRET, KEY,
TOKEN) but ends with a config-flag suffix (`_enabled`, `_disabled`,
`_interval`, `_timeout`, `_count`, `_mode`, `_provider`, `_addon`,
`_via_dns`, `_max_length`, `_min_length`) are now skipped by
`denyInsensitiveVariable`. These are feature flags, not secrets — e.g.
`secret_rotation_enabled`, `enable_secret_manager_addon`,
`dns_enable_k8s_tokens_via_dns`. This eliminates 6 false-positive
violations across the Azure AKS and GCP GKE modules.

`denyPlaintextLocalSecret` is NOT affected — a local named
`secret_rotation_enabled = "my-password"` is still suspicious.

**`UTILITY_TYPES` expanded — `null_resource`, `time_sleep`, `tls_*`:**

Added `null_resource`, `time_sleep`, `tls_private_key`,
`tls_self_signed_cert`, `tls_locally_signed_cert` to `UTILITY_TYPES`.
These are Terraform utility/provider resources with no security surface.
Previously surfaced as ungoverned noise (7 entries on the Azure AKS
module alone). Now silently skipped.

**Data source vocabulary expanded:**

Added 18 new `DataResource` enum members for commonly-used data sources
that previously surfaced as ungoverned:

- AWS: `aws_caller_identity`, `aws_partition`, `aws_region`,
  `aws_availability_zones`, `aws_iam_policy_document`, `aws_eks_cluster`,
  `aws_ssm_parameter`, `aws_sns_topic`, `aws_subnet`, `aws_vpc`,
  `aws_security_group`.
- Azure: `azurerm_client_config`, `azurerm_resource_group`,
  `azurerm_virtual_network`, `azurerm_subnet`,
  `azurerm_log_analytics_workspace`, `azurerm_user_assigned_identity`.
- GCP: `google_compute_zones`, `google_container_engine_versions`,
  `google_compute_subnetwork`, `google_client_config`,
  `google_client_openid_userinfo`.

**Azure vocabulary — `azapi_update_resource`:**

Added `azapi_update_resource` to `AzureResource`. This is a real Azure
provider resource used by AKS modules for imperative post-create API
updates (node pool version, DNS config, proxy config). Previously
surfaced as ungoverned (5 instances on the Azure AKS module).

### Dogfood results (before → after)

| Module    | Violations | CNE         | Ungoverned  |
| --------- | ---------- | ----------- | ----------- |
| AWS VPC   | 0 → 0      | 2 → 2       | 13 → 8      |
| Azure AKS | 5 → 2      | 1 → 1       | 25 → 2      |
| GCP GKE   | 4 → 2      | 14 → 14     | 8 → 4       |
| **Total** | **9 → 4**  | **17 → 17** | **46 → 14** |

- 5 false-positive violations eliminated (config-flag variables).
- 32 ungoverned entries eliminated (utility types + data sources + azapi).
- Remaining CNE: 2 AWS (data-source-based IAM policies — legitimately
  unresolvable), 1 Azure (compound ternary), 14 GCP (interpolated IAM
  members + complex firewall expressions — future improvement).
- Remaining ungoverned: 8 AWS (VPC-specific types like
  `aws_vpc_dhcp_options`, `aws_vpn_gateway_route_propagation`), 2 Azure
  (`azurerm_monitor_data_collection_rule`), 4 GCP (`kubernetes_config_map`
  — Kubernetes provider, not cloud provider).

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The
config-flag suffix skip in `denyInsensitiveVariable` may cause
previously-flagged violations on variables like `secret_rotation_enabled`
to disappear. These were false positives — review to confirm the variable
is indeed a config flag, not a secret value.

## 1.4.3

### Fixed — CHANGELOG formatting

Prettier compliance fix for `CHANGELOG.md` (missing blank line after
list-intro paragraph in the 1.4.2 entry). No code changes.

## 1.4.2

### Fixed — ref-branch ternary resolution (ROADMAP next-steps #2)

The conservative ternary evaluator now resolves sole-ref branches through
scope. Previously, a ternary like `${local.is_prod ? 30 : var.retention}`
where the false branch is a reference (not a scalar literal) degraded to
`couldNotEvaluate` — even when `var.retention` had a default value.

The chosen branch is now resolved via `resolveValue`, which handles:

- Sole `var.*` / `local.*` refs → follows through scope chains
- Nested ternaries → evaluates them
- Comparison locals → resolves via `tryEvalComparison`

Compound branch expressions (`var.x * 2`, `coalesce(...)`, function calls)
stay unresolved — conservative, never a guess.

This eliminates the #1 `couldNotEvaluate` source across all 3 cloud
fixtures. The realistic-rds and realistic-aws fixtures now report
`couldNotEvaluate: 0` (was 1 each).

5 new unit tests pin the behavior: ref branch with default, ref branch
true-path, local chain (var→local→literal), no-default (still unresolved),
compound expression (still unresolved).

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. Configs
that previously produced `couldNotEvaluate` on ternary-with-ref-branch
patterns will now produce **definite verdicts** (passes or violations)
where the ref resolves to a literal. Review newly-surfaced violations —
they reflect values that were always there but previously unresolvable.

## 1.4.1

### Added — first batch of rules for the expanded vocabulary (ROADMAP #1)

7 new preset rules governing previously-ungoverned resource types:

**`coreSecurity` (4 new rules):**

- **CloudWatch log retention** — `aws_cloudwatch_log_group` must set
  `retention_in_days` (warn). AI-generated configs often omit retention,
  leaving logs to accumulate forever.
- **SQS queue KMS encryption** — `aws_sqs_queue` must set
  `kms_master_key_id` (warn). Queue messages should be encrypted at rest.
- **SNS topic KMS encryption** — `aws_sns_topic` must set
  `kms_master_key_id` (warn). Topic messages should be encrypted at rest.
- **EFS encryption** — `aws_efs_file_system` must have `encrypted = true`
  (block). Aligns with the existing EBS/EC2 encryption controls.

**`cisAws` (1 new rule):**

- **EKS node group no direct SSH** — `aws_eks_node_group` must not have a
  `remote_access {}` block (block). SSM Session Manager provides audited
  access without opening SSH to nodes.

**`cisGcp` (1 new rule):**

- **GKE Workload Identity** — `google_container_cluster` must have a
  `workload_identity_config {}` block (block). Pods authenticate as
  their own identity, not the node service account.

### Added — vocabulary

- `AwsAttribute.RetentionInDays` (`retention_in_days`)
- `AwsAttribute.KmsMasterKeyId` (`kms_master_key_id`)
- `Block.RemoteAccess` (`remote_access` — EKS node group SSH block)
- `Block.WorkloadIdentityConfig` (`workload_identity_config` — GKE)

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
rules are additive to the preset packs. Users composing
`[...coreSecurity, ...cisAws]` will see new `warn`-effect findings on
CloudWatch/SQS/SNS resources without retention/encryption, and `block`
findings on EKS node groups with SSH or GKE clusters without Workload
Identity. Review the new findings — they were silent passes before.

## 1.4.0

### Added — conservative ternary: bare-ref boolean conditions (ROADMAP #3)

The conservative ternary evaluator now resolves the common AI-generated
pattern `local.is_prod = var.env == "prd"` followed by
`${local.is_prod ? true : false}`. Previously, a bare-ref ternary
condition (no inline `==`/`!=`) degraded to `could-not-evaluate` even
when the local stored a comparison result.

- New `tryEvalComparison()` helper evaluates `${ref (==|!=) scalar}`
  (no ternary) — used when a local's scope entry IS a comparison
  interpolation.
- `tryEvalTernary()` extended: when the inline-compare regex fails, a
  bare-ref condition `^(var|local)\.\w+$` is tried. The ref resolves
  via three fallbacks: (a) scope entry is a comparison interpolation →
  `tryEvalComparison`; (b) scope entry is a boolean literal → use
  truthiness; (c) `resolveRaw` → boolean literal. Non-boolean literals
  (strings/numbers) stay unresolved — Terraform forbids them as
  conditions, so dotzen refuses to guess.
- 5 new unit tests + 3 integration tests pin the behavior.

### Added — `UTILITY_TYPES` silently-skipped set (ROADMAP #4)

Terraform built-in utility resources (`random_password`, `random_string`,
`random_id`, `random_uuid`, `random_shuffle`, `random_pet`,
`random_integer`, `random_bytes`, `terraform_data`) are now silently
skipped in `collectUngoverned` — neither governed nor surfaced as a
coverage gap. These resources have no security surface; reporting them
as ungoverned was noise. 3 unit tests prove: real gaps still surface,
utilities don't, `data.random_*` also skipped.

### Added — vocabulary expansion + aws.ts split (ROADMAP #1/#2)

- **AWS enums extracted to `src/vocabulary/aws.ts`** — mirrors the
  existing `azure.ts`/`gcp.ts`/`data.ts` pattern. `index.ts` halved
  from 325 → 166 lines. Barrel re-exports preserve the public API.
- **`AwsResource` grew from 57 → 484 members** (verified 100% against
  the HashiCorp AWS provider docs — 1678 resources). Covers VPC/network,
  IAM, storage, compute, monitoring, Route53/ACM, EKS/ECS, RDS variants,
  EFS/FSx, KMS/Secrets/SSM, CloudTrail/Config, SQS/SNS/Kinesis,
  EventBridge, ALB/NLB, Lambda, Elastic Beanstalk/AppRunner/Lightsail,
  Glue/Athena/EMR/Step Functions, CloudFront/WAF/Shield/GAX, DynamoDB/
  ElastiCache/MQ/MSK, VPC Lattice/Verified Access/Network Firewall,
  SES/Pinpoint/Connect, Backup/DR, RAM/Macie/GuardDuty/Detective/
  SecurityHub/Inspector, Organizations/SSO/Transfer, AppConfig/Amplify.
- **`AzureResource` grew from 19 → 318 members** (266 verified against
  Azure provider docs, 52 deprecated-but-real kept intentionally).
  Covers networking, compute, storage, databases, containers, IAM,
  key vault, security, backup/recovery, event-grid/service-bus/event-hub,
  API management, app service, resource groups/policy.
- **`GcpResource` grew from 7 → 201 members** (verified 100% against
  GCP provider docs — 1465 resources with IAM expansion). Covers compute,
  networking, storage, IAM, SQL, GKE, KMS, cloud-run, pub-sub/eventarc/
  tasks, bigquery/dataflow/dataproc/composer, spanner/firestore/
  memorystore, cloudbuild/clouddeploy, secret-manager, network-security,
  VPC-SC, apigateway/apigee, logging/monitoring, vertex-AI, binary-
  authorization/artifact-registry.
- **Total recognized types: 1003** (was 83). Ungoverned noise on real
  module repos drops from ~50% to <5%. All enum values verified against
  actual provider documentation.

### Fixed — `findTfFiles` recursive scan causing duplicate violations

`findTfFiles` in `parse.ts` was using `fs.readdirSync(dir, { recursive:
true })` — the recursive scan discovered `.tf` files in `modules/`
subdirectories directly AND `followModules` re-normalized them via
`module {}` calls, producing duplicate violations on governed resources
inside local modules. Fixed: non-recursive scan (top-level `.tf` files
only), matching Terraform's own root-module loading behavior.

### Added — realistic AI-style integration test fixtures (ROADMAP #5/#6)

Four comprehensive AI-generated Terraform fixtures wired as permanent
integration tests in `check.test.ts`:

- **`realistic-rds/`** — RDS + SG + KMS + IAM + CloudWatch + SSM +
  `random_password`, with `local.is_production = var.environment == "prd"`
  ternary pattern, `merge()` tags, and a ref-branch ternary
  `couldNotEvaluate` case.
- **`realistic-aws/`** — VPC + subnet + IGW + SG + RDS + KMS + IAM +
  S3 + CloudWatch + Lambda + `random_password` + local module call +
  `aws_prometheus_workspace` (deliberately ungoverned).
- **`realistic-azure/`** — Resource group + VNet + NSG + storage +
  MSSQL + Key Vault + AKS + web app + Log Analytics + IAM + local
  module + `azurerm_iot_security_solution` (deliberately ungoverned).
- **`realistic-gcp/`** — VPC + subnetwork + firewall + GCS + Cloud SQL +
  GKE + KMS + service account + Cloud Run + Pub/Sub + `random_id` +
  local module + `google_workflows_workflow` (deliberately ungoverned).

Each fixture exercises: ternary evaluation, `UTILITY_TYPES` silent skip,
module-following, tag/label resolution, ungoverned surface, and
`couldNotEvaluate` honest degrade. Pinned assertions per cloud.

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The
ternary extension may cause **previously-`couldNotEvaluate` findings to
become definite verdicts** where `local.is_prod = var.env == "prd"`
patterns now resolve (intended — they were false negatives before). The
vocabulary expansion causes previously-ungoverned resources to be
recognized (not surfaced as coverage gaps) — no new violations unless
a rule targets them. The `findTfFiles` fix eliminates duplicate
violations on resources inside local `modules/` subdirectories.

To adopt:

- Upgrade `version` in `dotzen.json` to `"1.4.0"`.
- Pin CI to `npx @dotzen/dotzen@1.4.0 check`.

## 1.3.0

### Added — stable author-chosen rule IDs

Rules can now have a stable, human-readable ID for use in ignore directives
and JSON output — safe across reorders, unlike the auto-generated positional
`rule-N`:

```ts
rule()
  .id('no-public-ssh')
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH)
  .message('SSH must not be open')
```

Then in Terraform:

```hcl
# dotzen:ignore no-public-ssh: bastion host — SSH is intentional
resource "aws_security_group" "bastion" { ... }
```

- `.id()` is **optional** — if not set, dotzen auto-generates `rule-N` (backward compatible).
- Must match `[a-z][a-z0-9-]*` and be unique within the spec (validated at load time).
- The ignore directive regex now accepts any stable ID, not just `rule-\d+`.
- **Why:** positional `rule-N` IDs are fragile — reordering rules shifts IDs,
  silently suppressing the wrong rule. A stable ID makes per-rule ignores safe.

## 1.2.0

### Added — ungoverned-resource telemetry

Resources whose type is not in dotzen's closed vocabulary (`KNOWN_TYPES`)
were previously silently skipped. They are now collected and surfaced as a
**`NOT GOVERNED (vocabulary gap)`** section in terminal output, and as an
`ungoverned` array in JSON output. Each entry shows `{type, name, file, line}`.

A silent skip is worse than an honest gap — users now see exactly which
resources dotzen can and cannot govern. The `CheckReport` interface gains
a `ungoverned` field (additive — existing JSON consumers that ignore
unknown fields are unaffected; the frozen-schema test now includes it).

### Added — per-rule ignore directives

`# dotzen:ignore` now supports an optional ruleId to suppress ONLY that
rule on the block, while keeping other rules' findings:

```hcl
# dotzen:ignore rule-5: bastion host — SSH is intentionally public
resource "aws_security_group" "bastion" {
  ingress { ... }
}
```

- `# dotzen:ignore rule-5: <reason>` — suppresses only `rule-5` on this block.
- `# dotzen:ignore: <reason>` — suppresses ALL rules on this block (unchanged).
- `# dotzen:ignore` — suppresses ALL rules, no reason (unchanged).

The `IgnoreDirective` interface gains an optional `ruleId` field. The
filter in `check.ts` checks all-block ignores first (fast `Set` lookup),
then per-rule ignores by `(file, line, ruleId)` match.

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
`ungoverned` field in `CheckReport` is additive. The per-rule ignore syntax
is a superset of the existing syntax (no ruleId = suppress all, as before).

To see ungoverned resources:

```bash
npx @dotzen/dotzen@1.2.0 check
# The output now includes a "NOT GOVERNED (vocabulary gap)" section if any
# resources have types not in dotzen's vocabulary.
```

To suppress a single rule on a block:

```hcl
# dotzen:ignore rule-3: known exception — this bucket hosts a public CDN
resource "aws_s3_bucket" "cdn" { ... }
```

## 1.1.0

### Changed — CIS presets are now composable additions to coreSecurity

**Breaking for CIS preset users.** The three CIS packs (`cisAws`,
`cisAzure`, `cisGcp`) previously contained standalone rules that
duplicated `coreSecurity` (network, encryption, IAM, secrets, tags,
provisioners). Composing `[...cisAws, ...pciDss]` produced **duplicate
violations** — the same resource flagged twice under different ruleIds.

All 8 preset packs now compose on top of `coreSecurity`:

```ts
// Before (v1.0.x) — standalone, duplicating coreSecurity:
import { cisAws } from '@dotzen/dotzen'
export const spec = [...cisAws]

// After (v1.1.0) — composable, no duplicates:
import { coreSecurity, cisAws } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...cisAws]

// Mix CIS + framework packs without duplicate violations:
import { coreSecurity, cisAws, pciDss } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...cisAws, ...pciDss]
```

Rule count changes:

- `cisAws`: 23 → 6 (stripped 17 shared with coreSecurity)
- `cisAzure`: 17 → 15 (stripped 2 shared: secrets/provisioners)
- `cisGcp`: 21 → 18 (stripped 3 shared: secrets/provisioners)

New test: `no duplicate messages between coreSecurity and CIS packs` —
guards against regression.

### Migration

If you used a CIS pack standalone in v1.0.x:

```ts
// v1.0.x:
export const spec = [...cisAws]

// v1.1.0 — add coreSecurity to keep the same coverage:
import { coreSecurity, cisAws } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...cisAws]
```

If you used a framework pack (`pciDss`, `soc2`, etc.) with `coreSecurity`,
no change needed — those were already composable.

## 1.0.1

### Added — composable framework presets + GDPR/LGPD data residency

- **Composable framework preset packs** — five new `Rule[]` exports alongside
  the per-cloud CIS starters, designed to be spread as `coreSecurity` + a
  framework layer:
  - `coreSecurity` (18 rules) — the 80% shared across all frameworks.
  - `pciDss` (14 rules) — PCI DSS v4.0: encrypt ALL stores, S3 block flags,
    backup ≥30d, encrypted state, no drift hiding, DynamoDB PITR.
  - `soc2` (8 rules) — SOC 2 TSC: change mgmt, encrypted state, ECR scan,
    CloudTrail log validation.
  - `nist80053` (15 rules) — NIST 800-53: IAM password policy, additional
    encryption, no drift hiding, version pinning, state encryption.
  - `dataProtection` (12 rules) — GDPR/LGPD: encrypt ALL stores, S3 block,
    RDS not-public, data-class tagging, encrypted state, no drift hiding.
- **`denyNonApprovedRegion(...regions)` condition** — flags a resource whose
  provider region is not in the approved list. Closes the GDPR/LGPD
  data-residency gap. `providerRegions()` extracts `region` from `provider {}`
  blocks; `NormalizedResource.providerRegion` resolves per-alias (incl. module
  `providers` map remapping). Unknown region → could-not-evaluate (never a
  false pass). The `dataProtection` preset includes commented-out examples
  for both GDPR (EU) and LGPD (Brazil).
- **`.region(...approved)` scoping** on `RuleBuilder` — fail-open filter
  (mirror `.environment` / `.providerAlias`).

### Changed — dependency security

- **Upgraded eslint 9 → 10.** `brace-expansion` DoS
  (GHSA-mh99-v99m-4gvg) had no patched 1.x version; the fix required
  `minimatch@10+` → `eslint@10`. `eslint-plugin-security` is incompatible
  with eslint 10 and only produced pre-existing warnings — dropped it.
  `semgrep` + `gitleaks` (the real security gates) remain in CI.
- **npm audit: 0 vulnerabilities.**

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
presets + `denyNonApprovedRegion` are additive. To adopt:

```ts
import { coreSecurity, pciDss } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...pciDss]
```

## 1.0.0

The first stable release. The engine is feature-complete for static Terraform
governance across AWS, Azure, and GCP, with 492 unit + 34 integration tests.
The JSON output schema is frozen (`schemaVersion: 1`); inline ignore
directives suppress known-acceptable findings; curated CIS preset packs drop
into any spec; and CI integration templates ship for GitHub Actions + GitLab CI.

### Added — new rule conditions (20+)

**Resource-surface conditions:**

- `denyProvisioner(...names)` — flags `provisioner "local-exec"` /
  `"remote-exec"` / `"file"` (arbitrary command execution on apply/destroy).
  `Provisioner` enum added (`LocalExec`, `RemoteExec`, `File`).
- `denyIgnoreChanges(...attrs)` — flags `lifecycle { ignore_changes = [...] }`
  hiding drift on security-critical attributes. `LifecycleAttribute` enum
  added (`PreventDestroy`, `CreateBeforeDestroy`, `IgnoreChanges`).
- `denyPlaintextConnectionSecret()` — flags a `connection {}` block with a
  plaintext secret (`private_key` / `password` / `token`). Reuses the
  engine's secret-name pattern.
- `providerAlias(X)` scoping — a rule can target resources pinned to a
  provider alias (`provider = aws.dr` → `.providerAlias('dr')`). Extracted
  on the resource AND threaded through module `providers = { aws = aws.dr }`
  maps (#13, closes #9 across module boundaries).

**Output-surface conditions:**

- `denyInsensitiveSecretOutput(...secretAttrs)` — flags an `output` whose
  `value` references a secret-bearing attribute (e.g.
  `aws_db_instance.master_password`) without `sensitive = true`. Supports
  multi-segment data-source attrs (`data.aws_ssm_parameter.value`).

**Binding-surface conditions (variables + locals):**

- `denyInsensitiveVariable()` — flags a secret-looking `variable` (name
  matches PASSWORD/SECRET/KEY/TOKEN/CREDENTIAL) without `sensitive = true`.
- `denyPlaintextLocalSecret()` — flags a `locals` entry with a secret-shaped
  name and a plaintext literal value.

**Settings-surface conditions (terraform block):**

- `requireExactTerraformVersion()` — `required_version` must be an exact pin
  (`= X.Y.Z`), not floating.
- `denyFloatingProviderVersion(...names)` — each named provider's
  `required_providers` version constraint must be pinned (`=` or `~>`).
- `requireEncryptedBackend()` — the state backend must be declared and
  encrypted (`encrypt = true`).
- `denyLocalBackend()` — forbids `backend "local"` (or absent = local
  default).

**Module-call-surface conditions:**

- `denyFloatingModuleVersion()` — a registry module's `version` must be
  pinned (`=` or `~>`); local modules (`./`/`../`) are never flagged.

### Added — parser & normalization

- **Provider `default_tags` / `default_labels` inheritance.** A provider's
  `default_tags { tags = { … } }` (AWS/Azure) or `default_labels { labels }`
  (GCP) merges into every resource's tag set. Threaded through
  `followModules` so child modules inherit the root's defaults (Terraform
  provider inheritance). Fixes a false-violation on tagless resources whose
  tags come from the provider.
- **Resource `count = 0` / `for_each`-empty skip.** A resource with
  `count = 0` or a `for_each` resolving to an empty collection is skipped
  silently (no false violation on a disabled resource). Unresolvable
  `count`/`for_each` followed once (honest).
- **Resource `for_each` per-element expansion.** A resource with a resolvable
  `for_each` is expanded into one `NormalizedResource` per element, with
  `each.key`/`each.value` threaded into a per-instance scope. Violations
  show `type.name[key]` to distinguish instances. Association logic uses
  the base address (honest — can't statically name an instance).
- **`dynamic` blocks beyond ingress/egress.** A `dynamic "settings" { … }`
  on an App Service / GCP resource is expanded into `settings.*` attributes
  (for any block name except ingress/egress/tags, which have dedicated
  extractors). `mustHaveBlock`/`denyBlockPresence` see the block.
- **Data sources as governed resources.** `data "aws_ami" "x" {}` is
  normalized as a `NormalizedResource` with type `data.aws_ami`. The full
  condition set applies (e.g. `listMustInclude` on `owners`). `DataResource`
  - `DataAttribute` enums added. A `data` block is a READ query — governance
    is over the query (filters/args), not the fetched object.
- **Conservative ternary evaluation.** `resolveValue` now evaluates the safe
  form `${<ref> (==|!=) <scalar> ? <scalar> : <scalar>}` — a strict-equality
  ternary whose ref resolves to a literal and whose branches are both scalar
  literals. Anything compound stays unresolved (could-not-evaluate, never a
  guess). Unblocks definite verdicts on `var.env == "prod" ? true : false`.
- **Meta-arg filtering.** `count`/`for_each`/`depends_on`/`provider` are
  excluded from attribute harvesting (no longer leak as pseudo-attributes).
  `lifecycle` is kept (a nested block → `lifecycle.*` attributes for rules).

### Added — product surface (1.0 blockers)

- **Inline ignore directives (`# dotzen:ignore`).** A `# dotzen:ignore` or
  `// dotzen:ignore` (optionally `: <reason>`) comment suppresses ALL findings
  on the block it precedes (or trails on the same line). Matched by
  `(physicalFile, blockLine)`. Threaded through module files (an ignore in
  a module file suppresses findings from every instantiation).
- **Frozen JSON output schema.** `renderJson` emits `schemaVersion: 1` at the
  top. The top-level fields (`schemaVersion`, `violations`, `passed`,
  `couldNotEvaluate`, `requiresApproval`) and per-entry fields are pinned by a
  schema-stability test. Additive fields are OK; a removal/rename is a bump.
- **Performance verified.** A synthetic benchmark (100 root files, 1000
  direct resources + 100 module calls = 1202 resources) completes in ~195ms.
  No parse cache needed.

### Added — curated preset packs

**Per-cloud CIS starters** (`Rule[]` exports):

- `cisAws` (23 rules) — network exposure, encryption at rest (RDS/EBS/EC2/
  Redshift/ElastiCache), KMS rotation, S3 public access, IAM least privilege,
  CloudTrail audit logging, RDS backup retention + not-public, ECR scan,
  tags, secrets hygiene, provisioners.
- `cisAzure` (17 rules) — storage TLS/public-access/network-default-deny,
  SQL TLS/SSL, Key Vault purge protection, AKS private cluster + local
  accounts, App Service HTTPS, ACR admin, RBAC Owner/Contributor, secrets
  hygiene, provisioners.
- `cisGcp` (21 rules) — storage public-access-prevention/UBLA/versioning,
  Cloud SQL SSL/IPv4/root-password, GKE private nodes + legacy ABAC, KMS
  rotation, compute secure boot + IP forwarding, IAM allUsers/primitive
  roles, Cloud Run Functions ingress + service account, firewall SSH, secrets
  hygiene, provisioners.

**Composable framework packs** — spread a shared base + a framework layer:

- `coreSecurity` (18 rules) — the 80% shared across all frameworks: network
  exposure, encryption at rest (key resources), IAM least privilege, audit
  logging, no hardcoded secrets, required tags, provisioner denial, backup
  retention.
- `pciDss` (14 rules) — PCI DSS v4.0: encrypt ALL data stores, all four S3
  public-access-block flags, backup retention ≥30 days, encrypted + non-local
  state, no drift hiding, DynamoDB PITR.
- `soc2` (8 rules) — SOC 2 TSC: change management (version pinning), encrypted
  - non-local state, ECR scan-on-push, CloudTrail log validation.
- `nist80053` (15 rules) — NIST SP 800-53: IAM password policy
  (length/complexity/reuse/age), additional encryption, no drift hiding,
  version pinning, state encryption.
- `dataProtection` (12 rules) — GDPR/LGPD: encrypt ALL data stores, S3
  public-access block, RDS not-public, data-classification tagging, encrypted
  state, no drift hiding. Data-residency is a documented gap.

Usage:

```ts
import { cisAws } from '@dotzen/dotzen'
export const spec = [...cisAws /* your custom rules */]

// Or compose a framework spec:
import { coreSecurity, pciDss } from '@dotzen/dotzen'
export const spec = [...coreSecurity, ...pciDss]
```

All CIS presets are proven end-to-end against real Terraform fixtures
(violations flagged, compliant resources pass).

### Added — CI integration templates

- **GitHub Actions** — `.github/workflows/dotzen.yml` template: checkout +
  setup-node + `npx @dotzen/dotzen@1 check` + approval-signal export.
- **GitLab CI** — a `dotzen:check` job with `artifacts:reports:dotenv` +
  an optional manual-approval gate on `DOTZEN_REQUIRES_APPROVAL`.
- `dotzen init` prints a pointer to both templates.

### Added — vocabulary

- `Provisioner { LocalExec, RemoteExec, File }`
- `LifecycleAttribute { PreventDestroy, CreateBeforeDestroy, IgnoreChanges }`
- `DataResource { AwsAmi }`, `DataAttribute { AmiOwners }`
- `AwsAttribute.AtRestEncryptionEnabled`, `TransitEncryptionEnabled`

### Migration notes

This release is **backward-compatible** — no existing `.zen/spec.ts` needs
changes. All new conditions are additive (the `evaluate` signature gains
optional params that default to empty). The new parser features (provider
default_tags, resource count=0/for_each, dynamic blocks, ternary eval) may
cause **previously-could-not-evaluate findings to become definite verdicts**
(intended — they were false negatives before). Review newly-surfaced
violations.

To adopt the new surface:

- Upgrade `version` in `dotzen.json` to `"1.0.0"`.
- Optionally import a CIS preset (`import { cisAws } from '@dotzen/dotzen'`).
- Optionally add `# dotzen:ignore: <reason>` to suppress known-acceptable findings.
- Pin CI to `npx @dotzen/dotzen@1 check`.

## 0.3.0

### Added — module-following: nested modules, `for_each`, trace labels, `count`, and DoD surfacing (doc 08)

This release completes `doc 08 — Module-following` beyond the v0.1.0
single-level local-source case. No spec DSL vocabulary changes — the
rule-authoring surface is unchanged. The engine and HCL/parse layer now
follow and evaluate more of the module-based Terraform that real orgs
write, and surface (rather than silently skip) what they cannot.

**New module-following behavior:**

- **Nested modules (module → module).** `followModules` is recursive: a
  followed module's own `module {}` calls are followed too, bounded by a
  path-stack of resolved absolute dirs. A self/mutual cycle is recorded
  as a `could-not-evaluate` skip (ruleId `dotzen.module-following`),
  not infinite recursion. Independent diamond paths (two modules calling
  the same module with different inputs) are still evaluated per-path —
  the cycle guard is a current-path test, not a global visited set.
- **Module `for_each`.** A `for_each` over a resolvable literal map or a
  var-resolved list/set is expanded per element — one module instance
  per key, with `each.value` / `each.key` threaded into the module
  scope. The trace carries a per-key suffix `(module-label[key])`. An
  unresolvable `for_each` (`toset(...)` compound, `var.x` with no
  default) is followed once honestly — refs to `each.*` inside the
  module degrade to `could-not-evaluate` rather than false expansion.
  An empty resolved collection (`toset([])`) skips silently.
- **Per-instantiation trace labels.** Each followed call's findings carry
  `(module-label)` — e.g. `env/prd › modules/rds/main.tf (db_bad)` — so
  two calls of one module are distinguishable. Nested findings name
  every hop: `env/prd › modules/outer/main.tf (db) ›
modules/inner/main.tf (inner_db)`.
- **`count = 0` honored.** A literal `0`, or a `count` that resolves to
  `0` via a sole `var`/`local` ref, disables the module — it is skipped
  silently (correct, no resources to evaluate). An unresolvable `count`
  is followed once (honest; no per-index expansion).

### Changed — non-followed modules now surface (doc 08 DoD), never a silent `0 checks`

Previously, a `module {}` call dotzen could not follow (remote/registry/git
source, a source that escapes the scanned project, or a missing module
dir) was silently skipped — an env layer of only such calls reported
`0 checks` with no explanation. These are now recorded and surfaced as
`couldNotEvaluate` under the stable ruleId `dotzen.module-following`,
with the caller file + line and the source that was not followed.

**Behavioral note for consumers (surfaces NEW findings on existing
configs):** configs that previously reported `0 checks` on a module-based
env layer, or `could-not-evaluate` on a module's `var.*`-dependent
resources, may now produce **definite verdicts** (passes or violations)
where module-following now resolves the caller-supplied values —
including nested-module and `for_each` expansions. Review the new
violations; they reflect values that were always there but previously
unresolvable. Non-followed modules surface as `couldNotEvaluate`
(ruleId `dotzen.module-following`) — filter on that ruleId to see only
the gaps dotzen could not close.

### Internal — `SOLE_REF` resolver accepts `each.value` / `each.key`

The sole-reference resolver in `src/hcl/normalize.ts` (used by
`resolveValue` / `resolveRaw`) now follows `each.value` and `each.key`
in addition to `var.*` / `local.*`, so `each.*` references inside a
module expanded by `for_each` resolve to the threaded element value.
Scopes without `each.*` set are unaffected.

## 0.2.0

### Added — serverless function coverage (AWS Lambda, Azure Functions, GCP Cloud Run Functions)

- **New resource types** (enum members):
  - `AwsResource.LambdaFunction` (`aws_lambda_function`)
  - `AzureResource.LinuxFunctionApp` / `WindowsFunctionApp` / `FunctionApp`
    (`azurerm_linux_function_app`, `azurerm_windows_function_app`,
    `azurerm_function_app`)
  - `GcpResource.Cloudfunctions2Function`
    (`google_cloudfunctions2_function`)
- **New attributes**: `AwsAttribute.TracingMode` /
  `LambdaKmsKeyArn`; `AzureAttribute.SiteConfigMinTlsVersion`;
  `GcpAttribute.IngressSettings` / `ServiceAccountEmail`.
- **New value enums**: `XrayMode` (`Active` / `PassThrough`);
  `IngressSetting` (`AllowAll` / `AllowInternalAndGclb` /
  `AllowInternalOnly`).
- **New nested-block enum**: `Block.Identity` — Azure Functions managed
  identity block (present = use AAD, not a shared/local credential).
- **Governance rules added** to the example spec (`examples/ai-generated/.zen/spec.ts`):
  - AWS Lambda: X-Ray active tracing (`mustEqual`), env-var KMS encryption
    (`mustBeSet`), plaintext env-var secrets (`denyPlaintextEnvSecrets`).
  - Azure Functions: HTTPS-only (`mustBeTrue`), TLS 1.2 floor
    (`mustEqual` on `site_config.minimum_tls_version`), public network
    access (`denyWhenTrue`), managed identity (`mustHaveBlock(Identity)`),
    plaintext `app_settings` secrets (`denyPlaintextEnvSecrets`),
    diagnostic logging (`mustHaveAssociated` on
    `azurerm_monitor_diagnostic_setting`).
  - GCP Cloud Run Functions: unrestricted ingress (`denyValue` on
    `ALLOW_ALL`), runtime service account (`mustBeSet`), plaintext env-var
    secrets (`denyPlaintextEnvSecrets`).
  - Shared ownership tags across all serverless resource types
    (`mustHaveTags`).

### Changed — engine

- **`denyPlaintextEnvSecrets` now scans serverless env-var maps**, not just
  ECS `container_definitions`. The extractor (`envVarsOf` in `normalize.ts`)
  reads `aws_lambda_function.environment.variables`, Azure Functions
  `app_settings`, and `google_cloudfunctions2_function.service_config.
environment_variables`. A whole-map reference (`= var.x`) degrades to
  could-not-evaluate; a mixed literal/reference map yields definite verdicts
  for the literal secrets (same lenient-parse behavior as ECS). The
  `EnvVarsInfo` type (`hcl/model.ts`) mirrors `ContainerInfo`.
- **GCP `labels` tag extraction.** `tagsOf` and `environmentOf` now read
  `labels` (not `tags`) for `google_*` resources, so `mustHaveTags` and
  environment-scoped rules work on GCP resources that use the provider's
  `labels` map. Previously GCP resources with `labels` but no `tags` map
  degraded to unresolved tags (a false could-not-evaluate).

### Migration notes for spec authors

This release is **backward-compatible** — no existing `.zen/spec.ts` needs
changes. The new vocabulary and the `denyPlaintextEnvSecrets` extension are
additive. To use the serverless rules, import the new enums and reference the
new resource types:

```ts
rule()
  .resource(AwsResource.LambdaFunction)
  .mustEqual(AwsAttribute.TracingMode, XrayMode.Active)
  .message('Lambda functions must enable X-Ray active tracing')

rule()
  .resource(AzureResource.LinuxFunctionApp)
  .mustHaveBlock(Block.Identity)
  .message('Azure Functions must use a managed identity')

rule()
  .resource(GcpResource.Cloudfunctions2Function)
  .denyValue(GcpAttribute.IngressSettings, IngressSetting.AllowAll)
  .message('Cloud Run Functions must not allow unrestricted ingress')
```

The `denyPlaintextEnvSecrets` extension may surface **previously-hidden
plaintext secrets** in Lambda / Azure Functions / Cloud Run Functions env-var
maps — these were silent could-not-evaluate findings before. Review any
newly-surfaced findings against your actual configs.

The GCP `labels` fix may cause **previously-could-not-evaluate `mustHaveTags`
findings to become definite violations** on GCP resources that use `labels`
instead of `tags`. This is intended (it was a false negative before).

## 0.1.3

### Added — new rule conditions

- **`denyPlaintextEnvSecrets`** — flags ECS task-definition environment
  variables with secret-like names (`PASSWORD`, `SECRET`, `KEY`, `TOKEN`,
  `CREDENTIAL`) whose value is a plaintext literal, not a reference. Catches
  the common AI-generated anti-pattern of hardcoding secrets in ECS env vars
  instead of using Secrets Manager / SSM Parameter Store references.
- **`requireSslOnlyPolicy`** — requires a `Deny` with
  `Condition Bool aws:SecureTransport=false` in the resource's policy.
  Implements CIS AWS S3 SSL-only bucket-policy control. Passes when no
  policy exists (no false positive on buckets without a policy).
- **`denyPublicPrincipal`** — flags `Principal: "*"` in an Allow statement
  (public access; CIS AWS). A `Deny` with `Principal: "*"` is fine.
- **AWS Config recorder settings** (CIS AWS §3.1 / §3.2) —
  `mustBeOneOf` on `aws_config_configuration_recorder.recording_mode.mode`
  and `mustHaveAssociated` on `aws_config_configuration_recorder` requiring
  a matching `aws_config_configuration_recorder_status` resource.

### Changed — engine

- **Lenient-mode `jsonencode(...)` parsing.** `parseHclString` and
  `parseHclValue` now accept a `lenient` parameter that keeps interpolated
  strings (`${var.x}`) as-is instead of returning `UNRESOLVED`. This lets
  `containersOf` partially evaluate mixed literal/reference ECS
  `container_definitions` — a config with both plaintext secrets and
  referenced secrets now yields definite verdicts for the plaintext ones,
  instead of degrading the whole document to could-not-evaluate.
- **`evalDenyPrivilegedContainers` improved.** A definite
  `privileged = true` violation is now flagged even in a mixed
  `container_definitions` config (previously, any interpolation suppressed
  the violation). An interpolated `privileged = "${var.x}"` is tracked via
  `privilegedUnresolved` and degrades to could-not-evaluate for that
  container, as before.
- **`denyIamWildcard` / `denyPublicPrincipal` / `requireSslOnlyPolicy`**
  now parse IAM / S3 bucket policies written as
  `jsonencode(...)` (not just literal-JSON heredocs). `Condition` blocks
  are parsed too. `jsonencode(var.x)` / variable policies still degrade to
  could-not-evaluate (no false violation).

### Migration notes for spec authors

This release is **backward-compatible** — no existing `.zen/spec.ts` needs
changes. The new conditions are additive. To use them:

```ts
rule().resource(AwsResource.EcsTaskDefinition).denyPlaintextEnvSecrets()
rule().resource(AwsResource.S3Bucket).requireSslOnlyPolicy()
rule().resource(AwsResource.S3BucketPolicy).denyPublicPrincipal()
```

The lenient-parser change may cause **previously-could-not-evaluate
findings to become definite violations** on configs that mix literal and
referenced ECS env vars. This is intended (it was a false negative before)
— review any newly-surfaced `denyPrivilegedContainers` or
`denyPlaintextEnvSecrets` findings against your actual configs.
