import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "dyn" {
  ingress {
    from_port   = 22
    to_port     = 22
    cidr_blocks = [var.allowed]
  }
}`

const parsed = {
  resource: {
    aws_security_group: {
      web: [
        {
          ingress: [{ from_port: 22, to_port: 22, cidr_blocks: ['0.0.0.0/0'] }],
        },
      ],
      dyn: [
        {
          ingress: [
            { from_port: 22, to_port: 22, cidr_blocks: ['${var.allowed}'] },
          ],
        },
      ],
    },
    // an unknown type should be skipped (not in the vocabulary)
    aws_lambda_function: { fn: [{}] },
  },
}

describe('normalize', () => {
  it('maps known resources into the normalized model with line numbers', () => {
    const res = normalize(parsed, 'main.tf', raw)
    const web = res.find((r) => r.name === 'web')
    expect(web?.type).toBe(AwsResource.SecurityGroup)
    expect(web?.file).toBe('main.tf')
    expect(web?.line).toBe(1)
    expect(web?.ingress[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(web?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('marks interpolated CIDRs as unresolved', () => {
    const res = normalize(parsed, 'main.tf', raw)
    const dyn = res.find((r) => r.name === 'dyn')
    expect(dyn?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'unresolved',
      expr: '${var.allowed}',
    })
  })

  it('skips resource types not in the vocabulary', () => {
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).not.toContain('fn')
  })
})
