import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, Port, AwsAttribute, Effect } from '../vocabulary'

const lit = (v: string | number): NormalizedValue => ({
  kind: 'literal',
  value: v,
})

const sg = (egress: NormalizedResource['egress']): NormalizedResource => ({
  type: AwsResource.SecurityGroup,
  name: 'sg',
  file: 'main.tf',
  line: 1,
  ingress: [],
  egress,
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
})

const denyEgressRule = (
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyEgress(Port.Postgres)
    .message('no DB egress to the internet')
    .validate(0) as { ok: true; value: Rule }
).value

describe('evaluate (denyEgress)', () => {
  it('flags a targeted port open to the internet on egress', () => {
    const r = evaluate(
      [denyEgressRule],
      [
        sg([
          {
            fromPort: lit(5432),
            toPort: lit(5432),
            cidrBlocks: [lit('0.0.0.0/0')],
          },
        ]),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('passes when egress is restricted', () => {
    const r = evaluate(
      [denyEgressRule],
      [
        sg([
          {
            fromPort: lit(5432),
            toPort: lit(5432),
            cidrBlocks: [lit('10.0.0.0/8')],
          },
        ]),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes when there are no egress rules', () => {
    expect(evaluate([denyEgressRule], [sg(undefined)]).violations).toHaveLength(
      0,
    )
  })
})

// Tier-1 encryption resources reuse mustBeTrue with no new engine logic.
const ebs = (encrypted?: NormalizedValue): NormalizedResource => ({
  type: AwsResource.EbsVolume,
  name: 'data',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: encrypted ? { encrypted } : {},
})

describe('evaluate — Tier 1 encryption resources', () => {
  const encRule: Rule = {
    id: 'ebs-encrypted',
    target: { kind: 'resource', types: [AwsResource.EbsVolume] },
    conditions: [{ kind: 'mustBeTrue', attrs: [AwsAttribute.Encrypted] }],
    effect: Effect.Block,
    message: 'EBS volumes must be encrypted',
  }

  it('flags an unencrypted EBS volume', () => {
    expect(
      evaluate([encRule], [ebs({ kind: 'literal', value: false })]).violations,
    ).toHaveLength(1)
  })

  it('flags an EBS volume with encryption unset (AWS default off)', () => {
    expect(evaluate([encRule], [ebs(undefined)]).violations).toHaveLength(1)
  })

  it('passes an encrypted EBS volume', () => {
    expect(
      evaluate([encRule], [ebs({ kind: 'literal', value: true })]).violations,
    ).toHaveLength(0)
  })
})
