import { describe, it, expect } from 'vitest'
import { RuleValidationError } from '../result/errors'
import { cisAws } from './cis-aws'
import { cisAzure } from './cis-azure'
import { cisGcp } from './cis-gcp'
import { coreSecurity } from './core-security'
import { pciDss } from './pci-dss'
import { soc2 } from './soc2'
import { nist80053 } from './nist-800-53'
import { dataProtection } from './data-protection'

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
  it('cis-aws: every rule validates, >= 5 rules (additions to coreSecurity)', () => {
    const { rules, errors } = validateAll(cisAws)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(5)
    expect(cisAws.length).toBeGreaterThanOrEqual(5)
  })

  it('cis-azure: every rule validates, >= 10 rules (additions to coreSecurity)', () => {
    const { rules, errors } = validateAll(cisAzure)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(10)
    expect(cisAzure.length).toBeGreaterThanOrEqual(10)
  })

  it('cis-gcp: every rule validates, >= 15 rules (additions to coreSecurity)', () => {
    const { rules, errors } = validateAll(cisGcp)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(15)
    expect(cisGcp.length).toBeGreaterThanOrEqual(15)
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

describe('Composable framework presets — validation', () => {
  it('coreSecurity: every rule validates, >= 15 rules', () => {
    const { rules, errors } = validateAll(coreSecurity)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(15)
    expect(coreSecurity.length).toBeGreaterThanOrEqual(15)
  })

  it('pciDss: every rule validates, >= 10 rules', () => {
    const { rules, errors } = validateAll(pciDss)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(10)
    expect(pciDss.length).toBeGreaterThanOrEqual(10)
  })

  it('soc2: every rule validates, >= 5 rules', () => {
    const { rules, errors } = validateAll(soc2)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(5)
    expect(soc2.length).toBeGreaterThanOrEqual(5)
  })

  it('nist80053: every rule validates, >= 10 rules', () => {
    const { rules, errors } = validateAll(nist80053)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(10)
    expect(nist80053.length).toBeGreaterThanOrEqual(10)
  })

  it('dataProtection: every rule validates, >= 8 rules', () => {
    const { rules, errors } = validateAll(dataProtection)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThanOrEqual(8)
    expect(dataProtection.length).toBeGreaterThanOrEqual(8)
  })

  it('every rule in every pack has a message + rationale', () => {
    for (const preset of [
      coreSecurity,
      pciDss,
      soc2,
      nist80053,
      dataProtection,
    ]) {
      for (const builder of preset) {
        const r = builder.validate(0)
        if (r.ok) {
          expect(r.value.message).toBeTruthy()
          expect(r.value.rationale).toBeTruthy()
        }
      }
    }
  })

  it('composable packs are spreadable arrays', () => {
    expect(Array.isArray(coreSecurity)).toBe(true)
    expect(Array.isArray(pciDss)).toBe(true)
    expect(Array.isArray(soc2)).toBe(true)
    expect(Array.isArray(nist80053)).toBe(true)
    expect(Array.isArray(dataProtection)).toBe(true)
  })

  it('coreSecurity + pciDss combines without collision (no duplicate ruleIds at same index)', () => {
    // Validate both packs independently, then together — the combined spec
    // should have more rules than either alone (proves composability).
    const combined = [...coreSecurity, ...pciDss]
    const { rules, errors } = validateAll(combined)
    expect(errors).toEqual([])
    expect(rules).toBeGreaterThan(coreSecurity.length)
    expect(rules).toBeGreaterThan(pciDss.length)
  })

  it('no duplicate messages between coreSecurity and CIS packs (no double-violation)', () => {
    // The refactor ensures CIS packs contain ONLY cloud-specific additions —
    // no rule in cisAws/cisAzure/cisGcp should share a message with
    // coreSecurity (which would produce a duplicate violation on the same
    // resource under different ruleIds when composed).
    const coreMsgs = new Set(
      coreSecurity.map((b) => {
        const r = b.validate(0)
        return r.ok ? r.value.message : ''
      }),
    )
    for (const [, pack] of [
      ['cisAws', cisAws],
      ['cisAzure', cisAzure],
      ['cisGcp', cisGcp],
    ] as const) {
      for (const builder of pack) {
        const r = builder.validate(0)
        if (r.ok) {
          expect(coreMsgs.has(r.value.message)).toBe(false)
        }
      }
    }
  })
})
