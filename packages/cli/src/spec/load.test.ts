import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { loadSpec, importSpecModule } from './load'
import { rule } from './rule'
import { AwsResource, Port } from '../vocabulary'

describe('loadSpec', () => {
  it('returns validated rules when all builders are valid', () => {
    const r = loadSpec([
      rule()
        .resource(AwsResource.SecurityGroup)
        .denyIngress(Port.SSH)
        .message('m'),
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(1)
  })

  it('accumulates SpecInvalid errors across every bad rule', () => {
    const r = loadSpec([
      rule()
        .resource(AwsResource.SecurityGroup)
        .denyIngress(Port.SSH)
        .message('ok'),
      rule(), // invalid: no message, no target, no conditions
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('SpecInvalid')
      if (r.error.kind === 'SpecInvalid') {
        expect(r.error.errors.length).toBe(3)
        expect(r.error.errors.every((e) => e.ruleIndex === 1)).toBe(true)
      }
    }
  })
})

describe('importSpecModule', () => {
  it('returns ConfigNotFound for a missing spec path', async () => {
    const r = await importSpecModule('does/not/exist/spec.ts')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('ConfigNotFound')
  })

  // Regression: a scaffolded spec imports the bare `@dotzen/dotzen`
  // specifier, which under `npx` isn't installed in the user's project. The
  // loader must alias it to the running engine so the spec still resolves.
  it('resolves a spec that imports "@dotzen/dotzen" (the npx flow)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotzen-spec-'))
    const specPath = path.join(dir, 'spec.ts')
    fs.writeFileSync(
      specPath,
      "import { rule, AwsResource, Port } from '@dotzen/dotzen'\n" +
        'export const spec = [\n' +
        '  rule().resource(AwsResource.SecurityGroup).denyIngress(Port.SSH).message("m"),\n' +
        ']\n',
    )
    const r = await importSpecModule(specPath)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(1)
  })
})
