import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule, RuleBuilder } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import {
  AwsResource,
  AwsAttribute,
  AzureResource,
  AzureAttribute,
  Effect,
} from '../vocabulary'
import { coreSecurity } from '../presets/core-security'
import { cisAws } from '../presets/cis-aws'
import { cisAzure } from '../presets/cis-azure'

/**
 * Locks the v1.9.14–v1.9.16 preset additions: each shipped rule (found by its
 * stable message substring, so the user-facing wording is pinned too) must
 * fire on a violating resource and pass on a compliant one, with the correct
 * effect (block vs warn). These complement the engine-condition unit tests
 * (which cover the evaluator in isolation) by asserting the PRESET WIRING —
 * the right resource type + attribute + effect, including the nested-block
 * attribute paths (OpenSearch, MSK).
 */

const lit = (v: string | boolean | number): NormalizedValue => ({
  kind: 'literal',
  value: v,
})
const ref = (expr = '${var.x}'): NormalizedValue => ({
  kind: 'unresolved',
  expr,
})

const res = (
  type: AwsResource | AzureResource,
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

/** Find a shipped preset rule by a stable message substring. Builds the
 *  preset's RuleBuilder chain into Rule[] first (validate is total on
 *  well-formed presets). */
const find = (preset: readonly RuleBuilder[], msg: string): Rule => {
  const built = preset.map((b, i) => b.validate(i))
  const r = built.find((x) => x.ok && x.value.message.includes(msg))
  if (!r || !r.ok) throw new Error(`preset rule not found (message ~ "${msg}")`)
  return r.value
}

const violations = (rule: Rule, resources: NormalizedResource[]) =>
  evaluate([rule], resources).violations

// ── denyLiteral: a literal value is the violation; a reference passes ──────
describe('preset locks — denyLiteral (hardcoded credential)', () => {
  const cases = [
    [
      'Amazon MQ admin_password',
      coreSecurity,
      'Amazon MQ broker admin passwords',
      AwsResource.MqBroker,
      AwsAttribute.MqAdminPassword,
      Effect.Block,
    ],
    [
      'Secrets Manager secret_string',
      coreSecurity,
      'secret_string should be a reference',
      AwsResource.SecretsmanagerSecretVersion,
      AwsAttribute.SecretString,
      Effect.Warn,
    ],
    [
      'ElastiCache auth_token',
      coreSecurity,
      'ElastiCache auth tokens must be a reference',
      AwsResource.ElasticacheReplicationGroup,
      AwsAttribute.AuthToken,
      Effect.Block,
    ],
    [
      'DocDB master_password',
      coreSecurity,
      'Cluster master passwords must be a reference',
      AwsResource.DocdbCluster,
      AwsAttribute.MasterPassword,
      Effect.Block,
    ],
    [
      'Azure SQL admin password',
      cisAzure,
      'Azure SQL admin passwords must be a reference',
      AzureResource.MssqlServer,
      AzureAttribute.AdministratorLoginPassword,
      Effect.Block,
    ],
  ] as const

  for (const [label, preset, msg, type, attr, effect] of cases) {
    const rule = find(preset, msg)
    describe(label, () => {
      it('flags a hardcoded literal value', () => {
        const v = violations(rule, [res(type, 'r', { [attr]: lit('hunter2') })])
        expect(v).toHaveLength(1)
        expect(v[0]!.effect).toBe(effect)
      })
      it('passes when the value is a reference', () => {
        const r = evaluate([rule], [res(type, 'r', { [attr]: ref() })])
        expect(r.violations).toHaveLength(0)
        expect(r.passed).toBe(1)
      })
    })
  }
})

// ── mustBeTrue: false is the violation; true passes ────────────────────────
describe('preset locks — mustBeTrue (encryption / transport)', () => {
  const cases = [
    [
      'OpenSearch at-rest',
      coreSecurity,
      'OpenSearch domains must encrypt data at rest',
      AwsResource.OpensearchDomain,
      AwsAttribute.OpenSearchEncryptAtRest,
      Effect.Block,
    ],
    [
      'OpenSearch node-to-node',
      coreSecurity,
      'OpenSearch domains must enable node-to-node',
      AwsResource.OpensearchDomain,
      AwsAttribute.OpenSearchNodeToNodeEncryption,
      Effect.Warn,
    ],
    [
      'OpenSearch enforce-https (cis-aws)',
      cisAws,
      'OpenSearch domains must enforce HTTPS',
      AwsResource.OpensearchDomain,
      AwsAttribute.OpenSearchEnforceHttps,
      Effect.Warn,
    ],
    [
      'ElastiCache transit (cis-aws)',
      cisAws,
      'ElastiCache replication groups must enable transit',
      AwsResource.ElasticacheReplicationGroup,
      AwsAttribute.TransitEncryptionEnabled,
      Effect.Warn,
    ],
    [
      'DocDB storage_encrypted',
      coreSecurity,
      'DocDB clusters must encrypt storage',
      AwsResource.DocdbCluster,
      AwsAttribute.StorageEncrypted,
      Effect.Block,
    ],
  ] as const

  for (const [label, preset, msg, type, attr, effect] of cases) {
    const rule = find(preset, msg)
    describe(label, () => {
      it('flags when the attribute is false', () => {
        const v = violations(rule, [res(type, 'r', { [attr]: lit(false) })])
        expect(v).toHaveLength(1)
        expect(v[0]!.effect).toBe(effect)
      })
      it('passes when the attribute is true', () => {
        const r = evaluate([rule], [res(type, 'r', { [attr]: lit(true) })])
        expect(r.violations).toHaveLength(0)
        expect(r.passed).toBe(1)
      })
    })
  }
})

// ── mustBeFalse: true is the violation; false passes ───────────────────────
describe('preset locks — mustBeFalse (cluster-instance publicly_accessible)', () => {
  // cis-aws, pci-dss, and data-protection all carry this rule; cis-aws is the
  // representative (same condition + resource types across the three).
  const rule = find(cisAws, 'must not be publicly accessible')
  for (const type of [
    AwsResource.RdsClusterInstance,
    AwsResource.DocdbClusterInstance,
  ]) {
    describe(type, () => {
      it('flags when publicly_accessible = true', () => {
        expect(
          violations(rule, [
            res(type, 'r', { [AwsAttribute.PubliclyAccessible]: lit(true) }),
          ]),
        ).toHaveLength(1)
      })
      it('passes when publicly_accessible = false', () => {
        const r = evaluate(
          [rule],
          [res(type, 'r', { [AwsAttribute.PubliclyAccessible]: lit(false) })],
        )
        expect(r.violations).toHaveLength(0)
        expect(r.passed).toBe(1)
      })
    })
  }
})

// ── denyValue: a value in the denylist is the violation ────────────────────
describe('preset locks — denyValue (MSK client_broker)', () => {
  const rule = find(coreSecurity, 'MSK clusters must not use PLAINTEXT')
  it('flags client_broker = PLAINTEXT (block)', () => {
    const v = violations(rule, [
      res(AwsResource.MskCluster, 'r', {
        [AwsAttribute.MskClientBroker]: lit('PLAINTEXT'),
      }),
    ])
    expect(v).toHaveLength(1)
    expect(v[0]!.effect).toBe(Effect.Block)
  })
  it('passes client_broker = TLS', () => {
    const r = evaluate(
      [rule],
      [
        res(AwsResource.MskCluster, 'r', {
          [AwsAttribute.MskClientBroker]: lit('TLS'),
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })
  it('passes client_broker = TLS_PLAINTEXT (mixed mode intentionally not flagged)', () => {
    expect(
      violations(rule, [
        res(AwsResource.MskCluster, 'r', {
          [AwsAttribute.MskClientBroker]: lit('TLS_PLAINTEXT'),
        }),
      ]),
    ).toHaveLength(0)
  })
})
