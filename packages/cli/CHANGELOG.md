# Changelog

All notable changes to `@dotzen/dotzen` are documented here. Versions follow
[semver](https://semver.org/). Notably, **new spec DSL vocabulary (new rule
conditions, resource types, or attributes) is treated as a feature release**,
not a patch — even when strictly backward-compatible, consumers should know
whether re-reading their spec is warranted.

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
