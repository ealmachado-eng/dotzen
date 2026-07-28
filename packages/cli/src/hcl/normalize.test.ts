import { describe, it, expect } from 'vitest'
import { normalize, collectUngoverned } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "dyn" {
  ingress {
    from_port   = 22
    to_port     = 22
    cidr_blocks = [var.allowed]
  }
}`

const parsed = {
  resource: {
    aws_security_group: {
      web: [
        {
          ingress: [{ from_port: 22, to_port: 22, cidr_blocks: ['0.0.0.0/0'] }],
        },
      ],
      dyn: [
        {
          ingress: [
            { from_port: 22, to_port: 22, cidr_blocks: ['${var.allowed}'] },
          ],
        },
      ],
    },
    // an unknown type should be skipped (not in the vocabulary)
    aws_fictional_unrecognized: { fn: [{}] },
  },
}

describe('normalize', () => {
  it('maps known resources into the normalized model with line numbers', () => {
    const res = normalize(parsed, 'main.tf', raw)
    const web = res.find((r) => r.name === 'web')
    expect(web?.type).toBe(AwsResource.SecurityGroup)
    expect(web?.file).toBe('main.tf')
    expect(web?.line).toBe(1)
    expect(web?.ingress[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(web?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('marks interpolated CIDRs as unresolved', () => {
    const res = normalize(parsed, 'main.tf', raw)
    const dyn = res.find((r) => r.name === 'dyn')
    expect(dyn?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'unresolved',
      expr: '${var.allowed}',
    })
  })

  it('skips resource types not in the vocabulary', () => {
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).not.toContain('fn')
  })

  describe('collectUngoverned — UTILITY_TYPES silently skipped (ROADMAP #4)', () => {
    it('surfaces a genuinely ungoverned resource type', () => {
      const out = collectUngoverned(
        { resource: { aws_fictional: { x: [{}] } } },
        'main.tf',
        'resource "aws_fictional" "x" {}\n',
      )
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('aws_fictional')
      expect(out[0]?.name).toBe('x')
    })

    it('silently skips random_password (and the other random_* / terraform_data utility types)', () => {
      const parsed = {
        resource: {
          random_password: { pw: [{}] },
          random_string: { s: [{}] },
          random_id: { id: [{}] },
          random_uuid: { u: [{}] },
          terraform_data: { d: [{}] },
          // A real coverage gap must still surface alongside the utilities.
          aws_fictional: { leak: [{}] },
        },
      }
      const out = collectUngoverned(
        parsed,
        'main.tf',
        [
          'resource "random_password" "pw" {}\n',
          'resource "random_string" "s" {}\n',
          'resource "random_id" "id" {}\n',
          'resource "random_uuid" "u" {}\n',
          'resource "terraform_data" "d" {}\n',
          'resource "aws_fictional" "leak" {}\n',
        ].join(''),
      )
      // Only the real gap — utilities are silent.
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('aws_fictional')
      expect(out[0]?.name).toBe('leak')
    })

    it('silently skips data.random_* utility data sources too', () => {
      const out = collectUngoverned(
        { data: { random_password: { pw: [{}] } } },
        'main.tf',
        'data "random_password" "pw" {}\n',
      )
      expect(out).toHaveLength(0)
    })
  })
})
