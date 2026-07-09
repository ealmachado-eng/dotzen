import { describe, it, expect } from 'vitest'
import { rule } from './rule'
import { Tag } from '../vocabulary'

describe('RuleBuilder.mustHaveTags', () => {
  it('produces a mustHaveTags condition and validates', () => {
    const r = rule()
      .allResources()
      .mustHaveTags(Tag.Team, Tag.CostCenter, Tag.Environment)
      .message('Required tags missing')
      .validate(0)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.conditions[0]).toEqual({
        kind: 'mustHaveTags',
        tags: [Tag.Team, Tag.CostCenter, Tag.Environment],
      })
      expect(r.value.target).toEqual({ kind: 'all' })
    }
  })
})
