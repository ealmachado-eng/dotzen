import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, IngressRule } from '../hcl/model'
import { AwsResource, Port, Effect } from '../vocabulary'

/**
 * Engine contract for NACL ingress governance (ROADMAP #2 — NACL rules).
 * The normalize layer now maps `aws_network_acl_rule` (standalone) and
 * `aws_network_acl` / `aws_default_network_acl` (inline `ingress {}`
 * blocks) into the cloud-neutral `ingress` field, so the EXISTING
 * `denyIngress` condition governs them unchanged — no new condition kind.
 * These tests pin that contract against hand-built NormalizedResources
 * shaped exactly as normalize produces them.
 */

const naclRule = (ingress: IngressRule[]): NormalizedResource => ({
  type: AwsResource.NetworkAclRule,
  name: 'r',
  file: 'main.tf',
  line: 1,
  ingress,
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
})

const nacl = (ingress: IngressRule[]): NormalizedResource => ({
  type: AwsResource.NetworkAcl,
  name: 'main',
  file: 'main.tf',
  line: 1,
  ingress,
  tags: { kind: 'resolved', keys: [] },
  attributes: {},
})

const lit = (
  v: string | number,
): { kind: 'literal'; value: string | number } => ({
  kind: 'literal',
  value: v,
})

const rule22open: IngressRule = {
  fromPort: lit(22),
  toPort: lit(22),
  cidrBlocks: [lit('0.0.0.0/0')],
}

const noPublicSshRdp: Rule = {
  id: 'nacl-no-public-ssh-rdp',
  target: {
    kind: 'resource',
    types: [AwsResource.NetworkAcl, AwsResource.NetworkAclRule],
  },
  conditions: [
    {
      kind: 'denyIngress',
      ports: [Port.SSH, Port.RDP],
      from: ['0.0.0.0/0', '::/0'] as never,
    },
  ],
  effect: Effect.Block,
  message: 'NACL must not allow public SSH/RDP ingress',
}

describe('evaluate — denyIngress on Network ACL rules (ROADMAP #2)', () => {
  it('flags a standalone aws_network_acl_rule allowing public SSH', () => {
    const report = evaluate([noPublicSshRdp], [naclRule([rule22open])])
    expect(report.violations).toHaveLength(1)
    expect(report.couldNotEvaluate).toHaveLength(0)
  })

  it('passes a standalone rule with no ingress (egress-only)', () => {
    const report = evaluate([noPublicSshRdp], [naclRule([])])
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('flags an inline aws_network_acl ingress block allowing public RDP', () => {
    const report = evaluate(
      [noPublicSshRdp],
      [
        nacl([
          {
            fromPort: lit(3389),
            toPort: lit(3389),
            cidrBlocks: [lit('0.0.0.0/0')],
          },
        ]),
      ],
    )
    expect(report.violations).toHaveLength(1)
  })

  it('passes a NACL whose only ingress is a non-targeted port (443)', () => {
    const report = evaluate(
      [noPublicSshRdp],
      [
        nacl([
          {
            fromPort: lit(443),
            toPort: lit(443),
            cidrBlocks: [lit('0.0.0.0/0')],
          },
        ]),
      ],
    )
    expect(report.violations).toHaveLength(0)
    expect(report.passed).toBe(1)
  })

  it('degrades to couldNotEvaluate when the CIDR is an unresolved ref', () => {
    const report = evaluate(
      [noPublicSshRdp],
      [
        naclRule([
          {
            fromPort: lit(22),
            toPort: lit(22),
            cidrBlocks: [{ kind: 'unresolved', expr: '${var.admin_cidr}' }],
          },
        ]),
      ],
    )
    expect(report.violations).toHaveLength(0)
    expect(report.couldNotEvaluate).toHaveLength(1)
  })
})
