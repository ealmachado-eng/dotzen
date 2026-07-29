import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { GcpResource, IamMember } from '../vocabulary'
import { cisGcp } from '../presets/cis-gcp'

/**
 * Engine contract for the v1.9 GCP niche rules (ROADMAP #6):
 * Cloud Audit Logs config presence, GKE Shielded Nodes, BigQuery public
 * access. Each reuses an existing condition (`requireResource` /
 * `mustBeTrue` / `denyValue`) — no engine change. These tests import the
 * `cisGcp` preset, find each rule by id, and confirm it fires (violate) /
 * passes on hand-built NormalizedResources.
 */

const res = (
  type: GcpResource,
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

const lit = (v: string | number | boolean): NormalizedValue => ({
  kind: 'literal',
  value: v,
})

const ruleById = (id: string) =>
  cisGcp.find((r) => {
    const v = r.validate(0)
    return v.ok && v.value.id === id
  })!

const run = (ruleId: string, resources: NormalizedResource[]) => {
  const builder = ruleById(ruleId)
  const validated = builder.validate(0)
  if (!validated.ok) throw new Error('rule did not validate')
  return evaluate([validated.value], resources)
}

describe('evaluate — cisGcp v1.9 niche rules (ROADMAP #6)', () => {
  describe('require-audit-config (project-level presence)', () => {
    it('passes when a google_project_iam_audit_config exists', () => {
      const r = run('require-audit-config', [
        res(GcpResource.ProjectIamAuditConfig, 'audit'),
      ])
      expect(r.violations).toHaveLength(0)
      expect(r.passed).toBe(1)
    })
    it('violates when no audit config exists (absent)', () => {
      const r = run('require-audit-config', [
        res(GcpResource.StorageBucket, 'b'),
      ])
      expect(r.violations).toHaveLength(1)
      expect(r.violations[0]?.resource).toBe(GcpResource.ProjectIamAuditConfig)
    })
  })

  describe('gke-shielded-nodes', () => {
    it('passes a cluster with shielded_nodes.enabled = true', () => {
      const r = run('gke-shielded-nodes', [
        res(GcpResource.ContainerCluster, 'c', {
          'shielded_nodes.enabled': lit(true),
        }),
      ])
      expect(r.violations).toHaveLength(0)
      expect(r.passed).toBe(1)
    })
    it('flags a cluster where shielded_nodes is absent (default false)', () => {
      const r = run('gke-shielded-nodes', [
        res(GcpResource.ContainerCluster, 'c', {}),
      ])
      expect(r.violations).toHaveLength(1)
    })
    it('flags a cluster that explicitly disables shielded nodes', () => {
      const r = run('gke-shielded-nodes', [
        res(GcpResource.ContainerCluster, 'c', {
          'shielded_nodes.enabled': lit(false),
        }),
      ])
      expect(r.violations).toHaveLength(1)
    })
  })

  describe('bigquery-no-public-access', () => {
    it('flags a standalone dataset access granting allAuthenticatedUsers', () => {
      const r = run('bigquery-no-public-access', [
        res(GcpResource.BigqueryDatasetAccess, 'public', {
          special_group: lit(IamMember.AllAuthenticatedUsers),
        }),
      ])
      expect(r.violations).toHaveLength(1)
    })
    it('passes a standalone access granting a specific user', () => {
      const r = run('bigquery-no-public-access', [
        res(GcpResource.BigqueryDatasetAccess, 'owner', {
          user_email: lit('owner@example.com'),
        }),
      ])
      expect(r.violations).toHaveLength(0)
    })
    it('flags a dataset with an inline access block granting allAuthenticatedUsers', () => {
      // The flattener captures the first access block's special_group as
      // `access.special_group`. A multi-block dataset where a LATER block is
      // public is a known gap (documented in the preset comment).
      const r = run('bigquery-no-public-access', [
        res(GcpResource.BigqueryDataset, 'ds', {
          'access.special_group': lit(IamMember.AllAuthenticatedUsers),
        }),
      ])
      expect(r.violations).toHaveLength(1)
    })
  })
})
