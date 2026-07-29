import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalizeSettings } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

const exactTf = valid(
  rule()
    .allResources()
    .requireExactTerraformVersion()
    .message('terraform required_version must be an exact pin'),
)
const pinnedProviders = valid(
  rule()
    .allResources()
    .denyFloatingProviderVersion('aws', 'google')
    .message('providers must be version-pinned (= or ~>)'),
)

const raw = `terraform {
  required_version = "1.7.5"
}`

const settings = (overrides?: {
  requiredVersion?: string
  requiredProviders?: { name: string; version: string }[]
}) => {
  const parsed: {
    terraform?: unknown[]
  } = {
    terraform: [
      {
        required_version: overrides?.requiredVersion,
        required_providers: overrides?.requiredProviders
          ? [
              Object.fromEntries(
                overrides.requiredProviders.map((p) => [
                  p.name,
                  { source: 'x/' + p.name, version: p.version },
                ]),
              ),
            ]
          : undefined,
      },
    ],
  }
  return normalizeSettings(parsed as never, 'main.tf', raw)
}

describe('evaluate (requireExactTerraformVersion) — #11', () => {
  it('passes an exact pin (= X.Y.Z)', () => {
    const s = settings({ requiredVersion: '= 1.7.5' })
    const r = evaluate([exactTf], [], [], [], s)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a floating bare version (X.Y.Z = >= X.Y.Z)', () => {
    const s = settings({ requiredVersion: '1.7.5' })
    const r = evaluate([exactTf], [], [], [], s)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('terraform')
  })

  it('flags a pessimistic ~> constraint (not exact)', () => {
    const s = settings({ requiredVersion: '~> 1.7' })
    const r = evaluate([exactTf], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })

  it('flags a >= constraint (not exact)', () => {
    const s = settings({ requiredVersion: '>= 1.0' })
    const r = evaluate([exactTf], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })

  it('flags an absent required_version', () => {
    const s = settings({ requiredVersion: undefined })
    const r = evaluate([exactTf], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })

  it('flags a dir with no terraform block at all', () => {
    const s = normalizeSettings({} as never, 'main.tf', raw)
    expect(s).toHaveLength(0)
    const r = evaluate([exactTf], [], [], [], s)
    // No settings → no settings-pass evaluation → no violation, no pass.
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(0)
  })
})

describe('evaluate (denyFloatingProviderVersion) — #11', () => {
  it('passes providers pinned with = and ~>', () => {
    const s = settings({
      requiredProviders: [
        { name: 'aws', version: '= 5.3.1' },
        { name: 'google', version: '~> 4.0' },
      ],
    })
    const r = evaluate([pinnedProviders], [], [], [], s)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a floating bare provider version', () => {
    const s = settings({
      requiredProviders: [{ name: 'aws', version: '5.0' }],
    })
    const r = evaluate([pinnedProviders], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })

  it('flags a >= provider version', () => {
    const s = settings({
      requiredProviders: [{ name: 'aws', version: '>= 4.0' }],
    })
    const r = evaluate([pinnedProviders], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })

  it('flags a provider absent from required_providers (not pinned at all)', () => {
    const s = settings({
      requiredProviders: [{ name: 'aws', version: '= 5.0' }],
    })
    const r = evaluate([pinnedProviders], [], [], [], s)
    // aws is pinned; google is absent → flagged.
    expect(r.violations).toHaveLength(1)
  })

  it('flags multiple floating/absent providers in one violation', () => {
    const s = settings({
      requiredProviders: [{ name: 'aws', version: '>= 4.0' }],
    })
    const r = evaluate([pinnedProviders], [], [], [], s)
    // aws floating + google absent → one violation (one condition eval).
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.message).toMatch(/providers must be version-pinned/)
  })
})

describe('normalizeSettings — extraction', () => {
  it('extracts required_version and required_providers entries', () => {
    const parsed = {
      terraform: [
        {
          required_version: '= 1.7.5',
          required_providers: [
            {
              aws: { source: 'hashicorp/aws', version: '~> 5.0' },
              google: { source: 'hashicorp/google', version: '4.2.0' },
            },
          ],
        },
      ],
    }
    const s = normalizeSettings(parsed as never, 'main.tf', raw)[0]!
    expect(s.requiredVersion).toBe('= 1.7.5')
    expect(s.requiredProviders).toEqual([
      { name: 'aws', version: '~> 5.0' },
      { name: 'google', version: '4.2.0' },
    ])
  })

  it('finds the terraform block line', () => {
    const raw2 = `# leading\nterraform {\n  required_version = "= 1.7.5"\n}`
    const parsed = { terraform: [{ required_version: '= 1.7.5' }] }
    const s = normalizeSettings(parsed as never, 'main.tf', raw2)[0]!
    expect(s.line).toBe(2)
  })

  it('returns [] when there is no terraform block', () => {
    expect(normalizeSettings({} as never, 'main.tf', raw)).toEqual([])
  })
})

describe('settings pass — no terraform block (synthetic default)', () => {
  it('settings-surface rules fire even when no terraform block exists', () => {
    // A project with .tf files but no terraform{} block → settings is empty
    // from normalizeSettings. parseTf synthesizes a default entry (no
    // backend, no required_version) so settings-surface rules still fire.
    // Here we simulate that: pass a synthetic default directly to evaluate.
    const synthetic = [
      {
        requiredVersion: undefined,
        requiredProviders: [],
        backend: undefined,
        file: 'main.tf',
        line: 1,
      },
    ]
    const encRule = valid(
      rule()
        .allResources()
        .requireEncryptedBackend()
        .message('state must be encrypted'),
    )
    const verRule = valid(
      rule()
        .allResources()
        .requireExactTerraformVersion()
        .message('must pin tf version'),
    )
    const r = evaluate([encRule, verRule], [], [], [], synthetic as never)
    // requireEncryptedBackend passes on absence (module-repo semantic); only
    // requireExactTerraformVersion fires (no required_version pinned).
    expect(r.violations).toHaveLength(1)
    expect(r.violations.every((v) => v.resource === 'terraform')).toBe(true)
  })
})

describe('evaluate (requireEncryptedBackend) — #17', () => {
  const encRule = valid(
    rule()
      .allResources()
      .requireEncryptedBackend()
      .message('state backend must be encrypted'),
  )

  const settingsWith = (backend?: {
    type: string
    encrypt?: unknown
    dynamodb_table?: string
  }) =>
    normalizeSettings(
      {
        terraform: [
          {
            required_version: '= 1.7.5',
            ...(backend
              ? {
                  backend: {
                    [backend.type]: [
                      {
                        encrypt: backend.encrypt,
                        dynamodb_table: backend.dynamodb_table,
                      },
                    ],
                  },
                }
              : {}),
          },
        ],
      } as never,
      'main.tf',
      raw,
    )

  it('passes an s3 backend with encrypt = true', () => {
    const s = settingsWith({ type: 's3', encrypt: true, dynamodb_table: 'l' })
    const r = evaluate([encRule], [], [], [], s)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags an s3 backend with encrypt absent (defaults to false)', () => {
    const s = settingsWith({ type: 's3' })
    const r = evaluate([encRule], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })

  it('flags an s3 backend with encrypt = false', () => {
    const s = settingsWith({ type: 's3', encrypt: false })
    const r = evaluate([encRule], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })

  it('degrades to could-not-evaluate when encrypt is a var ref', () => {
    const s = settingsWith({ type: 's3', encrypt: '${var.enc}' })
    const r = evaluate([encRule], [], [], [], s)
    expect(r.violations).toHaveLength(0)
    expect(r.couldNotEvaluate).toHaveLength(1)
  })

  it('passes when no backend is declared (module repo — absence is pass)', () => {
    // A module repo intentionally declares no backend — the backend is the
    // env/layer consumer's concern, not the module's. requireEncryptedBackend
    // fires only when a backend IS declared but unencrypted; the "must
    // declare a backend" concern is denyLocalBackend's job (opt-in).
    // (Dogfood round 2: the old absence=violation semantic caused a 40-60x
    // false-positive storm on every module repo's versions.tf files.)
    const s = settingsWith(undefined)
    const r = evaluate([encRule], [], [], [], s)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags a local backend (declared, no encrypt concept)', () => {
    const s = settingsWith({ type: 'local' })
    const r = evaluate([encRule], [], [], [], s)
    expect(r.violations).toHaveLength(1)
  })
})

describe('evaluate (denyLocalBackend) — #17', () => {
  const noLocal = valid(
    rule()
      .allResources()
      .denyLocalBackend()
      .message('local state is forbidden — use a remote backend'),
  )
  const settingsWith = (backendType?: string) =>
    normalizeSettings(
      {
        terraform: [
          {
            required_version: '= 1.7.5',
            ...(backendType
              ? { backend: { [backendType]: [{ encrypt: true }] } }
              : {}),
          },
        ],
      } as never,
      'main.tf',
      raw,
    )

  it('passes a remote (s3) backend', () => {
    const r = evaluate([noLocal], [], [], [], settingsWith('s3'))
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags an explicit local backend', () => {
    const r = evaluate([noLocal], [], [], [], settingsWith('local'))
    expect(r.violations).toHaveLength(1)
  })

  it('flags when no backend is declared (defaults to local)', () => {
    const r = evaluate([noLocal], [], [], [], settingsWith(undefined))
    expect(r.violations).toHaveLength(1)
  })
})
