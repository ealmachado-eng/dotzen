import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

const raw = `resource "google_bigquery_dataset" "ds" {}`

describe('normalize — repeated nested blocks (multi-block flattener)', () => {
  // hcl2json represents repeated `access {}` blocks as an array of block
  // objects. The flattener previously took only v[0] (the first block),
  // silently dropping later blocks — so a public grant in the 2nd access
  // block of a google_bigquery_dataset was invisible to rules. Now every
  // block is collected; a key that recurs across blocks is aggregated into
  // `lists` (so no value is lost), while a key unique to one block stays a
  // scalar in `attributes` (backward-compatible with single-block rules).

  it('captures fields from EVERY access block (not just the first)', () => {
    const parsed = {
      resource: {
        google_bigquery_dataset: {
          ds: [
            {
              dataset_id: 'my_ds',
              access: [
                { role: 'OWNER', user_by_email: 'owner@example.com' },
                { role: 'READER', special_group: 'allAuthenticatedUsers' },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    // Fields unique to one block → scalar attributes.
    expect(res[0]?.attributes?.['access.user_by_email']).toEqual({
      kind: 'literal',
      value: 'owner@example.com',
    })
    expect(res[0]?.attributes?.['access.special_group']).toEqual({
      kind: 'literal',
      value: 'allAuthenticatedUsers',
    })
    // `role` recurs in BOTH blocks → aggregated into lists (order preserved).
    expect(res[0]?.lists?.['access.role']).toEqual({
      kind: 'resolved',
      items: [
        { kind: 'literal', value: 'OWNER' },
        { kind: 'literal', value: 'READER' },
      ],
    })
    // The block path is recorded once.
    expect(res[0]?.blocks).toContain('access')
  })

  it('leaves a single-block dataset unchanged (scalar attributes, no lists)', () => {
    const parsed = {
      resource: {
        google_bigquery_dataset: {
          ds: [
            {
              access: [{ special_group: 'allAuthenticatedUsers' }],
            },
          ],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res[0]?.attributes?.['access.special_group']).toEqual({
      kind: 'literal',
      value: 'allAuthenticatedUsers',
    })
    // No list entry — single block, no collision.
    expect(res[0]?.lists?.['access.special_group']).toBeUndefined()
  })

  it('aggregates a key that recurs across blocks with a public grant', () => {
    // The danger pattern: special_group appears in two blocks, one public.
    // Both values must be visible so denyValue can catch the public one.
    const parsed = {
      resource: {
        google_bigquery_dataset: {
          ds: [
            {
              access: [
                { special_group: 'projectOwners' },
                { special_group: 'allAuthenticatedUsers' },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    expect(res[0]?.lists?.['access.special_group']).toEqual({
      kind: 'resolved',
      items: [
        { kind: 'literal', value: 'projectOwners' },
        { kind: 'literal', value: 'allAuthenticatedUsers' },
      ],
    })
    // Promoted out of attributes (it is now a list, not a scalar).
    expect(res[0]?.attributes?.['access.special_group']).toBeUndefined()
  })

  it('handles three repeated blocks', () => {
    const parsed = {
      resource: {
        google_bigquery_dataset: {
          ds: [
            {
              access: [
                { role: 'OWNER' },
                { role: 'WRITER' },
                { role: 'READER' },
              ],
            },
          ],
        },
      },
    }
    const res = normalize(parsed, 'main.tf', raw)
    const roleList = res[0]?.lists?.['access.role']
    expect(roleList?.kind).toBe('resolved')
    if (roleList?.kind === 'resolved')
      expect(
        roleList.items.map((i) => (i.kind === 'literal' ? i.value : null)),
      ).toEqual(['OWNER', 'WRITER', 'READER'])
  })
})
