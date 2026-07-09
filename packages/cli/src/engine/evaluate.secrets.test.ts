import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

const secret = (v?: NormalizedValue): NormalizedResource => ({
  type: AwsResource.SecretsmanagerSecretVersion,
  name: 's',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: v ? { secret_string: v } : {},
})

const rule: Rule = {
  id: 'no-hardcoded-secret',
  target: {
    kind: 'resource',
    types: [AwsResource.SecretsmanagerSecretVersion],
  },
  conditions: [{ kind: 'denyLiteral', attrs: [AwsAttribute.SecretString] }],
  effect: Effect.Block,
  message: 'secret_string must be a reference, not a literal',
}

describe('evaluate (denyLiteral — hardcoded secrets)', () => {
  it('flags a hardcoded literal secret', () => {
    const r = secret({ kind: 'literal', value: 'hunter2' })
    expect(evaluate([rule], [r]).violations).toHaveLength(1)
  })

  it('passes when the value is a reference (var/data)', () => {
    const r = secret({ kind: 'unresolved', expr: '${var.db_password}' })
    expect(evaluate([rule], [r]).violations).toHaveLength(0)
    expect(evaluate([rule], [r]).passed).toBe(1)
  })

  it('passes when the attribute is absent', () => {
    expect(evaluate([rule], [secret(undefined)]).violations).toHaveLength(0)
  })

  it('flags a hardcoded cluster master_password', () => {
    const clusterRule: Rule = {
      id: 'no-hardcoded-master-password',
      target: {
        kind: 'resource',
        types: [AwsResource.RdsCluster, AwsResource.RedshiftCluster],
      },
      conditions: [
        { kind: 'denyLiteral', attrs: [AwsAttribute.MasterPassword] },
      ],
      effect: Effect.Block,
      message: 'master_password must be a reference',
    }
    const cluster: NormalizedResource = {
      type: AwsResource.RdsCluster,
      name: 'main',
      file: 'main.tf',
      line: 1,
      ingress: [],
      tags: { kind: 'resolved', keys: [] },
      attributes: { master_password: { kind: 'literal', value: 'p' } },
    }
    expect(evaluate([clusterRule], [cluster]).violations).toHaveLength(1)
  })
})
