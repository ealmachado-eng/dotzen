import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { normalizeOutputs } from '../hcl/normalize'
import { NormalizedOutput } from '../hcl/model'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

// A rule targeting outputs (use allResources — output rules aren't typed).
const outputRule = valid(
  rule()
    .allResources()
    .denyInsensitiveSecretOutput(
      'aws_db_instance.master_password',
      'aws_secretsmanager_secret_version.secret_string',
    )
    .message('secret outputs must set sensitive = true'),
)

// A rule with a 3-segment data-source secret descriptor — exercises the
// lastIndexOf('.') split (#6 fix): type=`data.aws_ssm_parameter`, attr=`value`.
const dataSourceSecretRule = valid(
  rule()
    .allResources()
    .denyInsensitiveSecretOutput('data.aws_ssm_parameter.value')
    .message('SSM parameter values in outputs must be sensitive'),
)

const out = (
  o: Partial<NormalizedOutput> & { name: string },
): NormalizedOutput => ({
  name: o.name,
  file: o.file ?? 'main.tf',
  line: o.line ?? 1,
  value: o.value ?? { kind: 'literal', value: 'plain' },
  sensitive: o.sensitive ?? false,
})

describe('evaluate (denyInsensitiveSecretOutput)', () => {
  it('flags a sole secret ref in an insensitive output', () => {
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'db_pw',
          value: {
            kind: 'unresolved',
            expr: '${aws_db_instance.x.master_password}',
          },
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('output.db_pw')
    expect(r.violations[0]?.message).toMatch(/secret/)
  })

  it('passes when sensitive = true (protected)', () => {
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'db_pw',
          sensitive: true,
          value: {
            kind: 'unresolved',
            expr: '${aws_db_instance.x.master_password}',
          },
        }),
      ],
    )
    // The output pass counts a pass for the protected secret output.
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes an output referencing a non-secret attribute', () => {
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'endpoint',
          value: { kind: 'unresolved', expr: '${aws_db_instance.x.endpoint}' },
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a literal output value (no reference)', () => {
    const r = evaluate(
      [outputRule],
      [],
      [out({ name: 'msg', value: { kind: 'literal', value: 'hello' } })],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('degrades to could-not-evaluate when sensitive is an unresolvable var', () => {
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'db_pw',
          sensitive: 'unresolved',
          value: {
            kind: 'unresolved',
            expr: '${aws_db_instance.x.master_password}',
          },
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
    expect(r.couldNotEvaluate[0]?.resource).toBe('output.db_pw')
  })

  it('degrades to could-not-evaluate for a secret ref in a compound expression', () => {
    // `"prefix-${secret}"` — the secret is embedded, so cannot prove safe.
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'mixed',
          value: {
            kind: 'unresolved',
            expr: 'prefix-${aws_db_instance.x.master_password}',
          },
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('evaluates multiple outputs independently', () => {
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'leak',
          value: {
            kind: 'unresolved',
            expr: '${aws_db_instance.x.master_password}',
          },
        }),
        out({ name: 'safe', value: { kind: 'literal', value: 'id' } }),
      ],
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('output.leak')
    expect(r.passed).toBe(1) // 'safe' passed
  })

  it('matches a name-wildcarded secret attr (any resource name)', () => {
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'pw',
          value: {
            kind: 'unresolved',
            expr: '${aws_db_instance.some_other_name.master_password}',
          },
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags a secretsmanager secret_string output', () => {
    const r = evaluate(
      [outputRule],
      [],
      [
        out({
          name: 'sec',
          value: {
            kind: 'unresolved',
            expr: '${aws_secretsmanager_secret_version.s.secret_string}',
          },
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('a denyProvisioner rule and an output rule coexist (separate passes)', () => {
    // Regression: the output condition no-ops in the resource pass and the
    // provisioner condition no-ops in the outputs pass — no cross-contamination.
    const r = evaluate(
      [
        valid(
          rule()
            .resource(
              // an arbitrary resource type with a known enum value
              'aws_instance' as never,
            )
            .denyProvisioner('local-exec')
            .message('no provisioners'),
        ),
        outputRule,
      ],
      [],
      [
        out({
          name: 'leak',
          value: {
            kind: 'unresolved',
            expr: '${aws_db_instance.x.master_password}',
          },
        }),
      ],
    )
    // Only the output leaks (no resources present for the provisioner rule).
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('output.leak')
  })
})

describe('normalizeOutputs', () => {
  const raw = `output "db_password" {
  value     = aws_db_instance.x.master_password
  sensitive = true
}

output "endpoint" {
  value = aws_db_instance.x.endpoint
}

output "flag" {
  value = var.protect
}`

  it('extracts literal sensitive true/false and absent→false', () => {
    const parsed = {
      output: {
        db_password: [
          { value: '${aws_db_instance.x.master_password}', sensitive: true },
        ],
        endpoint: [{ value: '${aws_db_instance.x.endpoint}' }],
      },
    }
    const outs = normalizeOutputs(parsed as never, 'main.tf', raw, new Map())
    const pw = outs.find((o) => o.name === 'db_password')
    expect(pw?.sensitive).toBe(true)
    expect(pw?.value.kind).toBe('unresolved')
    const ep = outs.find((o) => o.name === 'endpoint')
    expect(ep?.sensitive).toBe(false) // absent → false
  })

  it('marks sensitive as unresolved when it is a var ref', () => {
    const parsed = {
      output: {
        flag: [{ value: '${var.protect}', sensitive: '${var.protect}' }],
      },
    }
    const outs = normalizeOutputs(parsed as never, 'main.tf', raw, new Map())
    expect(outs[0]?.sensitive).toBe('unresolved')
  })

  it('finds the output block line', () => {
    const parsed = {
      output: { endpoint: [{ value: '${aws_db_instance.x.endpoint}' }] },
    }
    const outs = normalizeOutputs(parsed as never, 'main.tf', raw, new Map())
    // "output "endpoint"" is on line 6 of raw.
    expect(outs[0]?.line).toBe(6)
  })

  it('resolves a var/local indirection so the secret attr is visible', () => {
    // output "pw" { value = local.db_pw } where local.db_pw bottoms out at the
    // master_password resource ref. resolveValue unwraps the chain so the
    // engine's secret matcher sees the real attr (not the indirection).
    const parsed = {
      locals: [{ db_pw: '${aws_db_instance.x.master_password}' }],
      output: { pw: [{ value: '${local.db_pw}' }] },
    }
    const scope = new Map([
      ['local.db_pw', '${aws_db_instance.x.master_password}'],
    ])
    const outs = normalizeOutputs(parsed as never, 'main.tf', raw, scope)
    const r = evaluate([outputRule], [], outs)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('output.pw')
  })
})

describe('evaluate (denyInsensitiveSecretOutput) — multi-segment data-source attrs (#6 fix)', () => {
  it('flags a sole data.aws_ssm_parameter.<name>.value ref in an insensitive output', () => {
    const outs = [
      out({
        name: 'ssm_pw',
        value: {
          kind: 'unresolved',
          expr: '${data.aws_ssm_parameter.sec.value}',
        },
      }),
    ]
    const r = evaluate([dataSourceSecretRule], [], outs)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('output.ssm_pw')
  })

  it('passes when the data-source value output is sensitive = true', () => {
    const outs = [
      out({
        name: 'ssm_pw',
        sensitive: true,
        value: {
          kind: 'unresolved',
          expr: '${data.aws_ssm_parameter.sec.value}',
        },
      }),
    ]
    const r = evaluate([dataSourceSecretRule], [], outs)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('does not match a different attribute on the same data source', () => {
    const outs = [
      out({
        name: 'ssm_arn',
        value: {
          kind: 'unresolved',
          expr: '${data.aws_ssm_parameter.sec.arn}',
        },
      }),
    ]
    const r = evaluate([dataSourceSecretRule], [], outs)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })
})
