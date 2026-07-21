import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `resource "aws_iam_policy" "x" {}`

const admin = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }],
})

// hcl2json represents jsonencode(...) as an interpolation string that
// preserves the original HCL source text (newlines, = keys, unquoted
// identifiers) inside ${jsonencode( ... )}. The parser now extracts the
// literal HCL object/array structure from that string; a non-literal
// inner (jsonencode(var.x)/local.x) stays unresolved.
const encodedEmpty = '${jsonencode({ Statement = [] })}'
const encodedFull =
  '${jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = "*", Resource = "*" }] })}'
const encodedVar = '${jsonencode(var.policy)}'
const encodedLocal = '${jsonencode(local.p)}'
const encodedCondition =
  '${jsonencode({ Statement = [{ Effect = "Allow", Action = "s3:GetObject", Resource = "*", Condition = { IpAddress = { "aws:SourceIp" = ["10.0.0.0/8"] } } }] })}'
const encodedMultiline =
  '${jsonencode({\n    Version = "2012-10-17"\n    Statement = [{ Effect = "Allow", Action = "*", Resource = "*" }]\n  })}'
const encodedInterpolatedValue =
  '${jsonencode({ Statement = [{ Effect = "Allow", Action = "*", Resource = "arn:aws:s3:::${var.bucket}" }] })}'

const parsed = {
  resource: {
    aws_iam_policy: {
      literal: [{ policy: admin }],
      encoded: [{ policy: encodedEmpty }],
      encoded_full: [{ policy: encodedFull }],
      encoded_var: [{ policy: encodedVar }],
      encoded_local: [{ policy: encodedLocal }],
      encoded_condition: [{ policy: encodedCondition }],
      encoded_multiline: [{ policy: encodedMultiline }],
      encoded_interp: [{ policy: encodedInterpolatedValue }],
      broken: [{ policy: 'not json' }],
      none: [{ name: 'no-policy' }],
    },
  },
}

describe('normalize — IAM policy parsing', () => {
  const by = (n: string) =>
    normalize(parsed, 'main.tf', raw).find((r) => r.name === n)

  it('parses a literal JSON policy into statements', () => {
    const p = by('literal')?.policy
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') {
      expect(p.statements[0]?.effect).toBe('Allow')
      expect(p.statements[0]?.actions).toEqual(['*'])
      expect(p.statements[0]?.resources).toEqual(['*'])
    }
    expect(by('literal')?.type).toBe(AwsResource.IamPolicy)
  })

  it('parses a jsonencode(...) policy with an empty Statement array', () => {
    const p = by('encoded')?.policy
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') expect(p.statements).toEqual([])
  })

  it('parses a jsonencode(...) policy with a wildcard statement', () => {
    const p = by('encoded_full')?.policy
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') {
      expect(p.statements[0]?.effect).toBe('Allow')
      expect(p.statements[0]?.actions).toEqual(['*'])
      expect(p.statements[0]?.resources).toEqual(['*'])
      expect(p.statements[0]?.notActions).toEqual([])
    }
  })

  it('parses a multi-line jsonencode(...) policy (newlines preserved by hcl2json)', () => {
    const p = by('encoded_multiline')?.policy
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') {
      expect(p.statements[0]?.effect).toBe('Allow')
      expect(p.statements[0]?.actions).toEqual(['*'])
      expect(p.statements[0]?.resources).toEqual(['*'])
    }
  })

  it('parses a jsonencode(...) policy with a Condition block', () => {
    const p = by('encoded_condition')?.policy
    expect(p?.kind).toBe('parsed')
    if (p?.kind === 'parsed') {
      const s = p.statements[0]
      expect(s?.effect).toBe('Allow')
      expect(s?.actions).toEqual(['s3:GetObject'])
      expect(s?.conditions).toEqual({
        IpAddress: { 'aws:SourceIp': ['10.0.0.0/8'] },
      })
    }
  })

  it('marks jsonencode(var.x) as unresolved (non-literal inner)', () => {
    expect(by('encoded_var')?.policy).toEqual({ kind: 'unresolved' })
  })

  it('marks jsonencode(local.x) as unresolved (non-literal inner)', () => {
    expect(by('encoded_local')?.policy).toEqual({ kind: 'unresolved' })
  })

  it('marks a jsonencode with an interpolated string value as unresolved', () => {
    // A `${var.bucket}` inside a string value means we cannot know the
    // resolved policy statically — degrade to could-not-evaluate rather
    // than guess (consistent with the literal-JSON path, which also bails
    // on any `${...}` inside the document).
    expect(by('encoded_interp')?.policy).toEqual({ kind: 'unresolved' })
  })

  it('marks malformed JSON as unresolved', () => {
    expect(by('broken')?.policy).toEqual({ kind: 'unresolved' })
  })

  it('leaves policy undefined when there is no policy argument', () => {
    expect(by('none')?.policy).toBeUndefined()
  })
})
