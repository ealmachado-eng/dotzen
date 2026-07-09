import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

const raw = `resource "aws_db_instance" "d" {}`

const parsed = {
  resource: {
    aws_db_instance: {
      d: [
        {
          identifier: 'db1',
          storage_encrypted: false,
          publicly_accessible: true,
          multi_az: '${var.multi_az}',
          tags: { team: 'core' },
        },
      ],
    },
  },
}

describe('normalize — scalar attributes', () => {
  const d = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'd')

  it('captures literal boolean and string attributes', () => {
    expect(d?.attributes.storage_encrypted).toEqual({
      kind: 'literal',
      value: false,
    })
    expect(d?.attributes.publicly_accessible).toEqual({
      kind: 'literal',
      value: true,
    })
    expect(d?.attributes.identifier).toEqual({ kind: 'literal', value: 'db1' })
  })

  it('marks interpolated attributes as unresolved', () => {
    expect(d?.attributes.multi_az).toEqual({
      kind: 'unresolved',
      expr: '${var.multi_az}',
    })
  })

  it('does not fold nested blocks (tags) into scalar attributes', () => {
    expect(d?.attributes.tags).toBeUndefined()
  })
})
