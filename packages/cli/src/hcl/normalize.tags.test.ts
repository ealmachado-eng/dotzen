import { describe, it, expect } from 'vitest'
import { normalize, buildScope, providerDefaults } from './normalize'

const raw = `resource "aws_s3_bucket" "tagged" {}
resource "aws_s3_bucket" "untagged" {}
resource "aws_s3_bucket" "dynamic_tags" {}`

const parsed = {
  resource: {
    aws_s3_bucket: {
      tagged: [{ tags: { team: 'core', cost_center: 'cc1' } }],
      untagged: [{}],
      dynamic_tags: [{ tags: '${var.common_tags}' }],
    },
  },
}

describe('normalize — tags', () => {
  const res = normalize(parsed, 'main.tf', raw)
  const byName = (n: string) => res.find((r) => r.name === n)

  it('extracts present tag keys from a literal map', () => {
    expect(byName('tagged')?.tags).toEqual({
      kind: 'resolved',
      keys: ['team', 'cost_center'],
    })
  })

  it('treats an absent tags block as resolved-but-empty', () => {
    expect(byName('untagged')?.tags).toEqual({ kind: 'resolved', keys: [] })
  })

  it('treats an interpolated tags expression as unresolved', () => {
    expect(byName('dynamic_tags')?.tags).toEqual({ kind: 'unresolved' })
  })
})

describe('normalize — tags reference + merge resolution', () => {
  const norm = (parsed: object) =>
    normalize(parsed as never, 'main.tf', '', buildScope([parsed as never]))[0]!

  it('resolves a sole local ref to a plain map (complete)', () => {
    const r = norm({
      locals: [{ common: { team: 'a', cost_center: 'b' } }],
      resource: { aws_s3_bucket: { x: [{ tags: '${local.common}' }] } },
    })
    expect(r.tags).toEqual({ kind: 'resolved', keys: ['team', 'cost_center'] })
  })

  it('extracts literal keys from merge(<literal>, var.tags) as PARTIAL', () => {
    const r = norm({
      resource: {
        aws_s3_bucket: {
          x: [
            { tags: '${merge({ team = "a", cost_center = "b" }, var.tags)}' },
          ],
        },
      },
    })
    expect(r.tags.kind).toBe('partial')
    if (r.tags.kind === 'partial')
      expect(r.tags.keys.sort()).toEqual(['cost_center', 'team'])
  })

  it('follows a local ref INTO a merge and unions the keys (partial)', () => {
    const r = norm({
      locals: [{ common: '${merge({ Name = "n", team = "a" }, var.tags)}' }],
      resource: {
        aws_s3_bucket: {
          x: [{ tags: '${merge(local.common, { extra = "e" })}' }],
        },
      },
    })
    expect(r.tags.kind).toBe('partial')
    if (r.tags.kind === 'partial')
      expect(r.tags.keys.sort()).toEqual(['Name', 'extra', 'team'])
  })

  it('stays unresolved for a var ref with no known value', () => {
    const r = norm({
      resource: { aws_s3_bucket: { x: [{ tags: '${var.tags}' }] } },
    })
    expect(r.tags).toEqual({ kind: 'unresolved' })
  })
})

// When module-following threads a caller's concrete tag map into var.tags,
// merge(<literal>, var.tags) becomes fully knowable — so a genuinely missing
// required tag must be a provable RESOLVED set, not a partial one.
describe('normalize — merge() with a concrete threaded var.tags', () => {
  it('resolves merge(<literal>, var.tags) as COMPLETE when var.tags is a concrete map', () => {
    const parsed = {
      resource: {
        aws_db_instance: {
          x: [
            {
              tags: '${merge({ Ou = "cloud", Environment = "prod" }, var.tags)}',
            },
          ],
        },
      },
    }
    const scope = buildScope([parsed as never])
    scope.set('var.tags', { apm_id: 'APM1', Application: 'pay' })
    const r = normalize(parsed as never, 'main.tf', '', scope)[0]!
    expect(r.tags.kind).toBe('resolved')
    if (r.tags.kind === 'resolved')
      expect(r.tags.keys.sort()).toEqual(
        ['Application', 'Environment', 'Ou', 'apm_id'].sort(),
      )
  })

  it('ignores refs inside object VALUES when judging completeness (the real module pattern)', () => {
    const parsed = {
      locals: [
        {
          common:
            '${merge(var.tags, { Ou = var.ou, Environment = var.environment })}',
        },
      ],
      resource: {
        aws_db_instance: { x: [{ tags: '${local.common}' }] },
      },
    }
    const scope = buildScope([parsed as never])
    scope.set('var.tags', { apm_id: 'APM1' })
    scope.set('var.ou', 'cloud')
    scope.set('var.environment', 'production')
    const r = normalize(parsed as never, 'main.tf', '', scope)[0]!
    expect(r.tags.kind).toBe('resolved')
    if (r.tags.kind === 'resolved')
      expect(r.tags.keys.sort()).toEqual(['Environment', 'Ou', 'apm_id'].sort())
  })

  it('stays PARTIAL when a merge arg is an unresolvable var ref', () => {
    const parsed = {
      resource: {
        aws_db_instance: {
          x: [{ tags: '${merge({ Ou = "cloud" }, var.tags)}' }],
        },
      },
    }
    // var.tags NOT set in scope → cannot prove completeness.
    const scope = buildScope([parsed as never])
    const r = normalize(parsed as never, 'main.tf', '', scope)[0]!
    expect(r.tags.kind).toBe('partial')
    if (r.tags.kind === 'partial') expect(r.tags.keys).toEqual(['Ou'])
  })

  it('stays PARTIAL when a merge arg is an opaque function call', () => {
    const parsed = {
      resource: {
        aws_db_instance: {
          x: [{ tags: '${merge({ Ou = "cloud" }, lookup(var.m, "k", {}))}' }],
        },
      },
    }
    const scope = buildScope([parsed as never])
    scope.set('var.tags', { apm_id: 'APM1' })
    const r = normalize(parsed as never, 'main.tf', '', scope)[0]!
    expect(r.tags.kind).toBe('partial')
  })
})

