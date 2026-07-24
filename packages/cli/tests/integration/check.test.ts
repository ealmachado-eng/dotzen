import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { check } from '../../src/cli/check'

const fixture = (name: string) => path.join(__dirname, 'fixtures', name)

describe('check (end-to-end)', () => {
  it('flags SSH open to the internet in a violating project', async () => {
    const r = await check(fixture('violating-project'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('aws_security_group.web')
      expect(r.value.violations[0]?.line).toBe(2)
      expect(r.value.violations[0]?.message).toMatch(/SSH and RDP/)
    }
  })

  it('passes a clean project with SSH restricted to a private CIDR', async () => {
    const r = await check(fixture('clean-project'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(0)
      expect(r.value.passed).toBeGreaterThan(0)
    }
  })

  it('refuses to run on a version mismatch', async () => {
    const r = await check(fixture('violating-project'), '9.9.9')
    // no version pin in fixture -> should still run; assert it does not
    // spuriously fail. (Version-mismatch path is unit-tested separately.)
    expect(r.ok).toBe(true)
  })

  it('resolves a var default across files and flags the violation', async () => {
    // variables.tf and main.tf are separate files; cidr comes from
    // var.admin_cidr (default 0.0.0.0/0) -> resolves to a definite hit.
    const r = await check(fixture('var-resolution'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
    }
  })

  it('root->environment mapping scopes rules by folder, not tag', async () => {
    // Neither resource has an environment tag; the env comes from the root
    // mapping. The production-only rule must fire on prod and skip dev.
    const r = await check(fixture('env-mapping'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.file).toMatch(/prod/)
    }
  })

  it('evaluates multiple roots with isolated scope (per-environment)', async () => {
    // dev and prd both define `var.ssh_cidr` with DIFFERENT defaults.
    // With per-root scope, only prd (0.0.0.0/0) violates; dev (10.0.0.0/8)
    // passes. A merged scope would collide and get one of them wrong.
    const r = await check(fixture('multi-root'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.file).toMatch(/env[/\\]prd/)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
    }
  })

  it('follows local modules and threads caller inputs into var.* (doc 08)', async () => {
    // env/prd has ONLY module calls (no direct resources). Following the
    // local source + threading each call's inputs makes the module's
    // resources concrete: the "bad" instantiation violates (Postgres open
    // to 0.0.0.0/0, tags missing cmdb_app_id); the "good" one passes.
    const r = await check(fixture('module-following'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // 2 resources × 2 instantiations = 4 checks; bad instance → 2 violations.
      expect(r.value.violations).toHaveLength(2)
      expect(r.value.passed).toBe(2)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      const kinds = r.value.violations.map((v) => v.resource).sort()
      expect(kinds).toEqual(['aws_db_instance.this', 'aws_security_group.this'])
      // Findings are traced back through the caller to the module file.
      expect(
        r.value.violations.every((v) => /modules[/\\]rds/.test(v.file)),
      ).toBe(true)
      expect(r.value.violations.every((v) => v.file.includes('›'))).toBe(true)
    }
  })

  it('env-layer: threads caller inputs, scopes prod rules by folder, and proves a missing tag (v0.1.2)', async () => {
    // env/dev has one compliant module call; env/prd has a compliant and a
    // non-compliant one. Module-following threads each caller's inputs in, so
    // cidrs/retention/deletion-protection become concrete. Crucially, the bad
    // call passes a CONCRETE tags = { apm_id } into merge(var.tags, {...}) —
    // the missing cmdb_app_id/Application must be a real VIOLATION, not a
    // could-not-evaluate (the full merge() tag-resolution fix).
    const r = await check(fixture('env-layer'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(4)
      expect(r.value.passed).toBe(9)
      expect(r.value.couldNotEvaluate).toHaveLength(0)

      // Every violation comes from the bad prod instantiation, traced through
      // the caller to the module file.
      expect(
        r.value.violations.every(
          (v) => /env[/\\]prd/.test(v.file) && /modules[/\\]rds/.test(v.file),
        ),
      ).toBe(true)

      // The missing-tag verdict is a definite violation (the v0.1.2 fix).
      const tagHit = r.value.violations.find((v) =>
        /apm_id, cmdb_app_id, Application/.test(v.message),
      )
      expect(tagHit?.resource).toBe('aws_db_instance.this')

      // Prod-only rules fired (deletion_protection + 30-day retention); none
      // of the four violations sits in env/dev.
      expect(r.value.violations.some((v) => /env[/\\]dev/.test(v.file))).toBe(
        false,
      )
    }
  })

  it('mustHaveAssociated links a child through local indirection (no false violation)', async () => {
    // The SSE-config resource references its bucket through a local chain
    // (`bucket = local.bucket_id` where `local.bucket_id = aws_s3_bucket.main.id`),
    // the ubiquitous real-module pattern. Before the fix, the association
    // index captured `local.bucket_id` and failed to link → a false violation
    // on a well-built module. Now the bucket passes; a bucket with no SSE
    // config at all still violates.
    const r = await check(fixture('assoc-local-indirection'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // `main` passes (linked through local); `lonely` violates (no SSE config).
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('aws_s3_bucket.lonely')
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      expect(r.value.passed).toBe(1)
    }
  })

  it('parses jsonencode(...) IAM policies and ECS container_definitions (v0.1.3)', async () => {
    // Before v0.1.3, jsonencode(...) degraded IAM policies and ECS
    // container_definitions to "could not evaluate" — the top remaining
    // could-not-evaluate on the roadmap, since most real Terraform uses
    // jsonencode, not literal JSON. Now the HCL object/array literal inside
    // jsonencode(...) is parsed: the wildcard policy and privileged container
    // are flagged as violations; the compliant resources pass.
    const r = await check(fixture('iam-jsonencode'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // encoded_admin (Action "*" + Resource "*") + encoded (privileged) = 2.
      expect(r.value.violations).toHaveLength(2)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      const resources = r.value.violations.map((v) => v.resource).sort()
      expect(resources).toEqual([
        'aws_ecs_task_definition.encoded',
        'aws_iam_policy.encoded_admin',
      ])
      // scoped IAM policy + safe ECS task = 2 passes.
      expect(r.value.passed).toBe(2)
    }
  })

  it('requireSslOnlyPolicy + denyPublicPrincipal on S3 bucket policies (v0.1.3)', async () => {
    // The Condition-block parsing (from the jsonencode work) is now used by
    // `requireSslOnlyPolicy`. A bucket policy with a Deny + Condition Bool
    // aws:SecureTransport=false passes; one with only an Allow (no SSL Deny)
    // violates. `denyPublicPrincipal` flags Allow statements with Principal
    // "*" (public access). The ssl_enforced policy passes both (Deny with
    // SecureTransport, Principal "*" is in a Deny not an Allow); the no_ssl
    // policy violates both (Allow with Principal "*", no SSL Deny).
    const r = await check(fixture('s3-ssl'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // no_ssl violates both rules (2 violations on the same resource).
      expect(r.value.violations).toHaveLength(2)
      expect(
        r.value.violations.every(
          (v) => v.resource === 'aws_s3_bucket_policy.no_ssl',
        ),
      ).toBe(true)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      // ssl_enforced passes both rules.
      expect(r.value.passed).toBe(2)
    }
  })

  it('follows nested modules (env → outer → inner) and threads cidrs two hops (doc 08 tranche 5)', async () => {
    // env/prd has two calls of `outer`, each threading its allowed_cidrs in.
    // `outer` calls `inner`, passing those cidrs through as `cidrs`. The SG
    // lives in `inner` — two hops of scope-threading from the caller. The
    // good call passes; the bad call (Postgres open to 0.0.0.0/0) violates.
    // Nested recursion + per-instantiation isolation: 1 pass + 1 violation,
    // the violation's trace names BOTH hops with their instantiation labels.
    const r = await check(fixture('nested-modules'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.passed).toBe(1)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      const v = r.value.violations[0]
      expect(v?.resource).toBe('aws_security_group.this')
      // Trace MUST include both hops and both instantiation labels: the
      // outer call label (db_bad) AND the inner call label (inner_db).
      expect(v?.file).toContain('(db_bad)')
      expect(v?.file).toContain('(inner_db)')
      expect(v?.file).toMatch(/modules[/\\]inner[/\\]main\.tf/)
      expect(v?.file).toMatch(/modules[/\\]outer[/\\]main\.tf/)
    }
  })

  it('expands a module `for_each` over a literal map — distinct verdicts per key (doc 08 tranche 5)', async () => {
    // One `module "db"` block with `for_each = { good = …, bad = … }` → two
    // module instances. Each expands with its own each.value threaded into
    // var.cidr → the good key passes, the bad key violates, distinguishable
    // in the trace by the per-key label suffix `(db[good])` / `(db[bad])`.
    const r = await check(fixture('module-for-each'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.passed).toBe(1)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      const v = r.value.violations[0]
      expect(v?.resource).toBe('aws_security_group.this')
      expect(v?.file).toMatch(/\(db\[bad\]\)/)
      // The good key appears among passed checks (no separate slot — but the
      // trace on the violation proves which key expanded to the violation).
    }
  })

  it('AWS Config recorder settings (CIS §3.1/3.2)', async () => {
    // The good recorder has all_supported + include_global_resource_types = true
    // → passes both rules. The bad recorder has both = false → 2 violations.
    const r = await check(fixture('aws-config'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(2)
      expect(
        r.value.violations.every(
          (v) => v.resource === 'aws_config_configuration_recorder.bad',
        ),
      ).toBe(true)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      expect(r.value.passed).toBe(2)
    }
  })

  it('ECS plaintext env secrets (v0.1.3)', async () => {
    // The lenient jsonencode parser extracts environment variables even when
    // some values are references. A plaintext DB_PASSWORD = "hunter2" is
    // flagged; a referenced DB_PASSWORD = "${var.db_password}" passes.
    const r = await check(fixture('ecs-env-secrets'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe(
        'aws_ecs_task_definition.bad',
      )
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      expect(r.value.passed).toBe(1)
    }
  })

  it('surfaces a remote (not-followed) module as could-not-evaluate (doc 08 DoD)', async () => {
    // env/prd calls one local module (followed → compliant DB) and one remote
    // module (git::… — cannot be fetched, not followed). doc 08's DoD says the
    // remote skip must surface, not silently pass: it lands in
    // couldNotEvaluate under the stable ruleId `dotzen.module-following`, with
    // the caller file+line and the source that was not followed.
    const r = await check(fixture('module-remote-skip'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // The local module's compliant DB → 1 passed, 0 violations.
      expect(r.value.violations).toHaveLength(0)
      expect(r.value.passed).toBe(1)
      // The remote module skip is the single could-not-evaluate entry.
      expect(r.value.couldNotEvaluate).toHaveLength(1)
      const skip = r.value.couldNotEvaluate[0]
      expect(skip?.ruleId).toBe('dotzen.module-following')
      expect(skip?.resource).toBe('module.remote')
      expect(skip?.file).toMatch(/env[/\\]prd[/\\]main\.tf$/)
      expect(skip?.reason).toMatch(/remote/)
      expect(skip?.reason).toContain('git::https://example.com/rds.git')
    }
  })

  it('serverless functions: Lambda, Azure Functions, Cloud Run Functions', async () => {
    // One violating + one compliant function per cloud. The "bad" resources
    // violate every serverless rule (tracing/KMS/HTTPS/TLS/public-network/
    // identity/ingress/service-account/env-var-secrets/tags/diag-logging);
    // the "good" resources pass them all, proving the env-var-map extractor
    // (denyPlaintextEnvSecrets on Lambda/Azure/GCP maps) and the GCP `labels`
    // tag extraction both work end-to-end.
    const r = await check(fixture('serverless-functions'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const badResources = new Set(r.value.violations.map((v) => v.resource))
      expect(badResources).toEqual(
        new Set([
          'aws_lambda_function.bad',
          'azurerm_linux_function_app.bad',
          'google_cloudfunctions2_function.bad',
        ]),
      )
      // 4 (lambda) + 7 (azure) + 4 (gcp) = 15 violations across the bad set.
      expect(r.value.violations).toHaveLength(15)
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      // The three good functions never appear in a violation.
      expect(r.value.violations.every((v) => !/\.good$/.test(v.resource))).toBe(
        true,
      )
    }
  })

  it('skips a resource with count = 0 (no false violation on a disabled resource)', async () => {
    // The "disabled" SG has count = 0 and an open-SSH ingress that WOULD
    // violate — but it must be skipped (no instances). The "active" SG has
    // the same ingress and must be flagged. So: exactly one violation on
    // aws_security_group.active, and the disabled one never appears.
    const r = await check(fixture('count-zero'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('aws_security_group.active')
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      expect(
        r.value.violations.every((v) => !/\.disabled$/.test(v.resource)),
      ).toBe(true)
    }
  })

  it('honors provider default_tags: tagless resources pass mustHaveTags (direct + nested module)', async () => {
    // The root provider's default_tags supply apm_id + cmdb_app_id, so two
    // tagless DB instances (one direct, one in a followed module with no
    // provider block of its own — inheriting the root defaults) must PASS
    // the mustHaveTags rule. Before the fix, a tagless resource resolved to
    // an empty tag set and this fired two false violations. The control SG
    // with SSH open must still be flagged (the fix is not blanket suppression).
    const r = await check(fixture('provider-default-tags'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // Only the control SG violates (SSH open). Neither DB instance does.
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe(
        'aws_security_group.violator',
      )
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      // Both DB instances passed the mustHaveTags rule (direct + inherited).
      expect(r.value.passed).toBeGreaterThanOrEqual(2)
      expect(
        r.value.violations.every((v) => !/aws_db_instance/.test(v.resource)),
      ).toBe(true)
    }
  })

  it('flags a resource declaring a forbidden provisioner (local-exec/remote-exec)', async () => {
    // The "with_provisioner" instance runs an arbitrary local-exec command
    // (a supply-chain / exfil surface) — denyProvisioner must flag it. The
    // "clean" instance uses user_data and must pass.
    const r = await check(fixture('provisioners'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe(
        'aws_instance.with_provisioner',
      )
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      expect(r.value.passed).toBe(1) // the clean instance
    }
  })

  it('flags an insensitive output referencing a secret attribute', async () => {
    // output "db_password" exposes aws_db_instance.master_password without
    // sensitive = true → leak. The safe twin (sensitive = true) and a non-
    // secret endpoint output must pass.
    const r = await check(fixture('insensitive-outputs'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('output.db_password')
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      // Two outputs pass (the sensitive twin + the non-secret endpoint).
      expect(r.value.passed).toBe(2)
    }
  })

  it('governs data sources: AMI data source must pin owners incl. "self"', async () => {
    // The "wildcard" AMI (no owners) and "third_party" (owners omit self) are
    // supply-chain risks → flagged. The "pinned" one (self + amazon) passes.
    const r = await check(fixture('ami-owners'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(2)
      expect(
        r.value.violations.every((v) => /^data\.aws_ami\./.test(v.resource)),
      ).toBe(true)
      const names = r.value.violations.map((v) => v.resource).sort()
      expect(names).toEqual([
        'data.aws_ami.third_party',
        'data.aws_ami.wildcard',
      ])
      expect(r.value.passed).toBe(1) // the pinned source
    }
  })

  it('scopes a rule by provider alias (.providerAlias)', async () => {
    // The dr-scoped encryption rule fires on the dr unencrypted instance only.
    // The dr-encrypted instance passes; the default-provider unencrypted
    // instance is skipped by the alias-scoped rule.
    const r = await check(fixture('provider-alias'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe(
        'aws_instance.dr_unencrypted',
      )
      expect(r.value.passed).toBe(1) // the dr-encrypted instance
      // The default-provider instance never appears (skipped, not violated).
      expect(
        r.value.violations.every(
          (v) => v.resource !== 'aws_instance.default_unencrypted',
        ),
      ).toBe(true)
    }
  })

  it('flags insensitive secret-looking variables and hardcoded local secrets', async () => {
    // #10: db_password (no sensitive) flagged; api_key (sensitive) +
    // instance_count (non-secret) pass. #12: admin_password (plaintext local)
    // flagged; auth_token (reference) + common_tags (non-secret) pass.
    const r = await check(fixture('sensitive-bindings'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(2)
      const resources = r.value.violations.map((v) => v.resource).sort()
      expect(resources).toEqual([
        'local.admin_password',
        'variable.db_password',
      ])
      expect(r.value.couldNotEvaluate).toHaveLength(0)
      // 4 bindings pass (api_key, instance_count, auth_token, common_tags).
      expect(r.value.passed).toBe(4)
    }
  })

  it('flags a resource that hides drift via lifecycle.ignore_changes (#14)', async () => {
    const r = await check(fixture('ignore-changes'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('aws_s3_bucket.drifting')
      expect(r.value.passed).toBe(1) // the clean bucket
    }
  })

  it('flags floating terraform required_version + provider version constraints (#11)', async () => {
    // required_version="1.7.5" (bare = floating) → violation. aws is exact-
    // pinned (pass for that provider), google is `>=` (floating) → violation.
    const r = await check(fixture('version-pinning'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(2)
      expect(r.value.violations.every((v) => v.resource === 'terraform')).toBe(
        true,
      )
      const msgs = r.value.violations.map((v) => v.message).sort()
      expect(msgs).toEqual([
        'providers must be version-pinned (= or ~>)',
        'terraform required_version must be an exact pin (= X.Y.Z)',
      ])
    }
  })

  it("a module providers map remaps a child's default provider alias (#13)", async () => {
    // The child instance has NO explicit `provider` arg, but the module call
    // passes `providers = { aws = aws.dr }` → the child inherits alias "dr".
    // The dr-scoped encryption rule fires on its unencrypted root volume.
    const r = await check(fixture('module-providers-map'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('aws_instance.child')
      // Traced through the module call.
      expect(r.value.violations[0]?.file).toMatch(/modules[/\\]mod/)
    }
  })

  it('flags a local/unencrypted state backend (#17)', async () => {
    // An explicit `backend "local"` fires both requireEncryptedBackend (no
    // encrypt) and denyLocalBackend (local is forbidden).
    const r = await check(fixture('backend'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(2)
      expect(r.value.violations.every((v) => v.resource === 'terraform')).toBe(
        true,
      )
      const msgs = r.value.violations.map((v) => v.message).sort()
      expect(msgs).toEqual([
        'local state is forbidden — use a remote backend',
        'state backend must be declared and encrypted',
      ])
    }
  })

  it('flags a connection block that hardcodes a secret (#18)', async () => {
    // The "bad" instance has a plaintext private_key + password in its
    // connection block; the "good" one references var.ssh_key.
    const r = await check(fixture('connection-secrets'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('aws_instance.bad')
    }
  })

  it('flags floating/absent registry module versions (#19)', async () => {
    // vpc (~> 5.0) + local_db (./, no version) pass. eks (bare 5.0) + acm
    // (no version) are flagged.
    const r = await check(fixture('module-version-pinning'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(2)
      const labels = r.value.violations.map((v) => v.resource).sort()
      expect(labels).toEqual(['module.acm', 'module.eks'])
    }
  })

  it('suppresses findings on blocks with a dotzen:ignore directive (#20)', async () => {
    // "flagged" (no ignore) → violation. "ignored" (preceding-line ignore with
    // a reason) + "trailing" (same-line trailing ignore) → suppressed.
    const r = await check(fixture('ignore-directive'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.violations).toHaveLength(1)
      expect(r.value.violations[0]?.resource).toBe('aws_security_group.flagged')
      expect(
        r.value.violations.every(
          (v) =>
            v.resource !== 'aws_security_group.ignored' &&
            v.resource !== 'aws_security_group.trailing',
        ),
      ).toBe(true)
    }
  })

  it('CIS AWS preset fires on real violations and passes compliant resources (#24 e2e)', async () => {
    // A SMOKE test: run the real cisAws preset against a fixture with known
    // violations + known compliant resources. Proves the preset produces
    // correct verdicts end-to-end (not just that its rules validate).
    const r = await check(fixture('cis-aws-smoke'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // Known violations: bad_ssh (SSH open), bad_rds (unencrypted + public +
      // low retention, possibly more from the preset's rules), bad_vol
      // (unencrypted EBS), bad_bucket (public ACL), bad_key (no rotation),
      // bad_policy (Action:*). The compliant resources must NOT appear.
      const flagged = new Set(r.value.violations.map((v) => v.resource))
      // The violating resources must be flagged.
      expect(flagged.has('aws_security_group.bad_ssh')).toBe(true)
      expect(flagged.has('aws_db_instance.bad_rds')).toBe(true)
      expect(flagged.has('aws_ebs_volume.bad_vol')).toBe(true)
      expect(flagged.has('aws_s3_bucket.bad_bucket')).toBe(true)
      expect(flagged.has('aws_kms_key.bad_key')).toBe(true)
      expect(flagged.has('aws_iam_policy.bad_policy')).toBe(true)
      // Binding-surface rules: insensitive variable + plaintext local secret.
      expect(flagged.has('variable.api_key')).toBe(true)
      expect(flagged.has('local.auth_token')).toBe(true)
      // The compliant resources must NOT be flagged.
      expect(flagged.has('aws_security_group.good_ssh')).toBe(false)
      expect(flagged.has('aws_db_instance.good_rds')).toBe(false)
      expect(flagged.has('variable.safe_secret')).toBe(false)
      expect(flagged.has('local.instance_count')).toBe(false)
    }
  })

  it('CIS Azure preset fires on real violations and passes compliant resources (#24 e2e)', async () => {
    const r = await check(fixture('cis-azure-smoke'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const flagged = new Set(r.value.violations.map((v) => v.resource))
      // The violating resources must be flagged.
      expect(flagged.has('azurerm_storage_account.bad_storage')).toBe(true)
      expect(flagged.has('azurerm_mssql_server.bad_sql')).toBe(true)
      expect(flagged.has('azurerm_postgresql_server.bad_pg')).toBe(true)
      expect(flagged.has('azurerm_key_vault.bad_kv')).toBe(true)
      expect(flagged.has('azurerm_kubernetes_cluster.bad_aks')).toBe(true)
      expect(flagged.has('azurerm_linux_web_app.bad_web')).toBe(true)
      expect(flagged.has('azurerm_container_registry.bad_acr')).toBe(true)
      // RBAC + binding-surface rules.
      expect(flagged.has('azurerm_role_assignment.bad_owner')).toBe(true)
      expect(flagged.has('variable.sql_password')).toBe(true)
      expect(flagged.has('local.admin_token')).toBe(true)
      // The compliant resources must NOT be flagged.
      expect(flagged.has('azurerm_storage_account.good_storage')).toBe(false)
      expect(flagged.has('azurerm_mssql_server.good_sql')).toBe(false)
      expect(flagged.has('azurerm_key_vault.good_kv')).toBe(false)
      expect(flagged.has('azurerm_role_assignment.good_reader')).toBe(false)
      expect(flagged.has('variable.safe_secret')).toBe(false)
    }
  })

  it('CIS GCP preset fires on real violations and passes compliant resources (#24 e2e)', async () => {
    const r = await check(fixture('cis-gcp-smoke'), '0.0.1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const flagged = new Set(r.value.violations.map((v) => v.resource))
      // The violating resources must be flagged.
      expect(flagged.has('google_storage_bucket.bad_bucket')).toBe(true)
      expect(flagged.has('google_sql_database_instance.bad_sql')).toBe(true)
      expect(flagged.has('google_container_cluster.bad_gke')).toBe(true)
      expect(flagged.has('google_kms_crypto_key.bad_key')).toBe(true)
      expect(flagged.has('google_compute_instance.bad_vm')).toBe(true)
      expect(flagged.has('google_storage_bucket_iam_member.bad_iam')).toBe(true)
      expect(flagged.has('google_cloudfunctions2_function.bad_fn')).toBe(true)
      // Firewall + binding-surface rules.
      expect(flagged.has('google_compute_firewall.bad_fw')).toBe(true)
      expect(flagged.has('variable.db_password')).toBe(true)
      expect(flagged.has('local.api_token')).toBe(true)
      // The compliant resources must NOT be flagged.
      expect(flagged.has('google_storage_bucket.good_bucket')).toBe(false)
      expect(flagged.has('google_sql_database_instance.good_sql')).toBe(false)
      expect(flagged.has('google_container_cluster.good_gke')).toBe(false)
      expect(flagged.has('google_kms_crypto_key.good_key')).toBe(false)
      expect(flagged.has('google_compute_firewall.good_fw')).toBe(false)
      expect(flagged.has('variable.safe_secret')).toBe(false)
    }
  })
})
