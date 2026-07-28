# Roadmap — resource/check backlog

Prospective governance checks for dotzen's AWS vocabulary, from the
EKS / ECS / Route 53 / ALB-NLB / ACM / Secrets Manager review. This is a
**backlog to pull from**, not committed design (that lives in
`docs/specs/*`). Each item is tagged:

- **Priority**: High / Med / Low (AI-gen frequency × security impact).
- **Fit**: _fits today_ (enum-add reusing an existing condition) or
  _needs Cn_ (a cross-cutting capability below).

Definition of Done for any item (per `docs/specs/07-development-workflow.md`):
written test-first, violating **and** passing fixtures, all gate subagents
green.

---

## Post-publish dogfooding findings (real module repos)

Running v0.0.x on real AWS module repos surfaced these, in priority order:

- ✅ **DONE (v0.0.2)** `npx`-scaffolded specs couldn't resolve the
  `@dotzen/dotzen` import — engine now aliases it to itself (spec loader).
- ✅ **DONE (v0.0.3)** Tag resolution through `var`/`local` refs and
  `merge(<literal>, var.tags)` — the ubiquitous module tag pattern. Reads
  the literal keys as a *partial* set (pass when required ⊆ literal;
  could-not-evaluate otherwise; never a false violation).
- ✅ **DONE (v0.1.2)** Full `merge()` tag resolution — parses `merge()`'s
  top-level args, so a caller-threaded **concrete** `var.tags` map makes the
  set *complete* and a genuinely-missing required tag becomes a real
  **violation** (not could-not-evaluate). Refs inside object *values* are no
  longer mistaken for map args; opaque/unresolvable args still degrade
  honestly. Surfaced by an env-layer simulation of the real module pattern.
- ✅ **DONE (v0.1.0, Tranche 1) — Module-following** (doc 08). Local
  `module {}` calls are followed: each call's inputs thread into the
  module's `var.*`, so caller-supplied cidrs/tags become concrete verdicts,
  traced as `env/prd › modules/rds/main.tf`. Also fixed: `cidr_blocks =
  var.list` (whole-list ref) now resolves (and honestly degrades instead of
  a silent pass).
