import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `resource "aws_security_group" "dyn" {}
resource "aws_vpc_security_group_ingress_rule" "ssh" {}`

const parsed = {
  resource: {
    aws_security_group: {
      dyn: [
        {
          dynamic: {
            ingress: [
              {
                for_each: '${local.rules}',
                content: [
                  {
                    from_port: '${ingress.value.port}',
                    to_port: '${ingress.value.port}',
                    cidr_blocks: ['${ingress.value.cidr}'],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    aws_vpc_security_group_ingress_rule: {
      ssh: [
        {
          from_port: 22,
          to_port: 22,
          ip_protocol: 'tcp',
          cidr_ipv4: '0.0.0.0/0',
          security_group_id: '${aws_security_group.dyn.id}',
        },
      ],
    },
  },
}

describe('normalize — additional ingress sources', () => {
  it('expands dynamic "ingress" blocks (values stay unresolved)', () => {
    const dyn = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'dyn')
    expect(dyn?.ingress).toHaveLength(1)
    expect(dyn?.ingress[0]?.fromPort.kind).toBe('unresolved')
    expect(dyn?.ingress[0]?.cidrBlocks[0]?.kind).toBe('unresolved')
  })

  it('models aws_vpc_security_group_ingress_rule as an ingress source', () => {
    const ssh = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'ssh')
    expect(ssh?.type).toBe(AwsResource.VpcSecurityGroupIngressRule)
    expect(ssh?.ingress).toHaveLength(1)
    expect(ssh?.ingress[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(ssh?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })
})
