import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'

const raw = `resource "aws_security_group" "sg" {}`

function root(forEach: unknown, locals?: Record<string, unknown>) {
  return {
    locals: locals ? [locals] : [],
    resource: {
      aws_security_group: {
        sg: [
          {
            dynamic: {
              ingress: [
                {
                  for_each: forEach,
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
    },
  }
}

const ingressOf = (parsed: ReturnType<typeof root>) => {
  const scope = buildScope([parsed])
  return normalize(parsed, 'main.tf', raw, scope).find((r) => r.name === 'sg')
    ?.ingress
}

describe('normalize — dynamic block for_each expansion', () => {
  it('expands a resolvable list into concrete ingress rules', () => {
    const ingress = ingressOf(
      root('${local.rules}', {
        rules: [
          { port: 22, cidr: '0.0.0.0/0' },
          { port: 443, cidr: '10.0.0.0/8' },
        ],
      }),
    )
    expect(ingress).toHaveLength(2)
    expect(ingress?.[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(ingress?.[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
    expect(ingress?.[1]?.fromPort).toEqual({ kind: 'literal', value: 443 })
  })

  it('expands a map-typed for_each over its values', () => {
    const ingress = ingressOf(
      root('${local.rules}', {
        rules: { ssh: { port: 22, cidr: '0.0.0.0/0' } },
      }),
    )
    expect(ingress).toHaveLength(1)
    expect(ingress?.[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
  })

  it('keeps values unresolved when the collection cannot be resolved', () => {
    // for_each references a var with no default -> not resolvable
    const parsed = {
      variable: { rules: [{ type: '${list}' }] },
      resource: root('${var.rules}').resource,
    }
    const scope = buildScope([parsed])
    const ingress = normalize(parsed, 'main.tf', raw, scope).find(
      (r) => r.name === 'sg',
    )?.ingress
    expect(ingress).toHaveLength(1)
    expect(ingress?.[0]?.fromPort.kind).toBe('unresolved')
  })
})
