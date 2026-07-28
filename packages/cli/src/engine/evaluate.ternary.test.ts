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

  it('resolves a ref branch through scope (inline-compare condition)', () => {
    // var.env == "prod" is true → picks var.a → var.a has default true.
    // The ref branch resolves through scope (ref-branch resolution).
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
    expect(res[0]?.attributes.storage_encrypted).toEqual({
      kind: 'literal',
      value: true,
    })
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

  it('resolves a bare-ref condition whose local is a boolean literal', () => {
    // local.is_prod = true; ternary on the bare ref.
    const parsed = {
      locals: [{ is_prod: true }],
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${local.is_prod ? true : false}' }],
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
    const r = evaluate([encRule], res)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })

  it('resolves a bare-ref condition whose local is a comparison interpolation (ROADMAP #3)', () => {
    // local.is_prod = "${var.env == \"prd\"}" — the canonical realistic-fixture
    // pattern. The ternary condition is a bare ref; the local's scope entry
    // is itself a conservative comparison interpolation.
    const parsed = {
      variable: { env: [{ default: 'prd' }] },
      locals: [{ is_prod: '${var.env == "prd"}' }],
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${local.is_prod ? true : false}' }],
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
    const r = evaluate([encRule], res)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })

  it('resolves a bare-ref condition through a comparison local when the comparison is false', () => {
    const parsed = {
      variable: { env: [{ default: 'dev' }] },
      locals: [{ is_prod: '${var.env == "prd"}' }],
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${local.is_prod ? true : false}' }],
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
      value: false,
    })
    const r = evaluate([encRule], res)
    expect(r.violations).toHaveLength(1)
    expect(r.couldNotEvaluate).toHaveLength(0)
  })

  it('stays unresolved when a bare-ref condition resolves to a non-boolean literal (string) — no guess', () => {
    // Terraform forbids non-boolean conditions; a string local is a type
    // mismatch, not a truthy value. Refuse rather than guess.
    const parsed = {
      locals: [{ name: 'prod' }],
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${local.name ? true : false}' }],
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
    const r = evaluate([encRule], res)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it("stays unresolved when a bare-ref condition's comparison local is unresolvable — no guess", () => {
    // local.is_prod = var.env == "prd" but var.env has no default.
    const parsed = {
      locals: [{ is_prod: '${var.env == "prd"}' }],
      resource: {
        aws_db_instance: {
          x: [{ storage_encrypted: '${local.is_prod ? true : false}' }],
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
    const r = evaluate([encRule], res)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('resolves a ref branch through scope (local.is_prod ? 30 : var.retention)', () => {
    // The false branch is a var ref with a default — should resolve to
    // the default value (7), not degrade to could-not-evaluate.
    const parsed = {
      variable: { env: [{ default: 'dev' }], retention: [{ default: 7 }] },
      locals: [{ is_prod: '${var.env == "prd"}' }],
      resource: {
        aws_db_instance: {
          x: [
            {
              backup_retention_period: '${local.is_prod ? 30 : var.retention}',
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
    expect(res[0]?.attributes.backup_retention_period).toEqual({
      kind: 'literal',
      value: 7,
    })
  })

  it('resolves a ref branch through scope when the true branch is chosen', () => {
    // env=prd → is_prod=true → picks the true branch (30, a scalar).
    // The false branch (var.retention) is NOT evaluated.
    const parsed = {
      variable: { env: [{ default: 'prd' }], retention: [{ default: 7 }] },
      locals: [{ is_prod: '${var.env == "prd"}' }],
      resource: {
        aws_db_instance: {
          x: [
            {
              backup_retention_period: '${local.is_prod ? 30 : var.retention}',
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
    expect(res[0]?.attributes.backup_retention_period).toEqual({
      kind: 'literal',
      value: 30,
    })
  })

  it('resolves a ref branch through a local chain (var → local → literal)', () => {
    // false branch is local.retention which resolves to var.retention
    // which resolves to 7 — two hops through scope.
    const parsed = {
      variable: { env: [{ default: 'dev' }], retention: [{ default: 7 }] },
      locals: [
        { is_prod: '${var.env == "prd"}' },
        { retention: '${var.retention}' },
      ],
      resource: {
        aws_db_instance: {
          x: [
            {
              backup_retention_period:
                '${local.is_prod ? 30 : local.retention}',
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
    expect(res[0]?.attributes.backup_retention_period).toEqual({
      kind: 'literal',
      value: 7,
    })
  })

  it('stays unresolved when the ref branch has no default — no guess', () => {
    // var.retention has NO default → resolveRaw returns undefined →
    // toValue returns unresolved → could-not-evaluate (honest degrade).
    const parsed = {
      variable: { env: [{ default: 'dev' }] },
      locals: [{ is_prod: '${var.env == "prd"}' }],
      resource: {
        aws_db_instance: {
          x: [
            {
              backup_retention_period: '${local.is_prod ? 30 : var.retention}',
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
    expect(res[0]?.attributes.backup_retention_period?.kind).toBe('unresolved')
  })

  it('stays unresolved for a compound branch expression (var.x * 2) — no guess', () => {
    // The false branch is an arithmetic expression, not a sole ref.
    // resolveValue won't follow it → unresolved.
    const parsed = {
      variable: { env: [{ default: 'dev' }], x: [{ default: 5 }] },
      locals: [{ is_prod: '${var.env == "prd"}' }],
      resource: {
        aws_db_instance: {
          x: [{ backup_retention_period: '${local.is_prod ? 30 : var.x * 2}' }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.attributes.backup_retention_period?.kind).toBe('unresolved')
  })
})
