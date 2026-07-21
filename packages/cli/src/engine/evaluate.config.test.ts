import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { Rule } from '../spec/rule'
import { NormalizedResource, NormalizedValue } from '../hcl/model'
import { AwsResource, AwsAttribute, Effect } from '../vocabulary'

const lit = (v: unknown): NormalizedValue => ({
  kind: 'literal',
  value: v as string | number | boolean,
})

const recorder = (
  attrs: Record<string, NormalizedValue> = {},
): NormalizedResource => ({
  type: AwsResource.ConfigConfigurationRecorder,
  name: 'recorder',
  file: 'main.tf',
  line: 1,
  ingress: [],
  tags: { kind: 'resolved', keys: [] },
  attributes: attrs,
})

const allSupportedRule: Rule = {
  id: 'config-all-supported',
  target: {
    kind: 'resource',
    types: [AwsResource.ConfigConfigurationRecorder],
  },
  conditions: [
    { kind: 'mustBeTrue', attrs: [AwsAttribute.RecordingGroupAllSupported] },
  ],
  effect: Effect.Block,
  message: 'AWS Config must record all supported resource types',
  rationale:
    'CIS AWS §3.1 — Config should cover all regions and resource types',
}

const globalTypesRule: Rule = {
  id: 'config-global-types',
  target: {
    kind: 'resource',
    types: [AwsResource.ConfigConfigurationRecorder],
  },
  conditions: [
    {
      kind: 'mustBeTrue',
      attrs: [AwsAttribute.RecordingGroupIncludeGlobalResourceTypes],
    },
  ],
  effect: Effect.Block,
  message: 'AWS Config must include global resource types (IAM)',
  rationale: 'CIS AWS §3.2 — Config should record global resources',
}

describe('evaluate — AWS Config recorder (CIS §3.1/3.2)', () => {
  it('passes a recorder with all_supported = true', () => {
    const r = evaluate(
      [allSupportedRule],
      [recorder({ 'recording_group.all_supported': lit(true) })],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a recorder with all_supported = false', () => {
    const r = evaluate(
      [allSupportedRule],
      [recorder({ 'recording_group.all_supported': lit(false) })],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags a recorder with all_supported absent (AWS default is false)', () => {
    const r = evaluate([allSupportedRule], [recorder({})])
    expect(r.violations).toHaveLength(1)
  })

  it('passes a recorder with include_global_resource_types = true', () => {
    const r = evaluate(
      [globalTypesRule],
      [
        recorder({
          'recording_group.include_global_resource_types': lit(true),
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a recorder with include_global_resource_types absent', () => {
    const r = evaluate([globalTypesRule], [recorder({})])
    expect(r.violations).toHaveLength(1)
  })

  it('passes a fully compliant recorder against both rules', () => {
    const r = evaluate(
      [allSupportedRule, globalTypesRule],
      [
        recorder({
          'recording_group.all_supported': lit(true),
          'recording_group.include_global_resource_types': lit(true),
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(2)
  })
})
