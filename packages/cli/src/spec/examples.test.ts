import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { importSpecModule, loadSpec } from './load'

// The example org-profile specs live at the repo root under examples/. Each is
// a standalone consumer spec (startup / enterprise / regulated). This test
// loads each through the REAL jiti loader (the same path `pluvian check` uses)
// and validates every rule — so the templates stay correct as the DSL evolves
// (a renamed enum, a removed preset export, or a double-spread would fail here).
const exampleSpec = (name: string) =>
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'examples',
    name,
    '.pluvian',
    'spec.ts',
  )

describe('example org-profile specs — load + validate', () => {
  it('startup spec loads and validates (coreSecurity + ownership tag)', async () => {
    const imported = await importSpecModule(exampleSpec('startup'))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.value.length).toBeGreaterThan(1)
    const loaded = loadSpec(imported.value)
    expect(loaded.ok).toBe(true)
  })

  it('enterprise spec loads and validates (CIS packs + tags + approval gate)', async () => {
    const imported = await importSpecModule(exampleSpec('enterprise'))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    // enterprise composes coreSecurity + 3 CIS packs + 2 bespoke rules, so it
    // must be larger than startup's baseline.
    expect(imported.value.length).toBeGreaterThan(20)
    const loaded = loadSpec(imported.value)
    expect(loaded.ok).toBe(true)
  })

  it('regulated spec loads and validates (frameworks + data residency)', async () => {
    const imported = await importSpecModule(exampleSpec('regulated'))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    // regulated adds the framework packs (pci/soc2/nist/data-protection) on top
    // of the CIS baselines — the largest of the three.
    expect(imported.value.length).toBeGreaterThan(40)
    const loaded = loadSpec(imported.value)
    expect(loaded.ok).toBe(true)
  })

  it('every rule across all three examples has a message + rationale', async () => {
    for (const name of ['startup', 'enterprise', 'regulated'] as const) {
      const imported = await importSpecModule(exampleSpec(name))
      if (!imported.ok) continue
      const loaded = loadSpec(imported.value)
      if (!loaded.ok) continue
      for (const r of loaded.value) {
        expect(r.message).toBeTruthy()
        expect(r.rationale).toBeTruthy()
      }
    }
  })
})
