import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

const ref = (expr: string): NormalizedValue => ({ kind: 'unresolved', expr })
const bool = (v: boolean): NormalizedValue => ({ kind: 'literal', value: v })

const res = (
  type: AwsResource,
  name: string,
  attributes: Record<string, NormalizedValue> = {},
): NormalizedResource => ({
  type,
  name,
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

describe('evaluate — VPC flow logs (cross-resource)', () => {
  const rule: Rule = {
    id: 'vpc-flow-logs',
    target: { kind: 'resource', types: [AwsResource.Vpc] },
    conditions: [
      {
        kind: 'mustHaveAssociated',
        childType: AwsResource.FlowLog,
        via: AwsAttribute.VpcId,
      },
    ],
    effect: Effect.Warn,
    message: 'VPC must have flow logs',
  }

  it('passes a VPC referenced by an aws_flow_log', () => {
    const vpc = res(AwsResource.Vpc, 'main')
    const flow = res(AwsResource.FlowLog, 'main', {
      vpc_id: ref('${aws_vpc.main.id}'),
    })
    expect(evaluate([rule], [vpc, flow]).violations).toHaveLength(0)
  })

  it('flags a VPC with no flow log', () => {
    const vpc = res(AwsResource.Vpc, 'lonely')
    expect(evaluate([rule], [vpc]).violations).toHaveLength(1)
  })
})

describe('evaluate — subnet public exposure', () => {
  const rule: Rule = {
    id: 'subnet-no-public-ip',
    target: { kind: 'resource', types: [AwsResource.Subnet] },
    conditions: [
      { kind: 'denyWhenTrue', attrs: [AwsAttribute.MapPublicIpOnLaunch] },
    ],
    effect: Effect.Block,
    message: 'subnet must not auto-assign public IPs',
  }

  it('flags a subnet that auto-assigns public IPs', () => {
    const subnet = res(AwsResource.Subnet, 'public', {
      map_public_ip_on_launch: bool(true),
    })
    expect(evaluate([rule], [subnet]).violations).toHaveLength(1)
  })

  it('passes a private subnet', () => {
    const subnet = res(AwsResource.Subnet, 'private', {
      map_public_ip_on_launch: bool(false),
    })
    expect(evaluate([rule], [subnet]).violations).toHaveLength(0)
  })
})
