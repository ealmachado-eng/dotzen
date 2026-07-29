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

  describe('compound interpolation — prefix${sole_ref}suffix (ROADMAP #5)', () => {
    it('resolves a prefix + sole var ref to a concatenated literal', () => {
      expect(
        cidrOf(root({ cidr_blocks: ['prefix-${var.admin_cidr}'] })),
      ).toEqual({
        kind: 'literal',
        value: 'prefix-0.0.0.0/0',
      })
    })

    it('resolves a suffix-only compound interpolation', () => {
      expect(
        cidrOf(root({ cidr_blocks: ['${var.admin_cidr}-suffix'] })),
      ).toEqual({
        kind: 'literal',
        value: '0.0.0.0/0-suffix',
      })
    })

    it('resolves prefix + suffix around a sole var ref', () => {
      expect(
        cidrOf(root({ cidr_blocks: ['pre-${var.admin_cidr}-suf'] })),
      ).toEqual({
        kind: 'literal',
        value: 'pre-0.0.0.0/0-suf',
      })
    })

    it('resolves through a local chain inside a compound interpolation', () => {
      expect(
        cidrOf(root({ cidr_blocks: ['serviceAccount:${local.chained}'] })),
      ).toEqual({
        kind: 'literal',
        value: 'serviceAccount:0.0.0.0/0',
      })
    })

    it('resolves a number-typed default into the concatenated string', () => {
      const parsed = {
        variable: { port: [{ default: 22 }] },
        resource: {
          aws_security_group: {
            sg: [
              {
                ingress: [
                  { from_port: 22, to_port: 22, cidr_blocks: [':${var.port}'] },
                ],
              },
            ],
          },
        },
      }
      const scope = buildScope([parsed as never])
      const sg = normalize(parsed as never, 'main.tf', raw, scope).find(
        (r) => r.name === 'sg',
      )
      expect(sg?.ingress[0]?.cidrBlocks[0]).toEqual({
        kind: 'literal',
        value: ':22',
      })
    })

    it('leaves a compound interpolation unresolved when the ref has no default', () => {
      expect(
        cidrOf(root({ cidr_blocks: ['prefix-${var.no_default}'] })),
      ).toEqual({
        kind: 'unresolved',
        expr: 'prefix-${var.no_default}',
      })
    })

    it('leaves a compound interpolation unresolved for an unknown ref', () => {
      expect(cidrOf(root({ cidr_blocks: ['prefix-${var.missing}'] }))).toEqual({
        kind: 'unresolved',
        expr: 'prefix-${var.missing}',
      })
    })

    it('leaves a multi-interpolation string unresolved (conservative)', () => {
      expect(
        cidrOf(
          root({ cidr_blocks: ['pre-${var.admin_cidr}-${var.no_default}'] }),
        ),
      ).toEqual({
        kind: 'unresolved',
        expr: 'pre-${var.admin_cidr}-${var.no_default}',
      })
    })

    it('leaves a compound interpolation unresolved when the inner expr is not a sole ref', () => {
      // Compound inner (a ternary) — tryEvalTernary/Concat both refuse; the
      // whole expr stays unresolved honestly.
      expect(
        cidrOf(root({ cidr_blocks: ['prefix-${var.x == "y" ? "a" : "b"}'] })),
      ).toEqual({
        kind: 'unresolved',
        expr: 'prefix-${var.x == "y" ? "a" : "b"}',
      })
    })

    it('leaves a resource-attribute compound interpolation unresolved', () => {
      // The GKE-module pattern: `member = "serviceAccount:${google_sa.x.email}"`.
      // The ref is NOT a var/local/each — the resolver cannot follow it. The
      // string stays unresolved (the engine's denyValue compound-literal rule
      // turns this into a definite PASS — see evaluate denyValue tests).
      // `refAtBottom` still surfaces the bottom resource ref for association
      // linking, but the value itself is unresolved.
      expect(
        cidrOf(
          root({
            cidr_blocks: ['serviceAccount:${google_service_account.x.email}'],
          }),
        ),
      ).toEqual({
        kind: 'unresolved',
        expr: 'serviceAccount:${google_service_account.x.email}',
        resolvedRef: { type: 'google_service_account', name: 'x' },
      })
    })
  })
})
