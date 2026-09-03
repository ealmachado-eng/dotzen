import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { bundledEngineVersion, pinMismatch, runCheck } from './engine-bridge'

// The repo's demo project: pluvian.json + .pluvian/spec.ts (one graph rule)
// + terraform/main.tf with a public-subnet EFS mount target. Expected
// outcome is pinned by the demo itself: 1 violation, 1 passed.
const demo = path.join(__dirname, '..', '..', '..', 'demo')

describe('runCheck (real engine, real project, in-process)', () => {
  it('returns the demo project’s known verdict', async () => {
    const outcome = await runCheck(demo)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.report.violations).toHaveLength(1)
      expect(outcome.report.violations[0]?.resource).toBe(
        'aws_efs_mount_target.public_mt',
      )
      expect(outcome.report.violations[0]?.file).toBe('terraform/main.tf')
      expect(outcome.report.passed).toBe(1)
      // The demo pins no version: nothing to compare against.
      expect(outcome.pinnedVersion).toBeUndefined()
      expect(outcome.engineVersion).toBe(bundledEngineVersion)
    }
  })

  it('reports an operational error for a directory without pluvian.json', async () => {
    const outcome = await runCheck(path.join(__dirname))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.kind).toBe('ConfigNotFound')
  })
})

describe('pinMismatch', () => {
  it('returns nothing without a pin or when pin matches', () => {
    expect(pinMismatch(undefined, '2.1.0')).toBeUndefined()
    expect(pinMismatch('2.1.0', '2.1.0')).toBeUndefined()
  })

  it('flags ANY difference, including semver-compatible pins', () => {
    expect(pinMismatch('2.0.0', '2.1.0')).toEqual({
      pinned: '2.0.0',
      running: '2.1.0',
    })
  })
})
