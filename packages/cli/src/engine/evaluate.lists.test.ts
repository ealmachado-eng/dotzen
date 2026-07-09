import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, ListInfo } from '../hcl/model'
import {
  AwsResource,
  AwsAttribute,
  Cidr,
  EksLogType,
  Effect,
} from '../vocabulary'

const eks = (lists: Record<string, ListInfo>): NormalizedResource => ({
  type: AwsResource.EksCluster,
  name: 'c',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
  lists,
})

const lit = (v: string) => ({ kind: 'literal' as const, value: v })
const resolved = (...vals: string[]): ListInfo => ({
  kind: 'resolved',
  items: vals.map(lit),
})

const noPublicCidr: Rule = {
  id: 'eks-no-public-cidr',
  target: { kind: 'resource', types: [AwsResource.EksCluster] },
  conditions: [
    {
      kind: 'listContains',
      attr: AwsAttribute.PublicAccessCidrs,
      values: [Cidr.Internet, Cidr.InternetV6],
    },
  ],
  effect: Effect.Block,
  message: 'EKS public_access_cidrs must not include the internet',
}

const requireLogs: Rule = {
  id: 'eks-logs',
  target: { kind: 'resource', types: [AwsResource.EksCluster] },
  conditions: [
    {
      kind: 'listMustInclude',
      attr: AwsAttribute.EnabledClusterLogTypes,
      values: [EksLogType.Api, EksLogType.Audit],
    },
  ],
  effect: Effect.Block,
  message: 'EKS must enable api + audit logging',
}

describe('evaluate (listContains)', () => {
  it('flags a list containing a forbidden value', () => {
    const r = eks({ 'vpc_config.public_access_cidrs': resolved('0.0.0.0/0') })
    expect(evaluate([noPublicCidr], [r]).violations).toHaveLength(1)
  })

  it('passes a list without forbidden values', () => {
    const r = eks({ 'vpc_config.public_access_cidrs': resolved('10.0.0.0/8') })
    expect(evaluate([noPublicCidr], [r]).violations).toHaveLength(0)
  })

  it('passes when the list attribute is absent', () => {
    expect(evaluate([noPublicCidr], [eks({})]).violations).toHaveLength(0)
  })

  it('could-not-evaluate when the list is unresolved', () => {
    const r = eks({ 'vpc_config.public_access_cidrs': { kind: 'unresolved' } })
    expect(evaluate([noPublicCidr], [r]).couldNotEvaluate).toHaveLength(1)
  })
})

describe('evaluate (listMustInclude)', () => {
  it('passes when all required values are present', () => {
    const r = eks({
      enabled_cluster_log_types: resolved('api', 'audit', 'scheduler'),
    })
    expect(evaluate([requireLogs], [r]).violations).toHaveLength(0)
  })

  it('flags when a required value is missing', () => {
    const r = eks({ enabled_cluster_log_types: resolved('api') })
    expect(evaluate([requireLogs], [r]).violations).toHaveLength(1)
  })

  it('flags when the list is absent (logging not configured)', () => {
    expect(evaluate([requireLogs], [eks({})]).violations).toHaveLength(1)
  })
})
