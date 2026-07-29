import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'

// hcl2json shape mirrors the SG ingress fixtures: scalars as scalars, lists
// as arrays, nested blocks (`ingress {}` / `egress {}`) as arrays of objects.

const norm = (parsed: object) => {
  const scope = buildScope([parsed as never])
  return normalize(parsed as never, 'main.tf', '', scope)
}

const byName = (parsed: object, name: string) =>
  norm(parsed).find((r) => r.name === name)

describe('normalize — aws_network_acl_rule (standalone) → ingress', () => {
  it('maps an ingress allow rule from 0.0.0.0/0 on port 22', () => {
    const r = byName(
      {
        resource: {
          aws_network_acl_rule: {
            ssh: [
              {
                network_acl_id: '${aws_network_acl.main.id}',
                rule_number: 100,
                rule_action: 'allow',
                egress: false,
                protocol: '6',
                cidr_block: '0.0.0.0/0',
                from_port: 22,
                to_port: 22,
              },
            ],
          },
        },
      },
      'ssh',
    )
    expect(r?.ingress).toEqual([
      {
        fromPort: { kind: 'literal', value: 22 },
        toPort: { kind: 'literal', value: 22 },
        cidrBlocks: [{ kind: 'literal', value: '0.0.0.0/0' }],
      },
    ])
  })

  it('skips an egress rule (egress = true) — not an ingress opening', () => {
    const r = byName(
      {
        resource: {
          aws_network_acl_rule: {
            out: [
              {
                rule_action: 'allow',
                egress: true,
                protocol: '-1',
                cidr_block: '0.0.0.0/0',
                from_port: 0,
                to_port: 0,
              },
            ],
          },
        },
      },
      'out',
    )
    expect(r?.ingress).toHaveLength(0)
  })

  it('skips a ingress DENY rule — restrictive, not an opening', () => {
    const r = byName(
      {
        resource: {
          aws_network_acl_rule: {
            block: [
              {
                rule_action: 'deny',
                egress: false,
                protocol: '6',
                cidr_block: '0.0.0.0/0',
                from_port: 22,
                to_port: 22,
              },
            ],
          },
        },
      },
      'block',
    )
    expect(r?.ingress).toHaveLength(0)
  })

  it('captures an IPv6 source (ipv6_cidr_block) alongside the v4 one', () => {
    const r = byName(
      {
        resource: {
          aws_network_acl_rule: {
            v6: [
              {
                rule_action: 'allow',
                egress: false,
                protocol: '6',
                ipv6_cidr_block: '::/0',
                from_port: 443,
                to_port: 443,
              },
            ],
          },
        },
      },
      'v6',
    )
    expect(r?.ingress[0]?.cidrBlocks).toEqual([
      { kind: 'literal', value: '::/0' },
    ])
  })

  it('includes a rule with an unresolved egress flag honestly (might be ingress)', () => {
    // egress = var.is_public → can't statically tell direction; keep the rule
    // so the engine can degrade to could-not-evaluate rather than silent pass.
    const r = byName(
      {
        variable: { is_public: [{ default: false }] },
        resource: {
          aws_network_acl_rule: {
            dyn: [
              {
                rule_action: 'allow',
                egress: '${var.is_public}',
                protocol: '6',
                cidr_block: '0.0.0.0/0',
                from_port: 22,
                to_port: 22,
              },
            ],
          },
        },
      },
      'dyn',
    )
    expect(r?.ingress).toHaveLength(1)
  })
})

describe('normalize — aws_network_acl inline ingress/egress blocks', () => {
  it('maps an inline ingress {} allow block to an ingress rule', () => {
    const r = byName(
      {
        resource: {
          aws_network_acl: {
            main: [
              {
                subnet_id: '${aws_subnet.main.id}',
                ingress: [
                  {
                    rule_no: 100,
                    action: 'allow',
                    protocol: '6',
                    cidr_block: '0.0.0.0/0',
                    from_port: 22,
                    to_port: 22,
                  },
                ],
              },
            ],
          },
        },
      },
      'main',
    )
    expect(r?.ingress).toEqual([
      {
        fromPort: { kind: 'literal', value: 22 },
        toPort: { kind: 'literal', value: 22 },
        cidrBlocks: [{ kind: 'literal', value: '0.0.0.0/0' }],
      },
    ])
  })

  it('skips inline egress {} blocks (outbound, not ingress)', () => {
    const r = byName(
      {
        resource: {
          aws_network_acl: {
            main: [
              {
                egress: [
                  {
                    action: 'allow',
                    protocol: '-1',
                    cidr_block: '0.0.0.0/0',
                    from_port: 0,
                    to_port: 0,
                  },
                ],
              },
            ],
          },
        },
      },
      'main',
    )
    expect(r?.ingress).toHaveLength(0)
  })

  it('skips inline ingress {} DENY blocks (restrictive)', () => {
    const r = byName(
      {
        resource: {
          aws_network_acl: {
            main: [
              {
                ingress: [
                  {
                    action: 'deny',
                    protocol: '6',
                    cidr_block: '0.0.0.0/0',
                    from_port: 22,
                    to_port: 22,
                  },
                ],
              },
            ],
          },
        },
      },
      'main',
    )
    expect(r?.ingress).toHaveLength(0)
  })
})
