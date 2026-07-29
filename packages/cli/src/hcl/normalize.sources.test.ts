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

  it('models the legacy aws_security_group_rule (type=ingress) as ingress', () => {
    const parsed = {
      resource: {
        aws_security_group_rule: {
          ssh: [
            {
              type: 'ingress',
              from_port: 22,
              to_port: 22,
              protocol: 'tcp',
              cidr_blocks: ['0.0.0.0/0'],
            },
          ],
        },
      },
    }
    const ssh = normalize(parsed as never, 'main.tf', raw).find(
      (r) => r.name === 'ssh',
    )
    expect(ssh?.type).toBe(AwsResource.SecurityGroupRule)
    expect(ssh?.ingress).toHaveLength(1)
    expect(ssh?.ingress[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(ssh?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('skips a legacy aws_security_group_rule with type = egress', () => {
    const parsed = {
      resource: {
        aws_security_group_rule: {
          out: [
            {
              type: 'egress',
              from_port: 0,
              to_port: 0,
              protocol: '-1',
              cidr_blocks: ['0.0.0.0/0'],
            },
          ],
        },
      },
    }
    const out = normalize(parsed as never, 'main.tf', raw).find(
      (r) => r.name === 'out',
    )
    expect(out?.ingress).toHaveLength(0)
  })

  it('models aws_vpc_security_group_egress_rule as an egress source', () => {
    const parsed = {
      resource: {
        aws_vpc_security_group_egress_rule: {
          out: [
            {
              from_port: 443,
              to_port: 443,
              ip_protocol: 'tcp',
              cidr_ipv4: '0.0.0.0/0',
              security_group_id: '${aws_security_group.dyn.id}',
            },
          ],
        },
      },
    }
    const out = normalize(parsed as never, 'main.tf', raw).find(
      (r) => r.name === 'out',
    )
    expect(out?.type).toBe(AwsResource.VpcSecurityGroupEgressRule)
    expect(out?.egress).toHaveLength(1)
    expect(out?.egress?.[0]?.fromPort).toEqual({ kind: 'literal', value: 443 })
    expect(out?.egress?.[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })
})
