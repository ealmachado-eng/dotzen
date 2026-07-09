import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

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
