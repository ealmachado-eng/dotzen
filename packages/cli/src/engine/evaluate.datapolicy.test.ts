import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource } from '../hcl/model'
import { AwsResource, Effect } from '../vocabulary'

/**
 * End-to-end contract test for `data.aws_iam_policy_document` resolution
 * (ROADMAP #1). The normalize layer now resolves a consuming resource's
 * `policy = data.aws_iam_policy_document.x.json` to the data source's
 * parsed statements (cross-file via `buildDataPolicies`). This test pins
 * the ENGINE half of that contract: a NormalizedResource whose `policy`
 * carries the resolved statements (the shape normalize produces) is
 * judged exactly like a literal-JSON policy — `denyIamWildcard` fires on
 * `Action: "*"`, `denyPublicPrincipal` fires on `Principal: "*"`.
 *
 * The normalize-layer resolution itself is pinned in
 * `normalize.datapolicy.test.ts`.
 */

// Shape mirrors what `policyOf(block, dataPolicies)` now returns for a
// consuming resource whose `policy = data.aws_iam_policy_document.x.json`
// resolved through the cross-file index — identical to a parsed literal
// JSON / jsonencode policy.
const bucketPolicy = (
  policy: NormalizedResource['policy'],
): NormalizedResource => ({
  type: AwsResource.S3BucketPolicy,
  name: 'p',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
  policy,
})

const noWildcard: Rule = {
  id: 'no-iam-wildcard',
  target: { kind: 'resource', types: [AwsResource.S3BucketPolicy] },
  conditions: [{ kind: 'denyIamWildcard' }],
  effect: Effect.Block,
  message: 'no wildcard actions',
}

describe('evaluate — data.aws_iam_policy_document resolved policy (ROADMAP #1)', () => {
  it('flags an Allow Action "*" sourced from a data.aws_iam_policy_document', () => {
    // This is the resolved shape normalize produces for:
    //   data "aws_iam_policy_document" "admin" {
    //     statement { effect = "Allow"; actions = ["*"]; resources = ["*"] }
    //   }
    //   resource "aws_s3_bucket_policy" "p" {
    //     policy = data.aws_iam_policy_document.admin.json
    //   }
    const r = bucketPolicy({
      kind: 'parsed',
      statements: [
        {
          effect: 'Allow',
          actions: ['*'],
          resources: ['*'],
          notActions: [],
          principals: [],
          conditions: {},
        },
      ],
    })
    const report = evaluate([noWildcard], [r])
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('passes a least-privilege policy sourced from a data.aws_iam_policy_document', () => {
    const r = bucketPolicy({
      kind: 'parsed',
      statements: [
        {
          effect: 'Allow',
          actions: ['s3:GetObject'],
          resources: ['arn:aws:s3:::b/*'],
          notActions: [],
          principals: [],
          conditions: {},
        },
      ],
    })
    const report = evaluate([noWildcard], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('still degrades to couldNotEvaluate when the data source ref did NOT resolve', () => {
    // If the data source was absent (or its statements did not parse),
    // normalize leaves `policy = { kind: 'unresolved' }` — the engine
    // honestly reports couldNotEvaluate, never a silent pass.
    const r = bucketPolicy({ kind: 'unresolved' })
    const report = evaluate([noWildcard], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
  })
})
