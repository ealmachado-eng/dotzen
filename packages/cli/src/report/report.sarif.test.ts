import { describe, it, expect } from 'vitest'
import { renderSarif } from './report'
import { CheckReport } from '../engine/evaluate'
import { Effect } from '../vocabulary'

const TOOL = { version: '9.9.9', informationUri: 'https://example/dotzen' }

const full: CheckReport = {
  violations: [
    {
      ruleId: 'no-public-ssh',
      message: 'SSH must not be open to the internet',
      rationale: 'CIS 5.2',
      effect: Effect.Block,
      resource: 'aws_security_group.web',
      file: 'terraform/main.tf',
      line: 4,
    },
    {
      ruleId: 'no-public-ssh',
      message: 'SSH must not be open to the internet',
      rationale: 'CIS 5.2',
      effect: Effect.Block,
      resource: 'aws_security_group.db',
      file: 'terraform/main.tf',
      line: 12,
    },
    {
      ruleId: 'require-tags',
      message: 'Missing required tags',
      effect: Effect.Warn,
      resource: 'aws_s3_bucket.data',
      file: 'terraform/s3.tf',
      line: 2,
      approvers: ['alice'],
    },
  ],
  passed: 5,
  couldNotEvaluate: [
    {
      ruleId: 'require-tags',
      resource: 'aws_s3_bucket.other',
      file: 'terraform/s3.tf',
      line: 20,
      reason: 'tags unresolved',
    },
  ],
  ungoverned: [
    { type: 'aws_widget', name: 'g', file: 'terraform/x.tf', line: 1 },
  ],
}

const sarif = () => JSON.parse(renderSarif(full, TOOL)) as SarifDoc

// Minimal SARIF 2.1.0 shape for assertions.
interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string }
    region: { startLine: number }
  }
}
interface SarifResult {
  ruleId: string
  level: string
  message: { text: string }
  locations: SarifLocation[]
  properties?: Record<string, unknown>
}
interface SarifRule {
  id: string
  shortDescription?: { text: string }
  defaultConfiguration?: { level: string }
}
interface SarifRun {
  tool: {
    driver: {
      name: string
      version: string
      informationUri?: string
      rules: SarifRule[]
    }
  }
  results: SarifResult[]
}
interface SarifDoc {
  $schema?: string
  version: string
  runs: SarifRun[]
}

