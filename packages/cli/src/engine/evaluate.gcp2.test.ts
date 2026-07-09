import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { GcpResource, GcpAttribute, SqlSslMode, Effect } from '../vocabulary'

const sql = (
  attributes: Record<string, NormalizedValue>,
): NormalizedResource => ({
  type: GcpResource.SqlDatabaseInstance,
  name: 'db',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

describe('evaluate — mustBeOneOf (allowlist)', () => {
  const rule: Rule = {
    id: 'ssl',
    target: { kind: 'resource', types: [GcpResource.SqlDatabaseInstance] },
    conditions: [
      {
        kind: 'mustBeOneOf',
        attr: GcpAttribute.SslMode,
        values: [
          SqlSslMode.EncryptedOnly,
          SqlSslMode.TrustedClientCertRequired,
        ],
      },
    ],
    effect: Effect.Warn,
    message: 'ssl mode',
  }

  it('passes an allowed value', () => {
    const r = sql({
      'settings.ip_configuration.ssl_mode': {
        kind: 'literal',
        value: SqlSslMode.EncryptedOnly,
      },
    })
    expect(evaluate([rule], [r]).violations).toHaveLength(0)
  })

  it('flags an absent value (insecure default)', () => {
    expect(evaluate([rule], [sql({})]).violations).toHaveLength(1)
  })

  it('flags a disallowed value', () => {
    const r = sql({
      'settings.ip_configuration.ssl_mode': {
        kind: 'literal',
        value: 'ALLOW_UNENCRYPTED_AND_ENCRYPTED',
      },
    })
    expect(evaluate([rule], [r]).violations).toHaveLength(1)
  })
})
