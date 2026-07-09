import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

const raw = `resource "aws_eks_cluster" "c" {}`

const parsed = {
  resource: {
    aws_eks_cluster: {
      c: [
        {
          enabled_cluster_log_types: ['api', 'audit'],
          vpc_config: [
            {
              endpoint_public_access: true,
              public_access_cidrs: ['0.0.0.0/0'],
            },
          ],
        },
      ],
    },
  },
}

describe('normalize — list-valued attributes', () => {
  const c = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'c')

  it('captures a top-level list', () => {
    expect(c?.lists?.enabled_cluster_log_types).toEqual({
      kind: 'resolved',
      items: [
        { kind: 'literal', value: 'api' },
        { kind: 'literal', value: 'audit' },
      ],
    })
  })

  it('captures a nested list with a dotted key', () => {
    expect(c?.lists?.['vpc_config.public_access_cidrs']).toEqual({
      kind: 'resolved',
      items: [{ kind: 'literal', value: '0.0.0.0/0' }],
    })
  })

  it('still captures the nested scalar as an attribute', () => {
    expect(c?.attributes['vpc_config.endpoint_public_access']).toEqual({
      kind: 'literal',
      value: true,
    })
  })
})
