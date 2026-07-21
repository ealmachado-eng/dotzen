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
  a silent pass). **Remaining tranches:** remote (registry/git) sources,
  nested modules, module `count`/`for_each`, per-instantiation trace labels.
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
