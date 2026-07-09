import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

const raw = `resource "aws_security_group" "sg" {}`

const parsed = {
  resource: {
    aws_security_group: {
      sg: [
        {
          ingress: [
            { from_port: 22, to_port: 22, cidr_blocks: ['10.0.0.0/8'] },
          ],
          egress: [{ from_port: 0, to_port: 0, cidr_blocks: ['0.0.0.0/0'] }],
        },
      ],
    },
  },
}

describe('normalize — egress extraction', () => {
  const sg = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'sg')

  it('extracts egress rules separately from ingress', () => {
    expect(sg?.ingress).toHaveLength(1)
    expect(sg?.egress).toHaveLength(1)
    expect(sg?.egress?.[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })
})
