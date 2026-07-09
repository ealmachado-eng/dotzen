import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `resource "aws_iam_policy" "x" {}`

const admin = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }],
})

const parsed = {
  resource: {
    aws_iam_policy: {
      literal: [{ policy: admin }],
      // hcl2json represents jsonencode(...) as an interpolation string
      encoded: [{ policy: '${jsonencode({ Statement = [] })}' }],
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

  it('marks a jsonencode(...) policy as unresolved', () => {
    expect(by('encoded')?.policy).toEqual({ kind: 'unresolved' })
  })

  it('marks malformed JSON as unresolved', () => {
    expect(by('broken')?.policy).toEqual({ kind: 'unresolved' })
  })

  it('leaves policy undefined when there is no policy argument', () => {
    expect(by('none')?.policy).toBeUndefined()
  })
})
