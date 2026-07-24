import { describe, it, expect } from 'vitest'
import {
  reportExitCode,
  requiresApproval,
  hasBlocking,
  renderJson,
  renderTerminal,
} from './report'
import { CheckReport, Violation } from '../engine/evaluate'
import { Effect } from '../vocabulary'

const v = (effect: Effect, extra: Partial<Violation> = {}): Violation => ({
  ruleId: 'r',
  message: 'm',
  effect,
  resource: 'aws_db_instance.d',
  file: 'main.tf',
  line: 1,
  ...extra,
})

const rep = (violations: Violation[]): CheckReport => ({
  violations,
  passed: 0,
  couldNotEvaluate: [],
  ungoverned: [],
})

describe('effect-driven exit codes', () => {
  it('only Block fails the build', () => {
    expect(reportExitCode(rep([v(Effect.Block)]))).toBe(1)
    expect(reportExitCode(rep([v(Effect.RequireApproval)]))).toBe(0)
    expect(reportExitCode(rep([v(Effect.Warn)]))).toBe(0)
    expect(
      reportExitCode(rep([v(Effect.RequireApproval), v(Effect.Block)])),
    ).toBe(1)
  })

  it('hasBlocking / requiresApproval derive from effects', () => {
    expect(requiresApproval(rep([v(Effect.RequireApproval)]))).toBe(true)
    expect(requiresApproval(rep([v(Effect.Block)]))).toBe(false)
    expect(hasBlocking(rep([v(Effect.RequireApproval)]))).toBe(false)
  })
})

describe('approval reporting', () => {
  it('renderJson exposes requiresApproval', () => {
    const parsed = JSON.parse(renderJson(rep([v(Effect.RequireApproval)])))
    expect(parsed.requiresApproval).toBe(true)
  })

  it('renderTerminal shows an approval section with approvers', () => {
    const out = renderTerminal(
      rep([
        v(Effect.RequireApproval, { approvers: ['platform-team', 'finops'] }),
      ]),
    )
    expect(out).toMatch(/approval required/i)
    expect(out).toContain('platform-team')
    expect(out).toContain('DOTZEN_REQUIRES_APPROVAL')
  })

  it('renderTerminal separates warnings from blocking', () => {
    const out = renderTerminal(rep([v(Effect.Block), v(Effect.Warn)]))
    expect(out).toMatch(/blocking/i)
    expect(out).toMatch(/warnings/i)
  })

  it('emits ANSI colors only when color is enabled', () => {
    const report = rep([v(Effect.Block)])
    // default: no color (safe for CI logs / redirected output)
    expect(renderTerminal(report)).not.toContain('\x1b[')
    // color: true -> red blocking marker + uppercase red header
    const colored = renderTerminal(report, { color: true })
    expect(colored).toContain('\x1b[31m') // red
    expect(colored).toContain('── BLOCKING ──')
    expect(colored).toContain('\x1b[0m') // reset
  })
})
