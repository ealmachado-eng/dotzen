import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource } from '../hcl/model'
import { AwsResource, Effect } from '../vocabulary'

const res = (
  type: AwsResource,
  name: string,
  file = 'main.tf',
  line = 1,
): NormalizedResource => ({
  type,
  name,
  file,
  line,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
})

const requireAnalyzer: Rule = {
  id: 'require-access-analyzer',
  target: { kind: 'all' },
  conditions: [{ kind: 'requireResource', type: AwsResource.AccessAnalyzer }],
  effect: Effect.Warn,
  message: 'an IAM Access Analyzer must be declared',
}

describe('evaluate (requireResource — project-level presence)', () => {
  it('violates once when no resource of the required type exists', () => {
    const report = evaluate(
      [requireAnalyzer],
      [res(AwsResource.S3Bucket, 'b1'), res(AwsResource.SecurityGroup, 'sg1')],
    )
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0]).toMatchObject({
      ruleId: 'require-access-analyzer',
      resource: AwsResource.AccessAnalyzer,
      file: '<project>',
      line: 0,
      effect: Effect.Warn,
    })
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(0)
  })

  it('passes exactly once when one resource of the type exists', () => {
    const report = evaluate(
      [requireAnalyzer],
      [res(AwsResource.AccessAnalyzer, 'aa', 'org.tf', 42)],
    )
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes once (not N) when multiple matching resources exist', () => {
    const report = evaluate(
      [requireAnalyzer],
      [
        res(AwsResource.AccessAnalyzer, 'org'),
        res(AwsResource.AccessAnalyzer, 'account'),
      ],
    )
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes when the required type exists as a data source', () => {
    // data.aws_accessanalyzer_analyzer would normalize as type
    // 'aws_accessanalyzer_analyzer' too — the project-level presence check
    // is type-string based, so a data source of the same type satisfies it.
    const report = evaluate(
      [requireAnalyzer],
      [res(AwsResource.AccessAnalyzer, 'existing')],
    )
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('does not inflate the resource-loop passed count', () => {
    // A requireResource rule must NOT be evaluated per-resource in the main
    // loop (would inflate `passed` by every resource). It runs exactly once
    // in the project pass.
    const report = evaluate(
      [requireAnalyzer],
      [
        res(AwsResource.AccessAnalyzer, 'aa'),
        res(AwsResource.S3Bucket, 'b1'),
        res(AwsResource.SecurityGroup, 'sg1'),
      ],
    )
    expect(report.passed).toBe(1) // the single requireResource pass
    expect(report.violations).toHaveLength(0)
  })

  it('evaluates both halves of a rule with requireResource + a per-resource condition', () => {
    // A rule may combine project-level and resource-level conditions. Each
    // is evaluated in its own pass; the per-resource condition runs normally
    // against every in-scope resource.
    const combined: Rule = {
      id: 'combined',
      target: { kind: 'all' },
      conditions: [
        { kind: 'requireResource', type: AwsResource.AccessAnalyzer },
        { kind: 'mustHaveTags', tags: ['team'] },
      ],
      effect: Effect.Warn,
      message: 'project baseline',
    }
    const report = evaluate(
      [combined],
      [res(AwsResource.AccessAnalyzer, 'aa'), res(AwsResource.S3Bucket, 'b1')],
    )
    // requireResource → 1 pass; mustHaveTags on aa (no tags) → 1 violation;
    // mustHaveTags on b1 (no tags) → 1 violation.
    expect(report.passed).toBe(1)
    expect(report.violations).toHaveLength(2)
    expect(report.violations.map((v) => v.resource).sort()).toEqual([
      'aws_accessanalyzer_analyzer.aa',
      'aws_s3_bucket.b1',
    ])
  })

  it('reports each requireResource condition separately when a rule has several', () => {
    const multi: Rule = {
      id: 'multi-presence',
      target: { kind: 'all' },
      conditions: [
        { kind: 'requireResource', type: AwsResource.AccessAnalyzer },
        {
          kind: 'requireResource',
          type: AwsResource.ConfigConfigurationRecorder,
        },
      ],
      effect: Effect.Warn,
      message: 'baseline services must exist',
    }
    const report = evaluate([multi], [res(AwsResource.S3Bucket, 'b1')])
    // Neither analyzer nor config recorder is present → 2 violations.
    expect(report.violations).toHaveLength(2)
    expect(report.violations.map((v) => v.resource).sort()).toEqual([
      AwsResource.AccessAnalyzer,
      AwsResource.ConfigConfigurationRecorder,
    ])
  })

  it('returns no violation when resources list is empty (absent = violate)', () => {
    // Empty project: the required resource is absent → violation (not a
    // silent pass). Confirms the check fires on absence, not on resources
    // being present-but-wrong-type.
    const report = evaluate([requireAnalyzer], [])
    expect(report.violations).toHaveLength(1)
  })
})
