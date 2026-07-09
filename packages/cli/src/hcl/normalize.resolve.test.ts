import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'

const raw = `resource "aws_security_group" "sg" {}`

function root(extra: Record<string, unknown>) {
  return {
    variable: {
      admin_cidr: [{ default: '0.0.0.0/0', type: '${string}' }],
      no_default: [{ type: '${string}' }],
    },
    locals: [{ chained: '${var.admin_cidr}' }],
    resource: {
      aws_security_group: {
        sg: [{ ingress: [{ from_port: 22, to_port: 22, ...extra }] }],
      },
    },
  }
}

const cidrOf = (parsed: ReturnType<typeof root>) => {
  const scope = buildScope([parsed])
  const sg = normalize(parsed, 'main.tf', raw, scope).find(
    (r) => r.name === 'sg',
  )
  return sg?.ingress[0]?.cidrBlocks[0]
}

describe('normalize — var/local resolution', () => {
  it('resolves a sole var reference to its default literal', () => {
    expect(cidrOf(root({ cidr_blocks: ['${var.admin_cidr}'] }))).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('resolves a local that chains to a var', () => {
    expect(cidrOf(root({ cidr_blocks: ['${local.chained}'] }))).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('leaves a var without a default unresolved', () => {
    expect(cidrOf(root({ cidr_blocks: ['${var.no_default}'] }))).toEqual({
      kind: 'unresolved',
      expr: '${var.no_default}',
    })
  })

  it('leaves an unknown reference unresolved', () => {
    expect(cidrOf(root({ cidr_blocks: ['${var.missing}'] }))).toEqual({
      kind: 'unresolved',
      expr: '${var.missing}',
    })
  })

  it('leaves a compound interpolation unresolved', () => {
    expect(cidrOf(root({ cidr_blocks: ['prefix-${var.admin_cidr}'] }))).toEqual(
      {
        kind: 'unresolved',
        expr: 'prefix-${var.admin_cidr}',
      },
    )
  })
})
