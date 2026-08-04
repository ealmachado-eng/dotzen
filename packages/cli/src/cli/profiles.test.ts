import { describe, it, expect } from 'vitest'
import {
  PRESET_NAMES,
  PROFILE_NAMES,
  PROFILES,
  composedPresets,
  composeSpec,
  isValidPreset,
  isValidProfile,
} from './profiles'

describe('profiles — validity guards', () => {
  it('PRESET_NAMES lists the 8 packs; PROFILE_NAMES lists the 3 profiles', () => {
    expect(PRESET_NAMES).toHaveLength(8)
    expect(PROFILE_NAMES).toEqual(['startup', 'enterprise', 'regulated'])
  })

  it('isValidPreset / isValidProfile are narrow', () => {
    expect(isValidPreset('coreSecurity')).toBe(true)
    expect(isValidPreset('cisAws')).toBe(true)
    expect(isValidPreset('Coresecurity')).toBe(false) // case-sensitive
    expect(isValidPreset('notAPreset')).toBe(false)
    expect(isValidProfile('enterprise')).toBe(true)
    expect(isValidProfile('Enterprise')).toBe(false)
    expect(isValidProfile('startup')).toBe(true)
  })
})

describe('composedPresets — union + dedup + default', () => {
  it('defaults to coreSecurity when nothing is specified', () => {
    expect(composedPresets()).toEqual(['coreSecurity'])
    expect(composedPresets(undefined, [])).toEqual(['coreSecurity'])
  })

  it('--presets with no profile is EXACTLY that list (no implicit baseline)', () => {
    expect(composedPresets(undefined, ['cisAws', 'pciDss'])).toEqual([
      'cisAws',
      'pciDss',
    ])
  })

  it("--profile returns the profile's preset list", () => {
    expect(composedPresets('enterprise')).toEqual([
      'coreSecurity',
      'cisAws',
      'cisAzure',
      'cisGcp',
    ])
    expect(composedPresets('regulated')).toHaveLength(8)
  })

  it('--profile + --presets unions extras onto the profile (deduped)', () => {
    expect(composedPresets('enterprise', ['pciDss', 'soc2'])).toEqual([
      'coreSecurity',
      'cisAws',
      'cisAzure',
      'cisGcp',
      'pciDss',
      'soc2',
    ])
  })

  it('never double-spreads a preset the profile already includes (duplicate rule IDs are a load error)', () => {
    // enterprise already has cisAws → asking for it again must NOT duplicate.
    expect(composedPresets('enterprise', ['cisAws', 'coreSecurity'])).toEqual([
      'coreSecurity',
      'cisAws',
      'cisAzure',
      'cisGcp',
    ])
  })
})

describe('composeSpec — generated spec.ts content', () => {
  it('default: spreads coreSecurity, imports it, no bespoke', () => {
    const spec = composeSpec()
    expect(spec).toContain('...coreSecurity,')
    expect(spec).toContain("import { coreSecurity } from '@dotzen/dotzen'")
    // No bespoke rules/enums on the default.
    expect(spec).not.toContain('mustHaveTags')
    expect(spec).not.toContain('enum ')
    expect(spec).toMatch(/export const spec = \[/)
  })

  it('--presets only: spreads exactly the requested presets (no implicit coreSecurity)', () => {
    const spec = composeSpec({ presets: ['cisAws', 'pciDss'] })
    expect(spec).toContain('...cisAws,')
    expect(spec).toContain('...pciDss,')
    expect(spec).not.toContain('...coreSecurity,')
  })

  it('--profile enterprise: spreads the 3 CIS packs + bespoke (OrgTag + prevent_destroy)', () => {
    const spec = composeSpec({ profile: 'enterprise' })
    for (const p of PROFILES.enterprise.presets)
      expect(spec).toContain(`...${p},`)
    // Bespoke content carried through.
    expect(spec).toContain('enum OrgTag')
    expect(spec).toContain('LifecycleAttribute.PreventDestroy')
    expect(spec).toContain('Approver.SecurityArchitect')
    // Imports include the bespoke values.
    expect(spec).toContain('AwsResource')
    expect(spec).toContain('LifecycleAttribute')
  })

  it('--profile + --presets: adds the extra preset spread (deduped)', () => {
    const spec = composeSpec({ profile: 'enterprise', presets: ['pciDss'] })
    expect(spec).toContain('...pciDss,')
    // enterprise bespoke still present.
    expect(spec).toContain('enum OrgTag')
    // No duplicate spread line for an already-included preset.
    const coreCount = (spec.match(/\.\.\.coreSecurity,/g) ?? []).length
    expect(coreCount).toBe(1)
  })

  it('header override is used verbatim (examples pass the docblock)', () => {
    const spec = composeSpec({
      profile: 'startup',
      header: '/** MY HEADER */',
    })
    expect(spec.startsWith('/** MY HEADER */')).toBe(true)
  })

  it('every generated spec exports a `spec` array (syntactic anchor)', () => {
    for (const name of PROFILE_NAMES) {
      const spec = composeSpec({ profile: name })
      expect(spec).toMatch(/export const spec = \[/)
      expect(spec.trim().endsWith(']')).toBe(true)
    }
  })
})
