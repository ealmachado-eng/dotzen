import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'

// hcl2json shape (verified): `dynamic: { <name>: [ { content: [{ ... }],
// for_each, iterator? } ] }`. The default iterator is the block NAME, so
// content refs use `${<name>.value}` / `${<name>.value.<field>}` (NOT
// `each.*` unless `iterator = "each"` is declared).
describe('normalize — dynamic blocks (non-ingress/egress/tags) expanded into attributes', () => {
  const raw = `resource "azurerm_linux_function_app" "x" {
  dynamic "settings" {
    for_each = var.cfg
    content {
      enabled = settings.value
    }
  }
}`

  it('expands a resolvable list for_each: one content copy per element, iterator substituted', () => {
    const parsed = {
      variable: { cfg: [{ default: [true, false] }] },
      resource: {
        azurerm_linux_function_app: {
          x: [
            {
              dynamic: {
                settings: [
                  {
                    for_each: '${var.cfg}',
                    content: [{ enabled: '${settings.value}' }],
                  },
                ],
              },
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    const x = res[0]!
    // Two elements → two `settings.enabled` values collected; the LAST one
    // wins for the dotted attribute key (both write settings.enabled). The
    // block path `settings` is recorded.
    expect(x.blocks).toContain('settings')
    expect(x.attributes['settings.enabled']).toEqual({
      kind: 'literal',
      value: false, // last element wins
    })
  })

  it('expands a resolvable map for_each and substitutes <iterator>.value.<field>', () => {
    const parsed = {
      variable: {
        cfg: [{ default: { a: { flag: true }, b: { flag: false } } }],
      },
      resource: {
        azurerm_linux_function_app: {
          x: [
            {
              dynamic: {
                settings: [
                  {
                    for_each: '${var.cfg}',
                    content: [{ flag: '${settings.value.flag}' }],
                  },
                ],
              },
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    const x = res[0]!
    expect(x.blocks).toContain('settings')
    expect(x.attributes['settings.flag']).toEqual({
      kind: 'literal',
      value: false, // last map entry (b) wins
    })
  })

  it('keeps content once with unresolved values when for_each is unresolvable (honest)', () => {
    // No default → for_each unresolvable → one content, values unresolved.
    const parsed = {
      variable: { cfg: [{}] },
      resource: {
        azurerm_linux_function_app: {
          x: [
            {
              dynamic: {
                settings: [
                  {
                    for_each: '${var.cfg}',
                    content: [{ enabled: '${settings.value}' }],
                  },
                ],
              },
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    const x = res[0]!
    // Block path still recorded (the dynamic block IS declared).
    expect(x.blocks).toContain('settings')
    const enabled = x.attributes['settings.enabled']
    expect(enabled?.kind).toBe('unresolved')
    if (enabled?.kind === 'unresolved')
      expect(enabled.expr).toBe('${settings.value}')
  })

  it('records the block path so mustHaveBlock/denyBlockPresence see a dynamic block', () => {
    const parsed = {
      variable: { cfg: [{ default: ['a'] }] },
      resource: {
        azurerm_linux_function_app: {
          x: [
            {
              dynamic: {
                settings: [
                  {
                    for_each: '${var.cfg}',
                    content: [{ enabled: '${settings.value}' }],
                  },
                ],
              },
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res[0]?.blocks).toContain('settings')
  })

  it('does NOT expand dynamic "ingress" into attributes (dedicated extractor handles it)', () => {
    // A dynamic ingress block must feed IngressRules (via dynamicBlocks),
    // NOT leak `ingress.*` attributes. Verifies no double-handling.
    const parsed = {
      variable: { cidrs: [{ default: ['10.0.0.0/8'] }] },
      resource: {
        aws_security_group: {
          x: [
            {
              dynamic: {
                ingress: [
                  {
                    for_each: '${var.cidrs}',
                    content: [
                      {
                        from_port: 22,
                        to_port: 22,
                        protocol: 'tcp',
                        cidr_blocks: ['${ingress.value}'],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    const x = res[0]!
    // Ingress is produced as an IngressRule, not as attributes.
    expect(x.ingress).toHaveLength(1)
    expect(x.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '10.0.0.0/8',
    })
    // No ingress.* attributes leaked from the dynamic expansion.
    expect(x.attributes['ingress.from_port']).toBeUndefined()
    expect(x.attributes['ingress.protocol']).toBeUndefined()
    // And `ingress` is not recorded as a block path by collect.
    expect(x.blocks).not.toContain('ingress')
  })

  it('expands a dynamic block nested inside another block (prefix chains)', () => {
    // `network_interface { dynamic "access_config" { ... } }` → attributes
    // under `network_interface.access_config.*`.
    const parsed = {
      variable: { cfg: [{ default: [true] }] },
      resource: {
        google_compute_instance: {
          x: [
            {
              network_interface: [
                {
                  dynamic: {
                    access_config: [
                      {
                        for_each: '${var.cfg}',
                        content: [{ nat_ip: '${access_config.value}' }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    const x = res[0]!
    expect(x.blocks).toContain('network_interface')
    expect(x.blocks).toContain('network_interface.access_config')
    expect(x.attributes['network_interface.access_config.nat_ip']).toEqual({
      kind: 'literal',
      value: true,
    })
  })

  it('honors an explicit iterator = "each" (substitutes each.value)', () => {
    const parsed = {
      variable: { cfg: [{ default: ['on', 'off'] }] },
      resource: {
        azurerm_linux_function_app: {
          x: [
            {
              dynamic: {
                settings: [
                  {
                    iterator: 'each',
                    for_each: '${var.cfg}',
                    content: [{ enabled: '${each.value}' }],
                  },
                ],
              },
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed])
    const res = normalize(parsed, 'main.tf', raw, scope)
    expect(res[0]?.attributes['settings.enabled']).toEqual({
      kind: 'literal',
      value: 'off', // last element wins
    })
  })
})
