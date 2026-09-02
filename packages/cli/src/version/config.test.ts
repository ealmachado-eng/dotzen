import { describe, it, expect } from 'vitest'
import { enforceVersion, EngineConfig } from './config'

const cfg: EngineConfig = {
  version: '1.2.0',
  spec: '.pluvian/spec.ts',
  terraform: './terraform',
}

describe('enforceVersion', () => {
  it('passes when versions match', () => {
    expect(enforceVersion(cfg, '1.2.0')).toEqual({ ok: true, value: cfg })
  })

  it('fails with a VersionMismatch when they differ', () => {
    const r = enforceVersion(cfg, '1.3.0')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toEqual({
        kind: 'VersionMismatch',
        required: '1.2.0',
        running: '1.3.0',
      })
    }
  })

  it('passes when no version is pinned', () => {
    const noPin: EngineConfig = { spec: 's', terraform: 't' }
    expect(enforceVersion(noPin, '9.9.9')).toEqual({ ok: true, value: noPin })
  })
})