// Provider default_tags / default_labels (AWS/Azure `default_tags`, GCP
// `default_labels`) are inherited by every resource at apply time. dotzen
// threads them so a `mustHaveTags` rule does not flag a resource whose
// required tag is supplied by the provider rather than the resource block.
describe('normalize — provider default_tags / default_labels', () => {
  // Mirrors parseTf: build scope, compute provider defaults, thread to normalize.
  const norm = (parsed: object) => {
    const scope = buildScope([parsed as never])
    const pd = providerDefaults([parsed as never], scope)
    return normalize(parsed as never, 'main.tf', '', scope, undefined, pd)
  }

  it('upgrades an unresolved resource-tag map to PARTIAL with provider keys', () => {
    // Resource has tags = var.tags (unresolvable), but provider default_tags
    // supplies Env + Team → both are proven present → partial (not unresolved).
    const r = norm({
      provider: {
        aws: [{ default_tags: [{ tags: { Env: 'prod', Team: 'infra' } }] }],
      },
      resource: {
        aws_s3_bucket: { x: [{ tags: '${var.tags}' }] },
      },
    })[0]!
    expect(r.tags.kind).toBe('partial')
    if (r.tags.kind === 'partial')
      expect(r.tags.keys.sort()).toEqual(['Env', 'Team'])
  })

  it('unions provider keys with a resolved resource-tag map (complete)', () => {
    const r = norm({
      provider: {
        aws: [{ default_tags: [{ tags: { Env: 'prod' } }] }],
      },
      resource: {
        aws_s3_bucket: { x: [{ tags: { team: 'core' } }] },
      },
    })[0]!
    expect(r.tags.kind).toBe('resolved')
    if (r.tags.kind === 'resolved')
      expect(r.tags.keys.sort()).toEqual(['Env', 'team'])
  })

  it('unions provider keys with a PARTIAL merge() set', () => {
    const r = norm({
      provider: {
        aws: [{ default_tags: [{ tags: { Env: 'prod' } }] }],
      },
      resource: {
        aws_s3_bucket: {
          x: [{ tags: '${merge({ team = "core" }, var.tags)}' }],
        },
      },
    })[0]!
    expect(r.tags.kind).toBe('partial')
    if (r.tags.kind === 'partial')
      expect(r.tags.keys.sort()).toEqual(['Env', 'team'])
  })

  it('treats a tagless resource as resolved with the provider keys', () => {
    const r = norm({
      provider: {
        aws: [{ default_tags: [{ tags: { Env: 'prod' } }] }],
      },
      resource: { aws_s3_bucket: { x: [{}] } },
    })[0]!
    expect(r.tags.kind).toBe('resolved')
    if (r.tags.kind === 'resolved') expect(r.tags.keys).toEqual(['Env'])
  })

  it('reads GCP default_labels (not default_tags)', () => {
    const r = norm({
      provider: {
        google: [{ default_labels: [{ labels: { env: 'dev' } }] }],
      },
      resource: { google_storage_bucket: { x: [{}] } },
    })[0]!
    expect(r.tags.kind).toBe('resolved')
    if (r.tags.kind === 'resolved') expect(r.tags.keys).toEqual(['env'])
  })

  it('omits provider keys whose value is an unresolvable reference', () => {
    // default_tags = var.base — var.base has no default → not statically
    // proven present → no keys contributed → resource stays unresolved.
    const r = norm({
      variable: { base: [{}] },
      provider: {
        aws: [{ default_tags: [{ tags: '${var.base}' }] }],
      },
      resource: {
        aws_s3_bucket: { x: [{ tags: '${var.tags}' }] },
      },
    })[0]!
    expect(r.tags).toEqual({ kind: 'unresolved' })
  })

  it('resolves a provider default_tags that references a var with a default', () => {
    const r = norm({
      variable: { base: [{ default: { Env: 'prod', Team: 'infra' } }] },
      provider: {
        aws: [{ default_tags: [{ tags: '${var.base}' }] }],
      },
      resource: { aws_s3_bucket: { x: [{}] } },
    })[0]!
    expect(r.tags.kind).toBe('resolved')
    if (r.tags.kind === 'resolved')
      expect(r.tags.keys.sort()).toEqual(['Env', 'Team'])
  })

  it('unions keys across multiple provider blocks', () => {
    const r = norm({
      provider: {
        aws: [{ default_tags: [{ tags: { Env: 'prod' } }] }],
        google: [{ default_labels: [{ labels: { team: 'core' } }] }],
      },
      resource: { aws_s3_bucket: { x: [{}] } },
    })[0]!
    expect(r.tags.kind).toBe('resolved')
    if (r.tags.kind === 'resolved')
      expect(r.tags.keys.sort()).toEqual(['Env', 'team'])
  })

  it('leaves tags unresolved when no provider declares default_tags', () => {
    const r = norm({
      provider: { aws: [{ region: 'us-east-1' }] },
      resource: {
        aws_s3_bucket: { x: [{ tags: '${var.tags}' }] },
      },
    })[0]!
    expect(r.tags).toEqual({ kind: 'unresolved' })
  })
})
