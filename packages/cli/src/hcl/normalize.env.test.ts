import { describe, it, expect } from 'vitest'
import {
  normalize,
  buildScope,
  providerDefaults,
  mergeProviderDefaults,
} from './normalize'
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

describe('normalize — environment from provider default_tags', () => {
  const raw = `resource "aws_db_instance" "d" {}`

  it('falls back to the provider default_tags environment when the resource has none', () => {
    const parsed = {
      provider: {
        aws: [{ default_tags: [{ tags: { environment: 'production' } }] }],
      },
      resource: { aws_db_instance: { d: [{}] } },
    }
    const scope = buildScope([parsed])
    const pd = providerDefaults([parsed], scope)
    const d = normalize(parsed, 'main.tf', raw, scope, undefined, pd).find(
      (r) => r.name === 'd',
    )
    expect(d?.environment).toEqual({ kind: 'literal', value: 'production' })
  })

  it('a resource-level environment tag wins over the provider default', () => {
    const parsed = {
      provider: {
        aws: [{ default_tags: [{ tags: { environment: 'production' } }] }],
      },
      resource: {
        aws_db_instance: { d: [{ tags: { environment: 'staging' } }] },
      },
    }
    const scope = buildScope([parsed])
    const pd = providerDefaults([parsed], scope)
    const d = normalize(parsed, 'main.tf', raw, scope, undefined, pd).find(
      (r) => r.name === 'd',
    )
    expect(d?.environment).toEqual({ kind: 'literal', value: 'staging' })
  })

  it('a root environment override wins over the provider default', () => {
    const parsed = {
      provider: {
        aws: [{ default_tags: [{ tags: { environment: 'production' } }] }],
      },
      resource: { aws_db_instance: { d: [{}] } },
    }
    const scope = buildScope([parsed])
    const pd = providerDefaults([parsed], scope)
    const d = normalize(parsed, 'main.tf', raw, scope, 'development', pd).find(
      (r) => r.name === 'd',
    )
    expect(d?.environment).toEqual({ kind: 'literal', value: 'development' })
  })

  it('environment stays undefined when neither resource nor provider supplies it', () => {
    const parsed = {
      provider: { aws: [{ default_tags: [{ tags: { team: 'core' } }] }] },
      resource: { aws_db_instance: { d: [{}] } },
    }
    const scope = buildScope([parsed])
    const pd = providerDefaults([parsed], scope)
    const d = normalize(parsed, 'main.tf', raw, scope, undefined, pd).find(
      (r) => r.name === 'd',
    )
    expect(d?.environment).toBeUndefined()
  })
})

describe('mergeProviderDefaults — nested-module inheritance', () => {
  it('returns the child when there is no parent', () => {
    const child = { tagKeys: ['Env'], tagValues: { Env: 'prod' } }
    expect(mergeProviderDefaults(undefined, child)).toEqual(child)
  })

  it('returns the parent when there is no child', () => {
    const parent = { tagKeys: ['Env'], tagValues: { Env: 'prod' } }
    expect(mergeProviderDefaults(parent, undefined)).toEqual(parent)
  })

  it('returns undefined when neither declares defaults', () => {
    expect(mergeProviderDefaults(undefined, undefined)).toBeUndefined()
  })

  it('unions keys (both levels guarantee presence)', () => {
    const parent = { tagKeys: ['Env'], tagValues: { Env: 'prod' } }
    const child = { tagKeys: ['Team'], tagValues: { Team: 'infra' } }
    expect(mergeProviderDefaults(parent, child)).toEqual({
      tagKeys: ['Env', 'Team'],
      tagValues: { Env: 'prod', Team: 'infra' },
    })
  })

  it('the child value wins on a key conflict', () => {
    const parent = { tagKeys: ['Env'], tagValues: { Env: 'prod' } }
    const child = { tagKeys: ['Env'], tagValues: { Env: 'dev' } }
    expect(mergeProviderDefaults(parent, child)).toEqual({
      tagKeys: ['Env'],
      tagValues: { Env: 'dev' },
    })
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
