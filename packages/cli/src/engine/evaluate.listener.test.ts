import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, TlsPolicy, Effect } from '../vocabulary'

const listener = (
  attributes: Record<string, NormalizedValue>,
): NormalizedResource => ({
  type: AwsResource.LbListener,
  name: 'l',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

const lit = (v: string): NormalizedValue => ({ kind: 'literal', value: v })

const weakTls: Rule = {
  id: 'weak-tls',
  target: { kind: 'resource', types: [AwsResource.LbListener] },
  conditions: [
    {
      kind: 'denyValue',
      attr: AwsAttribute.SslPolicy,
      values: [TlsPolicy.Legacy2015, TlsPolicy.Tls10, TlsPolicy.Tls11],
    },
  ],
  effect: Effect.Block,
  message: 'weak TLS policy',
}

const noPlaintext: Rule = {
  id: 'no-plaintext',
  target: { kind: 'resource', types: [AwsResource.LbListener] },
  conditions: [{ kind: 'denyPlaintextListener' }],
  effect: Effect.Block,
  message: 'plaintext listener',
}

describe('evaluate (denyValue — weak TLS policy)', () => {
  it('flags a weak policy', () => {
    const r = listener({ ssl_policy: lit(TlsPolicy.Tls10) })
    expect(evaluate([weakTls], [r]).violations).toHaveLength(1)
  })
  it('passes a modern policy', () => {
    const r = listener({
      ssl_policy: lit('ELBSecurityPolicy-TLS13-1-2-2021-06'),
    })
    expect(evaluate([weakTls], [r]).violations).toHaveLength(0)
  })
  it('passes when ssl_policy is absent', () => {
    expect(evaluate([weakTls], [listener({})]).violations).toHaveLength(0)
  })
})

describe('evaluate (denyPlaintextListener)', () => {
  it('flags an HTTP listener that forwards', () => {
    const r = listener({
      protocol: lit('HTTP'),
      'default_action.type': lit('forward'),
    })
    expect(evaluate([noPlaintext], [r]).violations).toHaveLength(1)
  })
  it('exempts an HTTP listener that redirects to HTTPS', () => {
    const r = listener({
      protocol: lit('HTTP'),
      'default_action.type': lit('redirect'),
    })
    expect(evaluate([noPlaintext], [r]).violations).toHaveLength(0)
  })
  it('passes an HTTPS listener', () => {
    expect(
      evaluate([noPlaintext], [listener({ protocol: lit('HTTPS') })])
        .violations,
    ).toHaveLength(0)
  })
})
