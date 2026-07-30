import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { GcpResource, GcpAttribute, IamMember, Effect } from '../vocabulary'

const iamMember = (member: NormalizedValue): NormalizedResource => ({
  type: GcpResource.StorageBucketIamMember,
  name: 'm',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: { member },
})

const lit = (v: string): NormalizedValue => ({ kind: 'literal', value: v })
const unresolved = (expr: string): NormalizedValue => ({
  kind: 'unresolved',
  expr,
})

// Mirrors the cis-gcp public-member rule: deny `allUsers` /
// `allAuthenticatedUsers` on storage/project IAM members. This is the rule
// that produced 12 of 14 couldNotEvaluate on the real
// terraform-google-kubernetes-engine module (ROADMAP #5).
const noPublicMember: Rule = {
  id: 'no-public-iam-member',
  target: { kind: 'resource', types: [GcpResource.StorageBucketIamMember] },
  conditions: [
    {
      kind: 'denyValue',
      attr: GcpAttribute.Member,
      values: [IamMember.AllUsers, IamMember.AllAuthenticatedUsers],
    },
  ],
  effect: Effect.Block,
  message: 'IAM member must not be public',
}

describe('evaluate (denyValue — compound interpolation with literal text)', () => {
  it('passes definitively for a resource-attr compound (the GKE pattern)', () => {
    // member = "serviceAccount:${google_service_account.default.email}"
    // The ref is a resource attribute — unresolvable statically — but the
    // resolved string ALWAYS starts with `serviceAccount:` and so cannot
    // equal `allUsers` / `allAuthenticatedUsers`. Definite PASS, not CNE.
    const r = iamMember(
      unresolved('serviceAccount:${google_service_account.default.email}'),
    )
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes for an unresolvable sole-ref compound with a literal prefix', () => {
    // var.email has no default → unresolved; but the `serviceAccount:` prefix
    // still rules out every bare denylist scalar.
    const r = iamMember(unresolved('serviceAccount:${var.email}'))
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes for a suffix-only compound interpolation', () => {
    const r = iamMember(unresolved('${var.email}-suffix'))
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('passes for prefix + suffix around an unresolved interpolation', () => {
    const r = iamMember(unresolved('pre-${var.x}-suf'))
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('stays couldNotEvaluate for a bare sole ref with no literal text', () => {
    // `${var.x}` — no literal text to rule anything out; the ref could
    // resolve to `allUsers`. Honest CNE, not a silent pass.
    const r = iamMember(unresolved('${var.x}'))
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
  })

  it('stays couldNotEvaluate when the prefix is consistent with a denylist scalar', () => {
    // `allUser${var.s}` could resolve to `allUsers` (var.s = "s"). The prefix
    // `allUser` does NOT rule out the denylist scalar → CNE.
    const r = iamMember(unresolved('allUser${var.s}'))
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
  })

  it('stays couldNotEvaluate when a denylist value itself contains ${', () => {
    // Defensive: if a denylist scalar were itself dynamic, the literal-prefix
    // reasoning no longer holds → fall back to honest CNE.
    const dynamic: Rule = {
      id: 'dynamic-denylist',
      target: { kind: 'resource', types: [GcpResource.StorageBucketIamMember] },
      conditions: [
        {
          kind: 'denyValue',
          attr: GcpAttribute.Member,
          values: ['prefix-${var.bad}'],
        },
      ],
      effect: Effect.Block,
      message: 'never matches in practice but exercises the guard',
    }
    const r = iamMember(unresolved('serviceAccount:${var.x}'))
    const report = evaluate([dynamic], [r])
    expect(report.couldNotEvaluate).toHaveLength(1)
  })

  it('stays couldNotEvaluate for a multi-interpolation string (conservative)', () => {
    // `${var.x}-${var.y}` — the single-interp prefix/suffix rule does not
    // apply (the literal `-` is BETWEEN two interpolations). Stay honest.
    const r = iamMember(unresolved('${var.x}-${var.y}'))
    const report = evaluate([noPublicMember], [r])
    expect(report.couldNotEvaluate).toHaveLength(1)
  })

  it('still flags a literal denylist value (regression)', () => {
    const r = iamMember(lit(IamMember.AllUsers))
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('still passes a literal non-denylist value (regression)', () => {
    const r = iamMember(lit('user:alice@example.com'))
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('still treats an absent attribute as a pass (regression)', () => {
    const r: NormalizedResource = {
      type: GcpResource.StorageBucketIamMember,
      name: 'm',
      file: 'main.tf',
      line: 1,
      ingress: [],
      tags: { kind: 'resolved', keys: [] },
      attributes: {},
    }
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })
})

describe('evaluate (denyValue — bare resource-attr ref, provider semantics)', () => {
  // The bare-ref analog of the literal-prefix rule: `member = google_service_account.x[0].member`
  // has NO literal text, so the prefix/suffix rule can't help — but the provider
  // guarantees the value is a service-account identifier, which can never equal
  // a bare public-principal scalar. Eliminates the 15 CNE the
  // terraform-google-kubernetes-engine module produced on this pattern (round 11).
  it('passes definitively for a bare google_service_account.*.member ref (the GKE pattern)', () => {
    const r = iamMember(
      unresolved('${google_service_account.cluster_service_account[0].member}'),
    )
    const report = evaluate([noPublicMember], [r])
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes for a bare google_service_account.*.email ref (no index)', () => {
    const r = iamMember(unresolved('${google_service_account.default.email}'))
    const report = evaluate([noPublicMember], [r])
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('passes for a bare google_service_account.*.name ref', () => {
    const r = iamMember(unresolved('${google_service_account.default.name}'))
    const report = evaluate([noPublicMember], [r])
    expect(report.couldNotEvaluate).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('stays couldNotEvaluate for a bare ref to a non-service-account resource', () => {
    // A different resource's `.member`-ish attr has no provider guarantee —
    // don't over-apply the heuristic. Stay honest.
    const r = iamMember(unresolved('${google_some_other_resource.x.member}'))
    const report = evaluate([noPublicMember], [r])
    expect(report.couldNotEvaluate).toHaveLength(1)
  })

  it('stays couldNotEvaluate when the denylist could be a service-account value', () => {
    // If a denylist scalar itself looks like a service-account identifier
    // (serviceAccount: prefix or an @-email), a google_service_account.* ref
    // COULD equal it → not excludable → CNE (conservative).
    const denySpecificSa: Rule = {
      id: 'deny-specific-sa',
      target: { kind: 'resource', types: [GcpResource.StorageBucketIamMember] },
      conditions: [
        {
          kind: 'denyValue',
          attr: GcpAttribute.Member,
          values: ['serviceAccount:leak@proj.iam.gserviceaccount.com'],
        },
      ],
      effect: Effect.Block,
      message: 'specific SA denylisted',
    }
    const r = iamMember(
      unresolved('${google_service_account.cluster_service_account[0].member}'),
    )
    const report = evaluate([denySpecificSa], [r])
    expect(report.couldNotEvaluate).toHaveLength(1)
  })
})
