import { describe, it, expect } from 'vitest'
import { loadSpec, importSpecModule } from './load'
import { rule } from './rule'
import { AwsResource, Port } from '../vocabulary'

describe('loadSpec', () => {
  it('returns validated rules when all builders are valid', () => {
    const r = loadSpec([
      rule()
        .resource(AwsResource.SecurityGroup)
        .denyIngress(Port.SSH)
        .message('m'),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(1)
  })

  it('accumulates SpecInvalid errors across every bad rule', () => {
    const r = loadSpec([
      rule()
        .resource(AwsResource.SecurityGroup)
        .denyIngress(Port.SSH)
        .message('ok'),
      rule(), // invalid: no message, no target, no conditions
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('SpecInvalid')
      if (r.error.kind === 'SpecInvalid') {
        expect(r.error.errors.length).toBe(3)
        expect(r.error.errors.every((e) => e.ruleIndex === 1)).toBe(true)
      }
    }
  })
})

describe('importSpecModule', () => {
  it('returns ConfigNotFound for a missing spec path', async () => {
    const r = await importSpecModule('does/not/exist/spec.ts')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('ConfigNotFound')
  })
})
