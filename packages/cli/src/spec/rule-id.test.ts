import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { loadSpec } from './load'

describe('RuleBuilder.id() — stable author-chosen rule IDs', () => {
  it('uses the author ID when set', () => {
    const r = rule()
      .id('no-public-ssh')
      .resource('aws_security_group' as never)
      .denyIngress(22 as never)
      .message('no ssh')
      .validate(0)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.id).toBe('no-public-ssh')
  })

  it('falls back to rule-N when no .id() is set', () => {
    const r = rule()
      .resource('aws_security_group' as never)
      .denyIngress(22 as never)
      .message('no ssh')
      .validate(2)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.id).toBe('rule-3')
  })

  it('rejects an invalid ID format', () => {
    const r = rule()
      .id('Bad ID With Spaces')
      .resource('aws_security_group' as never)
      .denyIngress(22 as never)
      .message('no ssh')
      .validate(0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error[0]?.problem).toMatch(/\.id\(\)/)
  })

  it('rejects an ID starting with a digit', () => {
    const r = rule()
      .id('5-ssh')
      .resource('aws_security_group' as never)
      .denyIngress(22 as never)
      .message('no ssh')
      .validate(0)
    expect(r.ok).toBe(false)
  })

  it('accepts IDs with hyphens and digits', () => {
    const r = rule()
      .id('no-public-ssh-v2')
      .resource('aws_security_group' as never)
      .denyIngress(22 as never)
      .message('no ssh')
      .validate(0)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.id).toBe('no-public-ssh-v2')
  })
})

describe('loadSpec — duplicate stable ID detection', () => {
  const mkRule = (id: string) =>
    rule()
      .id(id)
      .resource('aws_security_group' as never)
      .denyIngress(22 as never)
      .message('no ssh')

  it('passes when all stable IDs are unique', () => {
    const r = loadSpec([mkRule('no-ssh'), mkRule('no-rdp')])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value[0]?.id).toBe('no-ssh')
      expect(r.value[1]?.id).toBe('no-rdp')
    }
  })

  it('fails when two rules share the same stable ID', () => {
    const r = loadSpec([mkRule('no-ssh'), mkRule('no-ssh')])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('SpecInvalid')
  })

  it('passes when rules have no .id() (positional IDs are always unique)', () => {
    const r = loadSpec([
      rule()
        .resource('aws_security_group' as never)
        .denyIngress(22 as never)
        .message('a'),
      rule()
        .resource('aws_security_group' as never)
        .denyIngress(22 as never)
        .message('b'),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value[0]?.id).toBe('rule-1')
      expect(r.value[1]?.id).toBe('rule-2')
    }
  })

  it('passes when a mix of stable + positional IDs (no collision)', () => {
    const r = loadSpec([
      mkRule('no-ssh'),
      rule()
        .resource('aws_security_group' as never)
        .denyIngress(22 as never)
        .message('b'),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value[0]?.id).toBe('no-ssh')
      expect(r.value[1]?.id).toBe('rule-2')
    }
  })
})
