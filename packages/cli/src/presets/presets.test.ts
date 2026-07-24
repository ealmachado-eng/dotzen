import { describe, it, expect } from 'vitest'
import { RuleValidationError } from '../result/errors'
import { cisAws } from './cis-aws'
import { cisAzure } from './cis-azure'
import { cisGcp } from './cis-gcp'

// A preset is a `Rule[]` array (builders). Each must validate without errors
// (the engine calls `.validate(index)` on load). This test validates every
// preset rule and asserts a minimum count so an accidental deletion fails
// the build. It also catches a vocab mismatch (a rule referencing a resource
// or attribute not in the enums) that would be a compile error — the typecheck
// covers that, but the validation step catches missing .message() / .resource()
// / conditions.
const validateAll = (
  preset: readonly ReturnType<typeof import('../spec/rule').rule>[],
): { rules: number; errors: RuleValidationError[] } => {
  const errors: RuleValidationError[] = []
  let valid = 0
  preset.forEach((builder, i) => {
    const r = builder.validate(i)
    if (r.ok) valid++
    else errors.push(...r.error)
  })
  return { rules: valid, errors }
}

describe('CIS presets — validation (#24)', () => {
  it('cis-aws: every rule validates, >= 20 rules', () => {
    const { rules, errors } = validateAll(cisAws)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(20)
    expect(cisAws.length).toBeGreaterThanOrEqual(20)
  })

  it('cis-azure: every rule validates, >= 12 rules', () => {
    const { rules, errors } = validateAll(cisAzure)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(12)
    expect(cisAzure.length).toBeGreaterThanOrEqual(12)
  })

  it('cis-gcp: every rule validates, >= 10 rules', () => {
    const { rules, errors } = validateAll(cisGcp)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(10)
    expect(cisGcp.length).toBeGreaterThanOrEqual(10)
  })

  it('every rule has a message + rationale (auditability)', () => {
    for (const preset of [cisAws, cisAzure, cisGcp]) {
      for (const builder of preset) {
        const r = builder.validate(0)
        if (r.ok) {
          expect(r.value.message).toBeTruthy()
          expect(r.value.rationale).toBeTruthy()
        }
      }
    }
  })

  it('presets are re-exportable arrays (not frozen)', () => {
    // A user spreads `[...cisAws, customRule]` — must be iterable + spreadable.
    expect(Array.isArray(cisAws)).toBe(true)
    expect(Array.isArray(cisAzure)).toBe(true)
    expect(Array.isArray(cisGcp)).toBe(true)
  })
})