- ✅ **DONE (v0.3.0, Tranche 2) — Module-following hardening** (doc 08). (a) Per-instantiation trace labels: each
  followed call's findings carry `(module-label)` — `env/prd ›
  modules/rds/main.tf (db_bad)` — so two calls of one module are
  distinguishable. (b) `count = 0` (literal, or a var that resolves to it)
  disables the module and it is skipped silently (correct, no resources to
  evaluate); an unresolvable `count` is followed once (honest, no key
  expansion). (c) Doc 08 DoD: non-followed modules (remote/registry/git
  source, source that escapes the scanned project, missing module dir) are
  recorded and surfaced as `couldNotEvaluate` under the stable ruleId
  `dotzen.module-following` — never a silent `0 checks`.
- ✅ **DONE (v0.3.0, Tranche 5) — Nested modules + module `for_each`** (doc 08).
  (a) `followModules` is now recursive: a followed module's own `module {}`
  calls are followed too, bounded by a path-stack of resolved absolute dirs
  — a cycle (module → module → itself, mutually or self-referential) is
  recorded as a `could-not-evaluate` skip rather than recursing forever.
  The trace accumulates the full call chain: `env/prd › modules/outer/main.tf
  (db) › modules/inner/main.tf (inner_db)` so a finding on a deep module
  names every hop. (b) Module `for_each` over a resolvable literal map or
  var-resolved list is expanded per element: one module instance per key,
  `each.value`/`each.key` threaded into the module scope (the `SOLE_REF`
  regex in `normalize.ts` now accepts `each.value`/`each.key`, so
  `resolveValue` follows them). The trace carries the per-key suffix
  `(db[bad])` / `(db[good])`. An unresolvable `for_each` (`toset(...)`,
  `var.x` no default) is followed once honestly — `each.*` inside degrades
  to `could-not-evaluate` via the engine, no false expansion. An empty
  resolved collection (`toset([])`) skips silently (like `count = 0`).
  Per-instance isolation preserved at every depth: each call's scope and
  trace label are independent.
  **Remaining (harder, lower-frequency):** caller inputs that are
  themselves unresolved compound expressions beyond sole refs; `count`
  per-index expansion; more than the current sole-ref `each.*` substitution
  inside module resources (e.g. `each.value.field` on objects — currently
  left unresolved).
- ✅ **DONE (v0.1.3)** `mustHaveAssociated` through `local`/`var` indirection.
  Real modules route the parent ref through a local
  (`bucket = local.bucket_id`, where `local.bucket_id = aws_s3_bucket.main.id`).
  `resolveValue` already follows the chain — the bottom expr IS the resource
  ref — so the resolvable case already linked correctly. The actual gap was
  the **unresolvable** chain (`bucket = var.bucket_id` with no default and no
  module-caller input): the index keyed on `var.bucket_id` and never matched,
  producing a false violation on well-built modules. Fix: normalize now
  surfaces an explicit `resolvedRef` on the `unresolved` NormalizedValue
  (structured data, so the engine does not inspect var/local prefix
  conventions), and `buildAssociations` records unresolvable sole
  `${var.x}`/`${local.y}` exprs in a second index so
  `evalMustHaveAssociated` degrades to **couldNotEvaluate** instead of a
  false violation — the formal "omitted" outcome, matching `evalMustHaveTags`
  / `evalMustEqual`. Direct refs and resolvable chains still link via the
  same `resolvedRef` signal. The "companion resource that points at its
  parent by a literal name" gap remains (rare, documented).
- ✅ **DONE** Open tag taxonomy — `mustHaveTags` accepts `(Tag | (string &
  {}))[]`, so org-specific tag keys work via a consumer's own enum (e.g.
  `enum OrgTag { ApmId = 'apm_id', CmdbAppId = 'cmdb_app_id' }`), keeping
  typo-safety without forcing a closed taxonomy. The `env-layer` integration
  fixture exercises a custom `OrgTag` enum with a missing-tag violation.
- ✅ **DONE (v0.1.3)** `jsonencode(...)` policy parsing — the top remaining IAM
  could-not-evaluate. Most real Terraform uses `jsonencode`, not literal JSON,
  for IAM policies and ECS `container_definitions`. The parser now extracts
  the HCL object/array literal inside `jsonencode(...)`: a recursive-descent
  parser (`parseHclValue`) handles nested objects, arrays, quoted strings
  (with escapes), booleans, numbers, and `null`; any interpolated value
  (`${var.x}` inside a string) or non-literal inner (`jsonencode(var.policy)`)
  degrades to `unresolved` → could-not-evaluate (consistent with the
  literal-JSON path). `Condition` blocks are now parsed too (keyed by
  operator then key, with string-list values), unblocking the [Low] S3
  SSL-only `aws:SecureTransport` check as a future condition. ECS
  `container_definitions = jsonencode([...])` is also parsed. Reuses
  `kind: 'parsed'` — zero engine changes except updated couldNotEvaluate
  reason strings.

---

## Cross-cutting capabilities (build these — they unlock multiple checks)

- ✅ **C1 — `denyValue(attr, values)`** (value-in-set) — DONE. (Kept
  `denyAcl` as-is rather than refactoring it onto `denyValue`; a
  `mustBeOneOf` allowlist variant remains a future option.)
- ✅ **C2 — `denyLiteral(attr)`** (literal-vs-reference) — DONE. A literal
  value is the violation; an unresolved `var`/`data` reference passes.
- ✅ **C3 — list-valued attributes + `listContains` / `listMustInclude`**
  — DONE. `normalize` now extracts arrays-of-scalars (nested → dotted key)
  into a `lists` map.
- ✅ **C4 — embedded-JSON inspection** — DONE for ECS `container_definitions`
  (reuses the IAM literal-JSON parser). Parsing the object argument of
  `jsonencode(...)` is still open (both IAM and ECS degrade to
  could-not-evaluate on it).
- ✅ **C5 — nested `default_action` inspection** — DONE (captured as the
  dotted attribute `default_action.type`; used by `denyPlaintextListener`).
- ✅ **C6 — cross-resource + same-resource presence** — DONE. Two
  conditions: `mustHaveAssociated(childType, via)` (a separate resource of
  `childType` must reference this one via `via` — association is by
  resource reference, built into an index once per run) and
  `mustHaveBlock(block)` (this resource must declare a given nested block,
  detected via the flattened dotted keys).

---

## Per-service checks

### ECS — worth building
- ✅ **DONE** `aws_ecs_service` → `network_configuration.assign_public_ip = true`
  → `denyWhenTrue` on the nested boolean. Public-IP Fargate tasks.
- ✅ **DONE** `aws_ecs_task_definition` → `container_definitions` privileged
  containers (`privileged = true`) via `denyPrivilegedContainers`. Plaintext
  env secrets still open.

### EKS — high value, mostly gated on C3
- ✅ **DONE** `aws_eks_cluster` → `vpc_config.endpoint_public_access` must be
  false → `mustBeFalse` (a new condition — `endpoint_public_access` defaults
  to *true*, so absent must violate; `denyWhenTrue` would silently pass it).
- ✅ **DONE** `vpc_config.public_access_cidrs` contains `0.0.0.0/0` via
  `listContains`.
- ✅ **DONE** `enabled_cluster_log_types` includes `audit`/`api` via
  `listMustInclude`.
- ✅ **DONE** `encryption_config` present (secrets envelope encryption) via
  `mustHaveBlock` (C6, same-resource block presence).

### ALB / NLB (`aws_lb`, `aws_lb_listener`) — worth building
- ✅ **DONE** `aws_lb` → `access_logs.enabled = true` → `mustBeTrue`
  (nested boolean).
- ✅ **DONE** `aws_lb` → `drop_invalid_header_fields = true` → `mustBeTrue`.
- ✅ **DONE** `aws_lb_listener` → weak `ssl_policy` (TLS 1.0/1.1) via
  `denyValue`.
- ✅ **DONE** `aws_lb_listener` → plaintext `protocol` via
  `denyPlaintextListener`, exempting HTTP→HTTPS redirect listeners
  (`default_action.type = "redirect"`).

### Secrets Manager — one high-value flagship
- ✅ **DONE** hardcoded-secret detection via `denyLiteral` across
  `aws_secretsmanager_secret_version.secret_string`,
  `aws_db_instance.password`, `aws_rds_cluster`/`aws_redshift_cluster`
  `master_password`, and `aws_elasticache_replication_group.auth_token`.
  Complements gitleaks/CI secret scanning as defense-in-depth (structural,
  precise, resource-aware). General "any secret anywhere" scanning stays
  out of scope (that's gitleaks' job — doc 01).
- ✅ **DONE** `aws_secretsmanager_secret` → rotation enabled (the separate
  `aws_secretsmanager_secret_rotation` resource must reference it) via
  `mustHaveAssociated` (C6, `warn`).
- **[Low][needs C4]** secret resource-policy wildcard (reuse IAM parsing).

### Logging / audit (CIS AWS §3) + IAM baseline (§1) — Tier A, DONE
- ✅ **DONE** `aws_cloudtrail` → `is_multi_region_trail` +
  `enable_log_file_validation` (`mustBeTrue`) and KMS encryption
  (`kms_key_id` present, via the new `mustBeSet`). CIS §3.1/3.2/3.7.
- ✅ **DONE** `aws_iam_account_password_policy` → length >= 14 +
  reuse-prevention >= 24 (`mustBeAtLeast`), full complexity (`mustBeTrue`),
  and `max_password_age <= 90` (`mustBeAtMost`).
  CIS §1.8/1.9/1.11.
- ✅ **DONE** IAM over-permission depth: `denyIamWildcard` now also flags
  `NotAction` on `Allow` (over-broad grant) and sharpens the message for
  `Action:"*"` + `Resource:"*"`. Flagging `Resource:"*"` *alone* was
  deliberately NOT added — it is legitimate in most Allow statements, so it
  would be false-positive-prone.
- ✅ **DONE (v0.1.3)** AWS Config recorder settings — `aws_config_configuration_recorder`
  with `mustBeTrue` on `recording_group.all_supported` (CIS §3.1) and
  `recording_group.include_global_resource_types` (CIS §3.2). Reuses existing
  conditions with new vocabulary; no engine changes. IAM Access Analyzer
  vocabulary (`aws_accessanalyzer_analyzer`) added but the useful check is
  "does an analyzer exist?" — a project-level presence check the engine
  doesn't yet support (future `requireResource` condition).
- ✅ **DONE (v0.1.3)** S3 SSL-only bucket policy (`aws:SecureTransport`) —
  the new `requireSslOnlyPolicy` condition inspects the now-parsed
  `Condition` blocks for a `Deny` with `Bool["aws:SecureTransport"]`
  including `"false"` (case-insensitive). Passes when no policy exists
  (combine with `mustHaveAssociated` to require a policy); unresolved
  policies degrade to could-not-evaluate. CIS AWS.

### VPC / networking
- ✅ **DONE** `aws_vpc` → flow logging enabled (a separate `aws_flow_log`
  must reference it via `vpc_id`) via `mustHaveAssociated` (C6, `warn`).
- ✅ **DONE** `aws_subnet` → `map_public_ip_on_launch` (`block`) and
  `assign_ipv6_address_on_creation` (`warn`) via `denyWhenTrue`.
- **[Med][new parse shape]** Network ACL rules (`aws_network_acl_rule`) —
  the stateless subnet-level firewall. Different shape from SG ingress
  (`rule_number`, `egress`, `rule_action`), so a new normalize path +
  evaluator, not a reuse. Lower AI-gen frequency than SGs — pull only for
  a customer who actually writes NACLs.
- **Skip — needs a graph layer** public-vs-private subnet checks ("no DB in
  a public subnet"). Requires a multi-hop join
  (`subnet → route_table_association → route → internet gateway`), which
  the per-resource + single-hop (C6) engine deliberately does not do.
  A genuine v2 architectural decision, not a rule.

---

## Multi-cloud (Terraform/HCL, so the whole pipeline is reused)

The engine is provider-neutral. Adding a cloud is per-provider **vocabulary
+ rules**, plus a small `normalize` mapper only for structures that don't
already flatten generically (network rules, mainly). Decision (recorded in
doc 02): each provider gets its own vocabulary module (`AzureResource` /
`GcpResource` and their `*Attribute` companions) behind shared
`AnyResource`/`AnyAttribute` unions — not one giant enum.

### Azure (azurerm) — initial CIS slice, DONE
- ✅ NSG SSH/RDP inbound from internet — `denyIngress`, via an Azure NSG →
  ingress `normalize` mapper (`*`/`Internet` → `0.0.0.0/0`; inline
  `security_rule` + standalone `azurerm_network_security_rule`).
- ✅ Storage: public blob (`allow_nested_items_to_be_public`, `mustBeFalse`),
  `min_tls_version` = TLS1_2 (`mustEqual`), public network access
  (`denyWhenTrue`, warn).
- ✅ MSSQL: hardcoded `administrator_login_password` (`denyLiteral`), weak
  `minimum_tls_version` (`denyValue`), public network access (warn).
- ✅ Key Vault `purge_protection_enabled` (`mustBeTrue`); AKS
  `private_cluster_enabled` + `local_account_disabled` (warn); ownership
  tags (`mustHaveTags`).
- ✅ **CIS-L1 tranche 1:** App Service `https_only`; PostgreSQL/MySQL
  single-server `ssl_enforcement_enabled` + `public_network_access_enabled`;
  Container Registry `admin_enabled`; Cosmos DB `public_network_access_enabled`.
- ✅ **CIS-L1 tranche 2:** RBAC over-permission — `role_definition`
  `permissions.actions` contains `*` (`listContains`, the analog of AWS
  `Action:"*"`) and `role_assignment` Owner (`denyValue`, warn). Needed
  **no new parse shape** — the `permissions` block flattens to a list.
- ✅ **CIS-L1 breadth:** storage + Key Vault `network(_rules|_acls).default_action`
  = Deny (`mustEqual`, warn); managed-disk `disk_encryption_set_id` CMK
  (`mustBeSet`, warn); Key Vault diagnostic-logging presence
  (`mustHaveAssociated` on `azurerm_monitor_diagnostic_setting`, warn).
- **Azure ~ CIS L1 reached.** Optional niche remainder: storage
  infrastructure-encryption, App Service min-TLS/client-cert, Cosmos local-auth.

### GCP (google) — initial CIS slice, DONE
- ✅ `google_compute_firewall` SSH/RDP from `0.0.0.0/0` — `denyIngress`, via
  a GCP firewall → ingress `normalize` mapper (INGRESS-only; `allow` blocks
  over `source_ranges`; empty `ports` = all ports).
- ✅ `google_storage_bucket`: `public_access_prevention` = enforced
  (`mustEqual`), `uniform_bucket_level_access` (`mustBeTrue`).
- ✅ Public-IAM anti-pattern: `google_storage_bucket_iam_member` /
  `google_project_iam_member` — `allUsers`/`allAuthenticatedUsers` members
  and primitive `roles/owner` (block) / `roles/editor` (warn) via
  `denyValue`. This is the concept-not-parity analog of AWS `Action:"*"`.
- ✅ `google_compute_instance` broad `cloud-platform` scope (`listContains`,
  warn); Cloud SQL hardcoded `root_password` (`denyLiteral`) + public IPv4
  (`mustBeFalse` on the *deep-nested* `settings.ip_configuration.ipv4_enabled`
  — confirms the flattener recurses past one level).
- ✅ **CIS-L1 tranche 1:** GKE `enable_legacy_abac` (block) +
  `private_cluster_config.enable_private_nodes` + `network_policy.enabled`
  (warn); instance `can_ip_forward` (block) + Shielded-VM
  `shielded_instance_config.enable_secure_boot` (warn); Cloud SQL `ssl_mode`
  (via the new `mustBeOneOf` allowlist condition, warn); KMS
  `rotation_period` (`mustBeSet`).
- ✅ **CIS-L1 tranche 2:** instance no-public-IP — `access_config` present
  via the new `denyBlockPresence` + normalize block-path tracking (catches
  even an empty `access_config {}`).
- ✅ **CIS-L1 breadth:** subnetwork VPC flow logs (`mustHaveBlock(log_config)`,
  warn); bucket versioning (`mustBeTrue`, warn) + access logging
  (`mustHaveBlock(logging)`, warn).
- **GCP ~ CIS L1 reached.** Optional niche remainder: Cloud Audit Logs
  config (`google_project_iam_audit_config`); BigQuery dataset public access
  (needs multi-`access`-block handling); GKE shielded nodes / workload identity.

### API Gateway (beyond CIS L1 — Well-Architected security)
Not part of any cloud's CIS Foundations L1, added as demand-driven breadth.
- ✅ **AWS** `aws_api_gateway_method` `authorization` != `NONE` (`denyValue`,
  warn — CORS `OPTIONS` is the known exception); `aws_api_gateway_stage` /
  `aws_apigatewayv2_stage` access logging (`mustHaveBlock(access_log_settings)`,
  warn); stage `xray_tracing_enabled` (`mustBeTrue`, warn).
- ✅ **Azure** `azurerm_api_management` legacy protocol toggles
  (`security.enable_frontend_tls10/tls11`, `enable_backend_ssl30` via
  `denyWhenTrue`, block) + `public_network_access_enabled` (warn).
- **Skip — GCP.** `google_api_gateway_*` puts auth/security in the OpenAPI
  `api_config` document, not in statically-inspectable HCL attributes — so
  there's little to check without parsing an embedded spec. Apigee is heavy
  and rarely AI-generated. Revisit only if a customer needs it.

### Certificate Manager (ACM) — deprioritized (low value)
Thin governance surface; ACM-managed certs auto-renew. Only minor,
compliance-flavored candidates: `validation_method = "DNS"`, certificate
transparency logging enabled, key-algorithm strength. **Skip** unless a
specific compliance requirement demands it.

### Route 53 — deprioritized (low value)
No common "AI writes dangerous Route 53" pattern. Only minor items:
DNSSEC enabled, query logging. **Skip** unless a compliance need arises.

### Serverless functions (v0.2.0) — DONE
First cross-cloud serverless tranche: AWS Lambda, Azure Functions, GCP
Cloud Run Functions. All reuse existing conditions (no new condition kinds);
the engine work was extending `denyPlaintextEnvSecrets` to serverless
env-var **maps** (not just ECS `container_definitions` JSON) and fixing GCP
`labels` tag extraction.
- ✅ **AWS Lambda** (`aws_lambda_function`) — X-Ray active tracing
  (`mustEqual` on `tracing_config.mode`, warn), env-var KMS encryption
  (`mustBeSet` on `kms_key_arn`, warn), plaintext env-var secrets
  (`denyPlaintextEnvSecrets`).
- ✅ **Azure Functions** (`azurerm_linux_function_app` /
  `azurerm_windows_function_app` / `azurerm_function_app`) — HTTPS-only
  (`mustBeTrue`), TLS 1.2 floor (`mustEqual` on
  `site_config.minimum_tls_version`, warn), public network access
  (`denyWhenTrue`, warn), managed identity (`mustHaveBlock(Identity)`,
  warn — present = use AAD, not a shared/local credential), plaintext
  `app_settings` secrets (`denyPlaintextEnvSecrets`), diagnostic logging
  (`mustHaveAssociated` on `azurerm_monitor_diagnostic_setting`, warn).
- ✅ **GCP Cloud Run Functions** (`google_cloudfunctions2_function`) —
  unrestricted ingress (`denyValue` on `ALLOW_ALL`), runtime service
  account (`mustBeSet` on `service_config.service_account_email`, warn),
  plaintext env-var secrets (`denyPlaintextEnvSecrets`).
- ✅ **Shared ownership tags** across all serverless resource types
  (`mustHaveTags`).
- ✅ **Engine: `denyPlaintextEnvSecrets` extended to env-var maps.** New
  `EnvVarsInfo` model + `envVarsOf` extractor handles
  `environment.variables` (Lambda), `app_settings` (Azure Functions),
  `service_config.environment_variables` (Cloud Run Functions). A
  whole-map reference (`= var.x`) degrades to could-not-evaluate; a mixed
  literal/reference map yields definite verdicts for the literal secrets.
- ✅ **Engine: GCP `labels` tag extraction.** `tagsOf` / `environmentOf`
  now read `labels` for `google_*` resources (was `tags`-only — a false
  could-not-evaluate on GCP resources that use `labels`).

---

## Suggested sequencing

1. ✅ **DONE — cheap wins** — ECS `assign_public_ip`, EKS
   `endpoint_public_access` (via the new `mustBeFalse`), ALB
   `access_logs.enabled` + `drop_invalid_header_fields`.
2. ✅ **DONE — C3** list attributes → EKS public CIDRs + control-plane logging.
3. ✅ **DONE — C1** `denyValue` → ALB weak TLS policy.
4. ✅ **DONE — C5** `default_action` → ALB HTTP→HTTPS listener check.
5. ✅ **DONE — C4** embedded-JSON → ECS `container_definitions` (privileged).
6. ✅ **DONE — C2** `denyLiteral` → Secrets Manager `secret_string` + DB
   passwords.

**All planned capabilities (C1–C6) are built.**

Post-roadmap additions (done): EC2 `root_block_device.encrypted` +
`associate_public_ip_address`; S3 bucket-policy `Action: "*"` (reuses the
IAM parser on `aws_s3_bucket` / `aws_s3_bucket_policy`); **C6 cross-resource
presence** → S3 server-side encryption (`block`) + versioning (`warn`), EKS
`encryption_config`, Secrets Manager rotation (`warn`).

Tier A (CIS logging/audit + IAM baseline) is built: CloudTrail hardening,
IAM password policy, IAM `NotAction`/full-admin depth, plus the `mustBeSet`
capability. AWS now reads as credibly CIS-aligned; **multi-cloud (Azure/GCP)
is the natural next move** — both are Terraform/HCL, so the whole pipeline
(hcl2json → normalize → conditions → report) carries over and expansion is
almost pure vocabulary + rules.

Still open (secondary): IAM Access Analyzer presence (needs a project-level
`requireResource` condition);
`data.aws_iam_policy_document`;
ACM / Route 53 (deprioritized). Note on C6: association is by *resource reference*
(`bucket = aws_s3_bucket.x.id`), the idiomatic wiring — and a `var`/`local`
chain that bottoms out at a resource ref is followed (via `resolvedRef`).
A companion resource that points at its parent by a literal name is not
linked (rare; documented in the evaluator). An *unresolvable* chain
(`var.x` with no default and no module input) degrades to
could-not-evaluate rather than a false violation.

---

## 1.0.0 — engine feature-complete + product surface

### Terraform structure coverage (DONE)

- ✅ **Provider `default_tags`/`default_labels` inheritance** — a provider's
  default tags merge into every resource's tag set; threaded through module
  following (nested modules inherit the root's defaults). Fixes a false
  violation on tagless resources whose tags come from the provider.
- ✅ **Resource `count = 0` / `for_each`-empty skip** — disabled resources
  are skipped silently (no false violation). Unresolvable `count`/`for_each`
  followed once (honest).
- ✅ **Resource `for_each` per-element expansion** — a resolvable `for_each`
  expands into one `NormalizedResource` per element, with `each.*` threaded
  into a per-instance scope. Violations show `type.name[key]`.
- ✅ **`dynamic` blocks beyond ingress/egress** — a `dynamic "settings" {}`
  on any block (except ingress/egress/tags) is expanded into `<name>.*`
  attributes. `mustHaveBlock`/`denyBlockPresence` see the block.
- ✅ **Data sources as governed resources** — `data "aws_ami" "x" {}`
  normalized with type `data.aws_ami`; existing conditions apply.
- ✅ **Provider alias scoping + module `providers` map remapping** —
  `.providerAlias(X)` scopes a rule to a provider alias; a module call's
  `providers = { aws = aws.dr }` remaps the child's default to the parent
  alias.
- ✅ **Conservative ternary evaluation** — `${ref (==|!=) scalar ? scalar
  : scalar}` resolves to a literal; anything compound stays unresolved.
- ✅ **Meta-arg filtering** — `count`/`for_each`/`depends_on`/`provider`
  excluded from attribute harvesting; `lifecycle` kept as nested block.

### New rule conditions (DONE — 20+)

- Resource: `denyProvisioner`, `denyIgnoreChanges`,
  `denyPlaintextConnectionSecret`, provider-alias scoping.
- Output: `denyInsensitiveSecretOutput` (multi-segment data-source attrs).
- Binding: `denyInsensitiveVariable`, `denyPlaintextLocalSecret`.
- Settings: `requireExactTerraformVersion`, `denyFloatingProviderVersion`,
  `requireEncryptedBackend`, `denyLocalBackend`.
- Module-call: `denyFloatingModuleVersion`.
- Lifecycle: `mustBeTrue`/`denyWhenTrue` on `lifecycle.prevent_destroy` /
  `create_before_destroy` (via `LifecycleAttribute` enum — no new condition).

### New vocabulary (DONE)

- `Provisioner { LocalExec, RemoteExec, File }`
- `LifecycleAttribute { PreventDestroy, CreateBeforeDestroy, IgnoreChanges }`
- `DataResource { AwsAmi }`, `DataAttribute { AmiOwners }`
- `AwsAttribute.AtRestEncryptionEnabled`, `TransitEncryptionEnabled`

### Product surface (DONE)

- ✅ **Inline ignore directives** (`# dotzen:ignore[: reason]`) — suppress
  findings on a block; anchored regex (no false match on string values).
