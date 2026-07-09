import { describe, it, expect } from 'vitest'
import { reportExitCode, renderError, renderTerminal } from './report'
import { CheckReport } from '../engine/evaluate'
import { Effect } from '../vocabulary'

const empty: CheckReport = { violations: [], passed: 3, couldNotEvaluate: [] }

describe('report', () => {
  it('exit code is 0 with no violations, 1 with violations', () => {
    expect(reportExitCode(empty)).toBe(0)
    expect(
      reportExitCode({
        violations: [
          {
            ruleId: 'r',
            message: 'm',
            effect: Effect.Block,
            resource: 'aws_security_group.web',
            file: 'main.tf',
            line: 1,
          },
        ],
        passed: 0,
        couldNotEvaluate: [],
      }),
    ).toBe(1)
  })

  it('renderError produces a message for every DotzenError kind', () => {
    expect(renderError({ kind: 'ConfigNotFound', path: 'x' })).toMatch(
      /config/i,
    )
    expect(
      renderError({ kind: 'VersionMismatch', required: '1', running: '2' }),
    ).toMatch(/version/i)
    expect(renderError({ kind: 'SpecInvalid', errors: [] })).toMatch(/spec/i)
    expect(
      renderError({ kind: 'SpecLoadFailed', path: 'p', detail: 'd' }),
    ).toMatch(/spec/i)
    expect(renderError({ kind: 'PathNotFound', path: 'p' })).toMatch(
      /not found/i,
    )
    expect(
      renderError({ kind: 'ParseFailed', file: 'f', detail: 'd' }),
    ).toMatch(/parse/i)
  })

  it('renderTerminal reports a clean pass', () => {
    expect(renderTerminal(empty)).toMatch(/pass/i)
  })
})
