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

describe('normalize — 2-level nested-block attribute (MSK client_broker)', () => {
  // The MSK `encryption_info.encryption_in_transit.client_broker` attribute
  // is two nested blocks deep. Locks that the flattener recurses past one
  // level (the v1.9.16 MSK rule depends on this path resolving).
  const rawMsk = `resource "aws_msk_cluster" "k" {}`
  const parsedMsk = {
    resource: {
      aws_msk_cluster: {
        k: [
          {
            encryption_info: [
              {
                encryption_in_transit: [{ client_broker: 'PLAINTEXT' }],
              },
            ],
          },
        ],
      },
    },
  }
  const k = normalize(parsedMsk, 'main.tf', rawMsk).find((r) => r.name === 'k')

  it('flattens a 2-deep nested block to a dotted attribute', () => {
    expect(
      k?.attributes['encryption_info.encryption_in_transit.client_broker'],
    ).toEqual({ kind: 'literal', value: 'PLAINTEXT' })
  })
})
