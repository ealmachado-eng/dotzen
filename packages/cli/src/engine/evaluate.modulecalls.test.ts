import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { rule, Rule } from '../spec/rule'
import { NormalizedModuleCall } from '../hcl/model'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

const pinnedModules = valid(
  rule()
    .allResources()
    .denyFloatingModuleVersion()
    .message('registry modules must be version-pinned (= or ~>)'),
)

const mc = (
  o: Partial<NormalizedModuleCall> & {
    label: string
    source: string
    registry: boolean
  },
): NormalizedModuleCall => ({
  label: o.label,
  source: o.source,
  version: o.version,
  registry: o.registry,
  file: o.file ?? 'main.tf',
  line: o.line ?? 1,
})

describe('evaluate (denyFloatingModuleVersion) — #19', () => {
  it('passes a registry module pinned with =', () => {
    const r = evaluate(
      [pinnedModules],
      [],
      [],
      [],
      [],
      [
        mc({
          label: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          version: '= 5.3.0',
          registry: true,
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('passes a registry module pinned with ~>', () => {
    const r = evaluate(
      [pinnedModules],
      [],
      [],
      [],
      [],
      [
        mc({
          label: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          version: '~> 5.0',
          registry: true,
        }),
      ],
    )
    expect(r.violations).toHaveLength(0)
  })

  it('flags a registry module with a floating bare version', () => {
    const r = evaluate(
      [pinnedModules],
      [],
      [],
      [],
      [],
      [
        mc({
          label: 'eks',
          source: 'terraform-aws-modules/eks/aws',
          version: '5.0',
          registry: true,
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('module.eks')
  })

  it('flags a registry module with a >= constraint', () => {
    const r = evaluate(
      [pinnedModules],
      [],
      [],
      [],
      [],
      [
        mc({
          label: 'eks',
          source: 'terraform-aws-modules/eks/aws',
          version: '>= 4.0',
          registry: true,
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('flags a registry module with no version at all', () => {
    const r = evaluate(
      [pinnedModules],
      [],
      [],
      [],
      [],
      [
        mc({
          label: 'vpc',
          source: 'terraform-aws-modules/vpc/aws',
          registry: true,
        }),
      ],
    )
    expect(r.violations).toHaveLength(1)
  })

  it('never flags a local module (./ source, no version)', () => {
    const r = evaluate(
      [pinnedModules],
      [],
      [],
      [],
      [],
      [mc({ label: 'db', source: './modules/rds', registry: false })],
    )
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('evaluates multiple module calls independently', () => {
    const r = evaluate(
      [pinnedModules],
      [],
      [],
      [],
      [],
      [
        mc({
          label: 'good',
          source: 'x/y/aws',
          version: '= 1.0',
          registry: true,
        }),
        mc({ label: 'bad', source: 'x/z/aws', version: '2.0', registry: true }),
        mc({ label: 'local', source: './m', registry: false }),
      ],
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('module.bad')
    expect(r.passed).toBe(2) // good + local
  })
})
