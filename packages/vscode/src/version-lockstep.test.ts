import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Lockstep versioning (spec 11): extension version == bundled engine
// version, cut from the same tag. One product, one number.
describe('version lockstep', () => {
  it('extension version equals engine package version', () => {
    const read = (rel: string): string => {
      const p = JSON.parse(
        fs.readFileSync(path.join(__dirname, rel), 'utf8'),
      ) as { version: string }
      return p.version
    }
    expect(read('../package.json')).toBe(read('../../cli/package.json'))
  })
})