- ✅ **Frozen JSON schema** (`schemaVersion: 1`) — top-level + per-entry
  fields pinned by a schema-stability test.
- ✅ **Curated CIS presets** — `cisAws` (23 rules), `cisAzure` (17),
  `cisGcp` (21). Each proven end-to-end on real Terraform fixtures.
- ✅ **CI integration templates** — GitHub Actions + GitLab CI YAML.
- ✅ **Performance verified** — ~195ms for 1200 resources.
- ✅ **Scaffold updated** — shows presets, new conditions, ignore directives.

**The engine is feature-complete for static Terraform governance across
AWS, Azure, and GCP.** 492 unit + 34 integration tests. Build, typecheck,
lint, format all green.

### Vocabulary breadth — DONE

Running dotzen against a **realistic RDS fixture** (variables, locals,
ternaries, supporting resources) revealed that 50% of a real deployment's
resources are NOT in the vocabulary — `aws_iam_role`,
`aws_iam_role_policy_attachment`, `aws_cloudwatch_metric_alarm`,
`aws_db_subnet_group`, `aws_db_parameter_group`, `aws_ssm_parameter`. The
ungoverned telemetry surfaces these correctly, but the coverage gap is
real. The first batch (7 types) was added and cut ungoverned from 8 → 1
on the fixture.

