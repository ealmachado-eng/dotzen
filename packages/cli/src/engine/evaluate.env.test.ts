import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Environment, Effect } from '../vocabulary'

const prodOnly: Rule = {
  id: 'prod-rds-deletion-protection',
  target: { kind: 'resource', types: [AwsResource.DbInstance] },
  environment: Environment.Production,
  conditions: [
    { kind: 'mustBeTrue', attrs: [AwsAttribute.DeletionProtection] },
  ],
  effect: Effect.Block,
  message: 'Production RDS requires deletion protection',
}

const db = (environment?: NormalizedValue): NormalizedResource => ({
  type: AwsResource.DbInstance,
  name: 'd',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {}, // deletion_protection absent -> would violate mustBeTrue
  environment,
})

const envLit = (v: string): NormalizedValue => ({ kind: 'literal', value: v })

describe('evaluate — environment scoping', () => {
  it('applies to a resource whose environment matches', () => {
    const r = evaluate([prodOnly], [db(envLit('production'))])
    expect(r.violations).toHaveLength(1)
  })

  it('skips a resource in a different environment', () => {
    const r = evaluate([prodOnly], [db(envLit('staging'))])
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(0) // skipped entirely, not counted as a pass
    expect(r.couldNotEvaluate).toHaveLength(0)
  })

  it('skips a resource with no environment tag (filter, fail-open)', () => {
    const r = evaluate([prodOnly], [db(undefined)])
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(0)
  })

  it('an unscoped rule still applies regardless of environment', () => {
    const unscoped: Rule = { ...prodOnly, environment: undefined }
    expect(evaluate([unscoped], [db(undefined)]).violations).toHaveLength(1)
  })
})
