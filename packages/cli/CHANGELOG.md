# Changelog

All notable changes to `@dotzen/dotzen` are documented here. Versions follow
[semver](https://semver.org/). Notably, **new spec DSL vocabulary (new rule
conditions, resource types, or attributes) is treated as a feature release**,
not a patch — even when strictly backward-compatible, consumers should know
whether re-reading their spec is warranted.

## 1.9.5

Dogfood round 4 precision + coverage fixes. Running v1.9.4 against 4 fresh
module repos (RDS, Lambda, GCP network, Azure Key Vault) surfaced 0 false
positives on governed resources + one secret-variable precision gap.

### Fixed — `denyInsensitiveVariable` identifier-suffix precision

Extended the config-flag suffix list with identifier/config suffixes that
caused 216 false positives on the RDS module (4 unique variable names repeated
across 54 module instances): `_arn` (`domain_auth_secret_arn` — an ARN is a
reference, not a secret value), `_duration` (`master_user_password_rotation_
duration`), `_expression` (`..._rotation_schedule_expression`), `_key_id`
(`master_user_secret_kms_key_id` — a KMS key ID is not a secret). All are
metadata ABOUT secrets (rotation config, KMS key, ARN pointer), not the
secret values themselves.

### Added — vocabulary (coverage noise reduction)

Dogfood round 4 surfaced 402 ungoverned on the Lambda module (mostly data
sources + docker provider types). Added to reduce noise:

- `DataResource.AwsIamPolicy` (`data.aws_iam_policy`) + `AwsCloudwatchLogGroup`
  (`data.aws_cloudwatch_log_group`) — common read-only data sources.
- `AwsResource.LambdaFunctionRecursionConfig` (`aws_lambda_function_recursion
_config`) — Lambda config resource.
- `UTILITY_TYPES`: `aws_arn`, `external`, `docker_image`,
  `docker_registry_image` — utility types with no security surface (ARN
  parsing, external-provider queries, container builds). Lambda module:
  402 → 18 ungoverned.

### Dogfood round 4 summary

| Repo            | V   | P     | CNE | Ungov |
| --------------- | --- | ----- | --- | ----- |
| AWS RDS         | 32  | 7533  | 32  | 58    |
| AWS Lambda      | 63  | 12301 | 12  | 18    |
| GCP network     | 0   | 787   | 64  | 29    |
| Azure Key Vault | 0   | 44    | 5   | 6     |

All violations legitimate (tags, RDS encryption, inline-policy, provisioner).
GCP network + Azure Key Vault: **0 violations** (both clean). 0 false positives
on any repo.

### Migration notes

Backward-compatible. Consumers will see fewer `denyInsensitiveVariable`
violations (identifier-named variables) and less ungoverned noise (data
sources + utility types now covered).

## 1.9.4

Dogfood round 3 coverage fixes. Running v1.9.3 against 4 fresh module repos
(terraform-aws-modules/alb, terraform-aws-modules/eks,
Azure/terraform-azurerm-storage, terraform-google-modules/sql-db) surfaced
two coverage gaps. Zero false positives on any repo.

### Added — `aws_vpc_security_group_egress_rule` governance

The modern decomposed egress-rule resource (the egress counterpart of the
already-governed `aws_vpc_security_group_ingress_rule`) was ungoverned —
26x on the EKS module. It is now in `AwsResource` and mapped to the
cloud-neutral `egress` field (same field shape as the ingress rule:
`cidr_ipv4`/`cidr_ipv6`/`from_port`/`to_port`). The existing `denyEgress`
condition governs it unchanged, and the `inScope` special-case lets a
`denyEgress` rule on `aws_security_group` cover it.

### Fixed — utility-type noise on `data.cloudinit_config` + `local_file`

`data.cloudinit_config` (112x) and `local_file` (33x) were surfaced as
ungoverned on the EKS module. Both are utility types with no security surface
(cloud-init config generation; local file writing). Added to `UTILITY_TYPES`
for silent skipping (neither governed nor surfaced as a coverage gap). The
EKS module dropped from 318 → 147 ungoverned.