**DONE:**

1. ✅ **DONE — Add the full AWS supporting-resource vocabulary** —
   `AwsResource` grew from 57 → 521 members across VPC/network, IAM,
   storage, compute, monitoring, Route53/ACM, EKS/ECS, RDS variants,
   EFS/FSx, KMS/Secrets/SSM, CloudTrail/Config, SQS/SNS/Kinesis,
   EventBridge, ALB/NLB, Lambda, Elastic Beanstalk/AppRunner/Lightsail,
   Glue/Athena/EMR/Step Functions, CloudFront/WAF/Shield/GAX, DynamoDB/
   ElastiCache/MQ/MSK, VPC Lattice/Verified Access/Network Firewall,
   SES/Pinpoint/Connect, Backup/DR, RAM/Macie/GuardDuty/Detective/
   SecurityHub/Inspector, Organizations/SSO/Transfer, AppConfig/Amplify,
   and more. Also: AWS enums extracted to `src/vocabulary/aws.ts` (mirrors
   azure.ts/gcp.ts/data.ts pattern), halving `index.ts` from 325 → 166
   lines.

2. ✅ **DONE — Add Azure + GCP supporting resources** —
   `AzureResource` grew from 19 → 318, `GcpResource` from 7 → 227.
   Azure covers networking (VNet/subnet/NIC/LB/DNS/Frontdoor/CDN),
   compute (VM/VMSS), storage, databases (MSSQL/PostgreSQL-flexible/
   MySQL-flexible/CosmosDB/DataFactory/Databricks/Synapse), containers
   (AKS/container-app/service-fabric), IAM, key vault, security (sentinel/
   security-center), backup/recovery, event-grid/service-bus/event-hub/
   IoT/SignalR, API management, app service, resource groups/policy.
   GCP covers compute (disk/image/snapshot/instance-group/autoscaler/
   target-pool/proxy/url-map/backend-service/forwarding-rule/health-check/
   ssl-cert/security-policy/router/vpn), networking (VPC/shared-VPC/DNS),
   storage (bucket-object/acl/IAM/filestore), IAM (project/org/folder/
   service-account/workload-identity), SQL, GKE, KMS, cloud-run,
   pub-sub/eventarc/tasks, bigquery/dataflow/dataproc/composer,
   spanner/firestore/memorystore, cloudbuild/clouddeploy, secret-manager,
   network-security, VPC-SC, apigateway/apigee, logging/monitoring,
   cloud-trace, identity-platform, billing, vertex-AI, binary-authorization/
   artifact-registry.

