import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import { evaluate } from '../engine/evaluate'
import { Rule } from '../spec/rule'
import { GcpResource, GcpAttribute, Port, Cidr, Effect } from '../vocabulary'

const firewall = (block: Record<string, unknown>) => ({
  resource: { google_compute_firewall: { fw: [block] } },
})

describe('normalize — GCP firewall ingress mapping', () => {
  it('maps an INGRESS allow tcp/22 from 0.0.0.0/0 to internet ingress', () => {
    const r = normalize(
      firewall({
        allow: [{ protocol: 'tcp', ports: ['22', '3389'] }],
        source_ranges: ['0.0.0.0/0'],
      }),
      'main.tf',
      '',
    )[0]!
    expect(r.ingress).toHaveLength(2)
    expect(r.ingress[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(r.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: Cidr.Internet,
    })
  })

  it('ignores EGRESS firewalls for ingress', () => {
    const r = normalize(
      firewall({
        direction: 'EGRESS',
        allow: [{ protocol: 'tcp', ports: ['22'] }],
        source_ranges: ['0.0.0.0/0'],
      }),
      'main.tf',
      '',
    )[0]!
    expect(r.ingress).toHaveLength(0)
  })

  it('an allow block with no ports means every port', () => {
    const resources = normalize(
      firewall({
        allow: [{ protocol: 'tcp' }],
        source_ranges: ['0.0.0.0/0'],
      }),
      'main.tf',
      '',
    )
    const rule: Rule = {
      id: 'fw',
      target: { kind: 'resource', types: [GcpResource.ComputeFirewall] },
      conditions: [
        { kind: 'denyIngress', ports: [Port.RDP], from: [Cidr.Internet] },
      ],
      effect: Effect.Block,
      message: 'no rdp',
    }
    expect(evaluate([rule], resources).violations).toHaveLength(1)
  })
})

describe('normalize — GCP deep-nested Cloud SQL attribute', () => {
  it('flags a public Cloud SQL instance (settings.ip_configuration.ipv4_enabled)', () => {
    const resources = normalize(
      {
        resource: {
          google_sql_database_instance: {
            bad: [
              { settings: [{ ip_configuration: [{ ipv4_enabled: true }] }] },
            ],
          },
        },
      },
      'main.tf',
      '',
    )
    const rule: Rule = {
      id: 'sql-public',
      target: { kind: 'resource', types: [GcpResource.SqlDatabaseInstance] },
      conditions: [{ kind: 'mustBeFalse', attrs: [GcpAttribute.Ipv4Enabled] }],
      effect: Effect.Warn,
      message: 'no public ip',
    }
    expect(evaluate([rule], resources).violations).toHaveLength(1)
  })
})
