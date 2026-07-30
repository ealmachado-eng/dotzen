import { describe, it, expect } from 'vitest'
import { normalize, collectUngoverned } from './normalize'
import { AwsResource } from '../vocabulary'

const raw = `resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "dyn" {
  ingress {
    from_port   = 22
    to_port     = 22
    cidr_blocks = [var.allowed]
  }
}`

const parsed = {
  resource: {
    aws_security_group: {
      web: [
        {
          ingress: [{ from_port: 22, to_port: 22, cidr_blocks: ['0.0.0.0/0'] }],
        },
      ],
      dyn: [
        {
          ingress: [
            { from_port: 22, to_port: 22, cidr_blocks: ['${var.allowed}'] },
          ],
        },
      ],
    },
    // an unknown type should be skipped (not in the vocabulary)
    aws_fictional_unrecognized: { fn: [{}] },
  },
}

describe('normalize', () => {
  it('maps known resources into the normalized model with line numbers', () => {
    const res = normalize(parsed, 'main.tf', raw)
    const web = res.find((r) => r.name === 'web')
    expect(web?.type).toBe(AwsResource.SecurityGroup)
    expect(web?.file).toBe('main.tf')
    expect(web?.line).toBe(1)
    expect(web?.ingress[0]?.fromPort).toEqual({ kind: 'literal', value: 22 })
    expect(web?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'literal',
      value: '0.0.0.0/0',
    })
  })

  it('marks interpolated CIDRs as unresolved', () => {
    const res = normalize(parsed, 'main.tf', raw)
    const dyn = res.find((r) => r.name === 'dyn')
    expect(dyn?.ingress[0]?.cidrBlocks[0]).toEqual({
      kind: 'unresolved',
      expr: '${var.allowed}',
    })
  })

  it('skips resource types not in the vocabulary', () => {
    const res = normalize(parsed, 'main.tf', raw)
    expect(res.map((r) => r.name)).not.toContain('fn')
  })

  describe('collectUngoverned — UTILITY_TYPES silently skipped (ROADMAP #4)', () => {
    it('surfaces a genuinely ungoverned resource type', () => {
      const out = collectUngoverned(
        { resource: { aws_fictional: { x: [{}] } } },
        'main.tf',
        'resource "aws_fictional" "x" {}\n',
      )
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('aws_fictional')
      expect(out[0]?.name).toBe('x')
    })

    it('silently skips random_password (and the other random_* / terraform_data utility types)', () => {
      const parsed = {
        resource: {
          random_password: { pw: [{}] },
          random_string: { s: [{}] },
          random_id: { id: [{}] },
          random_uuid: { u: [{}] },
          terraform_data: { d: [{}] },
          // A real coverage gap must still surface alongside the utilities.
          aws_fictional: { leak: [{}] },
        },
      }
      const out = collectUngoverned(
        parsed,
        'main.tf',
        [
          'resource "random_password" "pw" {}\n',
          'resource "random_string" "s" {}\n',
          'resource "random_id" "id" {}\n',
          'resource "random_uuid" "u" {}\n',
          'resource "terraform_data" "d" {}\n',
          'resource "aws_fictional" "leak" {}\n',
        ].join(''),
      )
      // Only the real gap — utilities are silent.
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('aws_fictional')
      expect(out[0]?.name).toBe('leak')
    })

    it('silently skips data.random_* utility data sources too', () => {
      const out = collectUngoverned(
        { data: { random_password: { pw: [{}] } } },
        'main.tf',
        'data "random_password" "pw" {}\n',
      )
      expect(out).toHaveLength(0)
    })
  })

  describe('collectUngoverned — round-11 recognized vocabulary', () => {
    // Elasticache global/serverless + OpenSearch(serverless) types verified
    // against the AWS provider Go ResourcesMap, then added to AwsResource so
    // KNOWN_TYPES (derived from the enum) recognizes them — they no longer
    // surface as ungoverned noise. A genuine gap must still surface.
    it('recognizes the round-11 elasticache + opensearch(serverless) types', () => {
      const parsed = {
        resource: {
          aws_elasticache_global_replication_group: { g: [{}] },
          aws_elasticache_serverless_cache: { sc: [{}] },
          aws_opensearchserverless_collection: { c: [{}] },
          aws_opensearchserverless_security_policy: { sp: [{}] },
          aws_opensearchserverless_security_config: { sconf: [{}] },
          aws_opensearchserverless_access_policy: { ap: [{}] },
          aws_opensearchserverless_lifecycle_policy: { lp: [{}] },
          aws_opensearchserverless_vpc_endpoint: { vpc: [{}] },
          aws_opensearch_package_association: { pa: [{}] },
          aws_opensearch_vpc_endpoint: { ove: [{}] },
          aws_fictional_round11: { leak: [{}] },
        },
      }
      const out = collectUngoverned(parsed, 'main.tf', '')
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('aws_fictional_round11')
    })

    it('recognizes round-12 types + silently skips the kubernetes_config_map_v1_data utility', () => {
      // Round-12 names taken straight from real module .tf (terraform-aws-modules,
      // Azure/aks, terraform-google-network, terraform-google-kubernetes-engine)
      // — observed-in-the-wild, so inherently verified. The kubernetes_* type is
      // a k8s-provider resource (not cloud IaC) → UTILITY_TYPES silent skip.
      const parsed = {
        resource: {
          aws_vpc_security_group_rules_exclusive: { a: [{}] },
          aws_vpc_security_group_vpc_association: { b: [{}] },
          azurerm_monitor_data_collection_rule: { c: [{}] },
          azurerm_monitor_data_collection_rule_association: { d: [{}] },
          google_service_networking_connection: { e: [{}] },
          kubernetes_config_map_v1_data: { k: [{}] },
          aws_fictional_round12: { leak: [{}] },
        },
      }
      const out = collectUngoverned(parsed, 'main.tf', '')
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('aws_fictional_round12')
    })
  })
})
