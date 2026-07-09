import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, TagsInfo } from '../hcl/model'
import { AwsResource, Tag, Effect } from '../vocabulary'

const requireTags: Rule = {
  id: 'required-tags',
  target: { kind: 'all' },
  conditions: [
    { kind: 'mustHaveTags', tags: [Tag.Team, Tag.CostCenter, Tag.Environment] },
  ],
  effect: Effect.Block,
  message: 'Required tags missing: team, cost_center, environment',
}

const res = (tags: TagsInfo): NormalizedResource => ({
  type: AwsResource.S3Bucket,
  name: 'data',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags,
  attributes: {},
})

describe('evaluate (mustHaveTags)', () => {
  it('flags a resource missing required tags', () => {
    const report = evaluate(
      [requireTags],
      [res({ kind: 'resolved', keys: ['team'] })],
    )
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0]?.resource).toBe('aws_s3_bucket.data')
  })

  it('passes when all required tags are present', () => {
    const report = evaluate(
      [requireTags],
      [
        res({
          kind: 'resolved',
          keys: ['team', 'cost_center', 'environment', 'extra'],
        }),
      ],
    )
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('reports couldNotEvaluate when tags are an unresolved reference', () => {
    const report = evaluate([requireTags], [res({ kind: 'unresolved' })])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
    expect(report.couldNotEvaluate[0]?.reason).toMatch(/tags/i)
  })
})
