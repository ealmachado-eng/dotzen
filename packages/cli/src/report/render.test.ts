import { describe, it, expect } from 'vitest'
import { renderTerminal, renderJson } from './report'
import { CheckReport } from '../engine/evaluate'
import { Effect } from '../vocabulary'

const report: CheckReport = {
  violations: [
    {
      ruleId: 'no-public-ssh',
      message: 'SSH must not be open to the internet',
      rationale: 'CIS 5.2',
      effect: Effect.Block,
      resource: 'aws_security_group.web',
      file: 'main.tf',
      line: 2,
    },
  ],
  passed: 1,
  couldNotEvaluate: [
    {
      ruleId: 'no-public-ssh',
      resource: 'aws_security_group.dyn',
      file: 'main.tf',
      line: 9,
      reason: 'unresolved var',
    },
  ],
  ungoverned: [],
}

describe('renderTerminal (non-empty report)', () => {
  const out = renderTerminal(report)

  it('renders the violation with resource, location, message and rationale', () => {
    expect(out).toContain('aws_security_group.web')
    expect(out).toContain('main.tf:2')
    expect(out).toContain('SSH must not be open to the internet')
    expect(out).toContain('CIS 5.2')
  })

  it('renders a could-not-evaluate section distinct from a pass', () => {
    expect(out).toMatch(/── COULD NOT EVALUATE ──/)
    expect(out).toContain('aws_security_group.dyn')
    expect(out).toContain('unresolved var')
  })

  it('summary reports the violation count', () => {
    expect(out).toMatch(/1 violation\(s\)/)
  })
})

describe('renderJson', () => {
  it('emits parseable JSON matching the report', () => {
    const parsed = JSON.parse(renderJson(report))
    expect(parsed.violations).toHaveLength(1)
    expect(parsed.couldNotEvaluate).toHaveLength(1)
    expect(parsed.passed).toBe(1)
  })
})