3. ✅ **DONE — Add the comparison-in-local eval pattern** — new
   `tryEvalComparison()` helper in `normalize.ts` evaluates
   `${ref (==|!=) scalar}` (no ternary). `tryEvalTernary()` extended to
   accept bare-ref conditions `${local.is_prod ? a : b}` where
   `local.is_prod` resolves to a boolean (directly or via a comparison
   stored in a local). Non-boolean literals (strings/numbers) stay
   unresolved — Terraform forbids them as conditions, so we refuse to
   guess. 5 new unit tests + 3 integration tests pin the behavior.

4. ✅ **DONE — `UTILITY_TYPES` silently-skipped set** — new
   `UTILITY_TYPES` set in `normalize.ts` covering `random_password`,
   `random_string`, `random_id`, `random_uuid`, `random_shuffle`,
   `random_pet`, `random_integer`, `random_bytes`, `terraform_data`.
   Silently skipped in `collectUngoverned` — neither governed nor
   surfaced as a coverage gap. 3 unit tests prove: real gaps still
   surface, utilities don't, `data.random_*` also skipped.

5. ✅ **DONE — Realistic fixture as a permanent integration test** —
   `realistic-rds/` wired into `check.test.ts` with pinned assertions:
   3 violations, 1 couldNotEvaluate, 0 ungoverned (random_password
   silently skipped), 32 passed.

