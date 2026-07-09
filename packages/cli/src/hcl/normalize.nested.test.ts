import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

const raw = `resource "aws_instance" "web" {}`

const parsed = {
  resource: {
    aws_instance: {
      web: [
        {
          instance_type: 't3.micro',
          metadata_options: [{ http_tokens: 'required' }],
          root_block_device: [{ encrypted: true }],
          tags: { team: 'core' },
        },
      ],
    },
  },
}

describe('normalize — nested-block attributes', () => {
  const web = normalize(parsed, 'main.tf', raw).find((r) => r.name === 'web')

  it('flattens a nested block to a dotted attribute', () => {
    expect(web?.attributes['metadata_options.http_tokens']).toEqual({
      kind: 'literal',
      value: 'required',
    })
    expect(web?.attributes['root_block_device.encrypted']).toEqual({
      kind: 'literal',
      value: true,
    })
  })

  it('keeps top-level scalars and does not flatten tags', () => {
    expect(web?.attributes.instance_type).toEqual({
      kind: 'literal',
      value: 't3.micro',
    })
    expect(web?.attributes['tags.team']).toBeUndefined()
  })
})
