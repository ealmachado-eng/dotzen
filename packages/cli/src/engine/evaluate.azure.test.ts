import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AzureResource, AzureAttribute, Effect } from '../vocabulary'

const bool = (v: boolean): NormalizedValue => ({ kind: 'literal', value: v })

const res = (
  type: AzureResource,
  attributes: Record<string, NormalizedValue>,
): NormalizedResource => ({
  type,
  name: 'x',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes,
})

describe('evaluate — Azure CIS L1 tranche (reuses existing conditions)', () => {
  it('flags an App Service without https_only (absent = violation)', () => {
    const rule: Rule = {
      id: 'https',
      target: { kind: 'resource', types: [AzureResource.LinuxWebApp] },
      conditions: [{ kind: 'mustBeTrue', attrs: [AzureAttribute.HttpsOnly] }],
      effect: Effect.Block,
      message: 'https only',
    }
    expect(
      evaluate([rule], [res(AzureResource.LinuxWebApp, {})]).violations,
    ).toHaveLength(1)
  })

  it('flags a Container Registry with admin_enabled = true', () => {
    const rule: Rule = {
      id: 'acr',
      target: { kind: 'resource', types: [AzureResource.ContainerRegistry] },
      conditions: [
        { kind: 'denyWhenTrue', attrs: [AzureAttribute.AdminEnabled] },
      ],
      effect: Effect.Block,
      message: 'no admin',
    }
    const bad = res(AzureResource.ContainerRegistry, {
      admin_enabled: bool(true),
    })
    const good = res(AzureResource.ContainerRegistry, {
      admin_enabled: bool(false),
    })
    expect(evaluate([rule], [bad]).violations).toHaveLength(1)
    expect(evaluate([rule], [good]).violations).toHaveLength(0)
  })
})
