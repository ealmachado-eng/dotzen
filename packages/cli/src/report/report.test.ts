import { describe, it, expect } from 'vitest'
import {
  reportExitCode,
  renderError,
  renderTerminal,
  renderJson,
  JSON_SCHEMA_VERSION,
} from './report'
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

  it('renderTerminal shows a clean green pass only when nothing is unevaluated', () => {
    const out = renderTerminal(empty)
    expect(out).toMatch(/✓ passed/)
    expect(out).not.toMatch(/could not be evaluated/)
  })

  it('renderTerminal does NOT show a clean ✓ pass when checks could not be evaluated', () => {
    const withCne: CheckReport = {
      violations: [],
      passed: 2,
      couldNotEvaluate: [
        {
          ruleId: 'r',
          resource: 'aws_s3_bucket.a',
          file: 'main.tf',
          line: 1,
          reason: 'tags',
        },
      ],
    }
    const out = renderTerminal(withCne)
    expect(out).not.toMatch(/✓ passed/) // caveat, not a clean pass
    expect(out).toMatch(/no violations/)
    expect(out).toMatch(/could not be evaluated/)
  })

  // #21: the JSON output schema is FROZEN for 1.0. This test pins the exact
  // top-level shape + per-entry fields so an accidental breaking change
  // (removed/renamed field) fails the build. Additive fields are OK (consumers
  // must ignore unknowns); a removal/rename here is a schema bump.
  describe('renderJson — frozen schema (#21)', () => {
    const full: CheckReport = {
      violations: [
        {
          ruleId: 'rule-1',
          message: 'SSH must not be open',
          rationale: 'CIS 5.2',
          effect: Effect.Block,
          resource: 'aws_security_group.web',
          file: 'terraform/main.tf',
          line: 4,
          approvers: ['alice'],
        },
      ],
      passed: 3,
      couldNotEvaluate: [
        {
          ruleId: 'rule-2',
          resource: 'aws_s3_bucket.a',
          file: 'terraform/main.tf',
          line: 10,
          reason: 'tags unresolved',
        },
      ],
    }
    const json = JSON.parse(renderJson(full)) as Record<string, unknown>

    it('emits schemaVersion: 1 at the top', () => {
      expect(json.schemaVersion).toBe(JSON_SCHEMA_VERSION)
      expect(json.schemaVersion).toBe(1)
    })

    it('preserves the frozen top-level fields', () => {
      expect(Object.keys(json).sort()).toEqual([
        'couldNotEvaluate',
        'passed',
        'requiresApproval',
        'schemaVersion',
        'violations',
      ])
    })

    it('violation entries carry the frozen fields', () => {
      const v = (json.violations as Array<Record<string, unknown>>)[0]!
      expect(Object.keys(v).sort()).toEqual([
        'approvers',
        'effect',
        'file',
        'line',
        'message',
        'rationale',
        'resource',
        'ruleId',
      ])
    })

    it('could-not-evaluate entries carry the frozen fields', () => {
      const u = (json.couldNotEvaluate as Array<Record<string, unknown>>)[0]!
      expect(Object.keys(u).sort()).toEqual([
        'file',
        'line',
        'reason',
        'resource',
        'ruleId',
      ])
    })

    it('requiresApproval is derived and present', () => {
      expect(json.requiresApproval).toBe(false)
    })
  })
})
