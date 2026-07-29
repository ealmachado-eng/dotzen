import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AzureResource } from '../vocabulary'
import { cisAzure } from '../presets/cis-azure'

/**
 * Engine contract for the v1.8 Azure niche rules (ROADMAP #5):
 * Cosmos DB local-auth, App Service min-TLS, storage infrastructure-
 * encryption. Each reuses an existing condition (`mustBeTrue` /
 * `mustBeOneOf`) on a new/existing attribute — no engine change. These
 * tests import the `cisAzure` preset, find each rule by id, and confirm
 * it fires (violate) / passes on hand-built NormalizedResources shaped
 * exactly as normalize produces them.
 */

const res = (
  type: AzureResource,
  name: string,
  attributes: Record<string, NormalizedValue>,
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
  cisAzure.find((r) => {
    const v = r.validate(0)
    return v.ok && v.value.id === id
  })!

const run = (ruleId: string, resources: NormalizedResource[]) => {
  const builder = ruleById(ruleId)
  const validated = builder.validate(0)
  if (!validated.ok) throw new Error('rule did not validate')
  return evaluate([validated.value], resources)
}

describe('evaluate — cisAzure v1.8 niche rules (ROADMAP #5)', () => {
  describe('cosmos-no-local-auth', () => {
    it('passes a Cosmos account with local_authentication_disabled = true', () => {
      const r = run('cosmos-no-local-auth', [
        res(AzureResource.CosmosdbAccount, 'db', {
          local_authentication_disabled: lit(true),
        }),
      ])
      expect(r.violations).toHaveLength(0)
      expect(r.passed).toBe(1)
    })
    it('flags a Cosmos account where local auth is enabled (absent => default false)', () => {
      const r = run('cosmos-no-local-auth', [
        res(AzureResource.CosmosdbAccount, 'db', {}),
      ])
      expect(r.violations).toHaveLength(1)
    })
    it('flags a Cosmos account that explicitly enables local auth', () => {
      const r = run('cosmos-no-local-auth', [
        res(AzureResource.CosmosdbAccount, 'db', {
          local_authentication_disabled: lit(false),
        }),
      ])
      expect(r.violations).toHaveLength(1)
    })
  })

  describe('app-service-min-tls', () => {
    it('passes an App Service with site_config.minimum_tls_version = 1.2', () => {
      const r = run('app-service-min-tls', [
        res(AzureResource.LinuxWebApp, 'app', {
          'site_config.minimum_tls_version': lit('1.2'),
        }),
      ])
      expect(r.violations).toHaveLength(0)
      expect(r.passed).toBe(1)
    })
    it('flags an App Service on a weak TLS floor (1.0)', () => {
      const r = run('app-service-min-tls', [
        res(AzureResource.WindowsWebApp, 'app', {
          'site_config.minimum_tls_version': lit('1.0'),
        }),
      ])
      expect(r.violations).toHaveLength(1)
    })
    it('flags an App Service with no minimum_tls_version set (absent)', () => {
      const r = run('app-service-min-tls', [
        res(AzureResource.LinuxFunctionApp, 'fn', {}),
      ])
      expect(r.violations).toHaveLength(1)
    })
  })

  describe('storage-infrastructure-encryption', () => {
    it('passes a storage account with infrastructure_encryption_enabled = true', () => {
      const r = run('storage-infrastructure-encryption', [
        res(AzureResource.StorageAccount, 'st', {
          infrastructure_encryption_enabled: lit(true),
        }),
      ])
      expect(r.violations).toHaveLength(0)
      expect(r.passed).toBe(1)
    })
    it('flags a storage account where it is absent (default false)', () => {
      const r = run('storage-infrastructure-encryption', [
        res(AzureResource.StorageAccount, 'st', {}),
      ])
      expect(r.violations).toHaveLength(1)
    })
    it('flags a storage account that explicitly disables it', () => {
      const r = run('storage-infrastructure-encryption', [
        res(AzureResource.StorageAccount, 'st', {
          infrastructure_encryption_enabled: lit(false),
        }),
      ])
      expect(r.violations).toHaveLength(1)
    })
  })
})