describe('renderSarif — SARIF 2.1.0 output', () => {
  it('emits the SARIF 2.1.0 envelope', () => {
    const d = sarif()
    expect(d.version).toBe('2.1.0')
    expect(d.$schema).toMatch(/^https:\/\/docs\.oasis-open\.org.*sarif-schema-2\.1\.0/)
    expect(d.runs).toHaveLength(1)
  })

  it('the tool driver carries name, version, and informationUri', () => {
    const driver = sarif().runs[0]!.tool.driver
    expect(driver.name).toBe('@dotzen/dotzen')
    expect(driver.version).toBe('9.9.9')
    expect(driver.informationUri).toBe('https://example/dotzen')
  })

  it('deduplicates rules by id (one entry per unique ruleId)', () => {
    const rules = sarif().runs[0]!.tool.driver.rules
    const ids = rules.map((r) => r.id).sort()
    // no-public-ssh + require-tags (both fire across violations+CNE).
    expect(ids).toEqual(['no-public-ssh', 'require-tags'])
  })

  it('a rule carries its message + a default level mapped from effect', () => {
    const rules = sarif().runs[0]!.tool.driver.rules
    const ssh = rules.find((r) => r.id === 'no-public-ssh')!
    expect(ssh.shortDescription?.text).toMatch(/SSH must not be open/)
    expect(ssh.defaultConfiguration?.level).toBe('error') // Block → error
    const tags = rules.find((r) => r.id === 'require-tags')!
    expect(tags.defaultConfiguration?.level).toBe('warning') // Warn → warning
  })

  it('maps effect → SARIF level (Block=error, Warn=warning)', () => {
    const results = sarif().runs[0]!.results
    // Violations only (exclude the note-level CNE/ungoverned gaps).
    const levels = results.filter((r) => r.level !== 'note').map((r) => r.level)
    expect(levels.sort()).toEqual(['error', 'error', 'warning'])
  })

  it('each violation result has a file:line location and a properties bag', () => {
    const results = sarif().runs[0]!.results.filter(
      (r) => r.ruleId === 'no-public-ssh',
    )
    expect(results).toHaveLength(2)
    const web = results.find((r) =>
      r.locations[0]?.physicalLocation.artifactLocation.uri.endsWith('main.tf'),
    )!
    expect(web.locations[0]?.physicalLocation.region.startLine).toBe(4)
    // dotzen-specific data round-trips through the properties bag.
    expect(web.properties?.resource).toBe('aws_security_group.web')
    expect(web.properties?.effect).toBe('block')
    expect(web.properties?.rationale).toMatch(/CIS 5.2/)
  })

  it('includes could-not-evaluate as note-level results (visible gaps, not violations)', () => {
    const cne = sarif().runs[0]!.results.find((r) =>
      r.message.text.includes('could not evaluate'),
    )
    expect(cne).toBeDefined()
    expect(cne?.level).toBe('note')
    expect(cne?.ruleId).toBe('require-tags')
    expect(cne?.properties?.resource).toBe('aws_s3_bucket.other')
  })

  it('includes ungoverned resources as note-level results (coverage gaps)', () => {
    const ung = sarif().runs[0]!.results.find((r) =>
      r.message.text.includes('not governed'),
    )
    expect(ung).toBeDefined()
    expect(ung?.level).toBe('note')
    expect(ung?.locations[0]?.physicalLocation.artifactLocation.uri).toBe(
      'terraform/x.tf',
    )
  })

  it('require_approval violations map to warning level (need human action)', () => {
    const doc = JSON.parse(
      renderSarif(
        {
          violations: [
            {
              ruleId: 'approve-me',
              message: 'needs sign-off',
              effect: Effect.RequireApproval,
              resource: 'aws_x.y',
              file: 'main.tf',
              line: 1,
              approvers: ['bob'],
            },
          ],
          passed: 0,
          couldNotEvaluate: [],
          ungoverned: [],
        },
        TOOL,
      ),
    ) as SarifDoc
    const r = doc.runs[0]!.results[0]!
    expect(r.level).toBe('warning')
    expect(r.properties?.approvers).toEqual(['bob'])
  })

  it('a clean report still emits valid SARIF (empty results, no rules)', () => {
    const doc = JSON.parse(
      renderSarif(
        { violations: [], passed: 7, couldNotEvaluate: [], ungoverned: [] },
        TOOL,
      ),
    ) as SarifDoc
    expect(doc.version).toBe('2.1.0')
    expect(doc.runs[0]!.results).toEqual([])
    expect(doc.runs[0]!.tool.driver.rules).toEqual([])
  })

  it('strips the module-trace annotation from the uri (RFC 3986 validity)', () => {
    // dotzen embeds the followModules trace in `file` as `path (label)`. The
    // SARIF uri must be a clean path (GitHub deep-links by uri → a trace-laden
    // uri would 404); the full trace round-trips via properties.moduleTrace.
    const doc = JSON.parse(
      renderSarif(
        {
          violations: [
            {
              ruleId: 'x',
              message: 'm',
              effect: Effect.Block,
              resource: 'aws_iam_role.this',
              file: 'modules/rds/main.tf (db_bad)',
              line: 7,
            },
          ],
          passed: 0,
          couldNotEvaluate: [],
          ungoverned: [],
        },
        TOOL,
      ),
    ) as SarifDoc
    const r = doc.runs[0]!.results[0]!
    expect(r.locations[0]?.physicalLocation.artifactLocation.uri).toBe(
      'modules/rds/main.tf',
    )
    expect(r.properties?.moduleTrace).toBe('modules/rds/main.tf (db_bad)')
  })

  it('omits locations for project-level findings (no valid file:line)', () => {
    // requireResource findings carry the synthetic <project>:0 location.
    // SARIF requires startLine >= 1 and a valid uri; emit zero locations
    // (SARIF-permitted) and carry context in message/properties.
    const doc = JSON.parse(
      renderSarif(
        {
          violations: [
            {
              ruleId: 'require-access-analyzer',
              message: 'An IAM Access Analyzer must be declared in the project',
              effect: Effect.Block,
              resource: 'aws_accessanalyzer_analyzer',
              file: '<project>',
              line: 0,
            },
          ],
          passed: 0,
          couldNotEvaluate: [],
          ungoverned: [],
        },
        TOOL,
      ),
    ) as SarifDoc
    const r = doc.runs[0]!.results[0]!
    expect(r.locations).toEqual([])
    expect(r.properties?.resource).toBe('aws_accessanalyzer_analyzer')
    expect(r.message.text).toMatch(/Access Analyzer/)
  })
})