### Dogfood round 3 summary

| Repo          | V   | P    | CNE | Ungov |
| ------------- | --- | ---- | --- | ----- |
| AWS ALB       | 5   | 408  | 20  | 14    |
| AWS EKS       | 85  | 8053 | 107 | 147   |
| Azure storage | 0   | 54   | 5   | 1     |
| GCP Cloud SQL | 2   | 232  | 31  | 11    |

All violations legitimate (tags, inline-policy, secret-variables). All CNE
legitimate (module-following + unresolved variable-driven values). Zero false
positives. The Azure storage module — exercising the v1.8 niche rules
(infra-encryption, TLS, public access) — passed cleanly (0 violations).

### Added — vocabulary

- `AwsResource.VpcSecurityGroupEgressRule` (`aws_vpc_security_group_egress_rule`)

### Migration notes

Backward-compatible. The egress-rule resource is now governed (was a coverage
gap). Two utility types are silently skipped (were noise). No new violations.

## 1.9.3

### Fixed — `denyInsensitiveVariable` config-flag precision (dogfood round 2, Finding #3)

The rule over-fired on config-flag variables whose names contain a secret-like
word (PASSWORD/SECRET/KEY/TOKEN) but are actually configuration parameters —
not secret values. The AWS IAM module dogfood produced 129 false positives on
names like `max_password_age`, `create_access_key`, `password_reuse_prevention`.

**Three-pronged precision fix** (all skip only `denyInsensitiveVariable`, not
`denyPlaintextLocalSecret` — a hardcoded value in a secret-named local IS
suspicious regardless):

- **Type-based skip** (most principled): a variable whose `type` constraint is
  `bool` or `number` is definitionally not a secret (a secret is always a
  string). The variable's `type` is now threaded through `NormalizedBinding`.
  `string` / `list` / `map` / object-typed variables are still evaluated; a
  variable with no type declared is still flagged (conservative).
- **Verb-prefix skip**: `allow_*`, `create_*`, `attach_*`, `enable_*`,
  `disable_*` describe action/permission toggles, not secret values.
- **Extended config-flag suffix list**: added `_status`, `_policy`, `_arns`,
  `_permission`, `_age`, `_length`, `_required`, `_prevention` to the existing
  `_enabled`/`_disabled`/`_interval`/etc.

**Result:** the AWS IAM module dogfood dropped from 159 → 30 violations (0
secret-variable false positives remain; all 30 are legitimate inline-policy
findings — the module's core purpose is to create IAM roles with inline
policies).

### Added — vocabulary

- `NormalizedBinding.type` (the raw variable `type` constraint, for the
  type-based skip above).

### Migration notes

Backward-compatible. Consumers will see FEWER `denyInsensitiveVariable`
violations — specifically, bool/number-typed variables and verb-prefixed /
extended-suffix config flags are no longer flagged. A `string`-typed secret
variable (e.g. `db_password`) is still flagged exactly as before.

## 1.9.2

Dogfood round 2 fixes. Two issues surfaced running v1.9.1 against real module
repos (terraform-aws-modules/vpc, terraform-google-modules/kubernetes-engine,
Azure/terraform-azurerm-aks, terraform-aws-modules/iam).

### Fixed — `requireEncryptedBackend` false-positive storm on module repos

The rule previously fired a violation on EVERY `.tf` file with no `backend`
block — but module repos intentionally declare no backend (the backend is the
env/layer consumer's concern). This produced 40–63 false "State backend must
be encrypted" violations per module repo (the #1 noise source, an adoption
blocker).

**Changed:** `requireEncryptedBackend` now PASSES when no backend is declared
(absence = pass). It fires only when a backend IS declared but unencrypted
(including `local`, which has no encrypt concept). The "must declare a
backend" concern is `denyLocalBackend`'s job (opt-in, not in `coreSecurity`).
The two rules are now cleanly complementary.

