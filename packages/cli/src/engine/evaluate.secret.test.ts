import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource } from '../hcl/model'
import { AwsResource, Effect } from '../vocabulary'

/**
 * Engine contract for `aws_secretsmanager_secret_policy` governance
 * (ROADMAP #3 — secret resource-policy wildcard). The normalize layer's
 * `policyOf` already parses ANY resource's inline `policy` attribute
 * (literal JSON or `jsonencode(...)`); the EXISTING `denyPublicPrincipal`
 * condition flags an `Allow` statement with `Principal: "*"`. So a secret
 * resource policy granting public access is governed by a rule that simply
 * targets `SecretsmanagerSecretPolicy` + `denyPublicPrincipal()` — no new
 * condition, no engine change. These tests pin that contract.
 */

const secretPolicy = (
  policy: NormalizedResource['policy'],
): NormalizedResource => ({
  type: AwsResource.SecretsmanagerSecretPolicy,
  name: 'p',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
  policy,
})

const noPublicSecret: Rule = {
  id: 'no-public-secret-policy',
  target: { kind: 'resource', types: [AwsResource.SecretsmanagerSecretPolicy] },
  conditions: [{ kind: 'denyPublicPrincipal' }],
  effect: Effect.Block,
  message: 'Secret policies must not grant Principal "*" (public access)',
}

describe('evaluate — denyPublicPrincipal on aws_secretsmanager_secret_policy (ROADMAP #3)', () => {
  it('flags a secret policy granting Allow Principal "*"', () => {
    // The canonical dangerous shape: a secret whose resource policy allows
    // the whole world to read it. `policyOf` parses the inline JSON; the
    // engine flags the Allow + Principal "*".
    const r = secretPolicy({
      kind: 'parsed',
      statements: [
        {
          effect: 'Allow',
          actions: ['secretsmanager:GetSecretValue'],
          resources: ['*'],
          notActions: [],
          principals: ['*'],
          conditions: {},
        },
      ],
    })
    const report = evaluate([noPublicSecret], [r])
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('passes a least-privilege secret policy granting a specific role', () => {
    const r = secretPolicy({
      kind: 'parsed',
      statements: [
        {
          effect: 'Allow',
          actions: ['secretsmanager:GetSecretValue'],
          resources: ['arn:aws:secretsmanager:us-east-1:123:secret:db-*'],
          notActions: [],
          principals: ['arn:aws:iam::123:role/app'],
          conditions: {},
        },
      ],
    })
    const report = evaluate([noPublicSecret], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes a Deny statement with Principal "*" (restrictive, not public)', () => {
    // A Deny + Principal "*" is fine — it restricts, doesn't open access.
    const r = secretPolicy({
      kind: 'parsed',
      statements: [
        {
          effect: 'Deny',
          actions: ['secretsmanager:GetSecretValue'],
          resources: ['*'],
          notActions: [],
          principals: ['*'],
          conditions: {},
        },
      ],
    })
    const report = evaluate([noPublicSecret], [r])
    expect(report.violations).toHaveLength(0)
  })

  it('degrades to couldNotEvaluate for a jsonencode(var.x) policy', () => {
    const r = secretPolicy({ kind: 'unresolved' })
    const report = evaluate([noPublicSecret], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
  })
})
