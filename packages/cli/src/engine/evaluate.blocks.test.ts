import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize } from '../hcl/normalize'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import {
  AwsResource,
  AwsAttribute,
  GcpResource,
  Block,
  Effect,
} from '../vocabulary'

const num = (v: number): NormalizedValue => ({ kind: 'literal', value: v })

describe('evaluate — mustBeAtMost', () => {
  const rule: Rule = {
    id: 'pw-age',
    target: { kind: 'resource', types: [AwsResource.IamAccountPasswordPolicy] },
    conditions: [
      { kind: 'mustBeAtMost', attr: AwsAttribute.MaxPasswordAge, max: 90 },
    ],
    effect: Effect.Block,
    message: 'expire within 90 days',
  }
  const pol = (attrs: Record<string, NormalizedValue>): NormalizedResource => ({
    type: AwsResource.IamAccountPasswordPolicy,
    name: 'p',
    file: 'main.tf',
    line: 1,
    ingress: [],
    tags: { kind: 'resolved', keys: [] },
    attributes: attrs,
  })

  it('passes a value at/below the max', () => {
    expect(
      evaluate([rule], [pol({ max_password_age: num(90) })]).violations,
    ).toHaveLength(0)
  })
  it('flags a value above the max', () => {
    expect(
      evaluate([rule], [pol({ max_password_age: num(365) })]).violations,
    ).toHaveLength(1)
  })
  it('flags an absent value (never expires)', () => {
    expect(evaluate([rule], [pol({})]).violations).toHaveLength(1)
  })
})

describe('evaluate — denyBlockPresence (via normalize block tracking)', () => {
  const rule: Rule = {
    id: 'no-public-ip',
    target: { kind: 'resource', types: [GcpResource.ComputeInstance] },
    conditions: [
      { kind: 'denyBlockPresence', block: Block.NetworkInterfaceAccessConfig },
    ],
    effect: Effect.Warn,
    message: 'no public ip',
  }
  const instance = (ni: Record<string, unknown>) =>
    normalize(
      {
        resource: {
          google_compute_instance: { app: [{ network_interface: [ni] }] },
        },
      },
      'main.tf',
      '',
    )

  it('flags an instance with an (even empty) access_config block', () => {
    const r = instance({ network: 'default', access_config: [{}] })
    expect(evaluate([rule], r).violations).toHaveLength(1)
  })

  it('passes an instance with no access_config', () => {
    const r = instance({ network: 'default' })
    expect(evaluate([rule], r).violations).toHaveLength(0)
  })
})
