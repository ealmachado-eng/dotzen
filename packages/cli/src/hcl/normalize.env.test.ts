import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'
import { rule } from '../spec/rule'
import { AwsResource, Environment, AwsAttribute } from '../vocabulary'

const raw = `resource "aws_db_instance" "d" {}`

describe('normalize — environment tag extraction', () => {
  it('extracts a literal environment tag value', () => {
    const parsed = {
      resource: {
        aws_db_instance: { d: [{ tags: { environment: 'production' } }] },
      },
    }
    const d = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'd')
    expect(d?.environment).toEqual({ kind: 'literal', value: 'production' })
  })

  it('resolves an environment tag that references a var', () => {
    const parsed = {
      variable: { env: [{ default: 'staging' }] },
      resource: {
        aws_db_instance: { d: [{ tags: { environment: '${var.env}' } }] },
      },
    }
    const scope = buildScope([parsed])
    const d = normalize(parsed, 'main.tf', raw, scope).find(
      (r) => r.name === 'd',
    )
    expect(d?.environment).toEqual({ kind: 'literal', value: 'staging' })
  })

  it('leaves environment undefined when there is no environment tag', () => {
    const parsed = {
      resource: { aws_db_instance: { d: [{ tags: { team: 'core' } }] } },
    }
    const d = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'd')
    expect(d?.environment).toBeUndefined()
  })

  it('an environment override (from the root) wins over the tag', () => {
    const parsed = {
      resource: {
        aws_db_instance: { d: [{ tags: { environment: 'staging' } }] },
      },
    }
    const d = normalize(parsed, 'main.tf', raw, new Map(), 'production').find(
      (r) => r.name === 'd',
    )
    expect(d?.environment).toEqual({ kind: 'literal', value: 'production' })
  })
})

describe('RuleBuilder.environment', () => {
  it('sets the environment scope on the validated rule', () => {
    const r = rule()
      .resource(AwsResource.DbInstance)
      .environment(Environment.Production)
      .mustBeTrue(AwsAttribute.DeletionProtection)
      .message('m')
      .validate(0)
    expect(r.ok && r.value.environment).toBe(Environment.Production)
  })
})