6. ✅ **DONE — Dogfood via AI-style fixtures × 3 clouds** — three
   comprehensive AI-generated Terraform fixtures created
   (`realistic-aws/`, `realistic-azure/`, `realistic-gcp/`), each ~25-40
   resources with variables, locals, ternaries, `random_*` utilities,
   local module calls, deliberately ungoverned resource types, and
   couldNotEvaluate cases. Pinned integration tests assert v/p/cne/
   ungoverned counts per cloud. Results:
   - AWS: 1 violation, 55 passed, 1 CNE, 1 ungoverned.
   - Azure: 4 violations, 13 passed, 1 CNE, 1 ungoverned.
   - GCP: 4 violations, 9 passed, 1 CNE, 1 ungoverned.
   Total recognized types: 1003 (was 83). Ungoverned noise on real
   module repos should drop from ~50% to <5%.

**Bug fix:** `findTfFiles` in `parse.ts` was using `fs.readdirSync(dir,
{ recursive: true })` — recursive scan discovered `.tf` files in
`modules/` subdirectories directly AND `followModules` re-normalized
them via `module {}` calls → duplicate violations on governed resources
inside local modules. Fixed: non-recursive scan (top-level `.tf` files
only), matching Terraform's own root-module loading behavior.

**Vocabulary verification:** All 1003 enum values verified against the
actual HashiCorp Terraform provider documentation (AWS 1678 resources,
Azure 1103, GCP 1465 with IAM expansion). Results: AWS 484/484 (100%),
GCP 201/201 (100%), Azure 266/318 (84% — the 52 unverified are
deprecated-but-real resources like `azurerm_app_service`,
`azurerm_function_app`, `azurerm_mariadb_*`, `azurerm_mysql_server`,
`azurerm_postgresql_server` that are still in the provider but not in
current docs; kept intentionally). 63 fabricated/wrong-named values
removed (37 AWS + 26 GCP); 7 AWS `transit_gateway` values renamed to
`ec2_transit_gateway` (correct Terraform resource type includes the
`ec2_` prefix).

