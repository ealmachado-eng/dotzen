import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { normalize, buildScope } from '../hcl/normalize'
import { rule, Rule } from '../spec/rule'
import { DataResource, DataAttribute } from '../vocabulary'

const valid = (b: ReturnType<typeof rule>): Rule =>
  (b.validate(0) as { ok: true; value: Rule }).value

// A data source (`data "aws_ami" "x" {}`) is a READ query; its attributes are
// filters/args to the cloud API. Governance is over the query — e.g. an AMI
// data source must declare `owners` (and include the org's own account) so it
// does not grab arbitrary third-party AMIs (a supply-chain risk).
describe('evaluate — data sources governed as resources (type data.<t>)', () => {
  const ownersRule = valid(
    rule()
      .resource(DataResource.AwsAmi)
      .listMustInclude(DataAttribute.AmiOwners, 'self')
      .message('AMI data sources must pin owners and include the org account'),
  )

  it('normalizes a data source with type data.aws_ami and harvests owners as a list', () => {
    const parsed = {
      data: {
        aws_ami: {
          amzn: [
            {
              most_recent: true,
              owners: ['amazon', 'self'],
              filter: [{ name: 'name', values: ['amzn2-*'] }],
            },
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
    const ami = res[0]!
    expect(ami.type).toBe('data.aws_ami')
    expect(ami.name).toBe('amzn')
    expect(ami.lists?.owners).toEqual({
      kind: 'resolved',
      items: [
        { kind: 'literal', value: 'amazon' },
        { kind: 'literal', value: 'self' },
      ],
    })
    // most_recent is a scalar attribute; count/for_each not leaked.
    expect(ami.attributes.most_recent).toEqual({ kind: 'literal', value: true })
    expect(ami.attributes.count).toBeUndefined()
  })

  it('passes an AMI data source whose owners include self', () => {
    const parsed = {
      data: { aws_ami: { x: [{ owners: ['self', 'amazon'] }] } },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([ownersRule], res)
    expect(r.violations).toHaveLength(0)
    expect(r.passed).toBe(1)
  })

  it('flags an AMI data source whose owners omit self (supply-chain risk)', () => {
    const parsed = {
      data: { aws_ami: { x: [{ owners: ['amazon'] }] } },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([ownersRule], res)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.resource).toBe('data.aws_ami.x')
  })

  it('flags an AMI data source with no owners declared (arbitrary AMIs)', () => {
    const parsed = {
      data: { aws_ami: { x: [{ most_recent: true }] } },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    const r = evaluate([ownersRule], res)
    expect(r.violations).toHaveLength(1)
  })

  it('skips data source types not in the vocabulary', () => {
    const parsed = {
      data: { aws_workspaces: { current: [{}] } },
    }
    const res = normalize(
      parsed as never,
      'main.tf',
      '',
      buildScope([parsed as never]),
    )
    // aws_workspaces is not in DataResource → not normalized.
    expect(res).toHaveLength(0)
  })

  it('finds the data block line (data "aws_ami" "x")', () => {
    const raw = `# leading comment\ndata "aws_ami" "amzn" {\n  owners = ["self"]\n}`
    const parsed = { data: { aws_ami: { amzn: [{ owners: ['self'] }] } } }
    const res = normalize(
      parsed as never,
      'main.tf',
      raw,
      buildScope([parsed as never]),
    )
    expect(res[0]?.line).toBe(2)
  })
})
