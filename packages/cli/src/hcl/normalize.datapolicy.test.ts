import { describe, it, expect } from 'vitest'
import { normalize, buildScope, buildDataPolicies } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `data "aws_iam_policy_document" "x" {}`

// hcl2json emits a `data.aws_iam_policy_document` block's `statement {}`
// nested blocks as an array of objects — scalars as scalars, lists as arrays
// (same shape as ingress blocks).
const doc = (
  name: string,
  statements: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) => ({
  data: {
    aws_iam_policy_document: {
      [name]: [{ statement: statements, ...extra }],
    },
  },
})

const policyOf = (parsed: ReturnType<typeof doc>) => {
  const res = normalize(
    parsed as never,
    'main.tf',
    raw,
    buildScope([parsed as never]),
  )
  return res.find(
    (r) => r.type === ('data.aws_iam_policy_document' as AwsResource),
  )?.policy
}

describe('normalize — data.aws_iam_policy_document statement-block parsing', () => {
  it('parses a single Allow "*" statement into a PolicyInfo', () => {
    const p = policyOf(
      doc('admin', [{ effect: 'Allow', actions: ['*'], resources: ['*'] }]),
    )
    expect(p).toEqual({
      kind: 'parsed',
      statements: [
        {
          effect: 'Allow',
          actions: ['*'],
          resources: ['*'],
          notActions: [],
          principals: [],
          conditions: {},
        },
      ],
    })
  })

  it('parses multiple statements', () => {
    const p = policyOf(
      doc('mixed', [
        {
          effect: 'Allow',
          actions: ['s3:GetObject'],
          resources: ['arn:aws:s3:::b/*'],
        },
        { effect: 'Deny', actions: ['*'], resources: ['*'] },
      ]),
    )
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') expect(p.statements).toHaveLength(2)
  })

  it('captures NotAction (the over-broad grant anti-pattern)', () => {
    const p = policyOf(
      doc('notaction', [
        { effect: 'Allow', not_actions: ['kms:Decrypt'], resources: ['*'] },
      ]),
    )
    expect(p).toEqual({
      kind: 'parsed',
      statements: [expect.objectContaining({ notActions: ['kms:Decrypt'] })],
    })
  })

  it('captures Principal "*" (public access)', () => {
    const p = policyOf(
      doc('public', [
        {
          effect: 'Allow',
          actions: ['s3:GetObject'],
          resources: ['arn:aws:s3:::b/*'],
          // hcl2json wraps a `principals {}` nested block as an array.
          principals: [{ type: 'AWS', identifiers: ['*'] }],
        },
      ]),
    )
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') expect(p.statements[0]?.principals).toEqual(['*'])
  })

  it('captures a Condition block (IpAddress aws:SourceIp)', () => {
    const p = policyOf(
      doc('cond', [
        {
          effect: 'Allow',
          actions: ['s3:GetObject'],
          resources: ['*'],
          // hcl2json wraps a `condition {}` nested block as an array.
          condition: [
            {
              test: 'IpAddress',
              variable: 'aws:SourceIp',
              values: ['10.0.0.0/8'],
            },
          ],
        },
      ]),
    )
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') {
      // The data-source condition shape (test/variable/values) maps to the
      // same operator→key→[values] structure as a parsed jsonencode Condition.
      expect(p.statements[0]?.conditions).toEqual({
        IpAddress: { 'aws:SourceIp': ['10.0.0.0/8'] },
      })
    }
  })

  it('parses alongside a literal `policy` attr (resource form wins)', () => {
    // A resource with BOTH statement blocks and a literal policy attr: the
    // literal JSON policy wins (this is the resource form, not the data
    // source form). Only relevant if a non-data-source type carries both.
    const parsed = {
      resource: {
        aws_iam_policy: {
          x: [
            {
              policy:
                '{"Statement":[{"Effect":"Allow","Action":"s3:*","Resource":"*"}]}',
              statement: [{ effect: 'Deny', actions: ['*'], resources: ['*'] }],
            },
          ],
        },
      },
    }
    const r = normalize(parsed as never, 'main.tf', raw).find(
      (x) => x.name === 'x',
    )
    // Literal JSON policy wins; statement blocks ignored.
    expect(r?.policy?.kind).toBe('parsed')
    if (r?.policy?.kind === 'parsed') {
      expect(r.policy.statements).toHaveLength(1)
      expect(r.policy.statements[0]?.effect).toBe('Allow')
    }
  })

  it('returns undefined when the data source has no statement blocks', () => {
    const p = policyOf(doc('empty', []))
    expect(p).toBeUndefined()
  })
})

describe('normalize — data.aws_iam_policy_document cross-file ref resolution', () => {
  it("resolves a resource's policy = data.aws_iam_policy_document.x.json via the index", () => {
    // The data source lives in one parsed root; the consuming resource in
    // another (same directory, different file). buildDataPolicies indexes
    // both roots; normalize threads the index so policyOf can resolve the
    // data-source ref on the consuming resource.
    const dataRoot = doc('admin', [
      { effect: 'Allow', actions: ['*'], resources: ['*'] },
    ])
    const resourceRoot = {
      resource: {
        aws_s3_bucket_policy: {
          p: [{ policy: '${data.aws_iam_policy_document.admin.json}' }],
        },
      },
    }
    const scope = buildScope([dataRoot as never, resourceRoot as never])
    // The index is built from BOTH roots; pass it to normalize.
    // (Mirrors how parseTf builds cross-file scope + threads it.)
    const dataPolicies = buildDataPolicies([dataRoot, resourceRoot])
    const res = normalize(
      resourceRoot as never,
      'bucket.tf',
      '',
      scope,
      undefined,
      undefined,
      undefined,
      undefined,
      dataPolicies,
    )
    const p = res.find((r) => r.name === 'p')?.policy
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') {
      expect(p.statements).toHaveLength(1)
      expect(p.statements[0]?.actions).toEqual(['*'])
    }
  })

  it('leaves the consuming policy unresolved when the data source is absent', () => {
    // No data.aws_iam_policy_document in any root → the ref cannot resolve →
    // unresolved (honest could-not-evaluate), never a guess.
    const resourceRoot = {
      resource: {
        aws_s3_bucket_policy: {
          p: [{ policy: '${data.aws_iam_policy_document.missing.json}' }],
        },
      },
    }
    const dataPolicies = buildDataPolicies([resourceRoot])
    const res = normalize(
      resourceRoot as never,
      'bucket.tf',
      '',
      new Map(),
      undefined,
      undefined,
      undefined,
      undefined,
      dataPolicies,
    )
    expect(res.find((r) => r.name === 'p')?.policy).toEqual({
      kind: 'unresolved',
    })
  })
})