---

## Next steps (post-verification)

1. ✅ **DONE — Rules for the new vocabulary (first batch)** — added 7
   new preset rules governing previously-ungoverned resource types:
   - `coreSecurity`: CloudWatch log group retention (`mustBeSet`,
     warn), SQS queue KMS encryption (`mustBeSet`, warn), SNS topic KMS
     encryption (`mustBeSet`, warn), EFS file system encryption
     (`mustBeTrue`).
   - `cisAws`: EKS node group no direct SSH (`denyBlockPresence` on
     `remote_access` block — use SSM Session Manager instead).
   - `cisGcp`: GKE Workload Identity (`mustHaveBlock` on
     `workload_identity_config`).
   New vocabulary: `AwsAttribute.RetentionInDays`, `KmsMasterKeyId`;
   `Block.RemoteAccess`, `Block.WorkloadIdentityConfig`. CIS GCP smoke
   fixture updated (good_gke cluster now has `workload_identity_config`).
   Remaining: ~910 types still ungoverned-by-rule — future batches by
   security impact (S3 access logging, IAM user inline policies, ECS
   container insights, Route53 DNSSEC, etc.).

2. ✅ **DONE — Ref-branch ternary resolution** — `tryEvalTernary` now
   resolves sole-ref branches through scope. The pattern
   `${local.is_prod ? 30 : var.retention}` where `var.retention` has a
   default now resolves to the default value instead of degrading to
   could-not-evaluate. The chosen branch is resolved via `resolveValue`,
   so ref chains (var→local→literal), nested ternaries, and comparison
   locals all resolve. Compound branch expressions (arithmetic, function
   calls) stay unresolved (conservative). 5 new unit tests; realistic-rds
   and realistic-aws fixtures updated (CNE 1→0).

3. **Real-world dogfood** — run `npx @dotzen/dotzen@latest check` against
   `terraform-aws-modules` or actual AI-generated code. The self-validated
   fixtures prove no regression but not real-world readiness. Patterns to
   watch for: complex `dynamic` blocks, `templatefile()`,
   `terraform_remote_state`, provider `for_each`, deeply nested `for`.

4. **Azure deprecated-resource verification** — the 52 "deprecated but
   real" Azure types were kept based on knowledge, not source verification.
   An `azurerm` provider upgrade could silently drop some. Verify against
   the provider's Go `ResourcesMap`.
