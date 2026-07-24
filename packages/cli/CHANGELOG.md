# Changelog

All notable changes to `@dotzen/dotzen` are documented here. Versions follow
[semver](https://semver.org/). Notably, **new spec DSL vocabulary (new rule
conditions, resource types, or attributes) is treated as a feature release**,
not a patch — even when strictly backward-compatible, consumers should know
whether re-reading their spec is warranted.

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
