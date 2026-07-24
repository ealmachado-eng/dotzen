import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import {
  normalize,
  buildScope,
  providerRegions,
  mergeProviderRegions,
} from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'
import { AwsResource, AwsAttribute } from '../vocabulary'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

describe('providerRegions — extraction', () => {
  it('builds an alias→region map from provider blocks', () => {
    const parsed = {
      provider: {
        aws: [{ region: 'us-east-1' }, { alias: 'eu', region: 'eu-west-1' }],
        google: [{ region: 'europe-west1' }],
      },
    }
    const map = providerRegions([parsed as never])
    expect(map.get('')).toBe('us-east-1')
    expect(map.get('eu')).toBe('eu-west-1')
    // google has no alias → also keyed '' but first-write wins (aws got there first)
    expect(map.get('')).toBe('us-east-1')
  })

  it('returns an empty map when no provider blocks', () => {
    expect(providerRegions([{} as never]).size).toBe(0)
  })

  it('mergeProviderRegions: child overrides parent aliases', () => {
    const parent = new Map([
      ['', 'us-east-1'],
      ['eu', 'eu-west-1'],
    ])
    const child = new Map([['eu', 'eu-central-1']])
    const merged = mergeProviderRegions(parent, child)
    expect(merged.get('')).toBe('us-east-1')
    expect(merged.get('eu')).toBe('eu-central-1')
  })

  it('mergeProviderRegions: child inherits parent when child is empty', () => {
    const parent = new Map([['', 'us-east-1']])
    const merged = mergeProviderRegions(parent, undefined)
    expect(merged.get('')).toBe('us-east-1')
  })
})

describe('normalize — providerRegion resolution', () => {
  it('resolves a default-provider resource to the default region', () => {
    const parsed = {
      provider: { aws: [{ region: 'us-east-1' }] },
      resource: { aws_instance: { x: [{ ami: 'ami-1' }] } },
    }
    const scope = buildScope([parsed as never])
    const regions = providerRegions([parsed as never])
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      scope,
      undefined,
      undefined,
      undefined,
      regions,
    )
    expect(res[0]?.providerRegion).toEqual({
      kind: 'literal',
      value: 'us-east-1',
    })
  })

  it('resolves an aliased-provider resource to the aliased region', () => {
    const parsed = {
      provider: {
        aws: [{ region: 'us-east-1' }, { alias: 'eu', region: 'eu-west-1' }],
      },
      resource: {
        aws_instance: {
          x: [{ ami: 'ami-1', provider: '${aws.eu}' }],
          y: [{ ami: 'ami-2' }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const regions = providerRegions([parsed as never])
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      scope,
      undefined,
      undefined,
      undefined,
      regions,
    )
    expect(res.find((r) => r.name === 'x')?.providerRegion).toEqual({
      kind: 'literal',
      value: 'eu-west-1',
    })
    expect(res.find((r) => r.name === 'y')?.providerRegion).toEqual({
      kind: 'literal',
      value: 'us-east-1',
    })
  })

  it('providerRegion is undefined when no provider block declares a region', () => {
    const parsed = { resource: { aws_instance: { x: [{ ami: 'ami-1' }] } } }
    const scope = buildScope([parsed as never])
    const res = normalize(parsed as never, 'main.tf', '', scope)
    expect(res[0]?.providerRegion).toBeUndefined()
  })
})

describe('evaluate (denyNonApprovedRegion) — GDPR/LGPD residency', () => {
  const euOnly = valid(
    rule()
      .allResources()
      .denyNonApprovedRegion('eu-west-1', 'eu-central-1', 'europe-west1')
      .message('Personal data must not leave EU regions (GDPR Art. 44)'),
  )

  it('passes a resource in an approved EU region', () => {
    const parsed = {
      provider: { aws: [{ region: 'eu-west-1' }] },
      resource: { aws_s3_bucket: { x: [{}] } },
    }
    const scope = buildScope([parsed as never])
    const regions = providerRegions([parsed as never])
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      scope,
      undefined,
      undefined,
      undefined,
      regions,
    )
    const r = evaluate([euOnly], res)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a resource in a non-EU region', () => {
    const parsed = {
      provider: { aws: [{ region: 'us-east-1' }] },
      resource: { aws_s3_bucket: { x: [{}] } },
    }
    const scope = buildScope([parsed as never])
    const regions = providerRegions([parsed as never])
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      scope,
      undefined,
      undefined,
      undefined,
      regions,
    )
    const r = evaluate([euOnly], res)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_s3_bucket.x')
  })

  it('degrades to could-not-evaluate when region is unknown', () => {
    const parsed = { resource: { aws_s3_bucket: { x: [{}] } } }
    const scope = buildScope([parsed as never])
    const res = normalize(parsed as never, 'main.tf', '', scope)
    const r = evaluate([euOnly], res)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('respects explicit provider alias: EU resource passes, US flagged', () => {
    const parsed = {
      provider: {
        aws: [{ region: 'us-east-1' }, { alias: 'eu', region: 'eu-west-1' }],
      },
      resource: {
        aws_s3_bucket: {
          eu_bucket: [{ provider: '${aws.eu}' }],
          us_bucket: [{}],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const regions = providerRegions([parsed as never])
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      scope,
      undefined,
      undefined,
      undefined,
      regions,
    )
    const r = evaluate([euOnly], res)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_s3_bucket.us_bucket')
    // eu_bucket passed
    expect(r.passed).toBe(1)
  })
})

describe('evaluate — .region() scoping', () => {
  const euEncrypted = valid(
    rule()
      .resource(AwsResource.DbInstance)
      .region('eu-west-1', 'eu-central-1')
      .mustBeTrue(AwsAttribute.StorageEncrypted)
      .message('EU-region DBs must encrypt storage (GDPR Art. 32)'),
  )

  it('applies only to resources in the scoped regions', () => {
    const parsed = {
      provider: {
        aws: [{ region: 'us-east-1' }, { alias: 'eu', region: 'eu-west-1' }],
      },
      resource: {
        aws_db_instance: {
          eu_db: [{ provider: '${aws.eu}', storage_encrypted: false }],
          us_db: [{ storage_encrypted: false }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    const regions = providerRegions([parsed as never])
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      scope,
      undefined,
      undefined,
      undefined,
      regions,
    )
    const r = evaluate([euEncrypted], res)
    // eu_db is in eu-west-1 (scoped) → violation. us_db is in us-east-1 (not
    // scoped) → skipped (no violation, no pass).
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_db_instance.eu_db')
  })
})
