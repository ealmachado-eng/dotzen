import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect, Block } from '../vocabulary'

const ref = (
  expr: string,
  resolvedRef?: { type: string; name: string },
): NormalizedValue =>
  resolvedRef
    ? { kind: 'unresolved', expr, resolvedRef }
    : { kind: 'unresolved', expr }

const base = (
  type: AwsResource,
  name: string,
  attributes: Record<string, NormalizedValue> = {},
): NormalizedResource => ({
  type,
  name,
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

describe('evaluate — mustHaveAssociated (cross-resource presence)', () => {
  const rule: Rule = {
    id: 's3-sse',
    target: { kind: 'resource', types: [AwsResource.S3Bucket] },
    conditions: [
      {
        kind: 'mustHaveAssociated',
        childType: AwsResource.S3BucketServerSideEncryptionConfiguration,
        via: AwsAttribute.Bucket,
      },
    ],
    effect: Effect.Block,
    message: 'bucket must have server-side encryption configured',
  }

  it('passes a bucket that a SSE-config resource references', () => {
    const bucket = base(AwsResource.S3Bucket, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'data',
      { bucket: ref('${aws_s3_bucket.data.id}') },
    )
    const report = evaluate([rule], [bucket, sse])
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('flags a bucket with no associated SSE-config resource', () => {
    const bucket = base(AwsResource.S3Bucket, 'lonely')
    expect(evaluate([rule], [bucket]).violations).toHaveLength(1)
  })

  it('does not link a SSE-config that references a different bucket', () => {
    const bucket = base(AwsResource.S3Bucket, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'other',
      { bucket: ref('${aws_s3_bucket.somewhere_else.id}') },
    )
    expect(evaluate([rule], [bucket, sse]).violations).toHaveLength(1)
  })

  it('links a SSE-config that references the bucket through a local chain (resolvedRef)', () => {
    // Real modules route the parent ref through a local, e.g.
    //   local.bucket_id = aws_s3_bucket.main.id
    //   bucket          = local.bucket_id
    // normalize surfaces resolvedRef so the engine can link them.
    const bucket = base(AwsResource.S3Bucket, 'main')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'main',
      {
        bucket: ref('${local.bucket_id}', {
          type: 'aws_s3_bucket',
          name: 'main',
        }),
      },
    )
    const report = evaluate([rule], [bucket, sse])
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('does not link a SSE-config whose resolvedRef points at a different bucket', () => {
    // A resolvedRef that names a different bucket is a DEFINITIVE
    // not-this-bucket: the local chain is resolved, so we know the child
    // points elsewhere. This is a violation for `bucket`, not a
    // could-not-evaluate.
    const bucket = base(AwsResource.S3Bucket, 'main')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'other',
      {
        bucket: ref('${local.bucket_id}', {
          type: 'aws_s3_bucket',
          name: 'other_bucket',
        }),
      },
    )
    expect(evaluate([rule], [bucket, sse]).violations).toHaveLength(1)
  })

  it('emits couldNotEvaluate when the via-attr is an unresolvable var/local chain', () => {
    // `bucket = var.bucket_id` with no default and no module input — we
    // cannot know which bucket (if any) this points at, so the parent's
    // mustHaveAssociated degrades to could-not-evaluate instead of a
    // false violation.
    const bucket = base(AwsResource.S3Bucket, 'main')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'main',
      { bucket: ref('${var.bucket_id}') }, // no resolvedRef
    )
    const report = evaluate([rule], [bucket, sse])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
    expect(report.couldNotEvaluate[0]?.resource).toBe('aws_s3_bucket.main')
  })
})

describe('evaluate — mustHaveBlock (same-resource block presence)', () => {
  const rule: Rule = {
    id: 'eks-enc',
    target: { kind: 'resource', types: [AwsResource.EksCluster] },
    conditions: [{ kind: 'mustHaveBlock', block: Block.EncryptionConfig }],
    effect: Effect.Block,
    message: 'EKS cluster must configure envelope encryption',
  }

  it('passes a cluster that declares encryption_config', () => {
    const cluster: NormalizedResource = {
      ...base(AwsResource.EksCluster, 'main', {
        'encryption_config.provider.key_arn': ref('${aws_kms_key.eks.arn}'),
      }),
      lists: {
        'encryption_config.resources': {
          kind: 'resolved',
          items: [{ kind: 'literal', value: 'secrets' }],
        },
      },
    }
    expect(evaluate([rule], [cluster]).violations).toHaveLength(0)
  })

  it('flags a cluster with no encryption_config block', () => {
    const cluster = base(AwsResource.EksCluster, 'plain')
    expect(evaluate([rule], [cluster]).violations).toHaveLength(1)
  })
})

describe('evaluate — denyIfAssociated (cross-resource absence)', () => {
  const noInlineRule: Rule = {
    id: 'iam-user-no-inline',
    target: { kind: 'resource', types: [AwsResource.IamUser] },
    conditions: [
      {
        kind: 'denyIfAssociated',
        childType: AwsResource.IamUserPolicy,
        via: AwsAttribute.User,
      },
    ],
    effect: Effect.Warn,
    message: 'IAM user must not have an inline policy',
  }

  it('passes a user with no inline policy', () => {
    const user = base(AwsResource.IamUser, 'app')
    expect(evaluate([noInlineRule], [user]).violations).toHaveLength(0)
  })

  it('flags a user that an inline policy references', () => {
    const user = base(AwsResource.IamUser, 'app')
    const policy = base(AwsResource.IamUserPolicy, 'app', {
      user: ref('${aws_iam_user.app.name}'),
    })
    const r = evaluate([noInlineRule], [user, policy])
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_iam_user.app')
  })

  it('passes a user whose inline policy references a DIFFERENT user', () => {
    const user1 = base(AwsResource.IamUser, 'app')
    const user2 = base(AwsResource.IamUser, 'other')
    const policy = base(AwsResource.IamUserPolicy, 'other', {
      user: ref('${aws_iam_user.other.name}'),
    })
    const r = evaluate([noInlineRule], [user1, user2, policy])
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_iam_user.other')
  })

  it('degrades to could-not-evaluate when the via attr is unresolvable', () => {
    const user = base(AwsResource.IamUser, 'app')
    const policy = base(AwsResource.IamUserPolicy, 'app', {
      user: ref('${var.user_name}'),
    })
    const r = evaluate([noInlineRule], [user, policy])
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })
})

describe('evaluate — C6 literal-name association (child references parent by label)', () => {
  // A child whose `via` attr is a LITERAL string matching the parent's
  // Terraform label (the `name` in `type.name`) is now linked — closing the
  // documented gap where `bucket = "data"` (literal) failed to associate
  // with `aws_s3_bucket.data`. The match is on the resource label, keyed by
  // `childType|viaAttr` so a literal in an unrelated attr/type cannot
  // cross-link. (ROADMAP #4 — was "rare; documented in the evaluator".)

  const sseRule: Rule = {
    id: 's3-sse',
    target: { kind: 'resource', types: [AwsResource.S3Bucket] },
    conditions: [
      {
        kind: 'mustHaveAssociated',
        childType: AwsResource.S3BucketServerSideEncryptionConfiguration,
        via: AwsAttribute.Bucket,
      },
    ],
    effect: Effect.Block,
    message: 'bucket must have server-side encryption configured',
  }

  const noInlineRule: Rule = {
    id: 'iam-user-no-inline',
    target: { kind: 'resource', types: [AwsResource.IamUser] },
    conditions: [
      {
        kind: 'denyIfAssociated',
        childType: AwsResource.IamUserPolicy,
        via: AwsAttribute.User,
      },
    ],
    effect: Effect.Warn,
    message: 'IAM user must not have an inline policy',
  }

  const lit = (v: string): NormalizedValue => ({ kind: 'literal', value: v })

  it('mustHaveAssociated passes when a child references the parent by literal label', () => {
    const bucket = base(AwsResource.S3Bucket, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'enc',
      { bucket: lit('data') },
    )
    const r = evaluate([sseRule], [bucket, sse])
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('mustHaveAssociated flags when the child literal does NOT match the parent label', () => {
    const bucket = base(AwsResource.S3Bucket, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'enc',
      { bucket: lit('some-other-bucket') },
    )
    const r = evaluate([sseRule], [bucket, sse])
    expect(r.violations).toHaveLength(1)
  })

  it('denyIfAssociated flags a user referenced by an inline policy via literal label', () => {
    const user = base(AwsResource.IamUser, 'app')
    const policy = base(AwsResource.IamUserPolicy, 'p', {
      user: lit('app'),
    })
    const r = evaluate([noInlineRule], [user, policy])
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_iam_user.app')
  })

  it('denyIfAssociated passes when the child literal references a DIFFERENT label', () => {
    const user = base(AwsResource.IamUser, 'app')
    const policy = base(AwsResource.IamUserPolicy, 'p', {
      user: lit('other'),
    })
    const r = evaluate([noInlineRule], [user, policy])
    expect(r.violations).toHaveLength(0)
  })

  it('does not cross-link a literal matching the label but on an unrelated attr/type', () => {
    // A bucket labeled "data" and an SSE config with a literal
    // `kms_key_id = "data"` — the literal matches the label but the rule
    // queries `S3BucketEncryption|bucket`, not `...|kms_key_id`. No link.
    const bucket = base(AwsResource.S3Bucket, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'enc',
      { kms_key_id: lit('data') },
    )
    const r = evaluate([sseRule], [bucket, sse])
    expect(r.violations).toHaveLength(1) // no bucket-link → still violates
  })

  it('does not cross-link a literal matching a label of a DIFFERENT resource type', () => {
    // Two resources labeled "data": a bucket and an IAM user. The no-inline
    // rule queries `IamUserPolicy|user`; an SSE config's literal `bucket`
    // matches "data" but is not an IamUserPolicy. No false flag on the user.
    const user = base(AwsResource.IamUser, 'data')
    const sse = base(
      AwsResource.S3BucketServerSideEncryptionConfiguration,
      'enc',
      { bucket: lit('data') },
    )
    const r = evaluate([noInlineRule], [user, sse])
    expect(r.violations).toHaveLength(0) // SSE config is not an inline policy
  })
})

describe('evaluate — denyIfAssociated / mustHaveAssociated module-scope isolation', () => {
  // Cross-resource associations are scoped by module (file-trace): a child's
  // direct `type.name` ref always points at a parent in its OWN module, so a
  // submodule's child must NOT alias onto a same-named root parent. The
  // dogfood FP: terraform-aws-modules/eks root `aws_iam_role.this` (no inline
  // policy) was flagged because a SUBMODULE's `aws_iam_role_policy` referenced
  // its own `aws_iam_role.this` — same base address, different module.
  const noInlineRule: Rule = {
    id: 'no-inline-policy',
    target: { kind: 'resource', types: [AwsResource.IamRole] },
    conditions: [
      {
        kind: 'denyIfAssociated',
        childType: AwsResource.IamRolePolicy,
        via: AwsAttribute.Role,
      },
    ],
    effect: Effect.Block,
    message: 'no inline policy',
  }
  const roleAt = (file: string): NormalizedResource => ({
    type: AwsResource.IamRole,
    name: 'this',
    file,
    line: 1,
    ingress: [],
    tags: { kind: 'resolved', keys: [] },
    attributes: {},
  })
  const inlinePolicyAt = (file: string): NormalizedResource => ({
    type: AwsResource.IamRolePolicy,
    name: 'this',
    file,
    line: 1,
    ingress: [],
    tags: { kind: 'resolved', keys: [] },
    attributes: {
      role: ref('${aws_iam_role.this.id}', {
        type: 'aws_iam_role',
        name: 'this',
      }),
    },
  })

  it('does NOT flag a root role when only a SUBMODULE has the inline policy', () => {
    // Root role (main.tf) has no inline policy in its module; the submodule
    // (modules/sub/main.tf (sub)) has its own role.this + inline policy.
    // Pre-fix: the root role was falsely flagged (aliasing on the shared
    // `aws_iam_role.this` address). Now: only the submodule role violates,
    // so exactly ONE violation (was two).
    const root = roleAt('main.tf')
    const subRole = roleAt('modules/sub/main.tf (sub)')
    const subPolicy = inlinePolicyAt('modules/sub/main.tf (sub)')
    const r = evaluate([noInlineRule], [root, subRole, subPolicy])
    expect(r.violations).toHaveLength(1)
  })

  it('still flags BOTH modules when each has its own inline policy', () => {
    // Sanity: scoping does not weaken the real catch. Each module's role has
    // its own inline policy → both violate.
    const root = roleAt('main.tf')
    const rootPolicy = inlinePolicyAt('main.tf')
    const subRole = roleAt('modules/sub/main.tf (sub)')
    const subPolicy = inlinePolicyAt('modules/sub/main.tf (sub)')
    const r = evaluate([noInlineRule], [root, rootPolicy, subRole, subPolicy])
    expect(r.violations).toHaveLength(2)
  })
})
