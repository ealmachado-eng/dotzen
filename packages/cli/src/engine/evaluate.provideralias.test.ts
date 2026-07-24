import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize, buildScope } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'
import { AwsResource, AwsAttribute } from '../vocabulary'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

// `provider = aws.dr` pins a resource to the dr provider (another account or
// region). `.providerAlias(X)` scopes a rule to those resources — a
// fail-open filter like `.environment(X)`. A default-provider resource (no
// provider arg) has providerAlias undefined and is skipped by an alias-scoped
// rule; an un-scoped rule applies to all.
describe('evaluate — provider-alias scoping (.providerAlias)', () => {
  const encryptedRule = valid(
    rule()
      .resource(AwsResource.Instance)
      .providerAlias('dr')
      .mustBeTrue(AwsAttribute.RootBlockDeviceEncrypted)
      .message('DR-region instances must encrypt the root volume'),
  )

  it('normalize extracts providerAlias from `provider = aws.dr`', () => {
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            { provider: '${aws.dr}', root_block_device: [{ encrypted: true }] },
          ],
          y: [{ root_block_device: [{ encrypted: false }] }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res.find((r) => r.name === 'x')?.providerAlias).toBe('dr')
    expect(res.find((r) => r.name === 'y')?.providerAlias).toBeUndefined()
  })

  it('an alias-scoped rule fires only on the matching provider-alias resource', () => {
    // x is dr + unencrypted → VIOLATION. y is default + unencrypted → skipped
    // (rule scoped to dr). z is dr + encrypted → PASS.
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            {
              provider: '${aws.dr}',
              root_block_device: [{ encrypted: false }],
            },
          ],
          y: [{ root_block_device: [{ encrypted: false }] }],
          z: [{ provider: 'aws.dr', root_block_device: [{ encrypted: true }] }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([encryptedRule], res)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('aws_instance.x')
    // y (default provider) skipped; z (dr, encrypted) passed.
    expect(r.passed).toBe(1)
  })

  it('a bare `provider = aws` (no alias) → default provider, not matched', () => {
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            { provider: '${aws}', root_block_device: [{ encrypted: false }] },
          ],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    expect(res[0]?.providerAlias).toBeUndefined()
    const r = evaluate([encryptedRule], res)
    // No alias match → the dr-scoped rule skips it → no violation.
    expect(r.violations).toHaveLength(0)
  })

  it('an un-scoped rule applies to resources of any provider alias', () => {
    const plain = valid(
      rule()
        .resource(AwsResource.Instance)
        .mustBeTrue(AwsAttribute.RootBlockDeviceEncrypted)
        .message('all instances must encrypt the root volume'),
    )
    const parsed = {
      resource: {
        aws_instance: {
          x: [
            {
              provider: '${aws.dr}',
              root_block_device: [{ encrypted: false }],
            },
          ],
          y: [{ root_block_device: [{ encrypted: false }] }],
        },
      },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([plain], res)
    expect(r.violations).toHaveLength(2) // both, regardless of alias
  })
})
