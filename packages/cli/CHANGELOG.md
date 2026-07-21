# Changelog

All notable changes to `@dotzen/dotzen` are documented here. Versions follow
[semver](https://semver.org/). Notably, **new spec DSL vocabulary (new rule
conditions, resource types, or attributes) is treated as a feature release**,
not a patch — even when strictly backward-compatible, consumers should know
whether re-reading their spec is warranted.

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