### Added — `aws_security_group_rule` (legacy standalone SG rule) governance

The legacy `aws_security_group_rule` resource (which handles both ingress and
egress via `type = "ingress" | "egress"`) was ungoverned — surfaced as a
coverage gap on the AWS VPC module dogfood. It is now in `AwsResource` and
mapped to the cloud-neutral `ingress` field (filtering on `type = "ingress"`;
egress rules are skipped). The existing `denyIngress` condition governs it
unchanged, and the `inScope` special-case lets a `denyIngress` rule on
`aws_security_group` cover it (same as the modern `aws_vpc_security_group_
ingress_rule`).

### Migration notes

**Behavior change:** consumers composing `coreSecurity` will see FEWER
`requireEncryptedBackend` violations — specifically, the "no backend declared"
violations on module repos are gone (absence is now pass). Users who relied on
`requireEncryptedBackend` to enforce "must declare a backend" should compose
`denyLocalBackend` (which still flags absence/local). Declared-but-unencrypted
backends are still flagged exactly as before.

## 1.9.1

Two module-following resolver improvements (ROADMAP #8 + #9) that convert
could-not-evaluate findings to definite verdicts. Engine internals — no new
spec DSL vocabulary.

### Changed — engine resolution

- **`count = N` per-index expansion** — a resource with a literal `count = N`
  (N > 0) now expands into N instances (was: followed once). Each instance
  gets `count.index` threaded into its scope (resolves to the instance
  number) and `instanceKey = "<i>"`. A `count = var.n` that resolves to a
  literal expands too; an unresolvable count is still followed once honestly
  (`count.index` refs degrade to could-not-evaluate — never a false verdict).
  `count = 0` skip and `count = 1` single-instance behavior are unchanged.
- **`each.value.<field>` field access** — a `for_each` over a MAP of objects
  now resolves dotted field access on the element (`each.value.port`,
  `each.value.cidr`). A for_each over SCALARS has a non-object element, so
  field access degrades to unresolved (honest — a scalar has no fields).
  Compound interpolations like `name-${each.value.env}` resolve too (the
  `tryEvalConcat` helper was generalized to delegate inner resolution to
  `resolveValue`, which handles sole refs, `each.value.<field>`, and
  conservative ternaries).
- `SOLE_REF` now matches `count.index` (so `resolveRaw` handles it for
  association linking too, not just `resolveValue`).

### Migration notes

Backward-compatible. Resources using `count = N` (N > 1) or
`each.value.<field>` that previously produced could-not-evaluate findings
will now produce definite verdicts (pass or violation) where the indexed/
field value is statically resolvable. No new false positives — the
expansion only fires on resolvable literal counts, and unresolved counts/
fields degrade honestly as before.

## 1.9.0

Closes the optional GCP niche remainder (ROADMAP #6): three `cisGcp` rules +
new vocabulary. Reuses existing conditions (including the v1.7
`requireResource` for the audit-config presence check) — no engine change.

### Added — `cisGcp` preset rules (GCP niche, ROADMAP #6)

- **Cloud Audit Logs config presence** (`require-audit-config`) — a
  `google_project_iam_audit_config` must be declared so admin/data access is
  logged. Uses the v1.7 `requireResource` condition (project-level presence).
  `warn`.
- **GKE Shielded Nodes** (`gke-shielded-nodes`) — `google_container_cluster`
  must enable `shielded_nodes.enabled` (integrity verification at the node
  level, complementing per-instance shielded VMs). `mustBeTrue`, `warn`.
- **BigQuery dataset public access** (`bigquery-no-public-access`) — flags a
  `special_group = "allAuthenticatedUsers"` grant on the standalone
  `google_bigquery_dataset_access` resource OR the dataset's inline
  `access {}` block. Two `denyValue` conditions on one rule (each resource
  type trips only its own — the other attr is absent → pass). `block`.
  NOTE: the inline form catches the FIRST `access {}` block only (the
  flattener recurses into `v[0]`); a multi-block dataset where a later block
  is public is a known gap (needs the multi-block `collect` change).

### Added — vocabulary

- `GcpResource.ProjectIamAuditConfig` (`google_project_iam_audit_config`)
- `GcpAttribute.ShieldedNodesEnabled` (`shielded_nodes.enabled`)
- `GcpAttribute.SpecialGroup` (`special_group`) — standalone BigQuery access
- `GcpAttribute.AccessSpecialGroup` (`access.special_group`) — inline access

### Migration notes

Backward-compatible. Consumers composing `[...coreSecurity, ...cisGcp]` will
see new findings: a `warn` for projects with no audit config, a `warn` for GKE
clusters without shielded nodes, and a `block` for BigQuery datasets granting
`allAuthenticatedUsers`. The `cis-gcp-smoke` fixture's compliant GKE cluster
was updated to set `shielded_nodes { enabled = true }` and a compliant
`google_project_iam_audit_config` was added.

## 1.8.0

Closes the optional Azure niche remainder (ROADMAP #5): three `warn`-effect
`cisAzure` rules + two new `AzureAttribute` members. Reuses existing
conditions — no engine change.

### Added — `cisAzure` preset rules (Azure niche, ROADMAP #5)

- **Cosmos DB local auth** (`cosmos-no-local-auth`) — `azurerm_cosmosdb_account`
  must set `local_authentication_disabled = true` (Entra ID/AAD identity-based
  auth; local keys are a long-lived credential surface). `mustBeTrue`, `warn`.
- **App Service min-TLS** (`app-service-min-tls`) — `azurerm_linux_web_app` /
  `windows_web_app` / `linux_function_app` / `windows_function_app` must enforce
  `site_config.minimum_tls_version = "1.2"`. `mustBeOneOf`, `warn`. (Client-cert
  was deliberately skipped — it is not a universal control and would
  false-violate apps that do not use mTLS.)
- **Storage infrastructure encryption** (`storage-infrastructure-encryption`) —
  `azurerm_storage_account` must enable `infrastructure_encryption_enabled` (a
  second platform-managed encryption layer at rest). `mustBeTrue`, `warn`.

### Added — vocabulary

- `AzureAttribute.LocalAuthenticationDisabled` (`local_authentication_disabled`)
- `AzureAttribute.InfrastructureEncryptionEnabled` (`infrastructure_encryption_enabled`)

### Migration notes

Backward-compatible. Consumers composing `[...coreSecurity, ...cisAzure]` will
see new `warn`-effect findings on Cosmos accounts using key auth, App Services
on a weak TLS floor, and storage accounts without infrastructure encryption.
The `cis-azure-smoke` integration fixture's compliant storage account was
updated to set `infrastructure_encryption_enabled = true`.

## 1.7.0

A feature release: a new project-level condition, two engine resolution
improvements that convert could-not-evaluate findings to definite verdicts,
NACL ingress governance, and two C6 association/policy coverage gaps closed.

### Added — new condition

- **`requireResource(type)`** — the first condition that is NOT per-resource.
  It asserts that at least one resource of `type` exists anywhere in the
  scanned project (a project-level presence check). Canonical case: CIS AWS
  §2.4 "ensure IAM Access Analyzer is enabled" (`aws_accessanalyzer_analyzer`
  must be declared). Evaluated once in a PROJECT pass; violations carry a
  synthetic `<project>:0` location. Pair with `.allResources()`; the rule's
  `.environment()`/`.providerAlias()`/`.region()` filters are ignored for
  this condition. Combines freely with per-resource conditions on the same
  rule. The `cisAws` preset ships `require-access-analyzer` (`warn`).

### Added — engine: `data.aws_iam_policy_document` policy resolution

- The idiomatic Terraform pattern for composing an IAM policy — author
  `statement {}` blocks on a `data "aws_iam_policy_document" "x" {}` and
  wire it via `policy = data.aws_iam_policy_document.x.json` — is now
  resolved end-to-end. `policyFromStatements` parses the data-source form
  (`effect`/`actions`/`not_actions`/`principals { type, identifiers }`/
  `condition { test, variable, values }`) into the same `PolicyInfo` a
  literal-JSON/`jsonencode(...)` policy produces. A cross-file index
  (`buildDataPolicies`, scoped per directory — data sources are
  module-local) lets a consuming resource's data-source ref resolve at
  normalize time. `denyIamWildcard`, `denyPublicPrincipal`, and
  `requireSslOnlyPolicy` now fire on data-source-composed policies instead
  of degrading to could-not-evaluate.

### Added — engine: GCP interpolated IAM member resolution (ROADMAP #5)

- Two conservative changes eliminate the
  `member = "serviceAccount:${google_service_account.default.email}"`
  could-not-evaluate pattern (12 of 14 CNE on the GKE module dogfood):
  - **Resolver** (`tryEvalConcat`): `prefix${sole_ref}suffix` where the
    sole var/local/each ref resolves to a literal → concatenated literal.
    Multi-interpolation, compound inner exprs, and resource-attribute refs
    stay unresolved honestly.
  - **`denyValue` literal-prefix rule** (`denyValueExcludedByLiteral`): the
    change that actually eliminates the GKE CNE. A resource-attribute ref
    is not statically resolvable, but the resolved value always starts with
    `serviceAccount:` and so can never equal a bare denylist scalar like
    `allUsers`. `denyValue` now returns a definite PASS (not CNE) when an
    unresolved expr's single `${...}` block has literal prefix/suffix text
    that rules out every denylist scalar.

### Added — Network ACL (NACL) ingress governance

- The stateless subnet-level firewall is now governed by the EXISTING
  `denyIngress` condition — no new condition kind. The normalize layer
  maps three AWS NACL shapes into the cloud-neutral `ingress` field:
  standalone `aws_network_acl_rule`, inline `aws_network_acl` `ingress {}`
  blocks, and `aws_default_network_acl`. Only INGRESS + ALLOW rules are
  openings (literal `egress=true` and `rule_action`/`action="deny"` are
  skipped; absent/unresolved includes honestly). The `cisAws` preset ships
  `nacl-no-public-ssh-rdp` (`warn`) targeting both the standalone and
  inline forms.

### Added — `cisAws` preset rules

- **`require-access-analyzer`** — project-level presence (`requireResource`,
  `warn`). CIS AWS §2.4.
- **`nacl-no-public-ssh-rdp`** — NACL ingress (`denyIngress`, `warn`).
- **`no-public-secret-policy`** — `aws_secretsmanager_secret_policy` must
  not grant `Principal: "*"` (`denyPublicPrincipal`, `block`). The
  secret-store analog of the IAM-policy `Principal: "*"` rule.

### Changed — C6 literal-name association (gap closed)

- `mustHaveAssociated`/`denyIfAssociated` now link a child that references
  its parent by a LITERAL string matching the parent's Terraform label
  (e.g. `bucket = "data"` for `aws_s3_bucket.data`). `buildAssociations`
  indexes literal-string attrs into a `literalLinks` map; the evaluators
  query it as `literalLinks.get(parent.name)?.has(childType|viaAttr)`. The
  `childType|viaAttr` key prevents unrelated attrs/types from cross-linking.
  The status quo was a false violation on the parent; this was a
  documented C6 gap ("rare; documented in the evaluator").

### Migration notes

Backward-compatible at the DSL level (no existing condition/resource/enum
removed or renamed). Consumers composing `[...coreSecurity, ...cisAws]`
will see **new findings** on this version — expected for a feature release:

- **New `warn`/`block` findings** from the three new `cisAws` rules
  (Access Analyzer absence, NACL public SSH/RDP, public secret policy).
- **could-not-evaluate → definite verdict conversions** that may surface
  new violations on existing configs:
  - `data.aws_iam_policy_document`-composed policies now resolve — a
    wildcard/principal-`*` policy that previously CNE'd now violates.
  - `denyValue` compound interpolations with a literal prefix that rules
    out every denylist scalar now PASS (fewer CNE; no new violations).
- **Fewer false violations** from C6 literal-name linking (children
  referencing parents by literal label no longer false-violate
  `mustHaveAssociated`).

## 1.6.3

### Added — ECS container insights + tfRootDirs fix

**`coreSecurity` (1 new rule):**

- **ECS cluster container insights** — `aws_ecs_cluster` must have
  `setting { value = "enabled" }` for containerInsights (warn). Uses the
  existing `mustEqual` condition on the flattened `setting.value`
  attribute — no new engine condition needed.

**Fixed — `tfRootDirs` in `scaffold.ts`:**

- `dotzen init` no longer detects `modules/` subdirectories as separate
  Terraform roots. Same class of bug as the `findTfFiles` recursive scan
  fixed in v1.4.0. The `ignored()` filter now skips `modules` path
  segments. `env/` subdirectories still detected correctly.

### Added — vocabulary

- `AwsAttribute.EcsSettingName` (`setting.name`)
- `AwsAttribute.EcsSettingValue` (`setting.value`)

### Migration notes

Backward-compatible. Users composing `[...coreSecurity, ...cisAws]` will
see new `warn`-effect findings on ECS clusters without container insights
enabled. `dotzen init` on projects with `modules/` subdirectories no
longer creates spurious root entries in `dotzen.json`.

## 1.6.2

### Added — remaining ungoverned VPC types + WAFv2 on ALB (ROADMAP #5)

- **6 VPC-specific resource types** added to `AwsResource` (verified
  against provider docs): `aws_vpc_block_public_access_exclusion`,
  `aws_vpc_block_public_access_options`, `aws_vpc_dhcp_options`,
  `aws_vpc_dhcp_options_association`, `aws_vpn_gateway_attachment`,
  `aws_vpn_gateway_route_propagation`. Eliminates the remaining 6
  ungoverned entries from the AWS VPC module dogfood.

- **WAFv2 Web ACL on ALB** — new `cisAws` rule using
  `mustHaveAssociated(AwsResource.Wafv2WebAclAssociation,
AwsAttribute.ResourceArn)`. No new engine condition needed — the
  existing `resolvedRef` mechanism already handles ARN-based resource
  attribute references (`resource_arn = aws_lb.web.arn` resolves to
  `{type: 'aws_lb', name: 'web'}` via `refAtBottom`).

- New vocabulary: `AwsAttribute.ResourceArn` (`resource_arn`).

### Migration notes

Backward-compatible. Users composing `[...coreSecurity, ...cisAws]` will
see new `warn`-effect findings on ALBs without a WAFv2 Web ACL
association. The VPC types are recognized (not ungoverned) but not
governed by any rule — no new violations from them.

## 1.6.1

### Fixed — blind spots found in AI-generated code testing

Tested dotzen against 3 AI-style Terraform fixtures (deliberately including
common AI mistakes: missing encryption, hardcoded secrets, public resources,
inline IAM policies, missing tags, absent state encryption). Found and fixed
7 blind spots:

**`coreSecurity` (3 new rules + 2 broadened):**

- **`requireEncryptedBackend`** now in `coreSecurity` (was only in
  framework packs). Catches AI configs with no `terraform {}` block.
- **`denyLiteral` on RDS password** — `aws_db_instance.password` must be a
  reference, not a literal. Catches `password = "SuperSecret123!"`.
- **`denyIamWildcard` + `denyPublicPrincipal`** broadened to also target
  `aws_iam_role_policy` and `aws_iam_user_policy` (was only on
  `aws_iam_policy`). Catches wildcard inline policies that previously
  escaped the `denyIamWildcard` rule.

**`cisAzure` (1 new rule):**

- **NSG `denyIngress`** on `azurerm_network_security_group` — Azure NSG
  public SSH/RDP now caught by `cisAzure` (was only in `coreSecurity`
  for AWS `SecurityGroup`).

**`cisGcp` (1 new rule):**

- **Compute instance `denyBlockPresence`** on `access_config` — GCP
  compute instances with public IPs now caught by `cisGcp` (was only in
  the realistic-gcp fixture's local spec).

### AI-style test fixtures

3 new integration test fixtures created:

- `tests/integration/fixtures/ai-style-aws/` — 15 deliberate AI mistakes
- `tests/integration/fixtures/ai-style-azure/` — 15 deliberate AI mistakes
- `tests/integration/fixtures/ai-style-gcp/` — 15 deliberate AI mistakes

### Migration notes

Backward-compatible. Users composing `[...coreSecurity, ...cisAws/Azure/Gcp]`
will now see **new violations** on configs that previously passed silently:
unencrypted state backends, hardcoded RDS passwords, wildcard inline IAM
policies, Azure NSGs with public SSH, and GCP compute instances with public
IPs. Review these — they were real blind spots.

## 1.6.0

### Added — `denyIfAssociated` condition (new engine capability)

New cross-resource condition: `denyIfAssociated(childType, via)` — the
inverse of `mustHaveAssociated`. Flags a resource if a separate
`childType` resource references it via the `via` attribute.

```ts
rule()
  .resource(AwsResource.IamUser)
  .denyIfAssociated(AwsResource.IamUserPolicy, AwsAttribute.User)
  .onViolation(Effect.Warn)
  .message('IAM users must not have inline policies')
```

Reuses the existing association index built by `buildAssociations` — zero
performance cost. Degrades to `couldNotEvaluate` when the `via` attribute
is an unresolvable var/local ref (same honest-degrade behavior as
`mustHaveAssociated`).

### Added — IAM inline policy rules (coreSecurity)

2 new `coreSecurity` rules using `denyIfAssociated`:

- **IAM user no inline policies** — `aws_iam_user` must not have an
  associated `aws_iam_user_policy` (warn). Managed policies are the
  preferred pattern — they're auditable, reusable, and version-controlled.
- **IAM role no inline policies** — `aws_iam_role` must not have an
  associated `aws_iam_role_policy` (warn). Same rationale.

### Added — vocabulary

- `AwsResource.EcrLifecyclePolicy` (`aws_ecr_lifecycle_policy` — from v1.5.3)
- `AwsAttribute.Repository` (`repository` — ECR lifecycle policy links to
  the repository by name)
- `AwsAttribute.User` (`user` — IAM user policy links to the user by name)
- `AwsAttribute.Role` (`role` — IAM role policy links to the role by name)
- `AwsAttribute.Group` (`group` — IAM group policy links to the group by
  name, reserved for future use)

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes.
`denyIfAssociated` is a new condition type, additive to the DSL. Users
composing `[...coreSecurity, ...cisAws]` will see new `warn`-effect
findings on IAM users and roles with inline policies. Review the findings
— inline policies are a legitimate but discouraged pattern; migrate to
managed policies where possible.

## 1.5.3

### Added — batch 3 rules for expanded vocabulary (ROADMAP #6)

3 new preset rules:

**`coreSecurity` (1 new rule):**

- **RDS cluster encryption** — `aws_rds_cluster` must have
  `storage_encrypted = true` (block). Complements the existing RDS
  instance encryption rule — Aurora clusters use `aws_rds_cluster`, not
  `aws_db_instance`.

**`cisAws` (2 new rules):**

- **S3 bucket versioning** — `aws_s3_bucket` must have an associated
  `aws_s3_bucket_versioning` resource (warn). Protects against accidental
  deletes and ransomware.
- **ECR lifecycle policy** — `aws_ecr_repository` must have an associated
  `aws_ecr_lifecycle_policy` resource (warn). Prevents stale vulnerable
  images from accumulating.

### Added — vocabulary

- `AwsResource.EcrLifecyclePolicy` (`aws_ecr_lifecycle_policy`)
- `AwsAttribute.Repository` (`repository` — ECR lifecycle policy links to
  the repository by name)

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
rules are additive to the preset packs. Users composing
`[...coreSecurity, ...cisAws]` will see new `warn`-effect findings on S3
buckets without versioning and ECR repos without lifecycle policies, plus
`block` findings on unencrypted RDS clusters.

**Item 6 status:** all feasible rules shipped. Remaining items (IAM user
no inline policies, WAFv2 Web ACL on ALB, ECS container insights) need
new engine condition types — future work.

## 1.5.2

### Fixed — Azure deprecated-resource verification against Go source

Verified all 52 "deprecated but real" Azure enum values against the actual
azurerm provider Go `ResourcesMap` registration files:

- **16 exact match** — confirmed real, kept as-is.
- **10 renamed** — generic type replaced by specific subtypes. Removed the
  generic entry and added the real subtypes:
  - `azurerm_metric_alert` → `azurerm_monitor_metric_alert`
  - `azurerm_policy_assignment` → 4 scoped variants
  - `azurerm_policy_exemption` → 4 scoped variants
  - `azurerm_automation_variable` → `azurerm_automation_variable_string` +
    `azurerm_automation_variable_int` + `azurerm_automation_variable_bool`
  - `azurerm_traffic_manager_endpoint` → 4 endpoint types
  - `azurerm_sentinel_data_connector` → 2 specific data connector types
  - `azurerm_stream_analytics_function` → kept as specific subtypes exist
  - `azurerm_stream_analytics_output` → kept as specific subtypes exist
  - `azurerm_data_factory_*` → kept as specific subtypes exist
- **26 completely removed from provider** — dead enum values that can
  never match real HCL. Removed: `azurerm_mariadb_*` (Azure retired MariaDB),
  `azurerm_mysql_server` (deprecated single-server, replaced by
  `azurerm_mysql_flexible_server`), `azurerm_monitor_log_profile` (API
  changed), `azurerm_key_vault_managed_hsm` + roles (removed from
  provider), `azurerm_hdinsight_ml_services/rserver/storm` (unmaintained
  HDInsight variants), and others.

Net: Azure enum 318 → 302 members, 100% verified against Go source.

**Preset fix:** `cis-azure.ts` `MysqlServer` → `MysqlFlexibleServer`
(the deprecated `azurerm_mysql_server` was removed from the provider;
`azurerm_mysql_flexible_server` is the current resource).

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. If a spec
referenced `AzureResource.MysqlServer`, it would have been a compile error
(the enum member was removed). The preset packs have been updated to
reference `MysqlFlexibleServer` instead. Users who had custom rules on
`azurerm_mysql_server` should update to `azurerm_mysql_flexible_server`.

## 1.5.1

### Added — batch 2 rules for expanded vocabulary (ROADMAP #6)

4 new preset rules governing previously-ungoverned resource types:

**`coreSecurity` (2 new rules):**

- **DynamoDB encryption at rest** — `aws_dynamodb_table` must have
  `server_side_encryption { enabled = true }` (block). Uses existing
  `AwsAttribute.ServerSideEncryptionEnabled`.
- **DynamoDB point-in-time recovery** — `aws_dynamodb_table` must have
  `point_in_time_recovery { enabled = true }` (warn). Uses existing
  `AwsAttribute.PointInTimeRecoveryEnabled`.

**`cisAws` (2 new rules):**

- **S3 access logging** — `aws_s3_bucket` must have an associated
  `aws_s3_bucket_logging` resource (warn). Uses `mustHaveAssociated`
  via the `bucket` attribute.
- **ALB access logging** — `aws_lb` must have `access_logs.enabled = true`
  (warn). Uses existing `AwsAttribute.AccessLogsEnabled`.

### Migration notes

Backward-compatible — no existing `.zen/spec.ts` needs changes. The new
rules are additive to the preset packs. Users composing
`[...coreSecurity, ...cisAws]` will see new `warn`-effect findings on S3
buckets without logging, ALBs without access logs, and DynamoDB tables
without encryption/PITR. Review the new findings — they were silent passes
before.

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
