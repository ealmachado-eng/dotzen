import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize, buildScope } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'
import { AwsResource, AwsAttribute } from '../vocabulary'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

// #16: a CONSERVATIVE ternary evaluator. Only the safe form
// `${<ref> (==|!=) <scalar> ? <scalar> : <scalar>}` resolves to a literal;
// anything compound stays unresolved (could-not-evaluate, never a guess).
// Test through normalize + evaluate (the public surface).
describe('evaluate — conservative ternary eval (#16)', () => {
  const encRule = valid(
    rule()
      .resource(AwsResource.DbInstance)
      .mustBeTrue(AwsAttribute.StorageEncrypted)
      .message('DB must encrypt storage'),
  )

  const dbWith = (encryptedExpr: string, envDefault?: unknown) => {
    const parsed = {
      variable:
        envDefault !== undefined ? { env: [{ default: envDefault }] } : {},
      resource: {
        aws_db_instance: { x: [{ storage_encrypted: encryptedExpr }] },
      },
    }
    return normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
  }

  it('resolves var.env == "prod" ? true : false to true when env=prod', () => {
    const res = dbWith('${var.env == "prod" ? true : false}', 'prod')
    expect(res[0]?.attributes.storage_encrypted).toEqual({
      kind: 'literal',
      value: true,
    })
    const r = evaluate([encRule], res)
    // definite PASS (not could-not-evaluate)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })

  it('resolves var.env == "prod" ? true : false to false when env=dev', () => {
    const res = dbWith('${var.env == "prod" ? true : false}', 'dev')
    expect(res[0]?.attributes.storage_encrypted).toEqual({
      kind: 'literal',
      value: false,
    })
    const r = evaluate([encRule], res)
    // definite VIOLATION (not could-not-evaluate)
    expect(r.violations).toHaveLength(1)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })

  it('resolves != operator (var.env != "prod" ? false : true) → true when env=prod', () => {
    const res = dbWith('${var.env != "prod" ? false : true}', 'prod')
    expect(res[0]?.attributes.storage_encrypted).toEqual({
      kind: 'literal',
      value: true,
    })
  })

  it('resolves a number comparison', () => {
    const parsed = {
      variable: { count: [{ default: 3 }] },
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${var.count == 3 ? true : false}' }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.attributes.storage_encrypted).toEqual({
      kind: 'literal',
      value: true,
    })
  })

  it('resolves string branches (not just booleans)', () => {
    const parsed = {
      variable: { env: [{ default: 'prod' }] },
      resource: {
        aws_db_instance: {
          x: [{ engine: '${var.env == "prod" ? "postgres" : "mysql"}' }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.attributes.engine).toEqual({
      kind: 'literal',
      value: 'postgres',
    })
  })

  it('stays unresolved when the ref has no default (unresolvable) — no guess', () => {
    const res = dbWith('${var.env == "prod" ? true : false}')
    expect(res[0]?.attributes.storage_encrypted?.kind).toBe('unresolved')
    const r = evaluate([encRule], res)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1) // honest, not a false verdict
  })

  it('stays unresolved for a compound condition (&&) — no guess', () => {
    const parsed = {
      variable: { env: [{ default: 'prod' }], x: [{ default: true }] },
      resource: {
        aws_db_instance: {
          x: [
            {
              storage_encrypted: '${var.env == "prod" && var.x ? true : false}',
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.attributes.storage_encrypted?.kind).toBe('unresolved')
  })

  it('stays unresolved when a branch is a ref (not a scalar) — no guess', () => {
    const parsed = {
      variable: { env: [{ default: 'prod' }], a: [{ default: true }] },
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${var.env == "prod" ? var.a : false}' }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.attributes.storage_encrypted?.kind).toBe('unresolved')
  })

  it('stays unresolved for a nested ternary in a branch — no guess', () => {
    const parsed = {
      variable: { env: [{ default: 'prod' }], x: [{ default: true }] },
      resource: {
        aws_db_instance: {
          x: [
            {
              storage_encrypted:
                '${var.env == "prod" ? (var.x ? true : false) : false}',
            },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.attributes.storage_encrypted?.kind).toBe('unresolved')
  })

  it('a non-ternary interpolation stays unresolved', () => {
    const res = dbWith('${var.env}')
    expect(res[0]?.attributes.storage_encrypted?.kind).toBe('unresolved')
  })

  it('resolves through a local indirection in the ref', () => {
    // local.env → var.env → "prod"; the ternary ref is local.env.
    const parsed = {
      variable: { env: [{ default: 'prod' }] },
      locals: [{ env: '${var.env}' }],
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${local.env == "prod" ? true : false}' }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.attributes.storage_encrypted).toEqual({
      kind: 'literal',
      value: true,
    })
  })
})
