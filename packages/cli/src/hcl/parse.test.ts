import { describe, it, expect } from 'vitest'
import { parseTf } from './parse'

describe('parseTf', () => {
  it('returns PathNotFound when the terraform directory is missing', async () => {
    const r = await parseTf('no/such/terraform/dir')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('PathNotFound')
  })
})
