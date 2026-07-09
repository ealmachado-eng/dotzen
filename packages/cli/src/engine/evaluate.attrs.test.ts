import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

const mustEncrypt: Rule = {
  id: 'rds-encrypted',
  target: { kind: 'resource', types: [AwsResource.DbInstance] },
  conditions: [{ kind: 'mustBeTrue', attrs: [AwsAttribute.StorageEncrypted] }],
  effect: Effect.Block,
  message: 'RDS must have storage encryption',
}

const denyPublic: Rule = {
  id: 'rds-not-public',
  target: { kind: 'resource', types: [AwsResource.DbInstance] },
  conditions: [
    { kind: 'denyWhenTrue', attrs: [AwsAttribute.PubliclyAccessible] },
  ],
  effect: Effect.Block,
  message: 'RDS must not be publicly accessible',
}

const db = (
  attributes: Record<string, NormalizedValue>,
): NormalizedResource => ({
  type: AwsResource.DbInstance,
  name: 'd',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

const boolLit = (v: boolean): NormalizedValue => ({ kind: 'literal', value: v })

describe('evaluate (mustBeTrue)', () => {
  it('passes when the attribute is literally true', () => {
    const r = evaluate(
      [mustEncrypt],
      [db({ storage_encrypted: boolLit(true) })],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags when the attribute is false', () => {
    const r = evaluate(
      [mustEncrypt],
      [db({ storage_encrypted: boolLit(false) })],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags when the attribute is absent (AWS default is off)', () => {
    const r = evaluate([mustEncrypt], [db({})])
    expect(r.violations).toHaveLength(1)
  })

  it('reports couldNotEvaluate when the attribute is unresolved', () => {
    const r = evaluate(
      [mustEncrypt],
      [db({ storage_encrypted: { kind: 'unresolved', expr: '${var.enc}' } })],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})

describe('evaluate (denyWhenTrue)', () => {
  it('flags when the attribute is true', () => {
    const r = evaluate(
      [denyPublic],
      [db({ publicly_accessible: boolLit(true) })],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('passes when false', () => {
    const r = evaluate(
      [denyPublic],
      [db({ publicly_accessible: boolLit(false) })],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes when absent (default is off)', () => {
    const r = evaluate([denyPublic], [db({})])
    expect(r.violations).toHaveLength(0)
  })
})
