import { describe, it, expect } from 'vitest'
import { Effect, type CheckReport, type Violation } from '@erkos/pluvian'
import { mapReport, physicalFile, PROJECT_FILE } from './diagnostics'

const violation = (over: Partial<Violation>): Violation => ({
  ruleId: 'rule-1',
  message: 'msg',
  effect: Effect.Block,
  resource: 'aws_db_instance.db',
  file: 'main.tf',
  line: 2,
  ...over,
})

const report = (over: Partial<CheckReport> = {}): CheckReport => ({
  violations: [],
  passed: 0,
  couldNotEvaluate: [],
  ungoverned: [],
  ...over,
})

describe('severity mapping (spec 11 table)', () => {
  it('maps effect → error/warning/info', () => {
    const r = mapReport(
      report({
        violations: [
          violation({ effect: Effect.Block }),
          violation({ effect: Effect.Warn, ruleId: 'rule-2' }),
          violation({ effect: Effect.RequireApproval, ruleId: 'rule-3' }),
        ],
      }),
      { showCouldNotEvaluate: true, showUngoverned: false },
    )
    expect(r.items.map((i) => i.severity)).toEqual(['error', 'warning', 'info'])
  })

  it('couldNotEvaluate maps to hint when enabled, hidden when disabled', () => {
    const base = report({
      couldNotEvaluate: [
        {
          ruleId: 'r',
          resource: 'x.y',
          file: 'a.tf',
          line: 3,
          reason: 'opaque',
        },
      ],
    })
    expect(
      mapReport(base, { showCouldNotEvaluate: true, showUngoverned: false })
        .items,
    ).toHaveLength(1)
    expect(
      mapReport(base, { showCouldNotEvaluate: false, showUngoverned: false })
        .items,
    ).toHaveLength(0)
  })

  it('ungoverned maps to hint under the pluvian.ungoverned id, off by default', () => {
    const base = report({
      ungoverned: [{ type: 'aws_new_thing', name: 'x', file: 'a.tf', line: 4 }],
    })
    expect(
      mapReport(base, { showCouldNotEvaluate: true, showUngoverned: false })
        .items,
    ).toHaveLength(0)
    const r = mapReport(base, {
      showCouldNotEvaluate: true,
      showUngoverned: true,
    })
    expect(r.items[0]?.severity).toBe('hint')
    expect(r.items[0]?.ruleId).toBe('pluvian.ungoverned')
  })
})

describe('file resolution', () => {
  it('resolves a module-following finding to the physical module file', () => {
    // Ground truth from the engine (module-following fixture): the trace is
    // `<root> › <module file> (label)` — the squiggle belongs in the module
    // file, which the LAST ` › ` hop names.
    const r = mapReport(
      report({
        violations: [
          violation({
            file: 'env/prd › modules/rds/main.tf (db_bad)',
            line: 10,
          }),
        ],
      }),
      { showCouldNotEvaluate: true, showUngoverned: false },
    )
    expect(r.items[0]?.file).toBe('modules/rds/main.tf')
    expect(r.items[0]?.message).toContain('module trace: env/prd ›')
  })

  it('nested module chains resolve to the innermost file', () => {
    const r = mapReport(
      report({
        violations: [
          violation({
            file: 'env/prd › modules/outer/main.tf (db) › modules/inner/main.tf (db)',
          }),
        ],
      }),
      { showCouldNotEvaluate: true, showUngoverned: false },
    )
    expect(r.items[0]?.file).toBe('modules/inner/main.tf')
  })

  it('physicalFile keeps plain paths and the project marker untouched', () => {
    expect(physicalFile('a/b/main.tf')).toBe('a/b/main.tf')
    expect(physicalFile(PROJECT_FILE)).toBe(PROJECT_FILE)
  })

  it('project-level findings never become editor items', () => {
    const r = mapReport(
      report({
        violations: [
          violation({ file: PROJECT_FILE, line: 0, ruleId: 'need-analyzer' }),
        ],
      }),
      { showCouldNotEvaluate: true, showUngoverned: false },
    )
    expect(r.items).toHaveLength(0)
    expect(r.projectLevel).toHaveLength(1)
    expect(r.projectLevel[0]).toContain('need-analyzer')
  })
})

describe('message composition', () => {
  it('stacks rationale, approvers, and graph detail as extra lines', () => {
    const r = mapReport(
      report({
        violations: [
          violation({
            rationale: 'CIS 5.2',
            approvers: ['Security Architect', 'SRE'],
            detail: 'reachable via: db → subnet → igw',
          }),
        ],
      }),
      { showCouldNotEvaluate: true, showUngoverned: false },
    )
    const msg = r.items[0]?.message ?? ''
    expect(msg.split('\n')).toEqual([
      'msg',
      'why: CIS 5.2',
      'approvers: Security Architect, SRE',
      'reachable via: db → subnet → igw',
    ])
  })

  it('couldNotEvaluate messages name the rule and reason', () => {
    const r = mapReport(
      report({
        couldNotEvaluate: [
          {
            ruleId: 'r-9',
            resource: 'x.y',
            file: 'a.tf',
            line: 1,
            reason: 'not resolvable',
          },
        ],
      }),
      { showCouldNotEvaluate: true, showUngoverned: false },
    )
    expect(r.items[0]?.message).toBe(
      'not resolvable (could not evaluate — rule r-9)',
    )
  })
})
