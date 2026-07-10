import { describe, it, expect } from 'vitest'
import { normalize, buildScope } from './normalize'

const raw = `resource "aws_s3_bucket" "tagged" {}
resource "aws_s3_bucket" "untagged" {}
resource "aws_s3_bucket" "dynamic_tags" {}`

const parsed = {
  resource: {
    aws_s3_bucket: {
      tagged: [{ tags: { team: 'core', cost_center: 'cc1' } }],
      untagged: [{}],
      dynamic_tags: [{ tags: '${var.common_tags}' }],
    },
  },
}

describe('normalize — tags', () => {
  const res = normalize(parsed, 'main.tf', raw)
  const byName = (n: string) => res.find((r) => r.name === n)

  it('extracts present tag keys from a literal map', () => {
    expect(byName('tagged')?.tags).toEqual({
      kind: 'resolved',
      keys: ['team', 'cost_center'],
    })
  })

  it('treats an absent tags block as resolved-but-empty', () => {
    expect(byName('untagged')?.tags).toEqual({ kind: 'resolved', keys: [] })
  })

  it('treats an interpolated tags expression as unresolved', () => {
    expect(byName('dynamic_tags')?.tags).toEqual({ kind: 'unresolved' })
  })
})

describe('normalize — tags reference + merge resolution', () => {
  const norm = (parsed: object) =>
    normalize(parsed as never, 'main.tf', '', buildScope([parsed as never]))[0]!

  it('resolves a sole local ref to a plain map (complete)', () => {
    const r = norm({
      locals: [{ common: { team: 'a', cost_center: 'b' } }],
      resource: { aws_s3_bucket: { x: [{ tags: '${local.common}' }] } },
    })
    expect(r.tags).toEqual({ kind: 'resolved', keys: ['team', 'cost_center'] })
  })

  it('extracts literal keys from merge(<literal>, var.tags) as PARTIAL', () => {
    const r = norm({
      resource: {
        aws_s3_bucket: {
          x: [
            { tags: '${merge({ team = "a", cost_center = "b" }, var.tags)}' },
          ],
        },
      },
    })
    expect(r.tags.kind).toBe('partial')
    if (r.tags.kind === 'partial')
      expect(r.tags.keys.sort()).toEqual(['cost_center', 'team'])
  })

  it('follows a local ref INTO a merge and unions the keys (partial)', () => {
    const r = norm({
      locals: [{ common: '${merge({ Name = "n", team = "a" }, var.tags)}' }],
      resource: {
        aws_s3_bucket: {
          x: [{ tags: '${merge(local.common, { extra = "e" })}' }],
        },
      },
    })
    expect(r.tags.kind).toBe('partial')
    if (r.tags.kind === 'partial')
      expect(r.tags.keys.sort()).toEqual(['Name', 'extra', 'team'])
  })

  it('stays unresolved for a var ref with no known value', () => {
    const r = norm({
      resource: { aws_s3_bucket: { x: [{ tags: '${var.tags}' }] } },
    })
    expect(r.tags).toEqual({ kind: 'unresolved' })
  })
})
