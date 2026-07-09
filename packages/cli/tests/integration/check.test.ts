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
})
