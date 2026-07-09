import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'
import { evaluate } from '../engine/evaluate'
import { Rule } from '../spec/rule'
import {
  AzureResource,
  AzureAttribute,
  Port,
  Cidr,
  Effect,
} from '../vocabulary'

// Minimal hcl2json-shaped input for an azurerm NSG with one inline rule.
const nsg = (rule: Record<string, unknown>) => ({
  resource: {
    azurerm_network_security_group: {
      app: [{ name: 'app-nsg', security_rule: [rule] }],
    },
  },
})

describe('normalize — Azure NSG ingress mapping', () => {
  it('maps an inbound Allow from "*" on port 22 to internet ingress', () => {
    const r = normalize(
      nsg({
        direction: 'Inbound',
        access: 'Allow',
        destination_port_range: '22',
        source_address_prefix: '*',
      }),
      'main.tf',
      '',
    )[0]!
    expect(r.ingress).toHaveLength(1)
    expect(r.ingress[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(r.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: Cidr.Internet,
    })
  })

  it('leaves an internal-source rule out of internet scope (denyIngress passes)', () => {
    const resources = normalize(
      nsg({
        direction: 'Inbound',
        access: 'Allow',
        destination_port_range: '22',
        source_address_prefix: '10.0.0.0/8',
      }),
      'main.tf',
      '',
    )
    const rule: Rule = {
      id: 'nsg',
      target: { kind: 'resource', types: [AzureResource.NetworkSecurityGroup] },
      conditions: [
        { kind: 'denyIngress', ports: [Port.SSH], from: [Cidr.Internet] },
      ],
      effect: Effect.Block,
      message: 'no ssh from internet',
    }
    expect(evaluate([rule], resources).violations).toHaveLength(0)
  })

  it('ignores Outbound and Deny rules for ingress', () => {
    const r = normalize(
      nsg({
        direction: 'Outbound',
        access: 'Allow',
        destination_port_range: '22',
        source_address_prefix: '*',
      }),
      'main.tf',
      '',
    )[0]!
    expect(r.ingress).toHaveLength(0)
  })
})

describe('normalize — Azure generic attribute extraction (no engine change)', () => {
  it('flags a hardcoded SQL admin password via the shared denyLiteral', () => {
    const resources = normalize(
      {
        resource: {
          azurerm_mssql_server: {
            bad: [{ administrator_login_password: 'P@ssw0rd!' }],
          },
        },
      },
      'main.tf',
      '',
    )
    const rule: Rule = {
      id: 'sql-pw',
      target: { kind: 'resource', types: [AzureResource.MssqlServer] },
      conditions: [
        {
          kind: 'denyLiteral',
          attrs: [AzureAttribute.AdministratorLoginPassword],
        },
      ],
      effect: Effect.Block,
      message: 'no hardcoded password',
    }
    expect(evaluate([rule], resources).violations).toHaveLength(1)
  })
})
