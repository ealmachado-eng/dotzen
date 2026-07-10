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
})
