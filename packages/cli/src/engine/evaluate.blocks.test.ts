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

describe('evaluate — block-presence on CONDITIONAL dynamic blocks (CNE)', () => {
  // A dynamic block whose for_each is unresolvable has UNKNOWN presence — the
  // block may or may not be created at apply time. Both mustHaveBlock and
  // denyBlockPresence must degrade to could-not-evaluate rather than a
  // definite verdict (the dogfood FP: eks `dynamic "remote_access"` with
  // `for_each = var.remote_access != null ? [var.remote_access] : []`).
  const denyRule: Rule = {
    id: 'no-remote-access',
    target: { kind: 'resource', types: [AwsResource.EksNodeGroup] },
    conditions: [{ kind: 'denyBlockPresence', block: Block.RemoteAccess }],
    effect: Effect.Block,
    message: 'no remote_access',
  }
  const mustRule: Rule = {
    id: 'needs-block',
    target: { kind: 'resource', types: [AwsResource.EksNodeGroup] },
    conditions: [{ kind: 'mustHaveBlock', block: Block.RemoteAccess }],
    effect: Effect.Block,
    message: 'needs remote_access',
  }
  const ng = (cond: string[]): NormalizedResource => ({
    type: AwsResource.EksNodeGroup,
    name: 'this',
    file: 'main.tf',
    line: 1,
    ingress: [],
    tags: { kind: 'resolved', keys: [] },
    attributes: {},
    conditionalBlocks: cond,
  })

  it('denyBlockPresence degrades to CNE on a conditional block', () => {
    const r = evaluate([denyRule], [ng(['remote_access'])])
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
  it('mustHaveBlock degrades to CNE on a conditional block', () => {
    const r = evaluate([mustRule], [ng(['remote_access'])])
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
  it('denyBlockPresence still passes when the block is fully absent', () => {
    const r = evaluate([denyRule], [ng([])])
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })
  it('mustHaveBlock still violates when the block is fully absent', () => {
    const r = evaluate([mustRule], [ng([])])
    expect(r.violations).toHaveLength(1)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })
})
